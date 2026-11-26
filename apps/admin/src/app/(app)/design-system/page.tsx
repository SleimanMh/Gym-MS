import { EmptyState, KpiCard, LockedFeature } from "@/components/blocks";
import { Badge, Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { getT } from "@/lib/i18n";

/**
 * Design system page (PLAN.md section 12, "Before building"): colours, type, buttons, cards,
 * table, form. Approve this and the 5 key screens before Phase 1 UI work.
 */
export default async function DesignSystemPage() {
  const { t } = await getT();
  const swatches = [
    ["bg", "bg-bg"],
    ["surface", "bg-surface"],
    ["border", "bg-border"],
    ["muted", "bg-muted"],
    ["fg", "bg-fg"],
    ["accent", "bg-accent"],
    ["success", "bg-success"],
    ["warning", "bg-warning"],
    ["danger", "bg-danger"],
  ] as const;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title={t("nav.designSystem")} action={<Button>Primary action</Button>} />

      <Section title="Colours">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
          {swatches.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <div className={`h-14 rounded-lg border border-border ${cls}`} />
              <span className="text-xs text-muted">{name}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          One accent colour per gym (its brand colour). Green, amber and red are only for status.
        </p>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <p className="text-3xl font-semibold">Heading 1 — 30px · عنوان رئيسي</p>
          <p className="text-2xl font-semibold">Page title — 24px · عنوان الصفحة</p>
          <p className="text-lg font-semibold">Section — 18px · قسم</p>
          <p className="text-base">Body — 16px. The quick brown fox jumps over the lazy dog. · النص الأساسي</p>
          <p className="text-sm text-muted">Muted — 14px · نص ثانوي</p>
        </div>
      </Section>

      <Section title="Buttons and badges">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button disabled>Disabled</Button>
          <Badge>Neutral</Badge>
          <Badge tone="accent">Pro</Badge>
          <Badge tone="success">Active</Badge>
          <Badge tone="warning">Expiring</Badge>
          <Badge tone="danger">Unpaid</Badge>
        </div>
      </Section>

      <Section title="KPI cards">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Revenue this month" value="$18,420" change={12} caption="vs last month" trend={[4, 6, 5, 8, 7, 9, 11]} />
          <KpiCard label="Active members" value="642" change={3} trend={[5, 5, 6, 6, 7, 7, 8]} />
          <KpiCard label="Churn rate" value="4.1%" change={-1.2} trend={[6, 5, 5, 4, 5, 4, 4]} />
          <KpiCard label="Check-ins today" value="187" />
        </div>
      </Section>

      <Section title="Table">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-bg text-start text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-medium">Member</th>
                <th className="px-4 py-3 text-start font-medium">Plan</th>
                <th className="px-4 py-3 text-start font-medium">Status</th>
                <th className="px-4 py-3 text-end font-medium">Last visit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["Omar Saleh", "Monthly", "success", "Active", "Today"],
                ["Lea Khoury", "10-class pack", "warning", "Expiring", "3 days ago"],
                ["Rami Haddad", "Annual", "danger", "Unpaid", "2 weeks ago"],
              ].map(([name, plan, tone, status, last]) => (
                <tr key={name} className="transition-subtle hover:bg-bg">
                  <td className="px-4 py-3 font-medium">{name}</td>
                  <td className="px-4 py-3">{plan}</td>
                  <td className="px-4 py-3">
                    <Badge tone={tone as "success" | "warning" | "danger"}>{status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-end text-muted">{last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title="Form">
        <Card className="max-w-md">
          <form className="flex flex-col gap-4">
            <div>
              <Label htmlFor="ds-name">Full name</Label>
              <Input id="ds-name" placeholder="Omar Saleh" />
            </div>
            <div>
              <Label htmlFor="ds-phone">Mobile phone</Label>
              <Input id="ds-phone" type="tel" dir="ltr" placeholder="+961 70 000 000" />
            </div>
            <div>
              <Label htmlFor="ds-plan">Membership plan</Label>
              <Select id="ds-plan" defaultValue="monthly">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button">
                Cancel
              </Button>
              <Button type="button">{t("common.save")}</Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="Empty state and upgrade card">
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState text={t("dash.empty")} action={{ label: t("dash.emptyAction"), href: "/schedule" }} />
          <LockedFeature feature="finance.pnl" t={t} />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
