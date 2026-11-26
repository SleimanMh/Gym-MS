import { LitElement, css, html, nothing, type PropertyValues } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { renderSVG } from "uqr";
import { ApiError, apiFor, type GymApi, type MemberProfile, type MyBookings, type PublicSession, type TenantInfo } from "./api";
import { locale, t, type Lang } from "./i18n";
import { base } from "./styles";

type View = "schedule" | "signin" | "mine";

/**
 * <gym-schedule api-key="pk_…" | tenant="ironfit" [location="downtown"] [lang="ar"] [api="https://api…"]>
 *
 * Browse the week, sign in with an emailed code, book or join the waitlist, see and cancel
 * "My bookings". Everything a member needs to use the gym from its own website.
 */
export class GymSchedule extends LitElement {
  static properties = {
    apiKey: { type: String, attribute: "api-key" },
    tenant: { type: String },
    location: { type: String },
    api: { type: String },
    _info: { state: true },
    _sessions: { state: true },
    _day: { state: true },
    _view: { state: true },
    _notice: { state: true },
    _busy: { state: true },
    _signedIn: { state: true },
    _mine: { state: true },
    _profile: { state: true },
    _codeSent: { state: true },
    _loadFailed: { state: true },
  };

  declare apiKey: string | null;
  declare tenant: string | null;
  declare location: string | null;
  declare api: string;
  declare _info: TenantInfo | null;
  declare _sessions: PublicSession[] | null;
  declare _day: string;
  declare _view: View;
  declare _notice: { kind: "ok" | "err"; text: string } | null;
  declare _busy: boolean;
  declare _signedIn: boolean;
  declare _mine: MyBookings | null;
  declare _profile: MemberProfile | null;
  declare _codeSent: boolean;
  declare _loadFailed: boolean;

  private client!: GymApi;
  private pending: { session: PublicSession; waitlist: boolean } | null = null;
  private email = "";

  constructor() {
    super();
    this.apiKey = null;
    this.tenant = null;
    this.location = null;
    this.api = "http://localhost:4000";
    this._info = null;
    this._sessions = null;
    this._day = "";
    this._view = "schedule";
    this._notice = null;
    this._busy = false;
    this._signedIn = false;
    this._mine = null;
    this._profile = null;
    this._codeSent = false;
    this._loadFailed = false;
  }

  static styles = [
    base,
    css`
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .days {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 4px;
        margin-bottom: 12px;
      }
      .day {
        flex: 0 0 auto;
        min-width: 56px;
        display: flex;
        flex-direction: column;
        align-items: center;
        background: #fff;
        border: 1px solid #e2e8f0;
        color: #0f172a;
        padding: 6px 10px;
      }
      .day[aria-pressed="true"] {
        background: var(--p);
        border-color: var(--p);
        color: #fff;
      }
      .day small {
        font-size: 12px;
        opacity: 0.8;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        border-top: 1px solid #e2e8f0;
        padding: 12px 0;
      }
      li:first-child {
        border-top: 0;
      }
      .time {
        width: 64px;
        flex: 0 0 64px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
      }
      .time small {
        display: block;
        font-weight: 400;
        color: #64748b;
        font-size: 12px;
      }
      .dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-inline-end: 6px;
      }
      .spots {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #64748b;
        margin-top: 4px;
      }
      .meter {
        width: 72px;
        height: 4px;
        border-radius: 999px;
        background: #e3e7ec;
        overflow: hidden;
      }
      .meter span {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: var(--p);
      }
      .meter.full span {
        background: #a8550b;
      }
      .pass {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px;
        margin-bottom: 16px;
        border: 1px solid #e3e7ec;
        border-radius: var(--r);
        background: #f9fafb;
      }
      .pass .qr {
        width: 112px;
        height: 112px;
        flex: 0 0 auto;
        background: #fff;
        padding: 6px;
        border-radius: 6px;
      }
      .pass .qr svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .logo {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: var(--p);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        flex: 0 0 auto;
      }
      .low {
        color: #b45309;
      }
      @media (max-width: 420px) {
        .row.session {
          flex-wrap: wrap;
        }
        .row.session button {
          width: 100%;
        }
      }
    `,
  ];

  private get language(): Lang {
    // `lang` is the built-in HTMLElement attribute ("" when not set).
    const l = this.lang || this._info?.defaultLanguage || "en";
    return l === "ar" ? "ar" : "en";
  }

  private tr = (k: string, v?: Record<string, string | number>) => t(this.language, k, v);

  connectedCallback() {
    super.connectedCallback();
    this.client = apiFor(this.api, { key: this.apiKey, tenant: this.tenant });
    this._signedIn = !!this.client.token;
    this.client.addEventListener("session", this.onSession);
    void this.load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.client.removeEventListener("session", this.onSession);
  }

  private onSession = () => {
    this._signedIn = !!this.client.token;
    if (!this._signedIn) this._mine = null;
  };

  protected updated(changed: PropertyValues) {
    if (changed.has("_info") && this._info) {
      this.style.setProperty("--gym-brand", this._info.branding.primaryColor);
    }
  }

  /** Session ids the signed-in member is booked into, so those rows show "Booked". */
  private async refreshMine() {
    if (!this.client.token) {
      this._mine = null;
      return;
    }
    try {
      this._mine = await this.client.myBookings();
    } catch {
      this._mine = null;
    }
  }

  private async load() {
    this._loadFailed = false;
    try {
      this._info = await this.client.tenant();
      this._sessions = await this.client.sessions(Math.min(7, this._info.bookingWindowDays + 1), this.location);
      await this.refreshMine();
      if (!this._day) this._day = this.days()[0]?.date ?? "";
    } catch (e) {
      this._loadFailed = true;
      if (e instanceof ApiError && e.code === "ORIGIN_NOT_ALLOWED") this.fail(e);
    }
  }

  private localDate(iso: string | Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: this._info?.timezone }).format(new Date(iso));
  }

  private time(iso: string) {
    return new Intl.DateTimeFormat(locale(this.language), {
      timeZone: this._info?.timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  private longDate(iso: string) {
    return new Intl.DateTimeFormat(locale(this.language), {
      timeZone: this._info?.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(iso));
  }

  private days() {
    const out: { date: string; weekday: string; dayNum: string }[] = [];
    const count = Math.min(7, (this._info?.bookingWindowDays ?? 6) + 1);
    for (let i = 0; i < count; i++) {
      const d = new Date(Date.now() + i * 86_400_000);
      out.push({
        date: this.localDate(d),
        weekday: new Intl.DateTimeFormat(locale(this.language), { timeZone: this._info?.timezone, weekday: "short" }).format(d),
        dayNum: new Intl.DateTimeFormat(locale(this.language), { timeZone: this._info?.timezone, day: "numeric" }).format(d),
      });
    }
    return out;
  }

  private fail(e: unknown) {
    const code = e instanceof ApiError ? e.code : "generic";
    this._notice = { kind: "err", text: this.tr(code) };
  }

  private async onBook(session: PublicSession, waitlist: boolean) {
    this._notice = null;
    if (!this._signedIn) {
      this.pending = { session, waitlist };
      this._view = "signin";
      return;
    }
    this._busy = true;
    try {
      const r = await this.client.book(session.id, waitlist);
      this._notice = {
        kind: "ok",
        text: r.result === "booked" ? this.tr("booked") : this.tr("waitlisted", { n: r.position ?? 1 }),
      };
      this._sessions = await this.client.sessions(Math.min(7, (this._info?.bookingWindowDays ?? 6) + 1), this.location);
      await this.refreshMine();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        this.pending = { session, waitlist };
        this._view = "signin";
      } else this.fail(e);
    } finally {
      this._busy = false;
    }
  }

  private async onSendCode(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    this.email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    this._busy = true;
    this._notice = null;
    try {
      await this.client.startLogin(this.email);
      this._codeSent = true;
      this._notice = { kind: "ok", text: this.tr("codeSent") };
    } catch (err) {
      this.fail(err);
    } finally {
      this._busy = false;
    }
  }

  private async onVerify(e: Event) {
    e.preventDefault();
    const code = ((e.target as HTMLFormElement).elements.namedItem("code") as HTMLInputElement).value.trim();
    this._busy = true;
    this._notice = null;
    try {
      await this.client.verifyLogin(this.email, code);
      this._codeSent = false;
      this._view = "schedule";
      const p = this.pending;
      this.pending = null;
      if (p) await this.onBook(p.session, p.waitlist);
    } catch (err) {
      this.fail(err);
    } finally {
      this._busy = false;
    }
  }

  private async openMine() {
    this._notice = null;
    this._view = "mine";
    try {
      [this._mine, this._profile] = await Promise.all([this.client.myBookings(), this.client.me()]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) this._view = "signin";
      else this.fail(e);
    }
  }

  private async onCancel(id: string) {
    this._busy = true;
    try {
      const r = await this.client.cancel(id);
      this._notice = { kind: "ok", text: r.late && !r.creditReturned ? this.tr("lateCancel") : this.tr("cancelled") };
      this._mine = await this.client.myBookings();
      this._sessions = await this.client.sessions(Math.min(7, (this._info?.bookingWindowDays ?? 6) + 1), this.location);
    } catch (e) {
      this.fail(e);
    } finally {
      this._busy = false;
    }
  }

  private async onLeave(id: string) {
    this._busy = true;
    try {
      await this.client.leaveWaitlist(id);
      this._mine = await this.client.myBookings();
    } catch (e) {
      this.fail(e);
    } finally {
      this._busy = false;
    }
  }

  render() {
    const dir = this.language === "ar" ? "rtl" : "ltr";
    return html`<div class="card" dir=${dir} lang=${this.language}>
      <div class="head">
        <div class="row" style="gap:10px">
          ${this._info ? html`<span class="logo" aria-hidden="true">${[...this._info.name][0] ?? ""}</span>` : nothing}
          <h2>${this._info?.name ?? ""}</h2>
        </div>
        ${this._signedIn
          ? html`<div class="row">
              <button class="link" @click=${() => (this._view === "mine" ? (this._view = "schedule") : this.openMine())}>
                ${this._view === "mine" ? this.tr("back") : this.tr("myBookings")}
              </button>
              <button class="link" @click=${() => { this.client.signOut(); this._view = "schedule"; }}>${this.tr("signOut")}</button>
            </div>`
          : this._view === "schedule"
            ? html`<button class="link" @click=${() => (this._view = "signin")}>${this.tr("signIn")}</button>`
            : nothing}
      </div>
      ${this._notice ? html`<div class="notice ${this._notice.kind}" role="status">${this._notice.text}</div>` : nothing}
      ${this._view === "signin" ? this.renderSignIn() : this._view === "mine" ? this.renderMine() : this.renderSchedule()}
      ${this._info?.branding.poweredByVisible ? html`<div class="powered">${this.tr("poweredBy")}</div>` : nothing}
    </div>`;
  }

  private renderSchedule() {
    if (this._loadFailed && !this._sessions) {
      return html`<p class="muted">${this.tr("loadError")}</p>`;
    }
    if (!this._sessions) return html`<p class="muted">${this.tr("loading")}</p>`;
    const list = this._sessions.filter((s) => this.localDate(s.startsAt) === this._day);
    const bookedIds = new Set(this._mine?.bookings.map((b) => b.session.id) ?? []);
    const waitingIds = new Set(this._mine?.waitlist.map((w) => w.session.id) ?? []);
    return html`
      <div class="days" role="group">
        ${this.days().map(
          (d) => html`<button class="day" aria-pressed=${d.date === this._day} @click=${() => (this._day = d.date)}>
            <small>${d.weekday}</small><span>${d.dayNum}</span>
          </button>`,
        )}
      </div>
      ${list.length
        ? html`<ul>
            ${list.map((s) => {
              const full = s.spotsLeft === 0;
              const mine = bookedIds.has(s.id) || waitingIds.has(s.id);
              return html`<li>
                <div class="row session">
                  <div class="time">${this.time(s.startsAt)}<small>${this.time(s.endsAt)}</small></div>
                  <div class="grow">
                    <div><span class="dot" style="background:${s.color}"></span><strong>${s.className}</strong></div>
                    <div class="muted">${[s.trainer ? this.tr("with", { name: s.trainer }) : null, s.location.name].filter(Boolean).join(" · ")}</div>
                    <div class="spots ${s.spotsLeft > 0 && s.spotsLeft <= 3 ? "low" : ""}">
                      <span class="meter ${full ? "full" : ""}" aria-hidden="true"
                        ><span style="width:${Math.round(((s.capacity - s.spotsLeft) / s.capacity) * 100)}%"></span
                      ></span>
                      ${full ? this.tr("full") : s.spotsLeft === 1 ? this.tr("oneSpotLeft") : this.tr("spotsLeft", { n: s.spotsLeft })}
                    </div>
                  </div>
                  <button
                    class=${full || mine ? "secondary" : "primary"}
                    ?disabled=${this._busy || mine}
                    @click=${() => this.onBook(s, full)}
                    aria-label="${full ? this.tr("joinWaitlist") : this.tr("book")}: ${s.className} ${this.time(s.startsAt)}"
                  >
                    ${bookedIds.has(s.id)
                      ? this.tr("bookedShort")
                      : waitingIds.has(s.id)
                        ? this.tr("waitlist")
                        : full
                          ? this.tr("joinWaitlist")
                          : this.tr("book")}
                  </button>
                </div>
              </li>`;
            })}
          </ul>`
        : html`<p class="muted">${this.tr("noClasses")}</p>`}
    `;
  }

  private renderSignIn() {
    return html`
      <p style="font-weight:600;margin-bottom:4px">${this.tr("signInTitle")}</p>
      <p class="muted" style="margin-bottom:12px">${this.tr("signInHelp")}</p>
      ${this._codeSent
        ? html`<form @submit=${this.onVerify}>
            <div class="field">
              <label for="code">${this.tr("code")}</label>
              <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required dir="ltr" />
            </div>
            <button class="primary" ?disabled=${this._busy}>${this.tr("verify")}</button>
          </form>`
        : html`<form @submit=${this.onSendCode}>
            <div class="field">
              <label for="email">${this.tr("email")}</label>
              <input id="email" name="email" type="email" autocomplete="email" required dir="ltr" />
            </div>
            <button class="primary" ?disabled=${this._busy}>${this.tr("sendCode")}</button>
          </form>`}
      <p style="margin-top:12px">
        <button class="link" @click=${() => { this._view = "schedule"; this._codeSent = false; this.pending = null; this._notice = null; }}>
          ${this.tr("back")}
        </button>
      </p>
    `;
  }

  private renderMine() {
    if (!this._mine) return html`<p class="muted">${this.tr("loading")}</p>`;
    const { bookings, waitlist } = this._mine;
    const p = this._profile;
    const membership = p?.memberships[0];
    const dateFmt = (d: string) =>
      new Intl.DateTimeFormat(locale(this.language), { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(d));
    return html`
      ${p
        ? html`<div class="pass">
            <div class="qr" role="img" aria-label=${this.tr("checkinTitle")}>
              ${unsafeSVG(renderSVG(p.checkinCode, { border: 1, ecc: "M" }))}
            </div>
            <div class="grow">
              <p style="font-weight:600">${this.tr("checkinTitle")}</p>
              <p class="muted">${this.tr("checkinHelp")}</p>
              ${membership
                ? html`<p style="margin-top:8px;font-size:14px">
                    <strong>${membership.name}</strong>
                    <span class="muted">
                      · ${membership.status === "pending"
                        ? this.tr("awaitingPayment")
                        : membership.creditsLeft !== null
                          ? this.tr("creditsLeft", { n: membership.creditsLeft })
                          : membership.endsOn
                            ? this.tr("until", { d: dateFmt(membership.endsOn) })
                            : ""}
                    </span>
                  </p>`
                : nothing}
            </div>
          </div>`
        : nothing}
      ${bookings.length
        ? html`<ul>
            ${bookings.map(
              (b) => html`<li class="row">
                <div class="grow">
                  <strong>${b.session.classType.name}</strong>
                  <div class="muted">${this.longDate(b.session.startsAt)} · ${this.time(b.session.startsAt)} · ${b.session.location.name}</div>
                </div>
                <button class="secondary" ?disabled=${this._busy} @click=${() => this.onCancel(b.id)}>${this.tr("cancel")}</button>
              </li>`,
            )}
          </ul>`
        : html`<p class="muted">${this.tr("noBookings")}</p>`}
      ${waitlist.length
        ? html`<p style="font-weight:600;margin-top:16px">${this.tr("waitlist")}</p>
            <ul>
              ${waitlist.map(
                (w) => html`<li class="row">
                  <div class="grow">
                    <strong>${w.session.classType.name}</strong>
                    <div class="muted">${this.longDate(w.session.startsAt)} · ${this.time(w.session.startsAt)}</div>
                  </div>
                  <button class="secondary" ?disabled=${this._busy} @click=${() => this.onLeave(w.id)}>${this.tr("leave")}</button>
                </li>`,
              )}
            </ul>`
        : nothing}
    `;
  }
}
