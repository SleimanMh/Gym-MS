import { redirect } from "next/navigation";

/** The rota became the team schedule (calendar). Old links keep working. */
export default async function RotaRedirect({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  redirect(`/staff/schedule${week ? `?week=${encodeURIComponent(week)}` : ""}`);
}
