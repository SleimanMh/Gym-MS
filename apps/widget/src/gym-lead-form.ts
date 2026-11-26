import { LitElement, html, nothing } from "lit";
import { ApiError, apiFor, type GymApi } from "./api";
import { t, type Lang } from "./i18n";
import { base } from "./styles";

/** <gym-lead-form api-key="pk_…" | tenant="ironfit" [lang="ar"]> — free-trial / contact form → CRM lead. */
export class GymLeadForm extends LitElement {
  static properties = {
    apiKey: { type: String, attribute: "api-key" },
    tenant: { type: String },
    api: { type: String },
    _state: { state: true },
    _error: { state: true },
    _lang: { state: true },
  };

  declare apiKey: string | null;
  declare tenant: string | null;
  declare api: string;
  declare _state: "idle" | "sending" | "done";
  declare _error: string | null;
  declare _lang: Lang;

  private client!: GymApi;

  static styles = [base];

  constructor() {
    super();
    this.apiKey = null;
    this.tenant = null;
    this.api = "http://localhost:4000";
    this._state = "idle";
    this._error = null;
    this._lang = "en";
  }

  connectedCallback() {
    super.connectedCallback();
    this.client = apiFor(this.api, { key: this.apiKey, tenant: this.tenant });
    this._lang = this.lang === "ar" ? "ar" : "en";
    if (!this.lang) {
      this.client
        .tenant()
        .then((info) => {
          this._lang = info.defaultLanguage;
          this.style.setProperty("--gym-brand", info.branding.primaryColor);
        })
        .catch(() => undefined);
    }
  }

  private async onSubmit(e: Event) {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    const v = (k: string) => (String(f.get(k) ?? "").trim() || undefined);
    if (!v("email") && !v("phone")) {
      this._error = t(this._lang, "needContact");
      return;
    }
    this._state = "sending";
    this._error = null;
    try {
      await this.client.lead({
        firstName: v("firstName"),
        lastName: v("lastName"),
        email: v("email"),
        phone: v("phone"),
        message: v("message"),
        website: String(f.get("website") ?? ""),
      });
      this._state = "done";
    } catch (err) {
      this._state = "idle";
      this._error = t(this._lang, err instanceof ApiError ? err.code : "generic");
    }
  }

  render() {
    const tr = (k: string) => t(this._lang, k);
    const dir = this._lang === "ar" ? "rtl" : "ltr";
    if (this._state === "done") {
      return html`<div class="card" dir=${dir}><div class="notice ok" role="status">${tr("leadThanks")}</div></div>`;
    }
    return html`<form class="card" dir=${dir} lang=${this._lang} @submit=${this.onSubmit}>
      <h2 style="margin-bottom:4px">${tr("leadTitle")}</h2>
      <p class="muted" style="margin-bottom:16px">${tr("leadHelp")}</p>
      ${this._error ? html`<div class="notice err" role="alert">${this._error}</div>` : nothing}
      <div class="row" style="align-items:flex-start">
        <div class="field grow"><label for="fn">${tr("firstName")}</label><input id="fn" name="firstName" required autocomplete="given-name" /></div>
        <div class="field grow"><label for="ln">${tr("lastName")}</label><input id="ln" name="lastName" autocomplete="family-name" /></div>
      </div>
      <div class="field"><label for="em">${tr("email")}</label><input id="em" name="email" type="email" autocomplete="email" dir="ltr" /></div>
      <div class="field"><label for="ph">${tr("phone")}</label><input id="ph" name="phone" type="tel" autocomplete="tel" dir="ltr" /></div>
      <div class="field"><label for="msg">${tr("message")}</label><textarea id="msg" name="message" rows="3"></textarea></div>
      <!-- Honeypot: hidden from people, filled in by naive bots. -->
      <div class="sr-only" aria-hidden="true"><label for="website">Website</label><input id="website" name="website" tabindex="-1" autocomplete="off" /></div>
      <button class="primary" ?disabled=${this._state === "sending"}>${tr("send")}</button>
    </form>`;
  }
}
