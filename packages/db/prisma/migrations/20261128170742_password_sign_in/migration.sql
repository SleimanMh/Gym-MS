-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_logins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_expires_at" TIMESTAMPTZ(3),
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 1;


-- Hand-written: sanity limits (users is a platform table: no RLS).
ALTER TABLE "users" ADD CONSTRAINT users_failed_logins_nonneg CHECK (failed_logins >= 0);
ALTER TABLE "users" ADD CONSTRAINT users_session_version_pos CHECK (session_version >= 1);
