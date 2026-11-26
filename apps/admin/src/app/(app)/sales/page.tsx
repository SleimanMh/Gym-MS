import { notFound } from "next/navigation";
import { LockedFeature } from "@/components/blocks";
import Link from "next/link";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { act, field } from "@/lib/act";
import { api, getMe } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n";

interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string;
  stage: Stage;
  createdAt: string;
}
const STAGES = ["new", "contacted", "trial", "member", "lost"] as const;
type Stage = (typeof STAGES)[number];
const tone = { new: "accent", contacted: "neutral", trial: "warning", member: "success", lost: "neutral" } as const;

async function setStage(f: FormData) {
  "use server";
  await act(`/v1/leads/${field(f, "id")}`, { method: "PATCH", body: { stage: field(f, "stage") } }, "/sales");
}

/** Leads from the website form. The full pipeline (assignment, follow-ups, conversion) is Phase 2. */
export default async function SalesPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const [{ t, lang }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("sale.create")) notFound();
  if (!me.entitlements?.features.includes("crm.leads")) {
    return (
      <>
        <PageHeader title={t("nav.sales")} />
        <LockedFeature feature="crm.leads" t={t} />
      </>
    );
  }
  const leads = await api<Lead[]>("/v1/leads");
  const stage = STAGES.includes(sp.stage as Stage) ? (sp.stage as Stage) : null;
  const shown = stage ? leads.filter((l) => l.stage === stage) : leads;
  const tz = me.tenant!.timezone;
  const canEdit = me.permissions.includes("member.manage");
  const won = leads.filter((l) => l.stage === "member").length;
  const closed = won + leads.filter((l) => l.stage === "lost").length;

  return (
    <>
      <PageHeader
        title={t("nav.sales")}
        subtitle={`${t("sales.leads")} · ${t("sales.newWeek", { n: String(leads.filter((l) => Date.now() - new Date(l.createdAt).getTime() < 7 * 86_400_000).length) })}`}
      />

      {/* Pipeline: one tile per stage (click to filter) and the conversion rate in the dark card */}
      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="font-semibold">{t("sales.pipeline")}</h2>
            <Link
              href="/sales"
              aria-current={!stage ? "page" : undefined}
              className={cn("rounded-full px-3 py-1 text-sm font-medium", !stage ? "bg-ink text-white" : "text-muted hover:bg-sunken")}
            >
              {t("sales.all")} · {leads.length}
            </Link>
          </div>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {STAGES.map((s) => {
              const n = leads.filter((l) => l.stage === s).length;
              const on = stage === s;
              return (
                <li key={s}>
                  <Link
                    href={on ? "/sales" : `/sales?stage=${s}`}
                    aria-current={on ? "page" : undefined}
                    className={cn("transition-subtle flex h-full flex-col rounded-2xl p-3", on ? "bg-accent text-accent-fg" : "bg-sunken hover:bg-accent-soft")}
                  >
                    <span className={cn("text-xs font-medium", on ? "text-white/80" : "text-muted")}>{t(`stage.${s}`)}</span>
                    <span className="mt-1 text-2xl font-semibold tabular-nums">{n}</span>
                    <span className={cn("mt-2 h-1 overflow-hidden rounded-full", on ? "bg-white/25" : "bg-border")}>
                      <span className={cn("block h-full rounded-full", on ? "bg-white" : "bg-accent")} style={{ width: `${leads.length ? (n / leads.length) * 100 : 0}%` }} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
        <section className="flex flex-col justify-center rounded-[var(--radius-card)] bg-ink p-6 text-white">
          <p className="text-sm text-white/60">{t("sales.conversion")}</p>
          <p className="mt-1 text-[40px] font-semibold leading-none tabular-nums">{closed ? `${Math.round((won / closed) * 100)}%` : "—"}</p>
          <p className="mt-2 text-xs text-white/55">{t("sales.conversionHelp", { m: String(won), n: String(closed) })}</p>
        </section>
      </div>
      {shown.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-5 py-3 text-start font-medium">{t("common.name")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("sales.message")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("sales.source")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("sales.received")}</th>
                <th className="px-5 py-3 text-start font-medium">{t("sales.stage")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar first={l.firstName} last={l.lastName ?? ""} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {l.firstName} {l.lastName}
                        </div>
                        <div className="text-xs text-faint" dir="ltr">
                          {[l.phone, l.email].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-xs px-3 py-3 text-muted">{l.message ?? "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted">{l.source}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted">{fmtDateTime(l.createdAt, tz, lang)}</td>
                  <td className="px-5 py-3">
                    {canEdit ? (
                      <form action={setStage} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={l.id} />
                        <select
                          name="stage"
                          defaultValue={l.stage}
                          aria-label={t("sales.stage")}
                          className="h-8 rounded-full bg-sunken px-3 text-sm font-medium"
                        >
                          {STAGES.map((s) => (
                            <option key={s} value={s}>
                              {t(`stage.${s}`)}
                            </option>
                          ))}
                        </select>
                        <button className="h-8 rounded-full px-3 text-xs font-semibold text-accent hover:bg-accent-soft">{t("common.save")}</button>
                      </form>
                    ) : (
                      <Badge tone={tone[l.stage]}>{t(`stage.${l.stage}`)}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-muted">{t("sales.empty")}</p>
        </Card>
      )}
    </>
  );
}
