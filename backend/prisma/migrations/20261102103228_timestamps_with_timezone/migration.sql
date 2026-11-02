-- Stored values were written as UTC; convert explicitly rather than using the session time zone.
-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "occurred_at" SET DATA TYPE TIMESTAMPTZ(3) USING "occurred_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "login_challenges" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "consumed_at" SET DATA TYPE TIMESTAMPTZ(3) USING "consumed_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMPTZ(3) USING "last_seen_at" AT TIME ZONE 'UTC',
ALTER COLUMN "idle_expires_at" SET DATA TYPE TIMESTAMPTZ(3) USING "idle_expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "absolute_expires_at" SET DATA TYPE TIMESTAMPTZ(3) USING "absolute_expires_at" AT TIME ZONE 'UTC',
ALTER COLUMN "revoked_at" SET DATA TYPE TIMESTAMPTZ(3) USING "revoked_at" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "locked_until" SET DATA TYPE TIMESTAMPTZ(3) USING "locked_until" AT TIME ZONE 'UTC',
ALTER COLUMN "last_login_at" SET DATA TYPE TIMESTAMPTZ(3) USING "last_login_at" AT TIME ZONE 'UTC',
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
