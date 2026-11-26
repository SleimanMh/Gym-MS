import { minorDigits } from "@gym/shared";
import { Input, Label, Select } from "@/components/ui";
import type { T } from "@/lib/i18n";
import type { PayType } from "@/lib/staff";

/** Pay type, rate, commission and home location — shared by "new" and "edit". */
export function PayFields({
  t,
  currency,
  locations,
  value,
}: {
  t: T;
  currency: string;
  locations: { id: string; name: string }[];
  value?: { payType: PayType; payRateMinor: string | null; commissionBp: number; homeLocationId: string | null };
}) {
  const digits = minorDigits(currency);
  const rate = value?.payRateMinor ? (Number(value.payRateMinor) / 10 ** digits).toFixed(digits) : "";
  return (
    <>
      <input type="hidden" name="currency" value={currency} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="payType">{t("st.f.payType")}</Label>
          <Select id="payType" name="payType" defaultValue={value?.payType ?? "hourly"} required>
            <option value="salary">{t("st.pay.salary")}</option>
            <option value="hourly">{t("st.pay.hourly")}</option>
            <option value="per_class">{t("st.pay.per_class")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="rate">
            {t("st.f.rate")} <span className="text-faint">({currency})</span>
          </Label>
          <Input id="rate" name="rate" inputMode="decimal" dir="ltr" defaultValue={rate} required placeholder="0.00" aria-describedby="rate-help" />
        </div>
      </div>
      <p id="rate-help" className="-mt-2 text-xs text-faint">
        {t("st.f.rateHelp")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="commission">{t("st.f.commission")}</Label>
          <Input id="commission" name="commission" type="number" min={0} max={100} step={0.5} dir="ltr" defaultValue={value ? value.commissionBp / 100 : 0} />
        </div>
        <div>
          <Label htmlFor="homeLocationId">{t("st.f.home")}</Label>
          <Select id="homeLocationId" name="homeLocationId" defaultValue={value?.homeLocationId ?? locations[0]?.id ?? ""}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </>
  );
}
