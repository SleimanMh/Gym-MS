import type { Metadata } from "next";
import Script from "next/script";
import { notFound } from "next/navigation";
import { TENANT_SLUG_HEADER } from "@gym/shared";
import { API_URL } from "@/lib/api";
import { translator } from "@/lib/i18n";

interface PublicTenant {
  slug: string;
  name: string;
  defaultLanguage: "en" | "ar";
  branding: { primaryColor: string; logoUrl: string | null };
}

async function loadTenant(slug: string): Promise<PublicTenant | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const res = await fetch(`${API_URL}/v1/public/tenant`, { headers: { [TENANT_SLUG_HEADER]: slug }, cache: "no-store" });
  return res.ok ? ((await res.json()) as PublicTenant) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const tenant = await loadTenant((await params).slug);
  return { title: tenant ? tenant.name : "Gym" };
}

/**
 * Hosted booking page (PLAN.md section 10.2): a gym with no website — or one that doesn't want to
 * embed anything — links here. It is the same widget, on our domain, in the gym's branding.
 * Production serves it at <slug>.yourapp.com or a custom domain.
 */
export default async function HostedBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await loadTenant(slug);
  if (!tenant) notFound();
  const t = translator(tenant.defaultLanguage);
  const widgetUrl = process.env.NEXT_PUBLIC_WIDGET_URL ?? "http://localhost:5173/src/index.ts";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  return (
    <div
      dir={tenant.defaultLanguage === "ar" ? "rtl" : "ltr"}
      lang={tenant.defaultLanguage}
      className="min-h-screen bg-bg"
      style={{ ["--gym-primary" as string]: tenant.branding.primaryColor, ["--accent" as string]: tenant.branding.primaryColor }}
    >
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {tenant.branding.logoUrl ? (
            <img src={tenant.branding.logoUrl} alt="" className="size-9 rounded-md object-cover" />
          ) : (
            <div className="size-9 rounded-md bg-accent" aria-hidden />
          )}
          <h1 className="text-lg font-semibold">{tenant.name}</h1>
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <h2 className="text-2xl font-semibold">{t("hosted.title")}</h2>
        <gym-schedule tenant={tenant.slug} api={apiUrl} lang={tenant.defaultLanguage} />
        <gym-lead-form tenant={tenant.slug} api={apiUrl} lang={tenant.defaultLanguage} />
      </main>
      <Script src={widgetUrl} type="module" strategy="afterInteractive" />
    </div>
  );
}
