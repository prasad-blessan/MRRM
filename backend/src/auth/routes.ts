import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { audit } from '../audit.js';
import { passwordProblemMessage } from './password.js';
import { isResetLinkValid, requestPasswordReset, resetPassword } from './password-reset.js';
import { register, resendVerification, verifyEmail } from './registration.js';
import { login, resendOtp, verifyOtp, type RequestMeta } from './service.js';
import { clearSessionCookie, requireAuth, revokeSession, setSessionCookie, type AuthContext } from './session.js';

export const authRouter = Router();

// Per-IP throttle on top of the per-account lockout (REG-06).
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

// REG-04: friendly messages that never expose technical detail.
const MESSAGES = {
  invalid_request: 'Please check the details you entered and try again.',
  invalid_credentials: 'The email or password you entered is incorrect.',
  locked:
    'Your account is temporarily locked after too many unsuccessful attempts. We have emailed you how to regain access.',
  inactive:
    'Your account is not active. If you registered recently, we will email you once LevelShift has reviewed it. Otherwise, contact support.',
  expired: 'This code has expired or is no longer valid. Please request a new code.',
  invalid_code: 'The code you entered is incorrect.',
  email_taken: 'An account with this email address already exists. Sign in or reset your password instead.',
  invalid_link: 'This link has expired or has already been used. Please request a new one.',
  reused_password: 'You have used this password recently. Choose a different one.',
} as const;

const loginSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  password: z.string().min(1).max(256),
});
const verifySchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
});
const resendSchema = z.object({ challengeId: z.uuid() });

const text = (max: number) => z.string().trim().min(1).max(max);
const emailField = z.string().trim().max(254).pipe(z.email());
const tokenField = z.string().min(20).max(200);

// REG-01: all fields mandatory; email and phone formats validated.
const registerSchema = z.object({
  organizationName: text(200),
  organizationType: z.enum(['CLIENT', 'AGENCY']),
  contactName: text(120),
  email: emailField,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s().-]{7,20}$/)
    .refine((v) => v.replace(/\D/g, '').length >= 7),
  address: text(500),
  password: z.string().min(1).max(256),
  acceptTerms: z.literal(true),
});
const emailOnlySchema = z.object({ email: emailField });
const tokenSchema = z.object({ token: tokenField });
const resetSchema = z.object({ token: tokenField, password: z.string().min(1).max(256) });

function meta(req: Request): RequestMeta {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

function fail(res: Response, status: number, code: keyof typeof MESSAGES, extra: object = {}) {
  res.status(status).json({ error: { code: code.toUpperCase(), message: MESSAGES[code], ...extra } });
}

function toUserDto(auth: Pick<AuthContext, 'user' | 'idleExpiresAt'>) {
  const { user } = auth;
  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      timezone: user.timezone ?? user.organization?.timezone ?? null,
      organization: user.organization
        ? { id: user.organization.id, name: user.organization.name, type: user.organization.type }
        : null,
    },
    session: { idleExpiresAt: auth.idleExpiresAt.toISOString() },
  };
}

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) return fail(res, 400, 'invalid_request');

  const result = await login(body.data.email, body.data.password, meta(req));
  switch (result.kind) {
    case 'otp_sent':
      return res.json({
        challengeId: result.challengeId,
        expiresAt: result.expiresAt.toISOString(),
        maskedEmail: result.maskedEmail,
      });
    case 'invalid_credentials':
      return fail(res, 401, 'invalid_credentials');
    case 'locked':
      return fail(res, 423, 'locked');
    case 'inactive':
      return fail(res, 403, 'inactive');
  }
});

authRouter.post('/verify-otp', authLimiter, async (req, res) => {
  const body = verifySchema.safeParse(req.body);
  if (!body.success) return fail(res, 400, 'invalid_code');

  const result = await verifyOtp(body.data.challengeId, body.data.code, meta(req));
  switch (result.kind) {
    case 'success': {
      setSessionCookie(res, result.sessionToken);
      return res.json(toUserDto(result));
    }
    case 'invalid_code':
      return fail(res, 401, 'invalid_code', { attemptsLeft: result.attemptsLeft });
    case 'expired':
      return fail(res, 410, 'expired');
    case 'locked':
      return fail(res, 423, 'locked');
  }
});

authRouter.post('/resend-otp', authLimiter, async (req, res) => {
  const body = resendSchema.safeParse(req.body);
  if (!body.success) return fail(res, 410, 'expired');

  const result = await resendOtp(body.data.challengeId, meta(req));
  switch (result.kind) {
    case 'otp_sent':
      return res.json({
        challengeId: result.challengeId,
        expiresAt: result.expiresAt.toISOString(),
        maskedEmail: result.maskedEmail,
      });
    case 'expired':
      return fail(res, 410, 'expired');
    case 'locked':
      return fail(res, 423, 'locked');
  }
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const body = registerSchema.safeParse(req.body);
  if (!body.success) {
    const fields = [...new Set(body.error.issues.map((i) => String(i.path[0])))];
    return fail(res, 400, 'invalid_request', { fields });
  }

  const result = await register(body.data, req.ip ?? null);
  switch (result.kind) {
    case 'registered':
      return res.status(201).json({ status: 'PENDING_VERIFICATION' });
    case 'email_taken':
      return fail(res, 409, 'email_taken');
    case 'weak_password':
      return res.status(400).json({
        error: { code: 'WEAK_PASSWORD', message: passwordProblemMessage(result.problem), fields: ['password'] },
      });
  }
});

authRouter.post('/verify-email', authLimiter, async (req, res) => {
  const body = tokenSchema.safeParse(req.body);
  if (!body.success || !(await verifyEmail(body.data.token, req.ip ?? null))) return fail(res, 410, 'invalid_link');
  res.json({ status: 'PENDING_APPROVAL' });
});

// REG-08: same response whether or not anything was sent.
authRouter.post('/resend-verification', authLimiter, async (req, res) => {
  const body = emailOnlySchema.safeParse(req.body);
  if (body.success) await resendVerification(body.data.email, req.ip ?? null);
  res.status(202).json({ status: 'ACCEPTED' });
});

// REG-05: same response whether or not the email exists.
authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const body = emailOnlySchema.safeParse(req.body);
  if (body.success) await requestPasswordReset(body.data.email, req.ip ?? null);
  res.status(202).json({ status: 'ACCEPTED' });
});

authRouter.post('/reset-password/check', authLimiter, async (req, res) => {
  const body = tokenSchema.safeParse(req.body);
  if (!body.success || !(await isResetLinkValid(body.data.token))) return fail(res, 410, 'invalid_link');
  res.json({ status: 'VALID' });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const body = resetSchema.safeParse(req.body);
  if (!body.success) return fail(res, 400, 'invalid_request');

  const result = await resetPassword(body.data.token, body.data.password, req.ip ?? null);
  switch (result.kind) {
    case 'reset':
      clearSessionCookie(res);
      return res.json({ status: 'RESET' });
    case 'invalid_link':
      return fail(res, 410, 'invalid_link');
    case 'weak_password':
      return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: passwordProblemMessage(result.problem) } });
    case 'reused_password':
      return fail(res, 400, 'reused_password');
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(toUserDto(req.auth!));
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  const { sessionId, user } = req.auth!;
  await revokeSession(sessionId);
  await audit({
    event: 'LOGOUT',
    outcome: 'SUCCESS',
    actorUserId: user.id,
    organizationId: user.organizationId,
    objectId: sessionId,
    ip: req.ip ?? null,
  });
  clearSessionCookie(res);
  res.status(204).end();
});
