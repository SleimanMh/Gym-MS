import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Avatar, Badge, Button, Card, PageHeader, Tabs } from "@/components/ui";
import { api, currentGym, getMe } from "@/lib/api";
import { settingsTabs } from "@/lib/access";
import { relativeDays } from "@/lib/format";
import { getT, type MessageKey } from "@/lib/i18n";
import { gymUrl } from "@/lib/session";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  status: "invited" | "active" | "disabled";
  role: string;
  customised: boolean;
}

const tone = { active: "success", invited: "warning", disabled: "neutral" } as const;

/** The owner's console for staff sign-ins: who has access, with which role, and their status. */
export default async function UsersPage() {
  const [{ t, lang }, me, slug] = await Promise.all([getT(), getMe(), currentGym()]);
  if (!me?.permissions.includes("tenant.security.manage") || !me.tenant || !slug) notFound();
  const users = await api<UserRow[]>("/v1/users");

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        action={
          <Link href="/settings/users/new">
            <Button>
              <UserPlus size={16} aria-hidden />
              {t("users.add")}
            </Button>
          </Link>
        }
      />
      <Tabs items={settingsTabs(t, "users", true)} />
      <p className="mb-4 text-sm text-muted">
        {t("users.subtitle", { gym: me.tenant.name, url: "" })}
        <span className="font-medium text-fg" dir="ltr">
          {gymUrl(slug)}
        </span>
      </p>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-5 py-3 text-start font-medium">{t("users.name")}</th>
              <th scope="col" className="px-3 py-3 text-start font-medium">{t("users.role")}</th>
              <th scope="col" className="px-3 py-3 text-start font-medium">{t("users.status")}</th>
              <th scope="col" className="px-5 py-3 text-end font-medium">{t("users.lastLogin")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="transition-subtle border-b border-border last:border-0 hover:bg-sunken">
                <td className="px-5 py-3">
                  <Link href={`/settings/users/${u.id}`} className="flex items-center gap-3">
                    <Avatar first={u.firstName} last={u.lastName} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {u.firstName} {u.lastName}
                      </span>
                      <span className="block text-xs text-faint" dir="ltr">
                        {u.email}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  {t(`acc.role.${u.role}` as MessageKey)}
                  {u.customised && <span className="ms-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{t("users.custom")}</span>}
                </td>
                <td className="px-3 py-3">
                  <Badge tone={tone[u.status]}>{t(`users.status.${u.status}` as MessageKey)}</Badge>
                </td>
                <td className="px-5 py-3 text-end text-muted">{u.lastLoginAt ? relativeDays(u.lastLoginAt, lang) : t("users.never")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
