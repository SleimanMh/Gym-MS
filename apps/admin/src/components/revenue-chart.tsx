"use client";

import { useState } from "react";
import { niceTicks } from "@/lib/ticks";

export interface RevenuePoint {
  key: string;
  label: string;
  value: number;
  display: string;
}

/**
 * Monthly revenue — one series, so no legend box (the card title names it).
 * Thin bars in the gym's accent colour, 4px rounded tops on the baseline, recessive grid,
 * a tooltip on hover/focus per bar, and a table view for screen readers / exact numbers.
 * Time always reads left → right, also in RTL pages.
 */
export function RevenueChart({
  points,
  tableLabel,
  monthLabel,
  valueLabel,
  formatTick,
}: {
  points: RevenuePoint[];
  tableLabel: string;
  monthLabel: string;
  valueLabel: string;
  formatTick: Record<string, string>;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 28, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const slot = plotW / points.length;
  const barW = Math.min(28, slot * 0.6);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  // Long month names (Arabic) would collide: label every other month, always including the latest.
  const thin = points.some((p) => p.label.length > 5);

  return (
    <div dir="ltr">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tableLabel}>
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={pad.left} x2={W - pad.right} y1={y(tk)} y2={y(tk)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={pad.left - 8} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="#64748b">
                {formatTick[String(tk)] ?? tk}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = pad.left + i * slot + (slot - barW) / 2;
            const h = Math.max(0, pad.top + plotH - y(p.value));
            const r = Math.min(4, h);
            const yTop = pad.top + plotH - h;
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
                {/* Hit target: the whole column, bigger than the bar. */}
                <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${x},${pad.top + plotH} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${pad.top + plotH} Z`}
                    fill="var(--accent, #2563eb)"
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                )}
                {(!thin || (points.length - 1 - i) % 2 === 0) && (
                  <text x={pad.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.left} x2={W - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} stroke="#cbd5e1" strokeWidth={1} />
        </svg>
        {active !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${((pad.left + active * slot + slot / 2) / W) * 100}%`, top: 0 }}
            role="status"
          >
            <div className="text-muted">{points[active]!.label}</div>
            <div className="font-semibold tabular-nums text-fg">{points[active]!.display}</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">{tableLabel}</summary>
        <table className="mt-2 w-full text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-1 text-start font-medium">{monthLabel}</th>
              <th className="py-1 text-end font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-border">
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-end tabular-nums">{p.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
