"use client";

import { useState, type ReactNode } from "react";
import { Lock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";

export interface AccessFormProps {
  roles: { key: string; label: string; help: string }[];
  /** Areas of the app, each with its permissions; the first one opens the area. */
  tree: { key: string; label: string; permissions: { key: string; label: string }[] }[];
  roleDefaults: Record<string, string[]>;
  initialRole: string;
  initialSelection: string[];
  customAllowed: boolean;
  labels: { role: string; access: string; accessHelp: string; reset: string; custom: string; ownerAll: string; locked: string; submit: string };
  action: (f: FormData) => Promise<void>;
  /** Hidden ids and any fields shown above the role (e.g. name and email when creating a user). */
  children?: ReactNode;
  disabled?: boolean;
}

/**
 * Role cards + an access tree (ADR 0007). Picking a role loads its defaults; ticking changes this
 * person only. A branch's first item opens the area — ticking any other item ticks it, unticking
 * it clears the branch. Without the plan feature the tree shows the role's access read-only.
 */
export function AccessForm({ roles, tree, roleDefaults, initialRole, initialSelection, customAllowed, labels, action, children, disabled }: AccessFormProps) {
  const [role, setRole] = useState(initialRole);
  const [sel, setSel] = useState<Set<string>>(new Set(initialSelection));
  const isOwner = role === "owner";
  const editable = customAllowed && !isOwner && !disabled;
  const defaults = new Set(roleDefaults[role] ?? []);
  const shown = isOwner ? new Set(tree.flatMap((a) => a.permissions.map((p) => p.key))) : sel;
  const customised = !isOwner && (shown.size !== defaults.size || [...shown].some((p) => !defaults.has(p)));

  const pickRole = (r: string) => {
    setRole(r);
    setSel(new Set(roleDefaults[r] ?? []));
  };
  const toggleLeaf = (area: AccessFormProps["tree"][number], key: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      const first = area.permissions[0]!.key;
      if (on) {
        n.add(key);
        n.add(first);
      } else if (key === first) {
        area.permissions.forEach((p) => n.delete(p.key));
      } else n.delete(key);
      return n;
    });
  const toggleArea = (area: AccessFormProps["tree"][number], on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      area.permissions.forEach((p) => (on ? n.add(p.key) : n.delete(p.key)));
      return n;
    });

  return (
    <form action={action} className="flex flex-col gap-6">
      {children}
      <input type="hidden" name="role" value={role} />
      {/* permSet tells the server the tree was sent (even with nothing ticked). */}
      {editable && <input type="hidden" name="permSet" value="1" />}
      {editable && [...sel].map((p) => <input key={p} type="hidden" name="perm" value={p} />)}

      <fieldset disabled={disabled}>
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
        <div className="mb-1 flex items-center justify-between gap-3">
          <legend className="text-sm font-medium">
            {labels.access}
            {customised && <span className="ms-2 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">{labels.custom}</span>}
          </legend>
          {editable && customised && (
            <button type="button" onClick={() => setSel(new Set(defaults))} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <RotateCcw size={12} aria-hidden />
              {labels.reset}
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-muted">{isOwner ? labels.ownerAll : labels.accessHelp}</p>
        {!customAllowed && !isOwner && (
          <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
            <Lock size={12} aria-hidden />
            {labels.locked}
          </p>
        )}
        <ul className="grid gap-2 md:grid-cols-2">
          {tree.map((area) => {
            const on = area.permissions.filter((p) => shown.has(p.key)).length;
            const all = on === area.permissions.length;
            return (
              <li key={area.key} className={cn("rounded-2xl px-4 py-3", on ? "bg-accent-soft/50" : "bg-sunken")}>
                <label className="flex items-center gap-2.5 font-semibold">
                  <input
                    type="checkbox"
                    checked={all}
                    ref={(el) => {
                      if (el) el.indeterminate = on > 0 && !all;
                    }}
                    disabled={!editable}
                    onChange={(e) => toggleArea(area, e.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  {area.label}
                </label>
                {area.permissions.length > 1 && (
                  <ul className="mt-2 flex flex-col gap-1.5 border-s-2 border-border ps-4 ms-2">
                    {area.permissions.map((p) => (
                      <li key={p.key}>
                        <label className="flex items-center gap-2.5 text-sm">
                          <input
                            type="checkbox"
                            checked={shown.has(p.key)}
                            disabled={!editable}
                            onChange={(e) => toggleLeaf(area, p.key, e.target.checked)}
                            className="size-4 accent-[var(--accent)]"
                          />
                          {p.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      {!disabled && (
        <div>
          <button type="submit" className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90">
            {labels.submit}
          </button>
        </div>
      )}
    </form>
  );
}
