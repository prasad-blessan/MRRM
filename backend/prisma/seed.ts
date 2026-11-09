// Development seed: synthetic accounts only (PRD 12.2). Never run against production.
import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient, type RequestStatus } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureStorage, filePath, requestFileKey } from '../src/requests/storage.js';
import { deliver, DONE_STAGE, requestCode } from '../src/requests/workflow.js';
import { syntheticPdf } from './synthetic-pdf.js';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in backend/.env`);
  return value;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');

  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'ABC Insurance (test)',
      type: 'CLIENT',
      status: 'ACTIVE',
      timezone: 'America/New_York',
    },
  });

  const users = [
    {
      email: 'admin@mrrm.test',
      fullName: 'Test Admin',
      role: 'LS_ADMIN' as const,
      organizationId: null,
      password: requireEnv('SEED_ADMIN_PASSWORD'),
    },
    {
      email: 'client@abc-insurance.test',
      fullName: 'Test Client User',
      role: 'CLIENT_USER' as const,
      organizationId: org.id,
      password: requireEnv('SEED_CLIENT_PASSWORD'),
    },
  ];

  for (const { password, ...user } of users) {
    const passwordHash = await argon2.hash(password);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null },
      create: { ...user, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    console.log(`Seeded ${user.role}: ${user.email}`);
  }

  await seedServices();
  await seedRequests(org.id);
}

// Service catalogue from the design (SLA hours are placeholders until confirmed).
const SERVICES = [
  ['IDX_DEDUP', 'Indexing and Deduplication', 24],
  ['IDX_DEDUP_TOC', 'Indexing and Deduplication with TOC', 24],
  ['IDX_BOOKMARK', 'Indexing and Bookmarking', 24],
  ['BOOKMARK_ANNOTATE', 'Bookmarking and Annotation', 48],
  ['IDX_BM_TOC_TABLE', 'Indexing, Bookmarking, TOC, and Table Summary with Hyperlink/Reverse Hyperlink', 72],
  ['IDX_TOC_TABLE', 'Indexing, TOC, and Table Summary with Hyperlink/Reverse Hyperlink', 72],
  ['IDX_TOC_PARAGRAPH', 'Indexing, TOC, and Paragraph Summary with Hyperlink/Reverse Hyperlink', 72],
  ['PDF_SORTING', 'PDF sorting services', 24],
  ['CLIENT_TEMPLATE', 'Others - Client-Specific Template Review', 72],
] as const;

async function seedServices() {
  for (const [index, [code, name, slaHours]] of SERVICES.entries()) {
    await prisma.serviceType.upsert({
      where: { code },
      update: { name, sortOrder: index },
      create: { code, name, slaHours, sortOrder: index },
    });
  }
  console.log(`Seeded ${SERVICES.length} service types`);
}

// Synthetic requests, one file each, so the files folder and the dashboard counts match:
// 3 completed (Completed Deliverables), 1 in progress, 1 pending. File names and content are placeholders, never real records.
const SAMPLE_REQUESTS: { status: RequestStatus; stage: number; progress: number; daysAgo: number; service: string; files: number }[] = [
  { status: 'COMPLETED', stage: DONE_STAGE, progress: 100, daysAgo: 12, service: 'IDX_DEDUP', files: 1 },
  { status: 'DELIVERED', stage: DONE_STAGE, progress: 100, daysAgo: 9, service: 'IDX_TOC_TABLE', files: 1 },
  { status: 'DELIVERED', stage: DONE_STAGE, progress: 100, daysAgo: 6, service: 'IDX_BOOKMARK', files: 1 },
  { status: 'IN_PROCESSING', stage: 1, progress: 70, daysAgo: 2, service: 'BOOKMARK_ANNOTATE', files: 1 },
  { status: 'RECEIVED', stage: 0, progress: 0, daysAgo: 1, service: 'PDF_SORTING', files: 1 },
];
const STAGE_TRAIL: RequestStatus[] = ['ALLOCATED', 'IN_PROCESSING', 'SUMMARIZATION', 'QC_VERIFICATION'];
const HOUR = 3_600_000;

async function seedRequests(organizationId: string) {
  if (await prisma.request.count()) return console.log('Requests already present; sample requests skipped');
  await ensureStorage();
  const client = await prisma.user.findUniqueOrThrow({ where: { email: 'client@abc-insurance.test' } });
  const services = new Map((await prisma.serviceType.findMany()).map((s) => [s.code, s]));

  for (const [i, sample] of SAMPLE_REQUESTS.entries()) {
    const number = i + 1;
    const service = services.get(sample.service)!;
    const receivedAt = new Date(Date.now() - sample.daysAgo * 24 * HOUR - (i % 5) * HOUR);
    const done = sample.stage === DONE_STAGE;

    await prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          number,
          code: requestCode(number),
          organizationId,
          submittedById: client.id,
          serviceTypeId: service.id,
          status: done ? 'QC_VERIFICATION' : sample.status,
          stage: Math.min(sample.stage, DONE_STAGE - 1),
          stageProgress: sample.progress,
          receivedAt,
          expectedAt: new Date(receivedAt.getTime() + service.slaHours * HOUR),
        },
      });
      for (let f = 1; f <= sample.files; f++) {
        const pages = 6 + ((number * 7 + f * 13) % 40);
        const fileName = `SYNTH-${request.code}-${String(f).padStart(3, '0')}.pdf`;
        // Same layout as a real submit: storage/files/<request ID>/<file name>.
        const storageKey = requestFileKey(request.code, fileName);
        const pdf = syntheticPdf(fileName, pages);
        await mkdir(path.dirname(filePath(storageKey)), { recursive: true });
        await writeFile(filePath(storageKey), pdf);
        await tx.requestDocument.create({
          data: { requestId: request.id, uploadedById: client.id, fileName, mimeType: 'application/pdf', sizeBytes: pdf.length, pages, storageKey },
        });
      }

      const trail: RequestStatus[] = ['RECEIVED', ...STAGE_TRAIL.slice(0, Math.min(sample.stage, STAGE_TRAIL.length))];
      if (sample.status === 'ON_HOLD') trail.push('ON_HOLD');
      for (const [step, status] of trail.entries()) {
        await tx.statusEvent.create({ data: { requestId: request.id, status, occurredAt: new Date(receivedAt.getTime() + step * 4 * HOUR) } });
      }
      if (!done) return;
      const deliveredAt = new Date(receivedAt.getTime() + (service.slaHours - 2) * HOUR);
      await deliver(tx, request.id, deliveredAt);
      if (sample.status === 'COMPLETED') {
        const completedAt = new Date(deliveredAt.getTime() + 5 * HOUR);
        await tx.request.update({ where: { id: request.id }, data: { status: 'COMPLETED', completedAt } });
        await tx.statusEvent.create({ data: { requestId: request.id, status: 'COMPLETED', occurredAt: completedAt, actorUserId: client.id } });
      }
    });
  }
  // Last updated = the latest recorded status change.
  await prisma.$executeRaw`UPDATE requests r SET updated_at = (SELECT max(occurred_at) FROM status_events e WHERE e.request_id = r.id)`;
  // Keep the sequence ahead of the seeded numbers.
  await prisma.$executeRaw`SELECT setval('requests_number_seq', ${SAMPLE_REQUESTS.length})`;
  console.log(`Seeded ${SAMPLE_REQUESTS.length} synthetic requests`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
