import { notFound } from "next/navigation";
import { minorDigits } from "@gym/shared";
import { LockedFeature } from "@/components/blocks";
import { Badge, Button, Card, Input, Notice, PageHeader, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { categoryName, financeTabs, monthName } from "@/lib/staff";
import { setBudget } from "../actions";
import type { FinanceOverview } from "../page";

/** This month's budget per expense category: spent vs limit, editable in place. */
export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("finance.view")) notFound();
  if (!me.entitlements?.features.includes("finance.pnl")) return <LockedFeature feature="finance.pnl" t={t} />;

  const o = await api<FinanceOverview & { categories: { id: string; key: string | null; name: string }[] }>("/v1/finance/overview?months=3");
  const canManage = me.permissions.includes("finance.manage");
  const digits = minorDigits(o.currency);
  const m = (v: number) => money(v, o.currency, lang);
  const rows = o.categories.map((c) => {
    const line = o.costsByCategory.find((x) => x.id === c.id);
    const spent = Number(line?.amountMinor ?? 0);
    const budget = line?.budgetMinor == null ? null : Number(line.budgetMinor);
    const ratio = budget ? spent / budget : null;
    const status = budget === null ? "none" : ratio! > 1 ? "over" : ratio! >= 0.85 ? "near" : "ok";
    return { ...c, label: categoryName(c, lang), spent, budget, ratio, status: status as "none" | "over" | "near" | "ok" };
  });
  const totSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0);
  const tone = { over: "danger", near: "warning", ok: "success", none: "neutral" } as const;

  return (
    <>
      <PageHeader title={t("bud.title")} subtitle={t("bud.subtitle", { month: monthName(o.month, lang) })} />
      <Tabs items={financeTabs(t, "budgets")} />
      {sp.error && <Notice>{err(sp.error)}</Notice>}

      <div className="mb-5 grid gap-5 sm:grid-cols-2">
        <section className="rounded-[var(--radius-card)] bg-ink p-6 text-white">
          <p className="text-sm text-white/60">{t("bud.total")}</p>
          <p className="mt-1 text-[34px] font-semibold leading-tight tabular-nums">
            {m(totSpent)} <span className="text-lg font-medium text-white/50">/ {m(totBudget)}</span>
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={cn("h-full rounded-full", totSpent > totBudget ? "bg-danger" : "bg-accent")} style={{ width: `${Math.min(100, totBudget ? (totSpent / totBudget) * 100 : 0)}%` }} />
          </div>
        </section>
        <Card className="flex flex-wrap content-center gap-2">
          {(["over", "near", "ok", "none"] as const).map((s) => (
            <Badge key={s} tone={tone[s]}>
              {t(`bud.status.${s}`)} · {rows.filter((r) => r.status === s).length}
            </Badge>
          ))}
        </Card>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="px-5 py-3 text-start font-medium">{t("exp.category")}</th>
              <th scope="col" className="w-[34%] px-3 py-3 text-start font-medium">{t("bud.spent")}</th>
              <th scope="col" className="px-3 py-3 text-start font-medium">{t("common.status")}</th>
              <th scope="col" className="px-5 py-3 text-end font-medium">{t("bud.budget")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-semibold">{r.label}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                      <div
                        className={cn("h-full rounded-full", r.status === "over" ? "bg-danger" : r.status === "near" ? "bg-warning" : "bg-accent")}
                        style={{ width: `${Math.min(100, r.ratio === null ? (r.spent ? 100 : 0) : r.ratio * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-end font-semibold tabular-nums">{m(r.spent)}</span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Badge tone={tone[r.status]}>{t(`bud.status.${r.status}`)}</Badge>
                </td>
                <td className="px-5 py-3">
                  {canManage ? (
                    <form action={setBudget} className="flex items-center justify-end gap-2">
                      <input type="hidden" name="categoryId" value={r.id} />
                      <input type="hidden" name="month" value={o.month} />
                      <input type="hidden" name="currency" value={o.currency} />
                      <input type="hidden" name="back" value="/finance/budgets" />
                      <Input
                        name="amount"
                        inputMode="decimal"
                        dir="ltr"
                        required
                        aria-label={`${t("bud.budget")} — ${r.label}`}
                        defaultValue={r.budget === null ? "" : (r.budget / 10 ** digits).toFixed(digits)}
                        placeholder="0.00"
                        className="h-9 w-28 text-end tabular-nums"
                      />
                      <Button type="submit" variant="secondary" className="h-9 px-3">
                        {t("bud.set")}
                      </Button>
                    </form>
                  ) : (
                    <span className="block text-end tabular-nums">{r.budget === null ? "—" : m(r.budget)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
