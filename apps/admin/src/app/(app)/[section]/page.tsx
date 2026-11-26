import { notFound } from "next/navigation";
import { ComingSoon, LockedFeature } from "@/components/blocks";
import { PageHeader } from "@/components/ui";
import { getMe } from "@/lib/api";
import { getT } from "@/lib/i18n";
import { NAV } from "@/lib/nav";

/** Placeholder for modules built in later phases. Shows the upgrade card when the plan lacks the feature. */
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = NAV.find((n) => n.href === `/${section}` && n.phase);
  if (!item) notFound();

  const [{ t }, me] = await Promise.all([getT(), getMe()]);
  if (!me?.permissions.includes(item.permission)) notFound();
  const locked = item.feature && !me.entitlements?.features.includes(item.feature);

  return (
    <>
      <PageHeader title={t(item.label)} />
      {locked ? <LockedFeature feature={item.feature!} t={t} /> : <ComingSoon phase={item.phase!} t={t} />}
    </>
  );
}
