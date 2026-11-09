import type { Prisma, RequestStatus, User } from '@prisma/client';
import archiver from 'archiver';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireAuth, requireRole } from '../auth/session.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import {
  countPdfPages,
  detectType,
  filePath,
  moveToPending,
  moveToRequestFolder,
  removeFile,
  requestFileKey,
  stagingDir,
  uniqueNames,
} from './storage.js';
import { outputPdf } from './output-pdf.js';
import { CANCELLABLE, OUTPUT_READY, STAGES, STATUS_GROUPS, requestCode, type DocumentOutput, type StatusGroup } from './workflow.js';

export const serviceTypesRouter = Router();
export const uploadsRouter = Router();
export const requestsRouter = Router();

serviceTypesRouter.use(requireAuth);
uploadsRouter.use(requireRole('CLIENT_USER'));
requestsRouter.use(requireAuth);

const MAX_FILES_PER_REQUEST = 200;
const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ error: { code, message } });
const meta = (req: Request) => ({ actorUserId: req.auth!.user.id, organizationId: req.auth!.user.organizationId, ip: req.ip ?? null });

// DSH-05: client users only ever see their own organization's requests; LevelShift staff see all.
const scope = (user: User): Prisma.RequestWhereInput =>
  user.role === 'CLIENT_USER' ? { organizationId: user.organizationId ?? '00000000-0000-0000-0000-000000000000' } : {};

// ---- Service catalogue ----

serviceTypesRouter.get('/', async (_req, res) => {
  const services = await prisma.serviceType.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, slaHours: true },
  });
  res.json({ services });
});

// ---- SUB-02..SUB-05: staged uploads, attached to a request on submit ----

const upload = multer({
  storage: multer.diskStorage({
    destination: stagingDir,
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 0 },
}).single('file');

function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return fail(res, 413, 'FILE_TOO_LARGE', `Files must be ${config.MAX_UPLOAD_MB} MB or smaller.`);
    }
    if (err instanceof multer.MulterError) return fail(res, 400, 'INVALID_UPLOAD', 'Upload one file at a time.');
    next(err);
  });
}

uploadsRouter.post('/', receiveFile, async (req, res) => {
  const file = req.file;
  if (!file) return fail(res, 400, 'INVALID_UPLOAD', 'Choose a file to upload.');
  const user = req.auth!.user;
  // Browsers send names as latin1; restore UTF-8 and keep only the base name.
  const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').split(/[\\/]/).pop()!.slice(0, 255);

  const mimeType = await detectType(file.path, fileName);
  if (!mimeType) {
    await removeFile(file.path);
    await audit({ event: 'FILE_UPLOAD', outcome: 'FAILURE', ...meta(req) });
    return fail(res, 415, 'UNSUPPORTED_TYPE', 'Only PDF, JPG, PNG and TIFF files are supported.');
  }
  if (file.size === 0) {
    await removeFile(file.path);
    return fail(res, 400, 'EMPTY_FILE', 'This file is empty.');
  }

  const pages = mimeType === 'application/pdf' ? await countPdfPages(file.path) : 1;
  // Held in storage/pending until the request is submitted (then moved to files/<request ID>/).
  const storageKey = await moveToPending(file.path);
  const doc = await prisma.requestDocument.create({
    data: { uploadedById: user.id, fileName, mimeType, sizeBytes: file.size, pages, storageKey },
  });
  await audit({ event: 'FILE_UPLOAD', outcome: 'SUCCESS', objectId: doc.id, ...meta(req) });
  res.status(201).json({ id: doc.id, fileName, mimeType, sizeBytes: file.size, pages });
});

uploadsRouter.delete('/:id', async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) return fail(res, 404, 'NOT_FOUND', 'File not found.');
  const doc = await prisma.requestDocument.findFirst({ where: { id: id.data, uploadedById: req.auth!.user.id, requestId: null } });
  if (!doc) return fail(res, 404, 'NOT_FOUND', 'File not found.');
  await prisma.requestDocument.delete({ where: { id: doc.id } });
  await removeFile(filePath(doc.storageKey));
  res.status(204).end();
});

// ---- SUB-13: submit is all-or-nothing ----

const submitSchema = z.object({
  serviceTypeId: z.uuid(),
  documentIds: z.array(z.uuid()).min(1).max(MAX_FILES_PER_REQUEST),
});

requestsRouter.post('/', requireRole('CLIENT_USER'), async (req, res) => {
  const body = submitSchema.safeParse(req.body);
  if (!body.success) return fail(res, 400, 'INVALID_REQUEST', 'Select a service and upload at least one file.');
  const user = req.auth!.user;
  const service = await prisma.serviceType.findFirst({ where: { id: body.data.serviceTypeId, active: true } });
  if (!service || !user.organizationId) return fail(res, 400, 'INVALID_REQUEST', 'Select a valid processing service.');
  const ids = [...new Set(body.data.documentIds)];
  const now = new Date();

  const created = await prisma
    .$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('requests_number_seq')`;
      const number = Number(nextval);
      const request = await tx.request.create({
        data: {
          number,
          code: requestCode(number),
          organizationId: user.organizationId!,
          submittedById: user.id,
          serviceTypeId: service.id,
          receivedAt: now,
          expectedAt: new Date(now.getTime() + service.slaHours * 3_600_000),
        },
      });
      const attached = await tx.requestDocument.updateMany({
        where: { id: { in: ids }, uploadedById: user.id, requestId: null },
        data: { requestId: request.id },
      });
      if (attached.count !== ids.length) throw new StaleUpload();
      await tx.statusEvent.create({ data: { requestId: request.id, status: 'RECEIVED', occurredAt: now, actorUserId: user.id } });

      // Files go to storage/files/<request ID>/ under their uploaded names, in upload order.
      const docs = await tx.requestDocument.findMany({ where: { requestId: request.id }, select: { id: true, fileName: true, storageKey: true } });
      docs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      const names = uniqueNames(docs.map((d) => d.fileName));
      const moves = docs.map((d, i) => ({ id: d.id, from: d.storageKey, to: requestFileKey(request.code, names[i]) }));
      for (const m of moves) await tx.requestDocument.update({ where: { id: m.id }, data: { storageKey: m.to } });
      // Last step: if a move fails, the moved files go back and the transaction rolls back.
      await moveToRequestFolder(request.code, moves);
      return request;
    }, { timeout: 30_000 })
    .catch((err: unknown) => {
      if (err instanceof StaleUpload) return null;
      throw err;
    });

  if (!created) {
    await audit({ event: 'REQUEST_SUBMIT', outcome: 'FAILURE', ...meta(req) });
    return fail(res, 409, 'UPLOADS_CHANGED', 'Some files are no longer available. Remove them and upload again.');
  }
  await audit({ event: 'REQUEST_SUBMIT', outcome: 'SUCCESS', objectId: created.code, ...meta(req) });
  res.status(201).json({ id: created.code, expectedAt: created.expectedAt.toISOString() });
});

class StaleUpload extends Error {}

// ---- DSH-01..DSH-04: tiles and list ----

requestsRouter.get('/summary', async (req, res) => {
  const counts = await prisma.request.groupBy({ by: ['status'], where: scope(req.auth!.user), _count: true });
  const sum = (statuses: RequestStatus[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);
  res.json({
    total: counts.reduce((n, c) => n + c._count, 0),
    inProgress: sum(STATUS_GROUPS.inProgress),
    completed: sum(STATUS_GROUPS.completed),
    pending: sum(STATUS_GROUPS.pending),
  });
});

const SORTS = {
  id: 'number',
  receivedAt: 'receivedAt',
  updatedAt: 'updatedAt',
  expectedAt: 'expectedAt',
  completedAt: 'deliveredAt',
  status: 'status',
} as const;

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  group: z.enum(Object.keys(STATUS_GROUPS) as [StatusGroup, ...StatusGroup[]]).optional(),
  // Leaves a group out, e.g. Recent Requests hides completed ones (they are listed under Completed Deliverables).
  exclude: z.enum(Object.keys(STATUS_GROUPS) as [StatusGroup, ...StatusGroup[]]).optional(),
  sort: z.enum(Object.keys(SORTS) as [keyof typeof SORTS, ...(keyof typeof SORTS)[]]).default('receivedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

requestsRouter.get('/', async (req, res) => {
  const query = listSchema.safeParse(req.query);
  if (!query.success) return fail(res, 400, 'INVALID_REQUEST', 'Invalid filter.');
  const { q, group, exclude, sort, order, page, pageSize } = query.data;
  const excluded: RequestStatus[] = exclude ? STATUS_GROUPS[exclude] : [];
  const statuses = group && (STATUS_GROUPS[group] as RequestStatus[]).filter((s) => !excluded.includes(s));

  const where: Prisma.RequestWhereInput = {
    ...scope(req.auth!.user),
    ...(statuses ? { status: { in: statuses } } : excluded.length > 0 && { status: { notIn: excluded } }),
    // DSH-03: partial, case-insensitive match on the request ID or service.
    ...(q && {
      OR: [
        { code: { contains: q, mode: 'insensitive' } },
        { serviceType: { name: { contains: q, mode: 'insensitive' } } },
      ],
    }),
  };

  const [total, rows] = await Promise.all([
    prisma.request.count({ where }),
    prisma.request.findMany({
      where,
      // Only deliveredAt is nullable; undelivered requests sort last either way.
      orderBy: [{ [SORTS[sort]]: sort === 'completedAt' ? { sort: order, nulls: 'last' } : order }, { number: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { serviceType: { select: { name: true } }, organization: { select: { name: true } } },
    }),
  ]);
  const stats = await documentStats(rows.map((r) => r.id));

  res.json({
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.code,
      organization: r.organization.name,
      service: r.serviceType.name,
      status: r.status,
      documents: stats.get(r.id)?.documents ?? 0,
      pages: stats.get(r.id)?.pages ?? 0,
      receivedAt: r.receivedAt.toISOString(),
      expectedAt: r.expectedAt.toISOString(),
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
});

async function documentStats(requestIds: string[]) {
  const grouped = requestIds.length
    ? await prisma.requestDocument.groupBy({
        by: ['requestId'],
        where: { requestId: { in: requestIds } },
        _count: true,
        _sum: { pages: true },
      })
    : [];
  return new Map(grouped.map((g) => [g.requestId!, { documents: g._count, pages: g._sum.pages ?? 0 }]));
}

// ---- TRK-01..TRK-04: request detail and stage tracking ----

const codeSchema = z.string().regex(/^MR-\d{4,9}$/i);

async function findRequest(req: Request) {
  const code = codeSchema.safeParse(req.params.code);
  if (!code.success) return null;
  return prisma.request.findFirst({
    where: { ...scope(req.auth!.user), code: code.data.toUpperCase() },
    include: {
      serviceType: { select: { name: true } },
      organization: { select: { name: true } },
      documents: { orderBy: { fileName: 'asc' }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, pages: true, outputAt: true } },
      events: { orderBy: { occurredAt: 'asc' }, select: { status: true, occurredAt: true } },
    },
  });
}

async function notFound(req: Request, res: Response) {
  await audit({ event: 'REQUEST_VIEW', outcome: 'DENIED', objectId: String(req.params.code).slice(0, 40), ...meta(req) });
  return fail(res, 404, 'NOT_FOUND', 'This request does not exist or you do not have access to it.');
}

requestsRouter.get('/:code', async (req, res) => {
  const r = await findRequest(req);
  if (!r) return notFound(req, res);
  const stageEvents: RequestStatus[][] = [['ALLOCATED'], ['IN_PROCESSING'], ['SUMMARIZATION'], ['QC_VERIFICATION'], ['DELIVERED']];

  res.json({
    id: r.code,
    organization: r.organization.name,
    service: r.serviceType.name,
    status: r.status,
    receivedAt: r.receivedAt.toISOString(),
    expectedAt: r.expectedAt.toISOString(),
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
    cancellable: CANCELLABLE.includes(r.status) && req.auth!.user.role === 'CLIENT_USER',
    pages: r.documents.reduce((n, d) => n + d.pages, 0),
    documents: r.documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      pages: d.pages,
      outputReady: Boolean(d.outputAt) && OUTPUT_READY.includes(r.status),
    })),
    stages: STAGES.map((name, i) => {
      const state = i < r.stage ? 'completed' : i === r.stage ? 'active' : 'pending';
      // Completion time = when the next status in the sequence was recorded.
      const doneAt = r.events.findLast((e) => stageEvents[i].includes(e.status))?.occurredAt;
      return {
        name,
        state,
        progress: state === 'completed' ? 100 : state === 'active' ? r.stageProgress : 0,
        completedAt: state === 'completed' ? (doneAt?.toISOString() ?? null) : null,
      };
    }),
    history: r.events.map((e) => ({ status: e.status, at: e.occurredAt.toISOString() })),
  });
});

requestsRouter.post('/:code/cancel', requireRole('CLIENT_USER'), async (req, res) => {
  const r = await findRequest(req);
  if (!r) return notFound(req, res);
  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.request.updateMany({ where: { id: r.id, status: { in: CANCELLABLE } }, data: { status: 'CANCELLED' } });
    if (count) await tx.statusEvent.create({ data: { requestId: r.id, status: 'CANCELLED', actorUserId: req.auth!.user.id } });
    return count;
  });
  await audit({ event: 'REQUEST_CANCEL', outcome: moved ? 'SUCCESS' : 'FAILURE', objectId: r.code, ...meta(req) });
  if (!moved) return fail(res, 409, 'NOT_CANCELLABLE', 'Processing has started, so this request can no longer be cancelled.');
  res.status(204).end();
});

// ---- DEL-02..DEL-06: original document and processed output ----

requestsRouter.get('/:code/documents/:docId/file', async (req, res) => {
  const r = await findRequest(req);
  const doc = r?.documents.find((d) => d.id === req.params.docId);
  if (!r || !doc) return notFound(req, res);
  const stored = await prisma.requestDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { storageKey: true } });
  await audit({ event: 'DOCUMENT_VIEW', outcome: 'SUCCESS', objectId: doc.id, ...meta(req) });

  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', 'inline');
  // The viewer embeds the PDF in a same-origin frame.
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
  res.removeHeader('X-Frame-Options');
  res.sendFile(filePath(stored.storageKey));
});

requestsRouter.get('/:code/documents/:docId/output', async (req, res) => {
  const r = await findRequest(req);
  const doc = r?.documents.find((d) => d.id === req.params.docId);
  if (!r || !doc) return notFound(req, res);
  if (!OUTPUT_READY.includes(r.status)) return fail(res, 409, 'NOT_READY', 'The output for this request is not ready yet.');
  const { output } = await prisma.requestDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { output: true } });
  if (!output) return fail(res, 409, 'NOT_READY', 'The output for this file is not ready yet.');

  // PRD 7.2: the client's first access to a delivered output marks the request Completed.
  if (r.status === 'DELIVERED' && req.auth!.user.role === 'CLIENT_USER') {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.request.updateMany({
        where: { id: r.id, status: 'DELIVERED' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (count) await tx.statusEvent.create({ data: { requestId: r.id, status: 'COMPLETED', actorUserId: req.auth!.user.id } });
    });
  }
  await audit({ event: 'OUTPUT_VIEW', outcome: 'SUCCESS', objectId: doc.id, ...meta(req) });
  res.json({ document: { id: doc.id, fileName: doc.fileName, pages: doc.pages }, output });
});

// ---- DEL-01 / DEL-03: download a completed request's output ----
// Output only: the source was uploaded by the client and is shown only where the Admin allows it (DEL-06).
// One output downloads as itself; several come as one ZIP. The PDF is a placeholder until the internal application
// supplies the real output file and its format is fixed [OQ].

requestsRouter.get('/:code/download', async (req, res) => {
  const r = await findRequest(req);
  if (!r) return notFound(req, res);
  if (!OUTPUT_READY.includes(r.status)) return fail(res, 409, 'NOT_READY', 'The output for this request is not ready yet.');
  const docs = await prisma.requestDocument.findMany({
    where: { requestId: r.id },
    orderBy: { fileName: 'asc' },
    select: { fileName: true, output: true },
  });
  if (docs.some((d) => !d.output)) return fail(res, 409, 'NOT_READY', 'The output for this request is not ready yet.');

  const user = req.auth!.user;
  let failed = false;
  res.on('close', async () => {
    // DEL-03: only a complete download counts; logs never hold file content.
    const ok = !failed && res.writableFinished;
    if (ok && r.status === 'DELIVERED' && user.role === 'CLIENT_USER') {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.request.updateMany({ where: { id: r.id, status: 'DELIVERED' }, data: { status: 'COMPLETED', completedAt: new Date() } });
        if (count) await tx.statusEvent.create({ data: { requestId: r.id, status: 'COMPLETED', actorUserId: user.id } });
      });
    }
    await audit({ event: 'OUTPUT_DOWNLOAD', outcome: ok ? 'SUCCESS' : 'FAILURE', objectId: r.code, ...meta(req) });
  });

  res.setHeader('Cache-Control', 'no-store');
  const outputs = docs.map((d) =>
    outputPdf({ requestCode: r.code, fileName: d.fileName, service: r.serviceType.name }, d.output as unknown as DocumentOutput),
  );
  if (outputs.length === 1) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${r.code} - summary.pdf"`);
    return res.end(outputs[0]);
  }
  const zip = archiver('zip', { zlib: { level: 6 } });
  zip.on('error', () => {
    failed = true;
    res.destroy();
  });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${r.code} - summaries.zip"`);
  zip.pipe(res);
  const names = uniqueNames(docs.map((d) => `${d.fileName.replace(/\.[^.]+$/, '')} - summary.pdf`));
  outputs.forEach((pdf, i) => zip.append(pdf, { name: names[i] }));
  await zip.finalize();
});
