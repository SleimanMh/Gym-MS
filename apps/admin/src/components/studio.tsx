import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowUpRight as Open, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./ui";

/*
 * Studio dashboard building blocks (server components). Colours follow the gym's accent;
 * the dark cards use the `ink` tokens.
 */

/** "Up next": the next class, who's coming and how full it is — the first thing staff look for. */
export function NextClassHero({
  label,
  title,
  meta,
  attendees,
  bookedLabel,
  booked,
  capacity,
  href,
  openLabel,
  startsLabel,
  timeBlock,
}: {
  label: string;
  title: string;
  meta: string;
  attendees: { firstName: string; lastName: string }[];
  bookedLabel: string;
  booked: number;
  capacity: number;
  href: string;
  openLabel: string;
  startsLabel: string;
  timeBlock: { time: string; day: string; color: string };
}) {
  const pct = capacity ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
  const extra = Math.max(0, booked - attendees.length);
  return (
    <section className="relative flex min-h-[236px] flex-col gap-6 overflow-hidden rounded-[var(--radius-card)] bg-accent p-6 text-accent-fg sm:flex-row sm:items-stretch">
      <div className="flex flex-1 flex-col">
        <span className="mb-4 w-fit rounded-full bg-white/18 px-3 py-1 text-xs font-medium">{label}</span>
        <h2 className="text-[34px] font-semibold leading-tight">{title}</h2>
        <p className="mt-1 text-sm text-white/80">{meta}</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex -space-x-2 rtl:space-x-reverse">
            {attendees.map((a, i) => (
              <span
                key={i}
                className="flex size-8 items-center justify-center rounded-full bg-white text-[11px] font-bold text-accent-deep ring-2 ring-accent"
                aria-hidden
              >
                {a.firstName[0]}
                {a.lastName[0]}
              </span>
            ))}
            {extra > 0 && (
              <span className="flex size-8 items-center justify-center rounded-full bg-accent-deep text-[11px] font-bold ring-2 ring-accent" aria-hidden>
                +{extra}
              </span>
            )}
          </div>
          <span className="text-sm text-white/90">{bookedLabel}</span>
        </div>
        <div className="mt-3 h-1.5 max-w-md overflow-hidden rounded-full bg-white/25" role="meter" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={booked} aria-label={bookedLabel}>
          <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <Link href={href}>
            <Button className="bg-white text-fg hover:opacity-95">
              {openLabel}
              <Open size={16} aria-hidden className="rtl:-scale-x-100" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Time block stands in for the class photo of the reference: the class colour, big time. */}
      <div
        className="relative flex min-h-[160px] w-full flex-col justify-between rounded-[18px] p-5 sm:w-64"
        style={{ background: `color-mix(in srgb, ${timeBlock.color} 35%, rgba(255,255,255,0.14))` }}
      >
        <span className="text-sm text-white/85">{timeBlock.day}</span>
        <span className="text-5xl font-semibold tabular-nums tracking-tight" dir="ltr">
          {timeBlock.time}
        </span>
        <span className="w-fit rounded-full bg-ink/70 px-3 py-1 text-xs font-medium">{startsLabel}</span>
      </div>
    </section>
  );
}

/** Dark card with a semicircle gauge: share of class spots taken this month. */
export function FillGauge({
  title,
  pct,
  caption,
  stats,
}: {
  title: string;
  pct: number | null;
  caption: string;
  stats: { label: string; value: string }[];
}) {
  const r = 80;
  const len = Math.PI * r;
  const value = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <section className="flex flex-col rounded-[var(--radius-card)] bg-ink p-6 text-white">
      <h2 className="font-semibold">{title}</h2>
      <div className="relative mx-auto mt-4 w-full max-w-[240px]">
        <svg viewBox="0 0 200 112" className="w-full" aria-hidden>
          <path d={`M20,100 A${r},${r} 0 0 1 180,100`} fill="none" stroke="var(--color-ink-soft)" strokeWidth="16" strokeLinecap="round" />
          <path
            d={`M20,100 A${r},${r} 0 0 1 180,100`}
            fill="none"
            stroke="var(--accent, #6d5df6)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * len} ${len}`}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <div className="text-[40px] font-semibold leading-none tabular-nums">{pct === null ? "—" : `${pct}%`}</div>
          <div className="mt-1 text-xs text-white/60">{caption}</div>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.label}>
            <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
            <dt className="text-xs text-white/55">{s.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Headline number with an icon and an optional change pill. */
export function StatCard({
  icon: Icon,
  label,
  value,
  change,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** `invert`: a rise is bad news (costs), so up shows red and down green. */
  change?: { pct: number; invert?: boolean } | { text: string };
  note?: string;
}) {
  return (
    <div className="flex flex-col rounded-[var(--radius-card)] bg-surface p-5 shadow-[0_1px_2px_rgba(18,18,24,0.04)]">
      <div className="mb-5 flex items-center justify-between">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={18} aria-hidden />
        </span>
        {change && "pct" in change && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              change.pct >= 0 !== !!change.invert ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {change.pct >= 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
            <bdi className="tabular-nums">{Math.abs(change.pct)}%</bdi>
          </span>
        )}
        {change && "text" in change && (
          <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-semibold text-muted tabular-nums">{change.text}</span>
        )}
      </div>
      <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</span>
      <span className="mt-2 text-sm text-muted">{label}</span>
      {note && <span className="mt-0.5 text-xs text-faint">{note}</span>}
    </div>
  );
}
