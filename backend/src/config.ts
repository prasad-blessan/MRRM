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

    // SUB-04: uploaded files live outside the web root; relative paths resolve from backend/.
    STORAGE_DIR: z.string().default('storage'),
    MAX_UPLOAD_MB: z.coerce.number().int().positive().default(100),
    // Development only: advances requests through the workflow and writes synthetic output.
    SIMULATE_WORKFLOW: z.stringbool().default(false),
    // Development only: deleting files/<request ID>/ by hand removes that request. Unset = on outside production.
    SYNC_STORAGE_DELETES: z.stringbool().optional(),
  })
  .refine((c) => c.NODE_ENV !== 'production' || c.MAIL_TRANSPORT === 'smtp', {
    message: 'MAIL_TRANSPORT=console is not allowed in production',
  })
  .refine((c) => c.NODE_ENV !== 'production' || !c.SIMULATE_WORKFLOW, {
    message: 'SIMULATE_WORKFLOW is not allowed in production',
  })
  .refine((c) => c.NODE_ENV !== 'production' || !c.SYNC_STORAGE_DELETES, {
    message: 'SYNC_STORAGE_DELETES is not allowed in production',
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = parsed.data;
export const isProduction = config.NODE_ENV === 'production';
