import { Router } from 'express';
import { z } from 'zod';
import { audit } from '../audit.js';
import { requireRole } from '../auth/session.js';
import { prisma } from '../db.js';
import { sendRegistrationApprovedEmail, sendRegistrationRejectedEmail } from '../emails.js';

// ADM-01 / ADM-08 / REG-03 / REG-07: registration approval queue.
export const registrationsRouter = Router();
registrationsRouter.use(requireRole('LS_ADMIN'));

const idParam = z.object({ id: z.uuid() });
const approveSchema = z.object({
  baaSigned: z.literal(true, { error: 'BAA must be signed before approval' }),
  msaReference: z.string().trim().min(1).max(100),
});
const rejectSchema = z.object({ reason: z.string().trim().min(5).max(1000) });

const NOT_PENDING = {
  error: { code: 'NOT_PENDING', message: 'This registration is no longer waiting for approval. Refresh the list.' },
};

registrationsRouter.get('/', async (_req, res) => {
  const orgs = await prisma.organization.findMany({
    where: { status: 'PENDING_APPROVAL' },
    orderBy: { submittedAt: 'asc' },
    include: { users: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });

  // REG-07: same name and type is allowed but flagged for the Admin.
  const matches = orgs.length
    ? await prisma.organization.findMany({
        where: {
          status: { not: 'PENDING_VERIFICATION' },
          OR: orgs.map((o) => ({ type: o.type, name: { equals: o.name, mode: 'insensitive' as const } })),
        },
        select: { id: true, name: true, type: true, status: true },
      })
    : [];
  const sameAs = (a: { name: string; type: string }, b: { name: string; type: string }) =>
    a.type === b.type && a.name.toLowerCase() === b.name.toLowerCase();

  res.json({
    registrations: orgs.map((org) => {
      const contact = org.users[0];
      return {
        id: org.id,
        organizationName: org.name,
        organizationType: org.type,
        address: org.address,
        submittedAt: org.submittedAt?.toISOString() ?? null,
        contact: contact
          ? { name: contact.fullName, email: contact.email, phone: contact.phone }
          : null,
        duplicates: matches
          .filter((o) => o.id !== org.id && sameAs(o, org))
          .map((o) => ({ id: o.id, name: o.name, status: o.status })),
      };
    }),
  });
});

registrationsRouter.post('/:id/approve', async (req, res) => {
  const params = idParam.safeParse(req.params);
  const body = approveSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Confirm the BAA is signed and enter the MSA reference.' },
    });
    return;
  }
  const admin = req.auth!.user;
  const now = new Date();

  const approved = await prisma.$transaction(async (tx) => {
    const moved = await tx.organization.updateMany({
      where: { id: params.data.id, status: 'PENDING_APPROVAL' },
      data: {
        status: 'ACTIVE',
        baaSigned: true,
        msaReference: body.data.msaReference,
        decidedAt: now,
        decidedById: admin.id,
      },
    });
    if (moved.count === 0) return null;
    await tx.user.updateMany({
      where: { organizationId: params.data.id, emailVerifiedAt: { not: null }, status: 'INVITED' },
      data: { status: 'ACTIVE' },
    });
    return tx.user.findMany({ where: { organizationId: params.data.id, status: 'ACTIVE' }, select: { email: true } });
  });

  if (!approved) {
    res.status(409).json(NOT_PENDING);
    return;
  }
  await Promise.all(approved.map((u) => sendRegistrationApprovedEmail(u.email)));
  await audit({
    event: 'REGISTRATION_APPROVED',
    outcome: 'SUCCESS',
    actorUserId: admin.id,
    organizationId: params.data.id,
    objectId: params.data.id,
    ip: req.ip ?? null,
  });
  res.status(204).end();
});

registrationsRouter.post('/:id/reject', async (req, res) => {
  const params = idParam.safeParse(req.params);
  const body = rejectSchema.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Enter a reason for the rejection (at least 5 characters).' },
    });
    return;
  }
  const admin = req.auth!.user;

  const moved = await prisma.organization.updateMany({
    where: { id: params.data.id, status: 'PENDING_APPROVAL' },
    data: { status: 'REJECTED', rejectionReason: body.data.reason, decidedAt: new Date(), decidedById: admin.id },
  });
  if (moved.count === 0) {
    res.status(409).json(NOT_PENDING);
    return;
  }

  const contacts = await prisma.user.findMany({ where: { organizationId: params.data.id }, select: { email: true } });
  await Promise.all(contacts.map((u) => sendRegistrationRejectedEmail(u.email)));
  await audit({
    event: 'REGISTRATION_REJECTED',
    outcome: 'SUCCESS',
    actorUserId: admin.id,
    organizationId: params.data.id,
    objectId: params.data.id,
    ip: req.ip ?? null,
  });
  res.status(204).end();
});
