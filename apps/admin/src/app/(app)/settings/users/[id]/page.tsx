import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, UserCog } from "lucide-react";
import { AccessForm } from "@/components/access-editor";
import { Badge, Button, Card, Input, Label, Notice, PageHeader } from "@/components/ui";
import { ApiError, api, currentGym, getMe } from "@/lib/api";
import { accessFormText } from "@/lib/access";
import { relativeDays } from "@/lib/format";
import { getT, type MessageKey } from "@/lib/i18n";
import { gymUrl } from "@/lib/session";
import { resetUserPassword, saveUserAccess, setUserPassword, setUserStatus } from "../actions";

interface UserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  status: "invited" | "active" | "disabled";
  role: string | null;
  selection: string[];
  isSelf: boolean;
  employeeId: string | null;
  roleDefaults: Record<string, string[]>;
  customAllowed: boolean;
}

const tone = { active: "success", invited: "warning", disabled: "neutral" } as const;

/** One staff sign-in: role and access tree, password reset, enable/disable. */
export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const [{ id }, sp, { t, lang, err }, me, slug] = await Promise.all([params, searchParams, getT(), getMe(), currentGym()]);
  if (!me?.permissions.includes("tenant.security.manage") || !slug) notFound();
  let u: UserDetail;
  try {
    u = await api<UserDetail>(`/v1/users/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const done = {
    created: t("users.created", { email: u.email }),
    createdSet: t("users.createdSet"),
    added: t("users.added", { email: u.email }),
    saved: t("users.saved"),
    reset: t("users.resetDone"),
    password: t("users.setPwDone"),
  }[sp.done as "created" | "createdSet" | "added" | "saved" | "reset" | "password"];

  return (
    <>
      <PageHeader
        title={`${u.firstName} ${u.lastName}`}
        subtitle={
          <span dir="ltr" className="inline-block">
            {u.email}
          </span>
        }
        action={
          <Link href="/settings/users">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />
      {sp.error && <Notice>{err(sp.error)}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-6">
          {u.isSelf && <p className="mb-4 rounded-2xl bg-sunken px-4 py-3 text-sm text-muted">{t("users.self")}</p>}
          <AccessForm
            {...accessFormText(t, t("users.save"))}
            roleDefaults={u.roleDefaults}
            initialRole={u.role ?? "front_desk"}
            initialSelection={u.selection}
            customAllowed={u.customAllowed}
            disabled={u.isSelf}
            action={saveUserAccess}
          >
            <input type="hidden" name="id" value={u.id} />
          </AccessForm>
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">{t("users.status")}</dt>
                <dd>
                  <Badge tone={tone[u.status]}>{t(`users.status.${u.status}` as MessageKey)}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">{t("users.lastLogin")}</dt>
                <dd>{u.lastLoginAt ? relativeDays(u.lastLoginAt, lang) : t("users.never")}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("users.signinAt")}</dt>
                <dd className="mt-0.5 break-all font-medium" dir="ltr">
                  {gymUrl(slug)}
                </dd>
              </div>
              {u.mustChangePassword && <p className="text-xs text-warning">{t("users.pending")}</p>}
            </dl>
            {u.employeeId && (
              <Link href={`/staff/${u.employeeId}`} className="mt-4 flex items-center gap-2 text-sm font-medium text-accent hover:underline">
                <UserCog size={15} aria-hidden />
                {t("users.team")}
              </Link>
            )}
          </Card>

          {!u.isSelf && (
            <Card className="p-5">
              <h2 className="font-semibold">{t("users.setPw")}</h2>
              <p className="mb-3 text-xs text-muted">{t("users.setPwHelp")}</p>
              <form action={setUserPassword} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={u.id} />
                <div>
                  <Label htmlFor="password">{t("users.newPw")}</Label>
                  <Input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" dir="ltr" />
                </div>
                <div>
                  <Label htmlFor="confirm">{t("users.confirmPw")}</Label>
                  <Input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" dir="ltr" />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="mustChange" defaultChecked className="mt-0.5 size-4 accent-[var(--accent)]" />
                  {t("users.forceChange")}
                </label>
                <p className="text-xs text-faint">{t("users.pwRule")}</p>
                <Button type="submit" variant="secondary">
                  {t("users.setPw")}
                </Button>
              </form>
            </Card>
          )}

          {!u.isSelf && (
            <Card className="flex flex-col gap-2 p-5">
              <form action={resetUserPassword}>
                <input type="hidden" name="id" value={u.id} />
                <Button variant="secondary" className="w-full">
                  <KeyRound size={15} aria-hidden />
                  {t("users.reset")}
                </Button>
              </form>
              <form action={setUserStatus}>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="status" value={u.status === "disabled" ? "active" : "disabled"} />
                <Button variant={u.status === "disabled" ? "secondary" : "ghost"} className={u.status === "disabled" ? "w-full" : "w-full text-danger hover:bg-danger-soft"}>
                  {u.status === "disabled" ? t("users.enable") : t("users.disable")}
                </Button>
              </form>
              {u.status === "disabled" && <p className="text-xs text-muted">{t("users.disabledNote")}</p>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
