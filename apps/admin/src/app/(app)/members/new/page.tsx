import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { getMe } from "@/lib/api";
import { getT } from "@/lib/i18n";
import { createMember } from "../actions";

/** Single-column form, labels above fields; email or phone is required (PLAN.md section 12). */
export default async function NewMemberPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("member.manage")) notFound();
  const opt = t("common.optional");

  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("mem.add")}
        action={
          <Link href="/members">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />
      <Card className="max-w-xl">
        <form action={createMember} className="flex flex-col gap-4">
          {sp.error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
              {err(sp.error)}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("firstName", t("mem.firstName"), { required: true, autoComplete: "off" })}
            {field("lastName", t("mem.lastName"), { required: true, autoComplete: "off" })}
          </div>
          {field("phone", t("common.phone"), { type: "tel", dir: "ltr", placeholder: "+961 70 000 000" })}
          {field("email", `${t("common.email")} ${opt}`, { type: "email", dir: "ltr" })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("dateOfBirth", `${t("mem.dob")} ${opt}`, { type: "date" })}
            <div>
              <Label htmlFor="gender">
                {t("mem.gender")} {opt}
              </Label>
              <Select id="gender" name="gender" defaultValue="">
                <option value="">—</option>
                <option value="female">{t("mem.female")}</option>
                <option value="male">{t("mem.male")}</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field("emergencyContactName", `${t("mem.emergencyName")} ${opt}`)}
            {field("emergencyContactPhone", `${t("mem.emergencyPhone")} ${opt}`, { type: "tel", dir: "ltr" })}
          </div>
          <div>
            <Label htmlFor="language">{t("mem.language")}</Label>
            <Select id="language" name="language" defaultValue={me.tenant?.defaultLanguage ?? "en"}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="notes">
              {t("mem.notes")} {opt}
            </Label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
            />
          </div>
          <div>
            <Button type="submit">{t("mem.add")}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
