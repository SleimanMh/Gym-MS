import { ConflictException } from "@nestjs/common";
import { generatePassword, hashPassword, type TenantTx } from "@gym/db";
import type { PermissionOverride, StaffRoleKey } from "@gym/shared";
import type { OutboxService } from "../notifications/outbox.service";

/** Generated passwords work for this long; after that the owner sends a new one. */
export const TEMP_PASSWORD_DAYS = 7;

/**
 * Gives the user a system-generated password they must change at next sign-in, and ends their
 * current sessions. Returns the password so it can be emailed (never stored in clear).
 */
export async function setTemporaryPassword(tx: TenantTx, userId: string): Promise<string> {
  const password = generatePassword();
  await tx.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      passwordExpiresAt: new Date(Date.now() + TEMP_PASSWORD_DAYS * 86_400_000),
      failedLogins: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 },
    },
  });
  return password;
}

/**
 * The owner chooses the password themselves (no email). Ends the person's current sessions.
 * Callers must first check the account is used only at this gym (assertOnlyThisGym).
 */
export async function setChosenPassword(tx: TenantTx, userId: string, password: string, mustChange: boolean) {
  await tx.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: mustChange,
      passwordExpiresAt: null,
      failedLogins: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 },
    },
  });
}

/**
 * One account can work at several gyms (one password for all). An owner may set a password only
 * for someone who belongs to their gym alone and isn't platform staff — otherwise they could take
 * over that person's sign-in elsewhere. Shared accounts get an emailed reset instead.
 */
export async function assertOnlyThisGym(tx: TenantTx, userId: string, tenantId: string) {
  // Counts memberships at other gyms in any status (RLS would hide them from this transaction).
  const rows = await tx.$queryRaw<{ n: number }[]>`SELECT app_user_other_gyms(${userId}::uuid, ${tenantId}::uuid) AS n`;
  const n = rows[0]?.n ?? 0;
  const platform = await tx.platformUser.findUnique({ where: { userId } });
  if (platform || n > 0) throw new ConflictException({ code: "SHARED_ACCOUNT" });
}

/**
 * Owner adds a staff sign-in to their gym (ADR 0007): a new person gets an account with a generated
 * password emailed to them; someone who already has an account elsewhere keeps their password and
 * simply gets access to this gym. Role and per-person tweaks are set in the same transaction.
 */
export async function provisionAccount(
  tx: TenantTx,
  outbox: OutboxService,
  tenantId: string,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    role: StaffRoleKey;
    overrides: PermissionOverride[];
    /** Owner-chosen password for a NEW account (ignored for someone who already has an account). */
    password?: string;
    mustChangePassword?: boolean;
  },
): Promise<{ userId: string; invited: boolean; passwordSet: boolean }> {
  const existing = await tx.user.findUnique({ where: { email: input.email } });
  if (existing && (await tx.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: existing.id } } }))) {
    throw new ConflictException({ code: "USER_EXISTS" });
  }
  const user = existing ?? (await tx.user.create({ data: { email: input.email, firstName: input.firstName, lastName: input.lastName } }));
  const chosen = !existing && !!input.password;
  const invite = !user.passwordHash && !chosen;

  await tx.tenantMembership.create({ data: { tenantId, userId: user.id, status: invite || chosen ? "invited" : "active" } });
  await tx.userRole.create({ data: { tenantId, userId: user.id, roleKey: input.role } });
  if (input.overrides.length) {
    await tx.userPermissionOverride.createMany({ data: input.overrides.map((o) => ({ tenantId, userId: user.id, ...o })) });
  }
  if (chosen) await setChosenPassword(tx, user.id, input.password!, input.mustChangePassword ?? true);
  if (invite) {
    const tempPassword = await setTemporaryPassword(tx, user.id);
    await outbox.enqueue(
      tx,
      tenantId,
      "user.invite",
      { userId: user.id, email: user.email, firstName: user.firstName, tempPassword, expiresDays: TEMP_PASSWORD_DAYS },
      `user.invite:${user.id}:${Date.now()}`,
    );
  }
  return { userId: user.id, invited: invite, passwordSet: chosen };
}
