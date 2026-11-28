import Link from "next/link";
import { notFound } from "next/navigation";
import { permissionsForRoles, STAFF_ROLE_KEYS, treeSelection } from "@gym/shared";
import { AccessForm } from "@/components/access-editor";
import { Button, Card, Input, Label, Notice, PageHeader } from "@/components/ui";
import { getMe } from "@/lib/api";
import { accessFormText } from "@/lib/access";
import { getT } from "@/lib/i18n";
import { createUser } from "../actions";

/** New staff sign-in: name, email, role and access; the system emails a temporary password. */
export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("tenant.security.manage")) notFound();
  const roleDefaults = Object.fromEntries(STAFF_ROLE_KEYS.map((r) => [r, treeSelection(permissionsForRoles([r]))]));

  return (
    <>
      <PageHeader
        title={t("users.new.title")}
        subtitle={t("users.new.help")}
        action={
          <Link href="/settings/users">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />
      {sp.error && <Notice>{err(sp.error)}</Notice>}
      <Card className="max-w-4xl p-6">
        <AccessForm
          {...accessFormText(t, t("users.create"))}
          roleDefaults={roleDefaults}
          initialRole="front_desk"
          initialSelection={roleDefaults.front_desk ?? []}
          customAllowed={!!me.entitlements?.features.includes("identity.custom_roles")}
          action={createUser}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">{t("mem.firstName")}</Label>
              <Input id="firstName" name="firstName" required autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="lastName">{t("mem.lastName")}</Label>
              <Input id="lastName" name="lastName" required autoComplete="off" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" name="email" type="email" required dir="ltr" autoComplete="off" />
            </div>
          </div>
        </AccessForm>
      </Card>
    </>
  );
}
