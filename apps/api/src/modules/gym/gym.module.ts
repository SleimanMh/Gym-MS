import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PaymentsController } from "../billing/payments.controller";
import { PaymentsService } from "../billing/payments.service";
import { BookingService } from "../booking/booking.service";
import { BookingsController } from "../booking/bookings.controller";
import { CheckInController } from "../checkin/checkin.controller";
import { DashboardController } from "../dashboard/dashboard.controller";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { FinanceController } from "../finance/finance.controller";
import { IdentityModule } from "../identity/identity.module";
import { LeadsController } from "../members/leads.controller";
import { MembersController } from "../members/members.controller";
import { MembershipsService } from "../members/memberships.service";
import { OutboxService } from "../notifications/outbox.service";
import { MemberAuthService } from "../public/member-auth.service";
import { MemberSelfController } from "../public/member-self.controller";
import { PublicController } from "../public/public.controller";
import { SchedulingController } from "../scheduling/scheduling.controller";
import { SettingsController } from "../settings/settings.controller";
import { StaffController } from "../staff/staff.controller";

/**
 * Phase 1 — the gym's day-to-day: scheduling, booking, members and memberships, check-in,
 * manual payments, dashboard, settings, and the public API for the widget.
 * Code stays in one folder per domain (src/modules/<domain>); this module only wires them,
 * because booking, memberships and payments share services inside one transaction.
 */
@Module({
  imports: [EntitlementsModule, IdentityModule],
  controllers: [
    SchedulingController,
    BookingsController,
    MembersController,
    LeadsController,
    PaymentsController,
    CheckInController,
    DashboardController,
    SettingsController,
    PublicController,
    MemberSelfController,
    StaffController,
    FinanceController,
  ],
  providers: [AuditService, OutboxService, BookingService, MembershipsService, PaymentsService, MemberAuthService],
})
export class GymModule {}
