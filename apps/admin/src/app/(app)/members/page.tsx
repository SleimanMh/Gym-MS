import Link from "next/link";
import { CalendarClock, Search, UserPlus, Users, UserX, Wallet } from "lucide-react";
import { EmptyState } from "@/components/blocks";
import { StatCard } from "@/components/studio";
import { Avatar, Badge, Button, Card, PageHeader, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { fmtDateOnly, relativeDays } from "@/lib/format";
import { getT } from "@/lib/i18n";

interface MemberRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  subscriptions: { id: string; status: "active" | "pending"; endsOn: string | null; plan: { name: string } }[];
  checkIns: { checkedInAt: string }[];
}

const FILTERS = ["all", "active", "pending", "expiring", "none"] as const;
type Filter = (typeof FILTERS)[number];

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [{ t, lang }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  const status: Filter = FILTERS.includes(sp.status as Filter) ? (sp.status as Filter) : "all";
  const q = sp.q?.trim() ?? "";
  const [members, counts] = await Promise.all([
    api<MemberRow[]>(`/v1/members?take=200&status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    api<Record<Filter, number>>("/v1/members/counts"),
  ]);
  const canAdd = me!.permissions.includes("member.manage");
  const href = (f: Filter) => `/members?status=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const soon = (endsOn: string) => (new Date(endsOn).getTime() - Date.now()) / 86_400_000 <= 7;

  return (
    <>
      <PageHeader
        title={t("nav.members")}
        subtitle={`${counts.active} ${t("mem.tab.active").toLowerCase()} · ${counts.all} ${t("mem.tab.all").toLowerCase()}`}
        action={
          canAdd ? (
            <Link href="/members/new">
              <Button>
                <UserPlus size={16} aria-hidden />
                {t("mem.add")}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Headline numbers double as shortcuts to each list */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            ["active", Users],
            ["pending", Wallet],
            ["expiring", CalendarClock],
            ["none", UserX],
          ] as const
        ).map(([f, Icon]) => (
          <Link key={f} href={href(f)} className="rounded-[var(--radius-card)] transition-subtle hover:ring-2 hover:ring-accent/30" aria-current={f === status ? "page" : undefined}>
            <StatCard icon={Icon} label={t(`mem.tab.${f}`)} value={new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-GB").format(counts[f])} />
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs items={FILTERS.map((f) => ({ href: href(f), label: t(`mem.tab.${f}`), active: f === status, count: counts[f] }))} />
        <form className="relative mb-4 w-full max-w-xs" role="search">
          <input type="hidden" name="status" value={status} />
          <Search size={16} aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("top.search")}
            aria-label={t("top.search")}
            className="h-10 w-full rounded-full bg-surface ps-9 pe-4 text-sm shadow-[0_1px_2px_rgba(18,18,24,0.04)] placeholder:text-faint"
          />
        </form>
      </div>

      {members.length === 0 ? (
        q || status !== "all" ? (
          <p className="text-muted">{t("mem.noResults")}</p>
        ) : (
          <EmptyState text={t("mem.empty")} action={canAdd ? { label: t("mem.add"), href: "/members/new" } : undefined} />
        )
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs text-muted">
              <tr>
                <th className="px-5 py-3 text-start font-medium">{t("common.member")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("common.phone")}</th>
                <th className="px-3 py-3 text-start font-medium">{t("mem.current")}</th>
                <th className="px-5 py-3 text-end font-medium">{t("mem.lastVisit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const sub = m.subscriptions[0];
                const last = m.checkIns[0]?.checkedInAt;
                return (
                  <tr key={m.id} className="transition-subtle hover:bg-sunken">
                    <td className="px-5 py-3">
                      <Link href={`/members/${m.id}`} className="flex items-center gap-3">
                        <Avatar first={m.firstName} last={m.lastName} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {m.firstName} {m.lastName}
                          </span>
                          {m.email && <span className="block truncate text-xs text-faint">{m.email}</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted tabular-nums" dir="ltr">
                      {m.phone}
                    </td>
                    <td className="px-3 py-2.5">
                      {sub ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-medium">{sub.plan.name}</span>
                          {sub.status === "pending" ? (
                            <Badge tone="warning">{t("sub.pending")}</Badge>
                          ) : sub.endsOn && soon(sub.endsOn) ? (
                            <Badge tone="warning">{t("mem.ends", { d: fmtDateOnly(sub.endsOn, lang) })}</Badge>
                          ) : (
                            <span className="text-xs text-faint">{sub.endsOn ? t("mem.ends", { d: fmtDateOnly(sub.endsOn, lang) }) : ""}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-faint">{t("mem.noMembership")}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-end whitespace-nowrap text-muted">{last ? relativeDays(last, lang) : t("mem.never")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
