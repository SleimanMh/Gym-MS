import Link from "next/link";
import { notFound } from "next/navigation";
import { formatHhMm } from "@gym/shared";
import { Button, Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { localDateIn } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { createClassType, createOneOff, createWeekly, stopWeekly } from "../actions";

interface ClassType {
  id: string;
  name: string;
  color: string;
  durationMin: number;
  defaultCapacity: number;
}
interface WeeklyRow {
  id: string;
  weekday: number;
  startMinute: number;
  durationMin: number;
  capacity: number;
  classType: { name: string; color: string };
  location: { name: string };
}

/** Class types and the weekly timetable that generates sessions a few weeks ahead. */
export default async function ScheduleSetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ t, lang, err }, me, sp] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("schedule.manage")) notFound();
  const [types, weekly, locations, trainers] = await Promise.all([
    api<ClassType[]>("/v1/class-types"),
    api<WeeklyRow[]>("/v1/schedules"),
    api<{ id: string; name: string }[]>("/v1/locations"),
    api<{ id: string; firstName: string; lastName: string }[]>("/v1/trainers"),
  ]);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", { weekday: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 10, 15 + i)), // 2026-11-15 is a Sunday
    ),
  );
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = [...weekly].sort(
    (a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday) || a.startMinute - b.startMinute,
  );
  const today = localDateIn(new Date(), me.tenant!.timezone);

  const classAndPlace = (
    <>
      <div>
        <Label htmlFor="classTypeId">{t("common.class")}</Label>
        <Select id="classTypeId" name="classTypeId" required>
          {types.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="locationId">{t("common.location")}</Label>
        <Select id="locationId" name="locationId" required>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="trainerUserId">{t("sched.trainer")}</Label>
        <Select id="trainerUserId" name="trainerUserId" defaultValue="">
          <option value="">{t("sched.noTrainer")}</option>
          {trainers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </Select>
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title={t("sched.setup")}
        action={
          <Link href="/schedule">
            <Button variant="secondary">{t("common.back")}</Button>
          </Link>
        }
      />
      {sp.error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
          {err(sp.error)}
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Card className="p-0">
            <h2 className="px-5 pt-5 pb-3 font-semibold">{t("sched.weekly")}</h2>
            {sorted.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {sorted.map((w) => (
                    <tr key={w.id}>
                      <td className="px-5 py-2.5">{weekdays[w.weekday]}</td>
                      <td className="px-2 py-2.5 tabular-nums" dir="ltr">
                        {formatHhMm(w.startMinute)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="me-2 inline-block size-2 rounded-full" style={{ background: w.classType.color }} aria-hidden />
                        {w.classType.name}
                      </td>
                      <td className="px-2 py-2.5 text-muted">{w.location.name}</td>
                      <td className="px-2 py-2.5 text-muted tabular-nums">{w.capacity}</td>
                      <td className="px-5 py-2.5 text-end">
                        <form action={stopWeekly}>
                          <input type="hidden" name="id" value={w.id} />
                          <Button variant="ghost" className="h-8 px-2.5 text-xs text-danger">
                            {t("sched.stop")}
                          </Button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">{t("sched.emptyWeekly")}</p>
            )}
          </Card>

          {types.length > 0 && (
            <Card>
              <h2 className="mb-4 font-semibold">{t("sched.addWeekly")}</h2>
              <form action={createWeekly} className="grid gap-3 sm:grid-cols-2">
                {classAndPlace}
                <div>
                  <Label htmlFor="weekday">{t("sched.weekday")}</Label>
                  <Select id="weekday" name="weekday" defaultValue="1">
                    {order.map((d) => (
                      <option key={d} value={d}>
                        {weekdays[d]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="startTime">{t("sched.start")}</Label>
                  <Input id="startTime" name="startTime" type="time" required defaultValue="18:00" />
                </div>
                <div>
                  <Label htmlFor="capacity">
                    {t("sched.capacity")} {t("common.optional")}
                  </Label>
                  <Input id="capacity" name="capacity" type="number" min={1} max={500} />
                </div>
                <div className="flex items-end">
                  <Button type="submit">{t("sched.addWeekly")}</Button>
                </div>
              </form>
            </Card>
          )}

          {types.length > 0 && (
            <Card>
              <h2 className="mb-4 font-semibold">{t("sched.addClass")}</h2>
              <form action={createOneOff} className="grid gap-3 sm:grid-cols-2">
                {classAndPlace}
                <div>
                  <Label htmlFor="date">{t("common.date")}</Label>
                  <Input id="date" name="date" type="date" required min={today} defaultValue={today} />
                </div>
                <div>
                  <Label htmlFor="oneoff-start">{t("sched.start")}</Label>
                  <Input id="oneoff-start" name="startTime" type="time" required defaultValue="10:00" />
                </div>
                <div className="flex items-end">
                  <Button type="submit">{t("sched.addClass")}</Button>
                </div>
              </form>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="mb-3 font-semibold">{t("sched.classTypes")}</h2>
          {types.length ? (
            <ul className="mb-5 divide-y divide-border text-sm">
              {types.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-2">
                  <span className="size-3 rounded-full" style={{ background: c.color }} aria-hidden />
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="text-muted tabular-nums">
                    {c.durationMin}′ · {c.defaultCapacity}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-5 text-sm text-muted">{t("sched.emptyTypes")}</p>
          )}
          <h3 className="mb-3 text-sm font-semibold">{t("sched.newClassType")}</h3>
          <form action={createClassType} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="ct-name">{t("common.name")}</Label>
              <Input id="ct-name" name="name" required minLength={2} maxLength={80} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="ct-duration">{t("sched.duration")}</Label>
                <Input id="ct-duration" name="durationMin" type="number" min={5} max={600} defaultValue={60} />
              </div>
              <div>
                <Label htmlFor="ct-capacity">{t("sched.capacity")}</Label>
                <Input id="ct-capacity" name="defaultCapacity" type="number" min={1} max={500} defaultValue={20} />
              </div>
              <div>
                <Label htmlFor="ct-color">{t("sched.color")}</Label>
                <Input id="ct-color" name="color" type="color" defaultValue="#2563EB" className="p-1" />
              </div>
            </div>
            <div>
              <Button type="submit">{t("common.add")}</Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
