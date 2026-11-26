-- CreateEnum
CREATE TYPE "LateCancelPolicy" AS ENUM ('none', 'lose_credit');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('scheduled', 'cancelled');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('female', 'male');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('recurring', 'fixed_term', 'class_pack', 'drop_in', 'trial');

-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "MemberSubscriptionStatus" AS ENUM ('pending', 'active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('purchase', 'booking', 'booking_refund', 'adjustment');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('booked', 'cancelled', 'late_cancel', 'no_show', 'attended');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('staff', 'widget', 'portal');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('waiting', 'promoted', 'removed');

-- CreateEnum
CREATE TYPE "CheckInMethod" AS ENUM ('qr', 'search');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card_terminal', 'bank_transfer');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('succeeded', 'refunded');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('new', 'contacted', 'trial', 'member', 'lost');

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "late_cancel_policy" "LateCancelPolicy" NOT NULL DEFAULT 'lose_credit',
ADD COLUMN     "reminder_lead_min" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "waitlist_auto_promote" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "waitlist_promote_cutoff_min" INTEGER NOT NULL DEFAULT 60;

-- CreateTable
CREATE TABLE "class_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#2563EB',
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "default_capacity" INTEGER NOT NULL DEFAULT 20,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "class_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "class_type_id" UUID NOT NULL,
    "room_id" UUID,
    "trainer_user_id" UUID,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "class_type_id" UUID NOT NULL,
    "room_id" UUID,
    "trainer_user_id" UUID,
    "schedule_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "status" "SessionStatus" NOT NULL DEFAULT 'scheduled',
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "location_id" UUID,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "date_of_birth" DATE,
    "gender" "Gender",
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "language" "Language",
    "home_location_id" UUID,
    "checkin_code" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PlanType" NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "billing_period" "BillingPeriod",
    "duration_days" INTEGER,
    "credits" INTEGER,
    "allowed_location_ids" UUID[],
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "MemberSubscriptionStatus" NOT NULL DEFAULT 'pending',
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "price_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "unlimited" BOOLEAN NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "member_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_freezes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_freezes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "booking_id" UUID,
    "delta" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "subscription_id" UUID,
    "status" "BookingStatus" NOT NULL DEFAULT 'booked',
    "source" "BookingSource" NOT NULL,
    "credit_used" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(3),
    "reminder_sent_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'waiting',
    "promoted_booking_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "booking_id" UUID,
    "method" "CheckInMethod" NOT NULL,
    "by_user_id" UUID,
    "checked_in_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "subscription_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'succeeded',
    "receipt_number" INTEGER NOT NULL,
    "note" TEXT,
    "received_by_user_id" UUID,
    "paid_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_counters" (
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tenant_counters_pkey" PRIMARY KEY ("tenant_id","key")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "message" TEXT,
    "source" TEXT NOT NULL DEFAULT 'widget',
    "stage" "LeadStage" NOT NULL DEFAULT 'new',
    "location_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_login_codes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_login_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_types_tenant_id_idx" ON "class_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_types_tenant_id_name_key" ON "class_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "schedules_tenant_id_idx" ON "schedules"("tenant_id");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_starts_at_idx" ON "sessions"("tenant_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tenant_id_schedule_id_starts_at_key" ON "sessions"("tenant_id", "schedule_id", "starts_at");

-- CreateIndex
CREATE INDEX "holidays_tenant_id_date_idx" ON "holidays"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "members_tenant_id_last_name_idx" ON "members"("tenant_id", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "members_tenant_id_email_key" ON "members"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "members_tenant_id_phone_key" ON "members"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "members_tenant_id_checkin_code_key" ON "members"("tenant_id", "checkin_code");

-- CreateIndex
CREATE INDEX "membership_plans_tenant_id_idx" ON "membership_plans"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_tenant_id_name_key" ON "membership_plans"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "member_subscriptions_tenant_id_member_id_idx" ON "member_subscriptions"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "member_subscriptions_tenant_id_ends_on_idx" ON "member_subscriptions"("tenant_id", "ends_on");

-- CreateIndex
CREATE INDEX "subscription_freezes_tenant_id_idx" ON "subscription_freezes"("tenant_id");

-- CreateIndex
CREATE INDEX "credit_ledger_tenant_id_subscription_id_idx" ON "credit_ledger"("tenant_id", "subscription_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_session_id_idx" ON "bookings"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "bookings_tenant_id_member_id_idx" ON "bookings"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "waitlist_entries_tenant_id_session_id_idx" ON "waitlist_entries"("tenant_id", "session_id");

-- CreateIndex
CREATE INDEX "check_ins_tenant_id_checked_in_at_idx" ON "check_ins"("tenant_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "check_ins_tenant_id_member_id_idx" ON "check_ins"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_paid_at_idx" ON "payments"("tenant_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_receipt_number_key" ON "payments"("tenant_id", "receipt_number");

-- CreateIndex
CREATE INDEX "leads_tenant_id_created_at_idx" ON "leads"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "member_login_codes_tenant_id_member_id_idx" ON "member_login_codes"("tenant_id", "member_id");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_created_at_idx" ON "outbox_events"("processed_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_tenant_id_dedupe_key_key" ON "outbox_events"("tenant_id", "dedupe_key");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_class_type_id_fkey" FOREIGN KEY ("class_type_id") REFERENCES "class_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_class_type_id_fkey" FOREIGN KEY ("class_type_id") REFERENCES "class_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_subscriptions" ADD CONSTRAINT "member_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_freezes" ADD CONSTRAINT "subscription_freezes_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "member_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "member_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "member_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

