/** Money helpers: integer minor units + ISO currency code (never floats in storage). */

export function minorDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function formatMoney(amountMinor: bigint | number | string, currency: string, lang: "en" | "ar" = "en"): string {
  const digits = minorDigits(currency);
  const value = Number(amountMinor) / 10 ** digits;
  return new Intl.NumberFormat(lang === "ar" ? "ar-LB" : "en-US", { style: "currency", currency }).format(value);
}

/** "49.90" → 4990n for USD. Throws on more decimals than the currency allows. */
export function parseMoney(input: string, currency: string): bigint {
  const digits = minorDigits(currency);
  const m = /^\s*(\d+)(?:[.,](\d+))?\s*$/.exec(input);
  if (!m) throw new Error("invalid amount");
  const frac = m[2] ?? "";
  if (frac.length > digits) throw new Error("too many decimals");
  return BigInt(m[1]!) * 10n ** BigInt(digits) + BigInt(frac.padEnd(digits, "0") || "0");
}
