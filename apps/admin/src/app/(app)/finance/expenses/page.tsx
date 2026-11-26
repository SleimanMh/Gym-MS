import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Repeat, Trash2 } from "lucide-react";
import { LockedFeature } from "@/components/blocks";
import { Badge, Button, Card, Input, Label, Notice, PageHeader, SectionTitle, Select, Tabs } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { localDateIn, money } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { categoryName, financeTabs, monthName, shiftMonth } from "@/lib/staff";
import { addCategory, addExpense, removeExpense } from "../actions";

interface Expense {
  id: string;
  amountMinor: string;
  currency: string;
  spentOn: string;
  vendor: string | null;
  note: string | null;
  locationId: string | null;
  recurringMonthly: boolean;
  recurringParentId: string | null;
  category: { id: string; name: string; key: string | null };
}

/** The month's expenses, newest first, with the add form beside them. */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; error?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("finance.view") || !me.tenant) notFound();
  if (!me.entitlements?.features.includes("finance.pnl")) return <LockedFeature feature="finance.pnl" t={t} />;

  const tz = me.tenant.timezone;
  const currency = me.tenant.currency;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : localDateIn(new Date(), tz).slice(0, 7);
  const self = `/finance/expenses?month=${month}`;
  const [expenses, categories, locations] = await Promise.all([
    api<Expense[]>(`/v1/expenses?month=${month}`),
    api<{ id: string; name: string; key: string | null }[]>("/v1/expense-categories"),
    api<{ id: string; name: string }[]>("/v1/locations"),
  ]);
  const canManage = me.permissions.includes("finance.manage");
  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const total = expenses.reduce((s, e) => s + Number(e.amountMinor), 0);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-GB");
  const today = localDateIn(new Date(), tz);
  const shortMonth = new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", { month: "short", timeZone: "UTC" });

  return (
    <>
      <PageHeader
        title={t("exp.title")}
        subtitle={t("exp.subtitle", { n: nf.format(expenses.length), total: money(total, currency, lang), month: monthName(month, lang) })}
        action={
          <div className="flex items-center gap-1 rounded-full bg-surface p-1">
            <Link href={`/finance/expenses?month=${shiftMonth(month, -1)}`} aria-label={t("pay.prevMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronLeft size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
            <span className="px-2 text-sm font-medium">{monthName(month, lang)}</span>
            <Link href={`/finance/expenses?month=${shiftMonth(month, 1)}`} aria-label={t("pay.nextMonth")} className="transition-subtle flex size-9 items-center justify-center rounded-full hover:bg-sunken">
              <ChevronRight size={18} aria-hidden className="rtl:-scale-x-100" />
            </Link>
          </div>
        }
      />
      <Tabs items={financeTabs(t, "expenses")} />
      {sp.error && <Notice>{err(sp.error)}</Notice>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="h-fit p-0">
          {expenses.length ? (
            <ul>
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
                  <span className="flex w-12 shrink-0 flex-col items-center rounded-2xl bg-sunken py-1.5 leading-tight">
                    <span className="text-lg font-semibold tabular-nums">{nf.format(Number(e.spentOn.slice(8, 10)))}</span>
                    <span className="text-[11px] text-faint">{shortMonth.format(new Date(`${e.spentOn.slice(0, 10)}T12:00:00Z`))}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{e.vendor ?? categoryName(e.category, lang)}</span>
                      {(e.recurringMonthly || e.recurringParentId) && (
                        <Badge tone="accent" dot={false}>
                          <Repeat size={11} aria-hidden />
                          {t("exp.monthly")}
                        </Badge>
                      )}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {categoryName(e.category, lang)}
                      {" · "}
                      {e.locationId ? locName.get(e.locationId) : t("exp.anyLocation")}
                      {e.note && <> · {e.note}</>}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{money(e.amountMinor, e.currency, lang)}</span>
                  {canManage && (
                    <form action={removeExpense}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="back" value={self} />
                      <button
                        aria-label={e.recurringMonthly ? t("exp.removeTemplate") : t("exp.remove")}
                        title={e.recurringMonthly ? t("exp.removeTemplate") : t("exp.remove")}
                        className="transition-subtle flex size-8 items-center justify-center rounded-full text-faint hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-muted">{t("exp.empty")}</p>
          )}
        </Card>

        {canManage && (
          <div className="flex flex-col gap-5">
            <Card className="p-6">
              <SectionTitle>{t("exp.add")}</SectionTitle>
              <form action={addExpense} className="flex flex-col gap-3">
                <input type="hidden" name="back" value={self} />
                <input type="hidden" name="currency" value={currency} />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="amount">
                      {t("exp.amount")} <span className="text-faint">({currency})</span>
                    </Label>
                    <Input id="amount" name="amount" inputMode="decimal" dir="ltr" required placeholder="0.00" />
                  </div>
                  <div>
                    <Label htmlFor="spentOn">{t("exp.date")}</Label>
                    <Input id="spentOn" name="spentOn" type="date" required defaultValue={month === today.slice(0, 7) ? today : `${month}-01`} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="categoryId">{t("exp.category")}</Label>
                  <Select id="categoryId" name="categoryId" required>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {categoryName(c, lang)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="vendor">
                    {t("exp.vendor")} {t("common.optional")}
                  </Label>
                  <Input id="vendor" name="vendor" maxLength={120} placeholder={t("exp.vendorPh")} />
                </div>
                <div>
                  <Label htmlFor="locationId">{t("exp.location")}</Label>
                  <Select id="locationId" name="locationId" defaultValue="">
                    <option value="">{t("exp.anyLocation")}</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="note">
                    {t("exp.note")} {t("common.optional")}
                  </Label>
                  <Input id="note" name="note" maxLength={500} />
                </div>
                <label className="flex items-start gap-2.5 rounded-2xl bg-sunken p-3 text-sm">
                  <input type="checkbox" name="recurringMonthly" className="mt-0.5 size-4 accent-[var(--accent)]" />
                  <span>
                    <span className="block font-medium">{t("exp.recurring")}</span>
                    <span className="block text-xs text-muted">{t("exp.recurringHelp")}</span>
                  </span>
                </label>
                <Button type="submit" className="mt-1">
                  {t("exp.add")}
                </Button>
              </form>
            </Card>

            <Card className="p-6">
              <SectionTitle>{t("exp.categories")}</SectionTitle>
              <ul className="mb-4 flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <li key={c.id} className="rounded-full bg-sunken px-3 py-1 text-xs font-medium text-muted">
                    {categoryName(c, lang)}
                  </li>
                ))}
              </ul>
              <form action={addCategory} className="flex gap-2">
                <input type="hidden" name="back" value={self} />
                <Input name="name" required minLength={2} maxLength={60} aria-label={t("exp.categoryName")} placeholder={t("exp.categoryName")} />
                <Button type="submit" variant="secondary" className="shrink-0">
                  {t("exp.addCategory")}
                </Button>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
