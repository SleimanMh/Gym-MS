import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Card } from "@/components/ui";
import { ApiError, api, getMe } from "@/lib/api";
import { fmtDateTime, money } from "@/lib/format";
import { getT } from "@/lib/i18n";

interface Receipt {
  gym: { name: string };
  receiptNumber: number;
  paidAt: string;
  method: "cash" | "card_terminal" | "bank_transfer";
  amountMinor: string;
  currency: string;
  note: string | null;
  member: { firstName: string; lastName: string; email: string | null; phone: string | null };
  item: string | null;
}

/** Printable receipt. A PDF version arrives with invoices in Phase 2. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { t, lang }, me] = await Promise.all([params, getT(), getMe()]);
  let r: Receipt;
  try {
    r = await api<Receipt>(`/v1/payments/${id}/receipt`);
  } catch (e) {
    if (e instanceof ApiError && [400, 403, 404].includes(e.status)) notFound();
    throw e;
  }
  const rows: [string, string][] = [
    [t("common.date"), fmtDateTime(r.paidAt, me!.tenant!.timezone, lang)],
    [t("rcpt.paidBy"), `${r.member.firstName} ${r.member.lastName}`],
    [t("rcpt.item"), r.item ?? t("rcpt.payment")],
    [t("rcpt.method"), t(`pay.${r.method}`)],
  ];

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton label={t("common.print")} />
      </div>
      <Card className="p-8 print:border-0">
        <p className="text-lg font-semibold">{r.gym.name}</p>
        <p className="mb-6 text-sm text-muted">{t("rcpt.number", { n: String(r.receiptNumber) })}</p>
        <dl className="flex flex-col gap-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-muted">{k}</dt>
              <dd className="text-end">{v}</dd>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base">
            <dt className="font-semibold">{t("rcpt.amount")}</dt>
            <dd className="font-semibold tabular-nums">{money(r.amountMinor, r.currency, lang)}</dd>
          </div>
        </dl>
        {r.note && <p className="mt-4 text-sm text-muted">{r.note}</p>}
      </Card>
    </div>
  );
}
