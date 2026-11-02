import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { Organization, User } from '@prisma/client';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { sendMail } from '../mailer.js';
import { generateOtp, generateToken, hashOtp, hashToken, safeEqualHex } from './crypto.js';

type UserWithOrg = User & { organization: Organization | null };

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export type LoginResult =
  | { kind: 'otp_sent'; challengeId: string; expiresAt: Date; maskedEmail: string }
  | { kind: 'invalid_credentials' }
  | { kind: 'locked' }
  | { kind: 'inactive' };

export type VerifyResult =
  | { kind: 'success'; sessionToken: string; idleExpiresAt: Date; user: UserWithOrg }
  | { kind: 'invalid_code'; attemptsLeft: number }
  | { kind: 'expired' }
  | { kind: 'locked' };

export type ResendResult =
  | { kind: 'otp_sent'; challengeId: string; expiresAt: Date; maskedEmail: string }
  | { kind: 'expired' }
  | { kind: 'locked' };

// Verifying against a fixed hash when the user does not exist keeps response times uniform.
const dummyHashPromise = argon2.hash('mrrm-timing-equalizer');

const minutes = (n: number) => n * 60_000;

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'*'.repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

function isLocked(user: User): boolean {
  return user.lockedUntil !== null && user.lockedUntil > new Date();
}

// REG-03 / ADM-02: only active users of approved, active organizations can sign in.
function canSignIn(user: UserWithOrg): boolean {
  if (user.status !== 'ACTIVE') return false;
  return user.organization === null || user.organization.status === 'ACTIVE';
}

// REG-06 / REG-10: password and OTP failures share one consecutive-failure counter.
async function registerFailure(user: User, meta: RequestMeta): Promise<{ locked: boolean }> {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
  });
  if (updated.failedLoginCount < config.LOCKOUT_THRESHOLD) return { locked: false };

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + minutes(config.LOCKOUT_MINUTES)) },
  });
  await prisma.loginChallenge.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await audit({
    event: 'ACCOUNT_LOCKED',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: user.id,
    ip: meta.ip,
  });
  await sendMail({
    to: user.email,
    subject: 'MRRM: your account has been locked',
    text:
      `Your MRRM account was locked after ${config.LOCKOUT_THRESHOLD} unsuccessful sign-in attempts.\n\n` +
      `You can try again after ${config.LOCKOUT_MINUTES} minutes, or reset your password at ${config.APP_BASE_URL}/forgot-password.\n\n` +
      `If this was not you, contact LevelShift support.`,
  });
  return { locked: true };
}

async function issueChallenge(user: User, meta: RequestMeta) {
  // A new code invalidates any earlier unused code.
  await prisma.loginChallenge.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const id = randomUUID();
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + config.OTP_TTL_SECONDS * 1000);
  const challenge = await prisma.loginChallenge.create({
    data: { id, userId: user.id, codeHash: hashOtp(id, code), expiresAt },
  });

  await sendMail({
    to: user.email,
    subject: 'MRRM: your sign-in code',
    text:
      `Your MRRM sign-in code is ${code}.\n\n` +
      `It expires in ${Math.round(config.OTP_TTL_SECONDS / 60)} minutes. Do not share this code with anyone.\n\n` +
      `If you did not try to sign in, change your password at ${config.APP_BASE_URL}/forgot-password.`,
  });
  await audit({
    event: 'OTP_SENT',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: challenge.id,
    ip: meta.ip,
  });

  return { kind: 'otp_sent' as const, challengeId: challenge.id, expiresAt, maskedEmail: maskEmail(user.email) };
}

export async function login(emailInput: string, password: string, meta: RequestMeta): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });

  if (!user || !user.passwordHash) {
    await argon2.verify(await dummyHashPromise, password);
    await audit({ event: 'LOGIN_PASSWORD', outcome: 'FAILURE', ip: meta.ip });
    return { kind: 'invalid_credentials' };
  }

  const auditBase = { actorUserId: user.id, organizationId: user.organizationId, objectId: user.id, ip: meta.ip };

  if (isLocked(user)) {
    await audit({ ...auditBase, event: 'LOGIN_PASSWORD', outcome: 'DENIED' });
    return { kind: 'locked' };
  }

  const passwordOk = await argon2.verify(user.passwordHash, password);
  if (!passwordOk) {
    await audit({ ...auditBase, event: 'LOGIN_PASSWORD', outcome: 'FAILURE' });
    const { locked } = await registerFailure(user, meta);
    return locked ? { kind: 'locked' } : { kind: 'invalid_credentials' };
  }

  // Revealed only after a correct password, so it does not help account enumeration.
  if (!canSignIn(user)) {
    await audit({ ...auditBase, event: 'LOGIN_PASSWORD', outcome: 'DENIED' });
    return { kind: 'inactive' };
  }

  await audit({ ...auditBase, event: 'LOGIN_PASSWORD', outcome: 'SUCCESS' });
  return issueChallenge(user, meta);
}

export async function verifyOtp(challengeId: string, code: string, meta: RequestMeta): Promise<VerifyResult> {
  const challenge = await prisma.loginChallenge.findUnique({
    where: { id: challengeId },
    include: { user: { include: { organization: true } } },
  });
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    await audit({ event: 'LOGIN_OTP', outcome: 'FAILURE', objectId: challengeId, ip: meta.ip });
    return { kind: 'expired' };
  }

  const { user } = challenge;
  const auditBase = { actorUserId: user.id, organizationId: user.organizationId, objectId: challenge.id, ip: meta.ip };

  if (isLocked(user)) {
    await audit({ ...auditBase, event: 'LOGIN_OTP', outcome: 'DENIED' });
    return { kind: 'locked' };
  }
  if (!canSignIn(user)) {
    await audit({ ...auditBase, event: 'LOGIN_OTP', outcome: 'DENIED' });
    return { kind: 'expired' };
  }

  if (!safeEqualHex(challenge.codeHash, hashOtp(challenge.id, code))) {
    const attempts = challenge.attempts + 1;
    const exhausted = attempts >= config.OTP_MAX_ATTEMPTS;
    await prisma.loginChallenge.update({
      where: { id: challenge.id },
      data: { attempts, consumedAt: exhausted ? new Date() : null },
    });
    await audit({ ...auditBase, event: 'LOGIN_OTP', outcome: 'FAILURE' });
    const { locked } = await registerFailure(user, meta);
    if (locked) return { kind: 'locked' };
    if (exhausted) return { kind: 'expired' };
    return { kind: 'invalid_code', attemptsLeft: config.OTP_MAX_ATTEMPTS - attempts };
  }

  // Single use: only the request that flips consumedAt wins.
  const consumed = await prisma.loginChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return { kind: 'expired' };

  const now = new Date();
  const sessionToken = generateToken();
  const idleExpiresAt = new Date(now.getTime() + minutes(config.SESSION_IDLE_MINUTES));
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    }),
    prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(sessionToken),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        idleExpiresAt,
        absoluteExpiresAt: new Date(now.getTime() + minutes(config.SESSION_ABSOLUTE_HOURS * 60)),
      },
    }),
  ]);
  await audit({ ...auditBase, event: 'LOGIN_OTP', outcome: 'SUCCESS' });

  return { kind: 'success', sessionToken, idleExpiresAt, user };
}

export async function resendOtp(challengeId: string, meta: RequestMeta): Promise<ResendResult> {
  const challenge = await prisma.loginChallenge.findUnique({
    where: { id: challengeId },
    include: { user: { include: { organization: true } } },
  });
  // The password step must be recent; otherwise the user starts again.
  const windowStart = new Date(Date.now() - minutes(config.OTP_RESEND_WINDOW_MINUTES));
  if (!challenge || challenge.createdAt < windowStart || challenge.attempts >= config.OTP_MAX_ATTEMPTS) {
    return { kind: 'expired' };
  }
  const { user } = challenge;
  if (isLocked(user)) return { kind: 'locked' };
  if (!canSignIn(user)) return { kind: 'expired' };

  return issueChallenge(user, meta);
}
