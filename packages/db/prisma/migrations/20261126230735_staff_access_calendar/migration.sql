-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "activity" TEXT;

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_permission_overrides_tenant_id_idx" ON "user_permission_overrides"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_tenant_id_user_id_permission_key" ON "user_permission_overrides"("tenant_id", "user_id", "permission");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_employee_id_starts_at_idx" ON "shifts"("tenant_id", "employee_id", "starts_at");

