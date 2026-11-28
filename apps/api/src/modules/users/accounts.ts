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
 * Owner adds a staff sign-in to their gym (ADR 0007): a new person gets an account with a generated
 * password emailed to them; someone who already has an account elsewhere keeps their password and
 * simply gets access to this gym. Role and per-person tweaks are set in the same transaction.
 */
export async function provisionAccount(
  tx: TenantTx,
  outbox: OutboxService,
  tenantId: string,
  input: { email: string; firstName: string; lastName: string; role: StaffRoleKey; overrides: PermissionOverride[] },
): Promise<{ userId: string; invited: boolean }> {
  const existing = await tx.user.findUnique({ where: { email: input.email } });
  if (existing && (await tx.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: existing.id } } }))) {
    throw new ConflictException({ code: "USER_EXISTS" });
  }
  const user = existing ?? (await tx.user.create({ data: { email: input.email, firstName: input.firstName, lastName: input.lastName } }));
  const invite = !user.passwordHash;

  await tx.tenantMembership.create({ data: { tenantId, userId: user.id, status: invite ? "invited" : "active" } });
  await tx.userRole.create({ data: { tenantId, userId: user.id, roleKey: input.role } });
  if (input.overrides.length) {
    await tx.userPermissionOverride.createMany({ data: input.overrides.map((o) => ({ tenantId, userId: user.id, ...o })) });
  }
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
  return { userId: user.id, invited: invite };
}
