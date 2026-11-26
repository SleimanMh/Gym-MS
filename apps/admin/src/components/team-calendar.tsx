"use client";

import { useMemo, useRef, useState, type MouseEvent } from "react";
import { Dumbbell, MapPin, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CalEmployee {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
}

/** An event already placed in the gym's time zone by the server page. */
export interface CalEvent {
  id: string;
  kind: "shift" | "class";
  employeeId: string;
  day: string; // YYYY-MM-DD (gym time)
  startMin: number; // minutes after midnight (gym time)
  endMin: number;
  start: string; // "09:00"
  end: string;
  title: string; // translated activity or class name
  activity: string | null; // raw activity value (for editing)
  note: string | null;
  locationId: string;
  location: string;
  booked: number | null;
  capacity: number | null;
}

export interface CalLabels {
  everyone: string;
  newSlot: string;
  addTitle: string;
  editTitle: string;
  who: string;
  activity: string;
  activityPh: string;
  where: string;
  day: string;
  from: string;
  to: string;
  note: string;
  save: string;
  add: string;
  del: string;
  cancel: string;
  openClass: string;
  booked: string; // "{b}/{c} booked"
  shift: string;
  clickHint: string;
}

/** Calendar colours per person (not a data chart: identity only, always shown with a name). */
const PEOPLE_COLORS = ["#6250d6", "#1baf7a", "#d68a00", "#d9558f", "#2a78d6", "#0f9fb5", "#c4571f", "#6f7f10"];

const HOUR = 52; // px per hour
const START_H = 6;
const END_H = 23;

type Draft = { id?: string; employeeId: string; day: string; start: string; end: string; activity: string; locationId: string; note: string };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Side-by-side columns for overlapping events (like Teams/Outlook). */
function layout(events: CalEvent[]) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: { e: CalEvent; col: number; cols: number }[] = [];
  let cluster: { e: CalEvent; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    cluster.forEach((c) => placed.push({ ...c, cols }));
    cluster = [];
  };
  for (const e of sorted) {
    if (e.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => c.e.endMin > e.startMin).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ e, col });
    clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flush();
  return placed;
}

export function TeamCalendar({
  days,
  dayLabels,
  today,
  nowMin,
  employees,
  events,
  locations,
  activities,
  canEdit,
  showFilter = true,
  labels,
  saveAction,
  deleteAction,
  back,
}: {
  days: string[];
  dayLabels: { wd: string; dm: string }[];
  today: string;
  /** Minutes after midnight now, in gym time (red "now" line). */
  nowMin: number;
  employees: CalEmployee[];
  events: CalEvent[];
  locations: { id: string; name: string }[];
  activities: { value: string; label: string }[];
  canEdit: boolean;
  showFilter?: boolean;
  labels: CalLabels;
  saveAction: (f: FormData) => Promise<void>;
  deleteAction: (f: FormData) => Promise<void>;
  back: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<CalEvent | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const color = useMemo(() => new Map(employees.map((e, i) => [e.id, PEOPLE_COLORS[i % PEOPLE_COLORS.length]!])), [employees]);
  const name = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "";
  };
  const visible = events.filter((e) => !hidden.has(e.employeeId));
  const onlyOne = employees.filter((e) => !hidden.has(e.id));
  const defaultWho = onlyOne.length === 1 ? onlyOne[0]!.id : (employees[0]?.id ?? "");

  const showDialog = (d: Draft | null, ev: CalEvent | null) => {
    setDraft(d);
    setOpen(ev);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  };
  const close = () => dialogRef.current?.close();

  const newAt = (day: string, startMin: number) =>
    showDialog({ employeeId: defaultWho, day, start: hhmm(startMin), end: hhmm(Math.min(startMin + 60, END_H * 60)), activity: "", locationId: locations[0]?.id ?? "", note: "" }, null);

  const onColumnClick = (day: string) => (ev: MouseEvent<HTMLDivElement>) => {
    if (!canEdit || ev.target !== ev.currentTarget) return;
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const min = Math.max(START_H * 60, Math.min((END_H - 1) * 60, START_H * 60 + Math.floor((y / HOUR) * 2) * 30));
    newAt(day, min);
  };

  const openEvent = (e: CalEvent) => {
    if (e.kind === "shift" && canEdit) {
      showDialog({ id: e.id, employeeId: e.employeeId, day: e.day, start: e.start, end: e.end, activity: e.activity ?? "", locationId: e.locationId, note: e.note ?? "" }, e);
    } else showDialog(null, e);
  };

  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);

  return (
    <div>
      {/* People filter + new slot */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {showFilter && employees.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setHidden(new Set())}
              className={cn("transition-subtle rounded-full px-3 py-1.5 text-sm font-medium", hidden.size === 0 ? "bg-ink text-white" : "bg-surface text-muted hover:text-fg")}
            >
              {labels.everyone}
            </button>
            {employees.map((e) => {
              const on = !hidden.has(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setHidden((h) => {
                      // First click on a person while everyone shows = show only them.
                      if (h.size === 0) return new Set(employees.filter((x) => x.id !== e.id).map((x) => x.id));
                      const n = new Set(h);
                      if (n.has(e.id)) n.delete(e.id);
                      else n.add(e.id);
                      return n.size === employees.length ? new Set() : n;
                    })
                  }
                  className={cn("transition-subtle flex items-center gap-2 rounded-full py-1 ps-1 pe-3 text-sm font-medium", on ? "bg-surface text-fg shadow-[0_1px_2px_rgba(18,18,24,0.06)]" : "bg-transparent text-faint")}
                >
                  <span className="flex size-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: on ? color.get(e.id) : "#c9c9d3" }} aria-hidden>
                    {e.firstName[0]}
                    {e.lastName[0]}
                  </span>
                  {e.firstName}
                </button>
              );
            })}
          </>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => newAt(days.includes(today) ? today : days[0]!, 9 * 60)}
            className="transition-subtle ms-auto inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90"
          >
            <Plus size={16} aria-hidden />
            {labels.newSlot}
          </button>
        )}
      </div>

      {/* Week grid — time runs top to bottom, days in reading order */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-surface shadow-[0_1px_2px_rgba(18,18,24,0.04)]">
        <div className="min-w-[860px]">
          <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d, i) => (
              <div key={d} className="px-2 py-3 text-center">
                <span className={cn("inline-flex flex-col rounded-2xl px-3 py-1", d === today && "bg-ink text-white")}>
                  <span className="text-xs opacity-70">{dayLabels[i]!.wd}</span>
                  <span className="text-sm font-semibold tabular-nums">{dayLabels[i]!.dm}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
            {/* Hour gutter */}
            <div className="relative" style={{ height: hours.length * HOUR }}>
              {hours.map((h, i) => (
                <span key={h} className="absolute end-2 -translate-y-1/2 text-[11px] tabular-nums text-faint" style={{ top: i * HOUR }} dir="ltr">
                  {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              ))}
            </div>
            {days.map((d) => {
              const dayEvents = layout(visible.filter((e) => e.day === d && e.endMin > START_H * 60 && e.startMin < END_H * 60));
              return (
                <div
                  key={d}
                  onClick={onColumnClick(d)}
                  className={cn("relative border-s border-border", canEdit && "cursor-cell", d === today && "bg-accent-soft/30")}
                  style={{
                    height: hours.length * HOUR,
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, var(--color-border, #ececf1) ${HOUR - 1}px, var(--color-border, #ececf1) ${HOUR}px)`,
                  }}
                >
                  {d === today && nowMin > START_H * 60 && nowMin < END_H * 60 && (
                    <span className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: ((nowMin - START_H * 60) / 60) * HOUR }} aria-hidden />
                  )}
                  {dayEvents.map(({ e, col, cols }) => {
                    const top = ((Math.max(e.startMin, START_H * 60) - START_H * 60) / 60) * HOUR;
                    const height = Math.max(22, ((Math.min(e.endMin, END_H * 60) - Math.max(e.startMin, START_H * 60)) / 60) * HOUR - 2);
                    const c = color.get(e.employeeId) ?? "#6250d6";
                    return (
                      <button
                        key={`${e.kind}-${e.id}`}
                        type="button"
                        onClick={() => openEvent(e)}
                        className="transition-subtle absolute flex flex-col items-stretch justify-start overflow-hidden rounded-lg border-s-[3px] px-1.5 py-1 text-start text-[11px] leading-tight text-fg hover:z-20 hover:shadow-md"
                        style={{
                          top: top + 1,
                          height,
                          insetInlineStart: `calc(${(col / cols) * 100}% + 2px)`,
                          width: `calc(${100 / cols}% - 4px)`,
                          borderInlineStartColor: c,
                          background: `color-mix(in srgb, ${c} 14%, white)`,
                        }}
                        title={`${e.start}–${e.end} · ${e.title} · ${name(e.employeeId)}`}
                      >
                        <span className="flex items-center gap-1 font-semibold">
                          {e.kind === "class" && <Dumbbell size={11} aria-hidden className="shrink-0" />}
                          <span className="truncate">{e.title}</span>
                        </span>
                        {height > 34 && <span className="block truncate text-muted">{name(e.employeeId)}</span>}
                        {height > 48 && (
                          <span className="block truncate tabular-nums text-faint" dir="ltr">
                            {e.start}–{e.end}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {canEdit && <p className="mt-2 text-xs text-faint">{labels.clickHint}</p>}

      {/* Quick add / edit / details */}
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[var(--radius-card)] bg-surface p-0 text-fg shadow-2xl backdrop:bg-ink/40"
        onClose={() => {
          setDraft(null);
          setOpen(null);
        }}
      >
        {draft ? (
          <form action={saveAction} className="flex flex-col gap-3 p-6" onSubmit={() => setTimeout(close, 0)}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{draft.id ? labels.editTitle : labels.addTitle}</h2>
              <button type="button" onClick={close} aria-label={labels.cancel} className="rounded-full p-1.5 text-muted hover:bg-sunken">
                <X size={18} aria-hidden />
              </button>
            </div>
            {draft.id && <input type="hidden" name="id" value={draft.id} />}
            <input type="hidden" name="back" value={back} />
            <Field label={labels.who}>
              <select name="employeeId" defaultValue={draft.employeeId} required className="h-10 w-full rounded-xl border border-border bg-surface px-3">
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} · {e.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={labels.activity}>
              <input name="activity" list="cal-activities" defaultValue={activities.find((a) => a.value === draft.activity)?.label ?? draft.activity} placeholder={labels.activityPh} maxLength={60} className="h-10 w-full rounded-xl border border-border bg-surface px-3" />
              <datalist id="cal-activities">
                {activities.map((a) => (
                  <option key={a.value} value={a.label} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={labels.day}>
                <input type="date" name="date" defaultValue={draft.day} required className="h-10 w-full rounded-xl border border-border bg-surface px-2 text-sm" />
              </Field>
              <Field label={labels.from}>
                <input type="time" name="start" defaultValue={draft.start} step={900} required className="h-10 w-full rounded-xl border border-border bg-surface px-2 text-sm" dir="ltr" />
              </Field>
              <Field label={labels.to}>
                <input type="time" name="end" defaultValue={draft.end} step={900} required className="h-10 w-full rounded-xl border border-border bg-surface px-2 text-sm" dir="ltr" />
              </Field>
            </div>
            <Field label={labels.where}>
              <select name="locationId" defaultValue={draft.locationId} required className="h-10 w-full rounded-xl border border-border bg-surface px-3">
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={labels.note}>
              <input name="note" defaultValue={draft.note} maxLength={200} className="h-10 w-full rounded-xl border border-border bg-surface px-3" />
            </Field>
            <div className="mt-2 flex items-center gap-2">
              <button type="submit" className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90">
                {draft.id ? labels.save : labels.add}
              </button>
              <button type="button" onClick={close} className="h-10 rounded-full px-4 text-sm font-medium text-muted hover:bg-sunken">
                {labels.cancel}
              </button>
              {draft.id && (
                <button
                  type="submit"
                  formAction={deleteAction}
                  formNoValidate
                  onClick={() => setTimeout(close, 0)}
                  className="ms-auto h-10 rounded-full px-4 text-sm font-semibold text-danger hover:bg-danger-soft"
                >
                  {labels.del}
                </button>
              )}
            </div>
          </form>
        ) : open ? (
          <div className="p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-lg font-semibold">
                  {open.kind === "class" && <Dumbbell size={16} aria-hidden />}
                  {open.title}
                </p>
                <p className="text-sm text-muted">{name(open.employeeId)}</p>
              </div>
              <button type="button" onClick={close} aria-label={labels.cancel} className="rounded-full p-1.5 text-muted hover:bg-sunken">
                <X size={18} aria-hidden />
              </button>
            </div>
            <p className="text-sm tabular-nums" dir="ltr">
              {open.day} · {open.start}–{open.end}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <MapPin size={14} aria-hidden />
              {open.location}
            </p>
            {open.kind === "class" && open.capacity !== null && (
              <p className="mt-1 text-sm text-muted">{labels.booked.replace("{b}", String(open.booked)).replace("{c}", String(open.capacity))}</p>
            )}
            {open.note && <p className="mt-2 rounded-xl bg-sunken px-3 py-2 text-sm">{open.note}</p>}
            {open.kind === "class" && (
              <a href={`/schedule/${open.id}`} className="mt-4 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg hover:opacity-90">
                {labels.openClass}
              </a>
            )}
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
