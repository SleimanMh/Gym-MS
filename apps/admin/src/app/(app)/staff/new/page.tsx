import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Input, Label, Notice, PageHeader, Select } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { localDateIn } from "@/lib/format";
import { STAFF_ROLE_KEYS } from "@gym/shared";
import { getT, type MessageKey } from "@/lib/i18n";
import { createEmployee } from "../actions";
import { PayFields } from "../pay-fields";

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("staff.manage") || !me.tenant) notFound();
  const locations = await api<{ id: string; name: string }[]>("/v1/locations");
  const canInvite = me.permissions.includes("tenant.security.manage");
  const opt = t("common.optional");

  return (
    <>
      <PageHeader
        title={t("st.new.title")}
        subtitle={t("st.new.subtitle")}
        action={
          <Link href="/staff">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />
      <Card className="max-w-2xl p-6">
        <form action={createEmployee} className="flex flex-col gap-4">
          {sp.error && <Notice>{err(sp.error)}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">{t("mem.firstName")}</Label>
              <Input id="firstName" name="firstName" required autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="lastName">{t("mem.lastName")}</Label>
              <Input id="lastName" name="lastName" required autoComplete="off" />
            </div>
          </div>
          <div>
            <Label htmlFor="title">{t("st.f.title")}</Label>
            <Input id="title" name="title" required minLength={2} placeholder={t("st.f.titlePh")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="phone">
                {t("common.phone")} {opt}
              </Label>
              <Input id="phone" name="phone" type="tel" dir="ltr" />
            </div>
            <div>
              <Label htmlFor="email">
                {t("common.email")} {opt}
              </Label>
              <Input id="email" name="email" type="email" dir="ltr" />
            </div>
          </div>
          <PayFields t={t} currency={me.tenant.currency} locations={locations} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="startedOn">{t("st.f.started")}</Label>
              <Input id="startedOn" name="startedOn" type="date" defaultValue={localDateIn(new Date(), me.tenant.timezone)} />
            </div>
          </div>
          {canInvite && (
            <div className="flex flex-col gap-3 rounded-2xl bg-sunken p-4">
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name="signIn" className="mt-0.5 size-4 accent-[var(--accent)]" />
                <span>
                  <span className="block font-medium">{t("users.giveSignIn")}</span>
                  <span className="block text-xs text-muted">{t("users.giveSignInHelp")}</span>
                </span>
              </label>
              <div className="max-w-xs">
                <Label htmlFor="role">{t("users.role")}</Label>
                <Select id="role" name="role" defaultValue="front_desk">
                  {STAFF_ROLE_KEYS.filter((r) => r !== "owner").map((r) => (
                    <option key={r} value={r}>
                      {t(`acc.role.${r}` as MessageKey)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button type="submit">{t("st.add")}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
