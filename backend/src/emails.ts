import { config } from './config.js';
import { prisma } from './db.js';
import { sendMail } from './mailer.js';

// NOT-02: system emails carry the event, IDs and a link only. No PHI, no reasons, no free text.
const link = (path: string) => `${config.APP_BASE_URL}${path}`;
const SIGNATURE = '\n\nLevelShift MRRM\nThis is an automated message. Please do not reply.';

export function sendVerificationEmail(to: string, token: string) {
  return sendMail({
    to,
    subject: 'MRRM: verify your email address',
    text:
      `Thank you for registering with MRRM.\n\n` +
      `Verify your email address to send your registration to LevelShift for approval:\n` +
      `${link(`/verify-email?token=${encodeURIComponent(token)}`)}\n\n` +
      `This link can be used once and expires in ${config.VERIFY_LINK_TTL_HOURS} hours.` +
      SIGNATURE,
  });
}

export function sendPasswordResetEmail(to: string, token: string) {
  return sendMail({
    to,
    subject: 'MRRM: reset your password',
    text:
      `We received a request to reset your MRRM password.\n\n` +
      `Reset it here:\n${link(`/reset-password?token=${encodeURIComponent(token)}`)}\n\n` +
      `This link can be used once and expires in ${config.RESET_LINK_TTL_MINUTES} minutes. ` +
      `If you did not ask for this, you can ignore this email; your password will not change.` +
      SIGNATURE,
  });
}

export function sendPasswordChangedEmail(to: string) {
  return sendMail({
    to,
    subject: 'MRRM: your password was changed',
    text:
      `Your MRRM password was changed and you were signed out of all devices.\n\n` +
      `If you did not make this change, contact LevelShift support immediately.` +
      SIGNATURE,
  });
}

export function sendRegistrationApprovedEmail(to: string) {
  return sendMail({
    to,
    subject: 'MRRM: your registration is approved',
    text:
      `Your organization's MRRM registration has been approved.\n\n` +
      `Sign in here: ${link('/login')}\n\n` +
      `You will be asked for a one-time code sent to this email address each time you sign in.` +
      SIGNATURE,
  });
}

export function sendRegistrationRejectedEmail(to: string) {
  return sendMail({
    to,
    subject: 'MRRM: update on your registration',
    text:
      `Your organization's MRRM registration was not approved.\n\n` +
      `Please contact LevelShift support for more information: ${link('/contact')}` +
      SIGNATURE,
  });
}

// NOT-05: every active LevelShift Admin is told a registration is waiting.
export async function notifyAdminsPendingApproval(organizationId: string) {
  const admins = await prisma.user.findMany({
    where: { role: 'LS_ADMIN', status: 'ACTIVE' },
    select: { email: true },
  });
  await Promise.all(
    admins.map((admin) =>
      sendMail({
        to: admin.email,
        subject: 'MRRM: registration waiting for approval',
        text:
          `A new registration (ID ${organizationId}) has verified its email and is waiting for approval.\n\n` +
          `Review it here: ${link('/admin/registrations')}` +
          SIGNATURE,
      }),
    ),
  );
}
