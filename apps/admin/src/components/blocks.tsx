import { ArrowDownRight, ArrowUpRight, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { FEATURE_LABELS, lowestPlanWith, PLAN_CATALOGUE, type FeatureKey } from "@gym/shared";
import type { T } from "@/lib/i18n";
import { Button, Card } from "./ui";

/** KPI card: label, big number, % change with arrow, tiny trend line (PLAN.md section 12). */
export function KpiCard({
  label,
  value,
  change,
  trend,
  caption,
}: {
  label: string;
  value: string;
  change?: number;
  trend?: number[];
  caption?: string;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <Card className="flex flex-col gap-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
      <div className="flex items-center justify-between gap-2">
        {change !== undefined ? (
          <span className={`inline-flex items-center gap-1 text-sm ${up ? "text-success" : "text-danger"}`}>
            {up ? <ArrowUpRight size={16} aria-hidden /> : <ArrowDownRight size={16} aria-hidden />}
            <bdi className="tabular-nums">{Math.abs(change)}%</bdi>
            {caption && <span className="text-muted">{caption}</span>}
          </span>
        ) : (
          <span className="text-sm text-muted">{caption ?? " "}</span>
        )}
        {trend && <Sparkline points={trend} />}
      </div>
    </Card>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const w = 80;
  const h = 24;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / (max - min || 1)) * h}`)
    .join(" ");
  // SVG coordinates are not mirrored in RTL, so time still reads left to right.
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-accent">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** Empty state: one sentence + one button. */
export function EmptyState({ text, action }: { text: string; action?: { label: string; href: string } }) {
  return (
    <Card className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-muted">{text}</p>
      {action && (
        <Link href={action.href}>
          <Button>{action.label}</Button>
        </Link>
      )}
    </Card>
  );
}

/** Locked features show a short upgrade card instead of disappearing (PLAN.md section 7). */
export function LockedFeature({ feature, t }: { feature: FeatureKey; t: T }) {
  const plan = lowestPlanWith(feature);
  const planName = plan ? PLAN_CATALOGUE[plan].name : "Enterprise";
  return (
    <Card className="flex max-w-xl items-start gap-4">
      <div className="rounded-lg bg-accent-soft p-2 text-accent">
        <Lock size={20} aria-hidden />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">{t("locked.title", { plan: planName })}</h2>
        <p className="text-muted">{t("locked.body", { feature: FEATURE_LABELS[feature] })}</p>
        <div>
          <Link href="/settings">
            <Button variant="secondary">{t("locked.cta")}</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

export function ComingSoon({ phase, t }: { phase: string; t: T }) {
  return (
    <Card className="flex max-w-xl items-start gap-4">
      <div className="rounded-lg bg-bg p-2 text-muted">
        <Sparkles size={20} aria-hidden />
      </div>
      <div>
        <h2 className="font-semibold">{t("soon.title", { phase })}</h2>
        <p className="text-muted">{t("soon.body", { phase })}</p>
      </div>
    </Card>
  );
}

export interface KpiItem {
  label: string;
  value: string;
  change?: number;
  caption?: string;
  trend?: number[];
}

/**
 * The dashboard's headline numbers as one strip (not a pile of separate cards): large figure,
 * change vs last period with a direction arrow, and a small trend line where there is one.
 */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="mb-6 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-surface sm:grid-cols-3 xl:grid-cols-6">
      {items.map((k) => {
        const up = (k.change ?? 0) >= 0;
        return (
          <div key={k.label} className="flex flex-col gap-1 border-b border-e border-border p-4 xl:border-b-0">
            <span className="text-xs font-medium text-muted">{k.label}</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{k.value}</span>
            <div className="flex min-h-5 items-center justify-between gap-2">
              {k.change !== undefined ? (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-danger"}`}>
                  {up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
                  <bdi className="tabular-nums">{Math.abs(k.change)}%</bdi>
                  {k.caption && <span className="ms-1 font-normal text-faint">{k.caption}</span>}
                </span>
              ) : (
                <span className="text-xs text-faint">{k.caption ?? " "}</span>
              )}
              {k.trend && k.trend.length > 1 && <Sparkline points={k.trend} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
