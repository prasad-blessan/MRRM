import { Router } from 'express';
import { z } from 'zod';
import { audit } from './audit.js';
import { requireAuth } from './auth/session.js';
import { prisma } from './db.js';

// Settings page: the signed-in user's own preferences.
export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const preferencesSchema = z.object({
  timezone: z.string().max(64).refine(isTimeZone).nullable(),
  emailNotifications: z.boolean(),
});

settingsRouter.get('/', (req, res) => {
  const { user } = req.auth!;
  res.json({
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    organization: user.organization?.name ?? null,
    timezone: user.timezone,
    organizationTimezone: user.organization?.timezone ?? null,
    emailNotifications: user.emailNotifications,
  });
});

settingsRouter.put('/', async (req, res) => {
  const body = preferencesSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Choose a valid time zone.' } });
    return;
  }
  const { user } = req.auth!;
  await prisma.user.update({ where: { id: user.id }, data: body.data });
  await audit({
    event: 'PREFERENCES_UPDATE',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: user.id,
    ip: req.ip ?? null,
  });
  res.status(204).end();
});
