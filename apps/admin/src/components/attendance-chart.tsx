"use client";

import { useState } from "react";

export interface DayBar {
  key: string;
  label: string;
  value: number;
  display: string;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Check-ins per day this week. One series, so no legend; today is the solid accent bar, other
 * days a lighter accent, days still ahead a dashed outline. Hover/focus shows the count; a
 * visually hidden table carries the same numbers for screen readers. Days run in reading order.
 */
export function AttendanceChart({ days, caption }: { days: DayBar[]; caption: string }) {
  const [active, setActive] = useState<number | null>(() => {
    const i = days.findIndex((d) => d.isToday);
    return i >= 0 ? i : null;
  });
  const max = Math.max(1, ...days.map((d) => d.value));

  return (
    <div dir="ltr">
      <div className="flex h-48 items-end gap-3" role="img" aria-label={caption}>
        {days.map((d, i) => {
          const h = d.isFuture ? 100 : Math.max(6, (d.value / max) * 100);
          const on = active === i;
          return (
            <button
              key={d.key}
              type="button"
              className="group relative flex h-full flex-1 flex-col items-center justify-end outline-none"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              aria-label={`${d.label}: ${d.display}`}
            >
              {on && !d.isFuture && (
                <span className="absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white tabular-nums">
                  {d.display}
                </span>
              )}
              <span
                className={
                  d.isFuture
                    ? "w-full max-w-[44px] rounded-full border-2 border-dashed border-border"
                    : d.isToday || on
                      ? "w-full max-w-[44px] rounded-full bg-accent"
                      : "w-full max-w-[44px] rounded-full bg-accent-line"
                }
                style={{ height: `${h}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3">
        {days.map((d) => (
          <span key={d.key} className={`flex-1 text-center text-xs ${d.isToday ? "font-semibold text-fg" : "text-faint"}`}>
            {d.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.isFuture ? "—" : d.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
