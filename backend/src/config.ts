import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    APP_BASE_URL: z.string().url().default('http://localhost:5173'),
    // HMAC key for one-time codes; never logged.
    OTP_SECRET: z.string().min(32),
    TRUST_PROXY: z.coerce.boolean().default(false),

    // 'console' prints emails to the server log (development only).
    MAIL_TRANSPORT: z.enum(['smtp', 'console']).default('console'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: z.coerce.boolean().default(false),
    MAIL_FROM: z.string().default('MRRM <no-reply@mrrm.local>'),

    // Defaults from REG-06, REG-10, REG-11. Moves to Admin settings (ADM-15) later.
    LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
    LOCKOUT_MINUTES: z.coerce.number().int().positive().default(30),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_RESEND_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(15),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
    // REG-08 link expiry defaults.
    VERIFY_LINK_TTL_HOURS: z.coerce.number().int().positive().default(24),
    RESET_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    // REG-09: number of previous passwords that cannot be reused.
    PASSWORD_HISTORY_COUNT: z.coerce.number().int().nonnegative().default(5),
    // CMP-12: version of the privacy notice / terms shown at registration.
    TERMS_VERSION: z.string().default('2026-11-draft'),
  })
  .refine((c) => c.NODE_ENV !== 'production' || c.MAIL_TRANSPORT === 'smtp', {
    message: 'MAIL_TRANSPORT=console is not allowed in production',
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export const isProduction = config.NODE_ENV === 'production';
