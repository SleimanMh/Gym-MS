import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { PLAN_CATALOGUE, PLAN_CODES } from "@gym/shared";
import { assignPlan, createTenant, logout } from "@/app/actions";
import { Badge, Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { getT } from "@/lib/i18n";

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  planCode: string | null;
  defaultLanguage: string;
}

/** Platform console: your side — onboard gyms and assign plans (PLAN.md sections 3 and 15, Phase 0). */
export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.platformRole) redirect("/");

  const [{ t }, tenants, { error }] = await Promise.all([
    getT(),
    api<TenantRow[]>("/v1/platform/tenants"),
    searchParams,
  ]);
  const canWrite = me.platformRole === "super_admin";

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm text-muted">
          {t("nav.platform")} · {me.user.email} · <Badge tone="accent">{me.platformRole}</Badge>
        </span>
        <form action={logout}>
          <Button variant="ghost" className="h-9 w-9 px-0" aria-label={t("top.logout")}>
            <LogOut size={18} aria-hidden />
          </Button>
        </form>
      </div>
      <PageHeader title={t("platform.title")} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t("common.name")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("platform.slug")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("common.status")}</th>
                <th className="px-4 py-3 text-start font-medium">{t("common.plan")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((tn) => (
                <tr key={tn.id}>
                  <td className="px-4 py-3 font-medium">{tn.name}</td>
                  <td className="px-4 py-3 text-muted" dir="ltr">
                    {tn.slug}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={tn.status === "active" ? "success" : tn.status === "trial" ? "accent" : "warning"}>
                      {tn.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {canWrite ? (
                      <form action={assignPlan} className="flex items-center gap-2">
                        <input type="hidden" name="tenantId" value={tn.id} />
                        <Select name="planCode" defaultValue={tn.planCode ?? "starter"} className="h-9 w-32 text-sm">
                          {PLAN_CODES.map((c) => (
                            <option key={c} value={c}>
                              {PLAN_CATALOGUE[c].name}
                            </option>
                          ))}
                        </Select>
                        <Button variant="secondary" className="h-9 px-3">
                          {t("common.save")}
                        </Button>
                      </form>
                    ) : (
                      tn.planCode
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {canWrite && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold">{t("platform.create")}</h2>
            <form action={createTenant} className="flex flex-col gap-3">
              <Field id="name" label={t("common.name")} />
              <Field id="slug" label={t("platform.slug")} pattern="[a-z0-9-]{3,40}" dir="ltr" />
              <div>
                <Label htmlFor="planCode">{t("common.plan")}</Label>
                <Select id="planCode" name="planCode" defaultValue="starter">
                  {PLAN_CODES.map((c) => (
                    <option key={c} value={c}>
                      {PLAN_CATALOGUE[c].name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="defaultLanguage">{t("platform.language")}</Label>
                <Select id="defaultLanguage" name="defaultLanguage" defaultValue="en">
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </Select>
              </div>
              <Field id="ownerEmail" label={t("platform.ownerEmail")} type="email" dir="ltr" />
              <Field id="ownerFirstName" label={t("platform.ownerFirst")} />
              <Field id="ownerLastName" label={t("platform.ownerLast")} />
              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}
              <Button type="submit">{t("common.create")}</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...rest} />
    </div>
  );
}
