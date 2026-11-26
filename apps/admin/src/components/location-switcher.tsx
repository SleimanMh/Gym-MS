"use client";

import { MapPin } from "lucide-react";
import { useRef } from "react";

/** Chooses which branch the schedule and check-in show. Saved in a cookie, applied on change. */
export function LocationSwitcher({
  locations,
  current,
  allLabel,
  label,
  action,
}: {
  locations: { id: string; name: string }[];
  current: string;
  allLabel: string;
  label: string;
  action: (formData: FormData) => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  if (locations.length < 2) return null;
  return (
    <form ref={form} action={action} className="flex items-center gap-2">
      <MapPin size={16} aria-hidden className="text-faint" />
      <label className="sr-only" htmlFor="location-switcher">
        {label}
      </label>
      <select
        id="location-switcher"
        name="location"
        defaultValue={current}
        onChange={() => form.current?.requestSubmit()}
        className="h-11 rounded-full bg-surface px-4 text-sm font-medium text-fg shadow-[0_1px_2px_rgba(18,18,24,0.04)]"
      >
        <option value="">{allLabel}</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </form>
  );
}
