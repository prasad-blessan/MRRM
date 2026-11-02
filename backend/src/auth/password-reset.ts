import { audit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { sendPasswordChangedEmail, sendPasswordResetEmail } from '../emails.js';
import { consumeEmailToken, issueEmailToken } from './email-tokens.js';
import {
  checkPasswordPolicy,
  hashPassword,
  isRecentlyUsed,
  recordPasswordHistory,
  type PasswordProblem,
} from './password.js';
import { hashToken } from './crypto.js';

export type ResetResult =
  | { kind: 'reset' }
  | { kind: 'invalid_link' }
  | { kind: 'weak_password'; problem: PasswordProblem }
  | { kind: 'reused_password' };

// REG-05: the caller always shows the same message, whether or not the email exists.
export async function requestPasswordReset(emailInput: string, ip: string | null): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });
  const eligible =
    user && user.status === 'ACTIVE' && (!user.organization || user.organization.status === 'ACTIVE');
  if (!eligible) {
    await audit({ event: 'PASSWORD_RESET_REQUESTED', outcome: 'FAILURE', ip });
    return;
  }

  const token = await issueEmailToken(user.id, 'RESET_PASSWORD', config.RESET_LINK_TTL_MINUTES * 60_000);
  await sendPasswordResetEmail(email, token);
  await audit({
    event: 'PASSWORD_RESET_REQUESTED',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: user.id,
    ip,
  });
}

// Lets the reset page check a link before the user types a new password. Does not consume it.
export async function isResetLinkValid(token: string): Promise<boolean> {
  const record = await prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!record && record.purpose === 'RESET_PASSWORD' && !record.usedAt && record.expiresAt > new Date();
}

// REG-05 / REG-09: single-use link, policy and history checks, then every session is ended.
export async function resetPassword(token: string, password: string, ip: string | null): Promise<ResetResult> {
  const record = await prisma.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.purpose !== 'RESET_PASSWORD' || record.usedAt || record.expiresAt <= new Date()) {
    await audit({ event: 'PASSWORD_RESET_COMPLETED', outcome: 'FAILURE', ip });
    return { kind: 'invalid_link' };
  }

  // Validate before consuming so a rejected password does not burn the link.
  const { user } = record;
  const problem = checkPasswordPolicy(password, user.email);
  if (problem) return { kind: 'weak_password', problem };
  if (await isRecentlyUsed(user.id, password)) return { kind: 'reused_password' };

  if (!(await consumeEmailToken(token, 'RESET_PASSWORD'))) return { kind: 'invalid_link' };

  const passwordHash = await hashPassword(password);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // A reset also clears a lockout: the lock email points users here to regain access.
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await recordPasswordHistory(tx, user.id, passwordHash);
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.loginChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
  });

  await sendPasswordChangedEmail(user.email);
  await audit({
    event: 'PASSWORD_RESET_COMPLETED',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: user.id,
    ip,
  });
  return { kind: 'reset' };
}
