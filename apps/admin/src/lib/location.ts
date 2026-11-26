import { cookies } from "next/headers";

export const LOCATION_COOKIE = "loc";

/** The branch chosen in the top bar ("" = all branches). Only ids the user can see are honoured. */
export async function getLocationId(valid: { id: string }[]): Promise<string> {
  const v = (await cookies()).get(LOCATION_COOKIE)?.value ?? "";
  return valid.some((l) => l.id === v) ? v : "";
}
