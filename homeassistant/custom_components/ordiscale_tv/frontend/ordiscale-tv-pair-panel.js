// Approval page for Ordiscale TV pairing (Home Assistant custom panel).
// Reached through the QR code on the TV: /ordiscale-tv-pair/<pairing_id>.
// Home Assistant shows its login first, so only signed-in users get here; the
// WebSocket commands additionally require an admin. No external resources.

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

const TEXT = {
  de: {
    title: "Fernseher koppeln",
    home: "Zur Startseite",
    loading: "Kopplung wird geladen …",
    wants: (name) =>
      name
        ? `Der Fernseher „${name}“ möchte sich mit Home Assistant verbinden.`
        : "Ein Fernseher möchte sich mit Home Assistant verbinden.",
    codeLabel: "Code vom Fernseher",
    codeHelp: "Sechs Zeichen, wie auf dem Fernseher angezeigt. Groß- und Kleinschreibung egal.",
    confusable: "0, O, 1 und I kommen im Code nicht vor. Bitte genau auf den Fernseher schauen.",
    expiresIn: (t) => `Läuft ab in ${t}`,
    approve: "Freigeben",
    deny: "Ablehnen",
    approved: "Freigegeben. Der Fernseher meldet sich in wenigen Sekunden an.",
    denied: "Abgelehnt. Der Fernseher erhält keinen Zugang.",
    expired: "Diese Kopplung ist abgelaufen. Bitte am Fernseher neu starten.",
    notAdmin: "Nur Administratoren können Fernseher freigeben. Bitte mit einem Administrator-Konto anmelden.",
    noId: "Kein Kopplungscode in der Adresse. Bitte den QR-Code am Fernseher erneut scannen.",
    attemptsLeft: (n) => `Noch ${n} ${n === 1 ? "Versuch" : "Versuche"}.`,
    errors: {
      pairing_disabled: "Die Kopplung ist in Home Assistant ausgeschaltet (Integration Ordiscale TV, Optionen).",
      not_found: "Diese Kopplung ist abgelaufen oder unbekannt. Bitte am Fernseher neu starten.",
      not_pending: "Diese Kopplung wurde bereits bearbeitet.",
      denied: "Zu viele falsche Versuche. Die Kopplung ist gesperrt. Bitte am Fernseher neu starten.",
      invalid_code: "Der Code stimmt nicht.",
      invalid_format: "Der Code hat 6 Zeichen: Ziffern 2–9 und Buchstaben ohne I und O.",
      user_unavailable: "Der TV-Benutzer fehlt, ist deaktiviert oder ist Administrator. Bitte die Integration prüfen.",
      unauthorized: "Nur Administratoren können Fernseher freigeben.",
      unknown: "Unerwarteter Fehler. Bitte erneut versuchen.",
    },
  },
  en: {
    title: "Pair TV",
    home: "Back to overview",
    loading: "Loading pairing …",
    wants: (name) =>
      name
        ? `The TV “${name}” wants to connect to Home Assistant.`
        : "A TV wants to connect to Home Assistant.",
    codeLabel: "Code from the TV",
    codeHelp: "Six characters as shown on the TV. Case does not matter.",
    confusable: "0, O, 1 and I never appear in the code. Please check the TV.",
    expiresIn: (t) => `Expires in ${t}`,
    approve: "Approve",
    deny: "Deny",
    approved: "Approved. The TV will sign in within a few seconds.",
    denied: "Denied. The TV does not get access.",
    expired: "This pairing has expired. Please restart it on the TV.",
    notAdmin: "Only administrators can approve TVs. Please sign in with an administrator account.",
    noId: "No pairing id in the address. Please scan the QR code on the TV again.",
    attemptsLeft: (n) => `${n} ${n === 1 ? "attempt" : "attempts"} left.`,
    errors: {
      pairing_disabled: "Pairing is switched off in Home Assistant (Ordiscale TV integration, options).",
      not_found: "This pairing has expired or is unknown. Please restart it on the TV.",
      not_pending: "This pairing has already been handled.",
      denied: "Too many wrong attempts. The pairing is blocked. Please restart it on the TV.",
      invalid_code: "Wrong code.",
      invalid_format: "The code has 6 characters: digits 2–9 and letters without I and O.",
      user_unavailable: "The TV user is missing, deactivated or an administrator. Please check the integration.",
      unauthorized: "Only administrators can approve TVs.",
      unknown: "Unexpected error. Please try again.",
    },
  },
};

const STYLE = `
  :host { display: block; min-height: 100%; background: var(--primary-background-color, #fafafa);
    color: var(--primary-text-color, #212121); font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  header { display: flex; align-items: center; justify-content: space-between; height: 56px; padding: 0 16px;
    background: var(--app-header-background-color, var(--primary-color, #03a9f4));
    color: var(--app-header-text-color, #fff); font-size: 20px; }
  header a { color: inherit; font-size: 14px; text-decoration: underline; }
  main { max-width: 480px; margin: 24px auto; padding: 0 16px; }
  .card { background: var(--card-background-color, #fff); border-radius: var(--ha-card-border-radius, 12px);
    box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,.2)); padding: 24px; }
  .tv { display: flex; justify-content: center; margin-bottom: 12px; color: var(--primary-color, #03a9f4); }
  .tv svg { width: 56px; height: 56px; }
  p { line-height: 1.5; margin: 0 0 16px; }
  .lead { font-size: 18px; text-align: center; }
  .muted { color: var(--secondary-text-color, #727272); font-size: 14px; }
  label { display: block; font-weight: 500; margin-bottom: 8px; }
  input { box-sizing: border-box; width: 100%; padding: 12px; font-size: 32px; letter-spacing: .3em;
    text-align: center; text-transform: uppercase; font-family: ui-monospace, Menlo, Consolas, monospace;
    border: 2px solid var(--divider-color, #ccc); border-radius: 8px; color: inherit;
    background: var(--secondary-background-color, #fff); }
  input:focus { outline: none; border-color: var(--primary-color, #03a9f4); }
  .buttons { display: flex; gap: 12px; margin-top: 20px; }
  button { flex: 1; min-height: 48px; font-size: 16px; font-weight: 500; border-radius: 8px; cursor: pointer;
    border: 2px solid var(--primary-color, #03a9f4); }
  button.primary { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
  button.secondary { background: transparent; color: var(--primary-color, #03a9f4); }
  button:disabled { opacity: .5; cursor: default; }
  .msg { margin-top: 16px; padding: 12px; border-radius: 8px; }
  .msg.error { background: rgba(219, 68, 55, .12); color: var(--error-color, #db4437); }
  .msg.ok { background: rgba(67, 160, 71, .12); color: var(--success-color, #43a047); }
`;

// Simple TV outline (own drawing).
const TV_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

class OrdiscaleTvPairPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._started = false;
    this._timer = null;
    this._busy = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._started) {
      this._started = true;
      this._init();
    }
  }

  get hass() {
    return this._hass;
  }

  // The frontend hands route changes to the same panel instance: another pairing id starts afresh,
  // so a code is never checked against the pairing that was open before.
  set route(route) {
    this._route = route;
    if (this._started && this._hass && this._pairingId() !== this._id) {
      clearInterval(this._timer);
      this._busy = false;
      this._init();
    }
  }

  get route() {
    return this._route;
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  get _t() {
    const lang = (this._hass && this._hass.language) || navigator.language || "en";
    return lang.toLowerCase().startsWith("de") ? TEXT.de : TEXT.en;
  }

  _pairingId() {
    const route = this.route && this.route.path ? this.route.path : "";
    const fromRoute = route.split("/").filter(Boolean)[0];
    if (fromRoute) return fromRoute;
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length > 1 ? parts[1] : "";
  }

  async _init() {
    const t = this._t;
    this._id = this._pairingId();
    this._renderFrame();
    if (!this._id) return this._final(t.noId, "error");
    if (!this._hass.user || !this._hass.user.is_admin) return this._final(t.notAdmin, "error");
    this._body.innerHTML = `<p class="muted">${t.loading}</p>`;
    try {
      const info = await this._hass.callWS({ type: "ordiscale_tv/info", pairing_id: this._id });
      if (info.status === "approved") return this._final(t.approved, "ok");
      if (info.status === "denied") return this._final(t.errors.denied, "error");
      this._renderForm(info);
    } catch (err) {
      this._final(this._errorText(err), "error");
    }
  }

  _renderFrame() {
    const t = this._t;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <header><span></span><a href="/"></a></header>
      <main><div class="card"><div class="tv">${TV_ICON}</div><div id="body"></div></div></main>`;
    this.shadowRoot.querySelector("header span").textContent = t.title;
    this.shadowRoot.querySelector("header a").textContent = t.home;
    this._body = this.shadowRoot.getElementById("body");
  }

  _renderForm(info) {
    const t = this._t;
    this._body.innerHTML = `
      <p class="lead"></p>
      <label for="code"></label>
      <input id="code" autocomplete="off" autocorrect="off" autocapitalize="characters"
        spellcheck="false" inputmode="text" maxlength="12" aria-describedby="help">
      <p id="help" class="muted" style="margin-top:8px"></p>
      <p id="countdown" class="muted"></p>
      <div class="buttons">
        <button class="secondary" id="deny"></button>
        <button class="primary" id="approve" disabled></button>
      </div>
      <div id="msg" role="status"></div>`;
    const $ = (id) => this._body.querySelector(id);
    $(".lead").textContent = t.wants(info.name);
    $("label").textContent = t.codeLabel;
    $("#help").textContent = t.codeHelp;
    $("#deny").textContent = t.deny;
    $("#approve").textContent = t.approve;

    const input = $("#code");
    input.addEventListener("input", () => this._onInput());
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !$("#approve").disabled) this._approve();
    });
    $("#approve").addEventListener("click", () => this._approve());
    $("#deny").addEventListener("click", () => this._deny());
    input.focus();

    this._deadline = Date.now() + info.expires_in * 1000;
    this._tick();
    this._timer = setInterval(() => this._tick(), 1000);
  }

  _tick() {
    const left = Math.max(0, Math.round((this._deadline - Date.now()) / 1000));
    const el = this._body.querySelector("#countdown");
    if (!el) return;
    if (left === 0) {
      clearInterval(this._timer);
      return this._final(this._t.expired, "error");
    }
    const m = Math.floor(left / 60);
    const s = String(left % 60).padStart(2, "0");
    el.textContent = this._t.expiresIn(`${m}:${s}`);
  }

  // Uppercase, drop spaces/hyphens; flag characters that never occur.
  _normalized() {
    const raw = this._body.querySelector("#code").value;
    return raw.toUpperCase().replace(/[\s-]/g, "");
  }

  _onInput() {
    const code = this._normalized();
    const bad = /[01OI]/.test(code);
    const valid =
      code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch));
    this._body.querySelector("#approve").disabled = !valid || this._busy;
    this._message(bad ? this._t.confusable : "", "error");
  }

  async _approve() {
    if (this._busy) return;
    this._setBusy(true);
    try {
      await this._hass.callWS({
        type: "ordiscale_tv/approve",
        pairing_id: this._id,
        code: this._normalized(),
      });
      this._final(this._t.approved, "ok");
    } catch (err) {
      const code = err && err.code;
      if (code === "invalid_code" || code === "invalid_format") {
        const left = err.translation_placeholders && err.translation_placeholders.attempts_left;
        const text = this._errorText(err) + (left ? " " + this._t.attemptsLeft(Number(left)) : "");
        const input = this._body.querySelector("#code");
        input.value = "";
        input.focus();
        this._setBusy(false);
        this._onInput();
        this._message(text, "error");
      } else {
        this._final(this._errorText(err), "error");
      }
    }
  }

  async _deny() {
    if (this._busy) return;
    this._setBusy(true);
    try {
      await this._hass.callWS({ type: "ordiscale_tv/deny", pairing_id: this._id });
      this._final(this._t.denied, "ok");
    } catch (err) {
      this._final(this._errorText(err), "error");
    }
  }

  _setBusy(busy) {
    this._busy = busy;
    this._body.querySelectorAll("button").forEach((b) => (b.disabled = busy));
  }

  _errorText(err) {
    const errors = this._t.errors;
    return (err && errors[err.code]) || errors.unknown;
  }

  _message(text, kind) {
    const el = this._body.querySelector("#msg");
    if (!el) return;
    el.className = text ? `msg ${kind}` : "";
    el.textContent = text;
  }

  _final(text, kind) {
    clearInterval(this._timer);
    this._body.innerHTML = '<div id="msg" role="status"></div><p style="margin-top:16px"><a href="/"></a></p>';
    this._body.querySelector("a").textContent = this._t.home;
    this._message(text, kind);
  }
}

if (!customElements.get("ordiscale-tv-pair-panel")) {
  customElements.define("ordiscale-tv-pair-panel", OrdiscaleTvPairPanel);
}
