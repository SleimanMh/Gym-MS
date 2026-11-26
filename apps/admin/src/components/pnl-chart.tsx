"use client";

import { useState } from "react";
import { niceTicks } from "@/lib/ticks";

export interface PnlPoint {
  key: string;
  label: string;
  revenue: number;
  costs: number;
  display: { revenue: string; costs: string; net: string; expenses: string; staff: string; margin: string };
  netPositive: boolean;
}

/**
 * Revenue vs costs per month on one axis: revenue in the gym's accent (the series that matters),
 * costs in a neutral grey for context. Legend always shown (two series); hover/focus a month for
 * a tooltip with the net; a table view carries every number. Time reads left → right in RTL too.
 */
export function PnlChart({
  points,
  labels,
  formatTick,
}: {
  points: PnlPoint[];
  labels: { revenue: string; costs: string; net: string; month: string; expenses: string; staff: string; margin: string; table: string };
  formatTick: Record<string, string>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 720;
  const H = 260;
  const pad = { top: 12, right: 8, bottom: 28, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...points.flatMap((p) => [p.revenue, p.costs]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const slot = plotW / points.length;
  const barW = Math.min(18, (slot * 0.62) / 2);
  const gap = 2;
  const base = pad.top + plotH;
  const y = (v: number) => base - (v / top) * plotH;
  const thin = points.some((p) => p.label.length > 5);
  const COSTS = "#b9b9c6";

  const bar = (x: number, v: number, fill: string, dim: boolean) => {
    const h = Math.max(0, base - y(v));
    if (h <= 0) return null;
    const r = Math.min(4, h);
    const yt = base - h;
    return (
      <path
        d={`M${x},${base} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + barW - r} Q${x + barW},${yt} ${x + barW},${yt + r} V${base} Z`}
        fill={fill}
        opacity={dim ? 0.4 : 1}
      />
    );
  };

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--accent, #6d5df6)" }} aria-hidden />
          {labels.revenue}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COSTS }} aria-hidden />
          {labels.costs}
        </li>
      </ul>
      <div className="relative" dir="ltr">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${labels.revenue} / ${labels.costs}`}>
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={pad.left} x2={W - pad.right} y1={y(tk)} y2={y(tk)} stroke="#ececf1" strokeWidth={1} />
              <text x={pad.left - 8} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="#8a8a99">
                {formatTick[String(tk)] ?? tk}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x0 = pad.left + i * slot + (slot - (barW * 2 + gap)) / 2;
            const dim = active !== null && active !== i;
            return (
              <g
                key={p.key}
                tabIndex={0}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              >
                <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill={active === i ? "#f4f4f8" : "transparent"} />
                {bar(x0, p.revenue, "var(--accent, #6d5df6)", dim)}
                {bar(x0 + barW + gap, p.costs, COSTS, dim)}
                {(!thin || (points.length - 1 - i) % 2 === 0) && (
                  <text x={pad.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#8a8a99">
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.left} x2={W - pad.right} y1={base} y2={base} stroke="#d6d6df" strokeWidth={1} />
        </svg>
        {active !== null && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: `${Math.min(88, Math.max(12, ((pad.left + active * slot + slot / 2) / W) * 100))}%`, top: 0 }}
            role="status"
          >
            <div className="mb-1 text-white/60">{points[active]!.label}</div>
            <div className="flex justify-between gap-4">
              <span>{labels.revenue}</span>
              <span className="font-semibold tabular-nums">{points[active]!.display.revenue}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>{labels.costs}</span>
              <span className="font-semibold tabular-nums">{points[active]!.display.costs}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4 border-t border-white/15 pt-1">
              <span>{labels.net}</span>
              <span className="font-semibold tabular-nums">{points[active]!.display.net}</span>
            </div>
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">{labels.table}</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[560px] text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1.5 text-start font-medium">{labels.month}</th>
                <th className="py-1.5 text-end font-medium">{labels.revenue}</th>
                <th className="py-1.5 text-end font-medium">{labels.expenses}</th>
                <th className="py-1.5 text-end font-medium">{labels.staff}</th>
                <th className="py-1.5 text-end font-medium">{labels.net}</th>
                <th className="py-1.5 text-end font-medium">{labels.margin}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.key} className="border-t border-border">
                  <td className="py-1.5">{p.label}</td>
                  <td className="py-1.5 text-end tabular-nums">{p.display.revenue}</td>
                  <td className="py-1.5 text-end tabular-nums">{p.display.expenses}</td>
                  <td className="py-1.5 text-end tabular-nums">{p.display.staff}</td>
                  <td className={`py-1.5 text-end font-semibold tabular-nums ${p.netPositive ? "" : "text-danger"}`}>{p.display.net}</td>
                  <td className="py-1.5 text-end tabular-nums text-muted">{p.display.margin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
