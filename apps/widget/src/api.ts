/** Tiny client for the public API (/v1/public/*) and member self-service (/v1/me/*). */

export interface TenantInfo {
  slug: string;
  name: string;
  defaultLanguage: "en" | "ar";
  timezone: string;
  currency: string;
  bookingWindowDays: number;
  cancellationCutoffMin: number;
  branding: { primaryColor: string; logoUrl: string | null; poweredByVisible: boolean };
}

export interface PublicSession {
  id: string;
  startsAt: string;
  endsAt: string;
  className: string;
  color: string;
  description: string | null;
  location: { slug: string; name: string };
  trainer: string | null;
  capacity: number;
  spotsLeft: number;
}

export interface MyBookings {
  bookings: { id: string; session: { id: string; startsAt: string; classType: { name: string }; location: { name: string } } }[];
  waitlist: { id: string; session: { id: string; startsAt: string; classType: { name: string }; location: { name: string } } }[];
}

export interface MemberProfile {
  id: string;
  firstName: string;
  checkinCode: string;
  memberships: { id: string; name: string; status: "active" | "pending"; endsOn: string | null; creditsLeft: number | null }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const clients = new Map<string, GymApi>();

/** One client (and one member session) per gym per page, shared by every component. */
export function apiFor(base: string, ident: { key?: string | null; tenant?: string | null }): GymApi {
  const id = `${base}|${ident.key ?? ""}|${ident.tenant ?? ""}`;
  let c = clients.get(id);
  if (!c) clients.set(id, (c = new GymApi(base.replace(/\/$/, ""), ident)));
  return c;
}

export class GymApi extends EventTarget {
  private readonly storageKey: string;

  constructor(
    private readonly base: string,
    private readonly ident: { key?: string | null; tenant?: string | null },
  ) {
    super();
    this.storageKey = `gym-member:${ident.key ?? ident.tenant ?? "default"}`;
  }

  get token(): string | null {
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  set token(v: string | null) {
    try {
      if (v) localStorage.setItem(this.storageKey, v);
      else localStorage.removeItem(this.storageKey);
    } catch {
      /* private mode: session lasts until reload */
    }
    this.dispatchEvent(new Event("session"));
  }

  async request<T>(method: string, path: string, body?: unknown, auth = false): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.ident.key) headers["x-api-key"] = this.ident.key;
    else if (this.ident.tenant) headers["x-tenant-slug"] = this.ident.tenant;
    if (auth && this.token) headers.authorization = `Bearer ${this.token}`;

    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, "NETWORK");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && auth) this.token = null;
      throw new ApiError(res.status, (data as { code?: string }).code ?? `HTTP_${res.status}`);
    }
    return data as T;
  }

  tenant = () => this.request<TenantInfo>("GET", "/v1/public/tenant");
  sessions = (days: number, location?: string | null) =>
    this.request<PublicSession[]>("GET", `/v1/public/sessions?days=${days}${location ? `&location=${encodeURIComponent(location)}` : ""}`);
  lead = (body: Record<string, string | undefined>) => this.request<{ ok: true }>("POST", "/v1/public/leads", body);
  startLogin = (email: string) => this.request<{ sent: true }>("POST", "/v1/public/member-auth/start", { email });
  async verifyLogin(email: string, code: string) {
    const r = await this.request<{ accessToken: string; member: { firstName: string } }>(
      "POST",
      "/v1/public/member-auth/verify",
      { email, code },
    );
    this.token = r.accessToken;
    return r;
  }
  myBookings = () => this.request<MyBookings>("GET", "/v1/me/bookings", undefined, true);
  me = () => this.request<MemberProfile>("GET", "/v1/me/member", undefined, true);
  book = (sessionId: string, joinWaitlist: boolean) =>
    this.request<{ result: "booked" | "waitlisted"; position?: number }>("POST", "/v1/me/bookings", { sessionId, joinWaitlist }, true);
  cancel = (bookingId: string) =>
    this.request<{ status: string; late: boolean; creditReturned: boolean }>("DELETE", `/v1/me/bookings/${bookingId}`, undefined, true);
  leaveWaitlist = (id: string) => this.request("DELETE", `/v1/me/waitlist/${id}`, undefined, true);
  signOut = () => {
    this.token = null;
  };
}
