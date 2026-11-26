-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('salary', 'hourly', 'per_class');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT NOT NULL,
    "pay_type" "PayType" NOT NULL,
    "pay_rate_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "commission_bp" INTEGER NOT NULL DEFAULT 0,
    "home_location_id" UUID,
    "started_on" DATE NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "location_id" UUID,
    "clock_in" TIMESTAMPTZ(3) NOT NULL,
    "clock_out" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "location_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "spent_on" DATE NOT NULL,
    "vendor" TEXT,
    "note" TEXT,
    "recurring_monthly" BOOLEAN NOT NULL DEFAULT false,
    "recurring_parent_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_tenant_id_idx" ON "employees"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_user_id_key" ON "employees"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_email_key" ON "employees"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_starts_at_idx" ON "shifts"("tenant_id", "starts_at");

-- CreateIndex
CREATE INDEX "time_entries_tenant_id_employee_id_idx" ON "time_entries"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "time_entries_tenant_id_clock_in_idx" ON "time_entries"("tenant_id", "clock_in");

-- CreateIndex
CREATE INDEX "expense_categories_tenant_id_idx" ON "expense_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenant_id_name_key" ON "expense_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_spent_on_idx" ON "expenses"("tenant_id", "spent_on");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_recurring_parent_id_spent_on_key" ON "expenses"("tenant_id", "recurring_parent_id", "spent_on");

-- CreateIndex
CREATE INDEX "budgets_tenant_id_idx" ON "budgets"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_tenant_id_category_id_month_key" ON "budgets"("tenant_id", "category_id", "month");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

