import { notFound } from "next/navigation";
import { CheckInPanel } from "@/components/checkin-panel";
import Link from "next/link";
import { Avatar, Card, PageHeader, SectionTitle } from "@/components/ui";
import { api, getMe } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { getLocationId } from "@/lib/location";
import { errorsAr, errorsEn } from "@/lib/messages-phase1";

/** Front-desk check-in screen (PLAN.md sections 6.2 and 12): works on a tablet, check in in 2 actions. */
export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ t, lang }, me, { q }] = await Promise.all([getT(), getMe(), searchParams]);
  if (!me?.permissions.includes("checkin.create")) notFound();
  const tz = me.tenant!.timezone;
  const [locations, todays, matches] = await Promise.all([
    api<{ id: string; name: string }[]>("/v1/locations"),
    api<{ id: string; checkedInAt: string; member: { id: string; firstName: string; lastName: string } }[]>("/v1/check-ins"),
    q ? api<{ id: string; firstName: string; lastName: string; phone: string | null }[]>(`/v1/members?take=8&q=${encodeURIComponent(q)}`) : [],
  ]);

  const preferred = await getLocationId(locations);

  return (
    <>
      <PageHeader title={t("ci.title")} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <CheckInPanel
          locations={preferred ? [...locations.filter((l) => l.id === preferred), ...locations.filter((l) => l.id !== preferred)] : locations}
          matches={matches}
          q={q ?? ""}
          tz={tz}
          lang={lang}
          errors={lang === "ar" ? errorsAr : errorsEn}
          labels={{
            scan: t("ci.scan"),
            checkIn: t("ci.checkIn"),
            ok: t("ci.result.ok"),
            warning: t("ci.result.warning"),
            denied: t("ci.result.denied"),
            force: t("ci.force"),
            forClass: t("ci.forClass"),
            ready: t("ci.ready"),
            location: t("common.location"),
            orSearch: t("ci.orSearch"),
            search: t("common.search"),
          }}
        />
        <Card className="h-fit p-0">
          <div className="px-5 pt-5">
            <SectionTitle
              action={<span className="rounded-full bg-accent px-3 py-0.5 text-lg font-semibold tabular-nums text-accent-fg">{todays.length}</span>}
            >
              {t("ci.today")}
            </SectionTitle>
          </div>
          {todays.length ? (
            <ul className="max-h-[70vh] overflow-y-auto pb-2 text-sm">
              {todays.map((c) => (
                <li key={c.id}>
                  <Link href={`/members/${c.member.id}`} className="transition-subtle flex items-center gap-3 px-5 py-2.5 hover:bg-sunken">
                    <Avatar first={c.member.firstName} last={c.member.lastName} size="sm" />
                    <span className="flex-1 truncate">
                      {c.member.firstName} {c.member.lastName}
                    </span>
                    <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted">{fmtTime(c.checkedInAt, tz, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted">{t("ci.none")}</p>
          )}
        </Card>
      </div>
    </>
  );
}
