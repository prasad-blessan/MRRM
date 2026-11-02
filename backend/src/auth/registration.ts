import { Prisma, type OrganizationType } from '@prisma/client';
import { audit } from '../audit.js';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { notifyAdminsPendingApproval, sendVerificationEmail } from '../emails.js';
import { consumeEmailToken, issueEmailToken } from './email-tokens.js';
import { checkPasswordPolicy, hashPassword, recordPasswordHistory, type PasswordProblem } from './password.js';

export interface RegistrationInput {
  organizationName: string;
  organizationType: OrganizationType;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
  acceptTerms: true;
}

export type RegisterResult =
  | { kind: 'registered' }
  | { kind: 'email_taken' }
  | { kind: 'weak_password'; problem: PasswordProblem };

const verifyTtlMs = () => config.VERIFY_LINK_TTL_HOURS * 60 * 60_000;

// REG-01, REG-02, REG-07, CMP-12.
export async function register(input: RegistrationInput, ip: string | null): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const problem = checkPasswordPolicy(input.password, email);
  if (problem) return { kind: 'weak_password', problem };

  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    await audit({ event: 'REGISTRATION_SUBMITTED', outcome: 'DENIED', ip });
    return { kind: 'email_taken' };
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const user = await createRegistration(input, email, passwordHash, now);
  if (!user) return { kind: 'email_taken' };

  const token = await issueEmailToken(user.id, 'VERIFY_EMAIL', verifyTtlMs());
  await sendVerificationEmail(email, token);
  await audit({
    event: 'REGISTRATION_SUBMITTED',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: user.organizationId,
    ip,
  });
  return { kind: 'registered' };
}

// Returns null when a concurrent registration took the email first.
async function createRegistration(input: RegistrationInput, email: string, passwordHash: string, now: Date) {
  try {
    return await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.organizationName.trim(),
          type: input.organizationType,
          address: input.address.trim(),
          status: 'PENDING_VERIFICATION',
        },
      });
      const created = await tx.user.create({
        data: {
          organizationId: org.id,
          email,
          fullName: input.contactName.trim(),
          phone: input.phone.trim(),
          role: 'CLIENT_USER',
          status: 'INVITED',
          passwordHash,
          termsVersion: config.TERMS_VERSION,
          termsAcceptedAt: now,
        },
      });
      await recordPasswordHistory(tx, created.id, passwordHash);
      return created;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

// REG-02 -> REG-03: a verified registration moves to Pending Approval and admins are notified.
export async function verifyEmail(token: string, ip: string | null): Promise<boolean> {
  const userId = await consumeEmailToken(token, 'VERIFY_EMAIL');
  if (!userId) {
    await audit({ event: 'EMAIL_VERIFIED', outcome: 'FAILURE', ip });
    return false;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
  if (user.organizationId) {
    const moved = await prisma.organization.updateMany({
      where: { id: user.organizationId, status: 'PENDING_VERIFICATION' },
      data: { status: 'PENDING_APPROVAL', submittedAt: new Date() },
    });
    if (moved.count === 1) await notifyAdminsPendingApproval(user.organizationId);
  }
  await audit({
    event: 'EMAIL_VERIFIED',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: user.id,
    ip,
  });
  return true;
}

// REG-08: re-send invalidates earlier links. Always succeeds from the caller's view.
export async function resendVerification(emailInput: string, ip: string | null): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });
  if (!user || user.emailVerifiedAt || user.organization?.status !== 'PENDING_VERIFICATION') return;

  const token = await issueEmailToken(user.id, 'VERIFY_EMAIL', verifyTtlMs());
  await sendVerificationEmail(email, token);
  await audit({
    event: 'VERIFICATION_RESENT',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: user.id,
    ip,
  });
}
