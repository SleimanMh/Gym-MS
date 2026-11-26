"use client";

import { useState } from "react";

/**
 * Categorical slots validated with the dataviz checker (violet-led, light surface):
 * lightness band, chroma floor, CVD and normal-vision separation all pass. Three slots are under
 * 3:1 against white, so names and percentages are always printed in the legend (required relief).
 * More than five plans fold into "Other".
 */
const SLOTS = ["#6250d6", "#1baf7a", "#eda100", "#e87ba4", "#2a78d6"];

export function MixDonut({
  items,
  totalLabel,
  otherLabel,
  lang,
}: {
  items: { name: string; count: number }[];
  totalLabel: string;
  otherLabel: string;
  lang: "en" | "ar";
}) {
  const [active, setActive] = useState<number | null>(null);
  const folded = items.length > SLOTS.length ? [...items.slice(0, SLOTS.length - 1), { name: otherLabel, count: items.slice(SLOTS.length - 1).reduce((s, i) => s + i.count, 0) }] : items;
  const total = folded.reduce((s, i) => s + i.count, 0);
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-US");

  const R = 70;
  const C = 2 * Math.PI * R;
  const gap = folded.length > 1 ? 2.5 : 0; // surface gap between segments
  let offset = 0;
  const arcs = folded.map((it, i) => {
    const len = total ? (it.count / total) * C : 0;
    const arc = { i, len: Math.max(0, len - gap), offset };
    offset += len;
    return arc;
  });
  const shown = active !== null ? folded[active] : null;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative size-48">
        <svg viewBox="0 0 180 180" className="size-full -rotate-90" role="img" aria-label={`${totalLabel}: ${total}`}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--color-sunken)" strokeWidth="22" />
          {arcs.map((a) => (
            <circle
              key={a.i}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={SLOTS[a.i]}
              strokeWidth={active === a.i ? 26 : 22}
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={-a.offset}
              opacity={active === null || active === a.i ? 1 : 0.35}
              onMouseEnter={() => setActive(a.i)}
              onMouseLeave={() => setActive(null)}
              className="cursor-default transition-[opacity,stroke-width] duration-150"
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[26px] font-semibold leading-none tabular-nums">{nf.format(shown ? shown.count : total)}</span>
          <span className="mt-1 max-w-[110px] truncate text-xs text-muted">{shown ? shown.name : totalLabel}</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {folded.map((it, i) => (
          <li
            key={it.name}
            className={`flex items-center gap-2 rounded-lg px-1 text-sm ${active === i ? "bg-sunken" : ""}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: SLOTS[i] }} aria-hidden />
            <span className="flex-1 truncate">{it.name}</span>
            <span className="tabular-nums text-muted">{total ? Math.round((it.count / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
