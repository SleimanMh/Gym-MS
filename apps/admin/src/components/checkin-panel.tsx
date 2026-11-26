"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ScanLine } from "lucide-react";
import { checkIn, type CheckInState } from "@/app/(app)/checkin/actions";
import { Button, Card, Input } from "./ui";

interface Labels {
  scan: string;
  checkIn: string;
  ok: string;
  warning: string;
  denied: string;
  force: string;
  forClass: string;
  ready: string;
  location: string;
  orSearch: string;
  search: string;
}

/**
 * Front-desk check-in in 2 actions: scan (a USB/Bluetooth scanner types the code and presses
 * Enter) or tap a member from search. The field refocuses after every result.
 */
export function CheckInPanel({
  locations,
  labels,
  errors,
  matches,
  q,
  tz,
  lang,
}: {
  locations: { id: string; name: string }[];
  labels: Labels;
  errors: Record<string, string>;
  matches: { id: string; firstName: string; lastName: string; phone: string | null }[];
  q: string;
  tz: string;
  lang: "en" | "ar";
}) {
  const [state, action, pending] = useActionState<CheckInState | null, FormData>(checkIn, null);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("checkin.location");
      // A branch picked in the top bar wins (the page lists it first); otherwise reuse this desk's last choice.
      const topBarChoice = /(^|; )loc=[0-9a-f-]{36}/.test(document.cookie);
      if (!topBarChoice && saved && locations.some((l) => l.id === saved)) setLocationId(saved);
    } catch {
      /* storage blocked: keep the first location */
    }
  }, [locations]);
  const codeRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.reset();
    codeRef.current?.focus();
  }, [state?.at]);

  const saveLocation = (id: string) => {
    setLocationId(id);
    try {
      localStorage.setItem("checkin.location", id);
    } catch {
      /* ignore */
    }
  };

  const tone =
    state?.result === "ok"
      ? { cls: "bg-success-soft text-success", Icon: CheckCircle2, title: labels.ok }
      : state?.result === "warning"
        ? { cls: "bg-warning-soft text-warning", Icon: AlertTriangle, title: labels.warning }
        : { cls: "bg-danger-soft text-danger", Icon: XCircle, title: labels.denied };

  const time = (iso: string) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-6">
      {/* Dark scan card: the one thing the front desk does all day */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-ink p-6 text-white sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg">
            <ScanLine size={24} aria-hidden />
          </span>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <span>{labels.location}</span>
            <select
              id="ci-location"
              value={locationId}
              onChange={(e) => saveLocation(e.target.value)}
              className="h-9 rounded-full bg-white/10 px-3 text-sm font-medium text-white [&>option]:text-fg"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <form ref={formRef} action={action} className="flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="locationId" value={locationId} />
          <input
            ref={codeRef}
            name="code"
            autoFocus
            autoComplete="off"
            aria-label={labels.scan}
            placeholder={labels.scan}
            className="h-14 flex-1 rounded-full bg-white px-6 text-lg text-fg placeholder:text-faint"
          />
          <Button className="h-14 px-8 text-base" disabled={pending}>
            {labels.checkIn}
          </Button>
        </form>
        <p className="mt-4 text-sm text-white/55" aria-hidden={!!state}>
          {labels.ready}
        </p>
      </section>

      <div aria-live="polite">
        {state && (
          <Card className={state.result === "error" ? "bg-danger-soft text-danger" : tone.cls}>
            {state.result === "error" ? (
              <p className="text-lg font-semibold">{errors[state.error ?? "generic"] ?? errors.generic}</p>
            ) : (
              <div className="flex items-start gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface">
                  <tone.Icon size={30} aria-hidden />
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-sm font-medium">{state.checkedIn && state.result !== "ok" ? labels.warning : tone.title}</p>
                  <p className="text-2xl font-semibold text-fg">
                    {state.member?.firstName} {state.member?.lastName}
                  </p>
                  {state.booking && (
                    <p className="text-fg">
                      {labels.forClass.replace("{c}", state.booking.className).replace("{t}", time(state.booking.startsAt))}
                    </p>
                  )}
                  {state.alerts.length > 0 && (
                    <ul className="mt-1 list-inside list-disc text-sm">
                      {state.alerts.map((a) => (
                        <li key={a}>{errors[a] ?? a}</li>
                      ))}
                    </ul>
                  )}
                  {state.result === "denied" && !state.checkedIn && state.member && (
                    <form action={action} className="mt-3">
                      <input type="hidden" name="memberId" value={state.member.id} />
                      <input type="hidden" name="locationId" value={locationId} />
                      <input type="hidden" name="force" value="1" />
                      <Button variant="secondary">{labels.force}</Button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      <Card>
        <h2 className="mb-3 font-semibold">{labels.orSearch}</h2>
        <form className="mb-3 flex max-w-md gap-2" role="search">
          <Input name="q" defaultValue={q} aria-label={labels.orSearch} className="rounded-full px-4" />
          <Button variant="secondary">{labels.search}</Button>
        </form>
        <ul className="divide-y divide-border">
          {matches.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-deep" aria-hidden>
                {m.firstName[0]}
                {m.lastName[0]}
              </span>
              <span className="flex-1">
                {m.firstName} {m.lastName}{" "}
                <span className="text-muted" dir="ltr">
                  {m.phone}
                </span>
              </span>
              <form action={action}>
                <input type="hidden" name="memberId" value={m.id} />
                <input type="hidden" name="locationId" value={locationId} />
                <Button className="h-8 px-3 text-xs">{labels.checkIn}</Button>
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
