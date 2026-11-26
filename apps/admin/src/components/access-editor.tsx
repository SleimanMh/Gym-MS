"use client";

import { useState } from "react";
import { Lock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";

type Level = "none" | "view" | "manage";

export interface AccessEditorProps {
  employeeId: string;
  roles: { key: string; label: string; help: string }[];
  areas: { key: string; label: string; levels: Level[] }[];
  roleDefaults: Record<string, Record<string, Level>>;
  initialRole: string;
  initialAreas: Record<string, Level>;
  customAllowed: boolean;
  labels: { role: string; areas: string; none: string; view: string; manage: string; on: string; save: string; reset: string; custom: string; ownerAll: string; locked: string };
  action: (f: FormData) => Promise<void>;
}

/**
 * Role cards, then one row per area of the app (Hidden / View / Manage). Picking a role loads its
 * defaults; changing a row customises this person only. Without the plan feature the rows show the
 * role's access read-only.
 */
export function AccessEditor({ employeeId, roles, areas, roleDefaults, initialRole, initialAreas, customAllowed, labels, action }: AccessEditorProps) {
  const [role, setRole] = useState(initialRole);
  const [levels, setLevels] = useState<Record<string, Level>>(initialAreas);
  const defaults = roleDefaults[role] ?? {};
  const isOwner = role === "owner";
  const customised = !isOwner && areas.some((a) => levels[a.key] !== defaults[a.key]);
  const editable = customAllowed && !isOwner;

  const pickRole = (r: string) => {
    setRole(r);
    setLevels({ ...(roleDefaults[r] ?? {}) });
  };

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={employeeId} />
      <input type="hidden" name="role" value={role} />
      {editable && areas.map((a) => <input key={a.key} type="hidden" name={`area.${a.key}`} value={levels[a.key] ?? "none"} />)}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{labels.role}</legend>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => (
            <label
              key={r.key}
              className={cn(
                "transition-subtle flex cursor-pointer flex-col rounded-2xl px-4 py-3 ring-1",
                role === r.key ? "bg-accent-soft ring-accent/50" : "bg-sunken ring-transparent hover:ring-border",
              )}
            >
              <input type="radio" name="role-pick" value={r.key} checked={role === r.key} onChange={() => pickRole(r.key)} className="sr-only" />
              <span className="font-semibold">{r.label}</span>
              <span className="mt-0.5 text-xs text-muted">{r.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <div className="mb-2 flex items-center justify-between gap-3">
          <legend className="text-sm font-medium">
            {labels.areas}
            {customised && <span className="ms-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{labels.custom}</span>}
          </legend>
          {editable && customised && (
            <button type="button" onClick={() => setLevels({ ...defaults })} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <RotateCcw size={12} aria-hidden />
              {labels.reset}
            </button>
          )}
        </div>
        {isOwner && <p className="mb-2 text-xs text-muted">{labels.ownerAll}</p>}
        {!customAllowed && !isOwner && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
            <Lock size={12} aria-hidden />
            {labels.locked}
          </p>
        )}
        <ul className="divide-y divide-border rounded-2xl bg-sunken px-4">
          {areas.map((a) => {
            const current = isOwner ? (a.levels.includes("manage") ? "manage" : "view") : (levels[a.key] ?? "none");
            return (
              <li key={a.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-sm font-medium">{a.label}</span>
                <span className="flex rounded-full bg-surface p-0.5" role="radiogroup" aria-label={a.label}>
                  {a.levels.map((l) => {
                    const on = current === l;
                    const text = l === "none" ? labels.none : l === "manage" ? labels.manage : a.levels.length === 2 ? labels.on : labels.view;
                    return (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={!editable}
                        onClick={() => setLevels((s) => ({ ...s, [a.key]: l }))}
                        className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold transition-subtle disabled:cursor-default",
                          on ? (l === "none" ? "bg-ink/80 text-white" : "bg-accent text-accent-fg") : "text-muted enabled:hover:text-fg",
                        )}
                      >
                        {text}
                      </button>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div>
        <button type="submit" className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90">
          {labels.save}
        </button>
      </div>
    </form>
  );
}
