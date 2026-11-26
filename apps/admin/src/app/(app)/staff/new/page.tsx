import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Input, Label, Notice, PageHeader, Select } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { localDateIn } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { createEmployee } from "../actions";
import { PayFields } from "../pay-fields";

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("staff.manage") || !me.tenant) notFound();
  const [locations, logins] = await Promise.all([
    api<{ id: string; name: string }[]>("/v1/locations"),
    api<{ id: string; email: string; firstName: string; lastName: string }[]>("/v1/staff/logins"),
  ]);
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
            <div>
              <Label htmlFor="userId">{t("st.f.login")}</Label>
              <Select id="userId" name="userId" defaultValue="">
                <option value="">{t("st.f.noLogin")}</option>
                {logins.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} · {u.email}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit">{t("st.add")}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
