// INFINITIX panel: the custom element Home Assistant mounts.
// Data and actions are real: states come from `hass.states`, control goes through
// `hass.callService` (so HA authorizes every call for the logged-in user), and
// configuration lives behind the server-side WebSocket API (admin-protected).

import { CSS } from "./styles.js";
import { makeT, LANGUAGES, RTL_LANGS } from "./i18n.js";
import { esc, clamp, clone, formatClock, formatDate, greetingKey, domainOf, renumber } from "./util.js";
import { cardHTML, icon, translateState } from "./cards.js";
import { dashboardHTML, categoryHTML, sideSystemsHTML, systemStatus, systemItems } from "./systems.js";
import { homeHTML, roomHTML, roomTempText, weatherHTML } from "./dashboard.js";
import { UNASSIGNED, entitiesOfRoom, visibleRooms, visibleEntities, roomName, GROUP_OF_CARD } from "./logic.js";

const LOGO = new URL("../brand/infinitix-logo.png", import.meta.url).href;
const LOGO_DARK = new URL("../brand/infinitix-logo-dark.png", import.meta.url).href;
import { CARD_TYPES_UI, ROOM_ICONS } from "./constants.js";
import { startWizard, renderWizard, wizardAct, wizardField, wizardWorkChanged } from "./wizard.js";
import { renderScenariosPage, scenariosAct, resetScenarios } from "./scenarios.js";
import { renderPairingPage, pairingAct } from "./pairing.js";
import { renderMediaPage, mediaAct } from "./media.js";
import { renderShoppingPage, shoppingAct, openShopping } from "./shopping.js";
import { renderCamerasPage, camerasAct, cameraField, resetCameras } from "./cameras.js";
import { resolveLayout, readDeviceLayout, writeDeviceLayout, reorder, applyOrder } from "./layout.js";
import { saverEnabled, showSaver, hideSaver, renderSaver, openForecast } from "./saver.js";
import { renderPageView, pagesAct, visiblePages } from "./pages.js";
import { renderStatusPage, hebrewDate } from "./scenarios.js";
import { renderSettings, renderManage, settingsAct, settingsField, openSettings, openManage, refreshSuggestions } from "./settings.js";

export class InfinitixPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null; this._cfg = null; this._inv = { areas: [], entities: [] }; this._invMap = new Map();
    this._view = { name: "home" }; this._edit = false; this._isAdmin = false; this._loading = true; this._error = null;
    this._narrow = false; this._navShown = false; this._lazy = []; this._token = 0; this._modal = null;
    this._wiz = null; this._manage = null; this._import = null; this._suggest = null; this._newSet = new Set();
    this._drag = null; this._viewKey = ""; this._lang = "he"; this.t = makeT("he");

    const style = document.createElement("style");
    style.textContent = CSS;
    this._app = document.createElement("div");
    this._app.className = "app";
    this._overlay = document.createElement("div");
    this._toastEl = document.createElement("div");
    this._toastEl.setAttribute("aria-live", "polite");
    this._saverEl = document.createElement("div");
    this.shadowRoot.append(style, this._app, this._overlay, this._toastEl, this._saverEl);
    this._lastActive = Date.now();
    const wake = () => { this._lastActive = Date.now(); };
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) this.addEventListener(ev, wake, { passive: true, capture: true });
    // The tap that wakes the screen only dismisses the saver; it never reaches a card.
    this._saverEl.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); hideSaver(this); });
    this._saverEl.addEventListener("keydown", (e) => { e.preventDefault(); hideSaver(this); });
    // Edit mode: touch/mouse drag by the card handle (buttons/keyboard remain the accessible way).
    this._app.addEventListener("pointerdown", (e) => this._dndStart(e));
    this._app.addEventListener("pointermove", (e) => this._dndMove(e));
    this._app.addEventListener("pointerup", (e) => this._dndEnd(e));
    this._app.addEventListener("pointercancel", () => this._dndCancel());
    this._app.addEventListener("click", (e) => this._onClick(e));
    // Stage layout: swipe between rooms (direction follows the reading direction).
    this._app.addEventListener("touchstart", (e) => { this._tx = e.touches[0].clientX; this._ty = e.touches[0].clientY; }, { passive: true });
    this._app.addEventListener("touchend", (e) => {
      if (this._layout() !== "stage" || this._tx == null || this._modal) return;
      const dx = e.changedTouches[0].clientX - this._tx, dy = e.changedTouches[0].clientY - this._ty;
      this._tx = null;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5 || e.target.closest("input,select,[data-act='slider']")) return;
      if (!["home", "room"].includes(this._view.name)) return;
      this._stageGo((this.dir === "rtl" ? dx > 0 : dx < 0) ? 1 : -1);
    }, { passive: true });
    this._app.addEventListener("change", (e) => this._onChange(e));
    this._app.addEventListener("input", (e) => this._onInput(e));
    this._overlay.addEventListener("click", (e) => this._onOverlay(e));
    this.shadowRoot.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._modal) this.closeModal();
      else if (e.key === "Enter" && !e.shiftKey && e.target?.id === "sh-in") { e.preventDefault(); this._app.querySelector('[data-act="sh-add"]')?.click(); }
    });
  }

  // ------------------------------------------------------------ HA properties
  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first) this._init();
    else this._onHass();
  }
  get hass() { return this._hass; }
  set narrow(v) { const c = this._narrow !== !!v; this._narrow = !!v; if (c && !this._loading) this.render(); }
  set panel(p) { this._panelCfg = p; }
  set route(r) { this._route = r; }

  connectedCallback() {
    this._langAttrs(); // attributes must not be set in the constructor (custom element rules)
    this._clock = setInterval(() => this._tick(), 20000);
    this._lastActive = Date.now();
    this._camTimer = setInterval(() => this._refreshCameras(), 10000);
  }
  disconnectedCallback() {
    clearInterval(this._clock); clearInterval(this._camTimer); hideSaver(this);
    try { this._unsubRegistry?.(); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------ small API for modules
  get lang() { return this._lang; }
  get dir() { return RTL_LANGS.includes(this._lang) ? "rtl" : "ltr"; }
  setLang(l) {
    this._lang = LANGUAGES.some(([k]) => k === l) ? l : "he";
    this.t = makeT(this._lang);
    if (this.isConnected) this._langAttrs();
  }
  _langAttrs() {
    this.setAttribute("dir", this.dir);
    this.setAttribute("lang", this._lang);
  }
  callWS(msg) { return this._hass.callWS(msg); }
  workCfg() { return this._wiz?.work ?? this._manage?.draft; }
  workChanged() { if (this._wiz) wizardWorkChanged(this); }
  effectiveCfg() { return this._wiz?.work ?? this._cfg; }
  _viewCfg() { return this._view.name === "wizard" ? this._previewCfg : this._cfg; }
  _rebuildInvMap() { this._invMap = new Map(this._inv.entities.map((e) => [e.entity_id, e])); }

  applyTheme() {
    const c = this.effectiveCfg();
    if (!c) return;
    let dark;
    if (c.theme.mode === "dark") dark = true;
    else if (c.theme.mode === "light") dark = false;
    else dark = typeof this._hass?.themes?.darkMode === "boolean" ? this._hass.themes.darkMode : !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    this.classList.toggle("dark", dark);
    if (c.theme.accent) this.style.setProperty("--ix-accent", c.theme.accent); else this.style.removeProperty("--ix-accent");
  }

  toast(text, err = false) {
    clearTimeout(this._tt);
    this._toastEl.innerHTML = `<div class="toast ${err ? "err" : ""}" role="status">${esc(text)}</div>`;
    this._tt = setTimeout(() => { this._toastEl.innerHTML = ""; }, 3500);
  }

  openModal(m) { this._modal = m; this._renderModal(); this._overlay.querySelector("input,select,.btn")?.focus(); }
  closeModal() { this._modalCleanup?.(); this._modalCleanup = null; this._modal = null; this._renderModal(); }
  _renderModal() {
    const m = this._modal;
    if (!m) { this._overlay.innerHTML = ""; return; }
    this._overlay.innerHTML = `<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(m.title)}"><h3>${esc(m.title)}</h3>${m.body || ""}
      <div class="row">${m.actions.map((a) => `<button class="btn ${a.cls || ""}" data-ma="${esc(a.id)}">${esc(a.label)}</button>`).join("")}</div></div></div>`;
  }
  async _onOverlay(e) {
    const b = e.target.closest("[data-ma]");
    if (!b || !this._modal) return;
    const form = {};
    this._overlay.querySelectorAll("[data-mf]").forEach((x) => { form[x.dataset.mf] = x.type === "checkbox" || x.type === "radio" ? x.checked : x.value; });
    const m = this._modal;
    const keep = await m.onAction?.(b.dataset.ma, form);
    if (keep !== false && this._modal === m) this.closeModal();
  }
  /** Promise-based confirmation (optionally asking for a code). */
  _confirm(title, { code = false, danger = true } = {}) {
    return new Promise((resolve) => {
      this.openModal({
        title,
        body: code ? `<div class="field"><label class="label">${esc(this.t("code"))}</label><input class="input" data-mf="code" type="password" autocomplete="off" inputmode="numeric"></div>` : "",
        actions: [{ id: "no", label: this.t("cancel") }, { id: "yes", label: this.t("confirm"), cls: danger ? "danger" : "primary" }],
        onAction: (id, form) => { resolve({ ok: id === "yes", code: form.code || undefined }); return true; },
      });
    });
  }

  // ------------------------------------------------------------ loading
  async _init() {
    this.render();
    try {
      const r = await this.callWS({ type: "infinitix/get_config" });
      this._cfg = r.config; this._isAdmin = r.is_admin; this._options = r.options; this._features = r.features;
      this._devLayout = readDeviceLayout(globalThis.localStorage, this._hass.user?.id || "");
      this.setLang(this._cfg.home.language);
      await this._loadInventory();
      this._loading = false;
      if (!this._cfg.wizard.completed && this._isAdmin) { startWizard(this); }
      else this.render();
      if (this._isAdmin && !this._hass.__demo) {
        this._hass.connection.subscribeMessage(() => this._onRegistry(), { type: "infinitix/subscribe_registry" })
          .then((u) => { this._unsubRegistry = u; }).catch(() => {});
      }
    } catch (err) {
      this._loading = false;
      this._error = err?.message || String(err);
      this.render();
    }
  }
  async _loadInventory() {
    this._inv = await this.callWS({ type: "infinitix/get_inventory" });
    this._rebuildInvMap();
  }
  _onRegistry() {
    clearTimeout(this._regTimer);
    this._regTimer = setTimeout(async () => {
      if (this._wiz || this._manage || this._modal) return; // never disturb an editing session
      try {
        await this._loadInventory();
        if (this._isAdmin) refreshSuggestions(this);
        if (this._view.name === "home" || this._view.name === "room") this.render();
      } catch { /* ignore */ }
    }, 1500);
  }

  persistSoon(immediate = false) {
    if (!this._isAdmin) return;
    clearTimeout(this._saveTimer);
    const go = async () => {
      try { await this.callWS({ type: "infinitix/save_config", config: this._cfg }); }
      catch (err) { this.toast(`${this.t("save_failed")}: ${err?.message || err}`, true); }
    };
    immediate ? go() : (this._saveTimer = setTimeout(go, 600));
  }

  // ------------------------------------------------------------ rendering
  render() {
    this._token++;
    this._lazy = [];
    this._postRender = null;
    const prevScroll = this._app.querySelector(".content")?.scrollTop ?? 0;
    const key = `${this._view.name}:${this._view.room || ""}:${this._wiz?.step ?? ""}`;
    this.applyTheme();
    let html;
    if (this._loading) html = `<div class="splash" role="status" aria-live="polite"><span class="logo-wrap"><img class="logo logo-light" src="${LOGO}" alt="INFINITIX" width="220" height="40"><img class="logo logo-dark" src="${LOGO_DARK}" alt="INFINITIX" width="220" height="40"></span><span class="splash-bar" aria-hidden="true"></span><span class="muted small">${esc(this.t("loading"))}</span></div>`;
    else if (this._error) html = `<div class="content"><div class="page"><div class="panel"><b>${esc(this.t("load_failed"))}</b><p class="note">${esc(this._error)}</p></div></div></div>`;
    else if (!this._cfg.wizard.completed && !this._isAdmin) html = `<div class="content"><div class="page"><div class="empty">${esc(this.t("setup_needed_user"))}</div></div></div>`;
    else html = this._shell();
    this._app.innerHTML = html;
    const sc = this._app.querySelector(".content");
    if (sc) sc.scrollTop = key === this._viewKey ? prevScroll : 0;
    this._viewKey = key;
    this._afterRender();
  }

  /** The layout actually used: Rail needs width, so narrow screens fall back to Mosaic. */
  _layout() {
    if (this._wiz) { const l = this._previewCfg?.theme.layout || "mosaic"; return l === "rail" && this._narrow ? "mosaic" : l; }
    const c = this._cfg;
    return resolveLayout({ stored: this._devLayout, homeDefault: c?.theme.layout, screen: c?.home.screen, allowed: this._features?.layouts, narrow: this._narrow });
  }

  /** Per-device layout choice: stored in this browser only, sends nothing to devices or the server. */
  _layoutDialog() {
    const t = this.t, allowed = this._features?.layouts || ["mosaic", "rows", "rail", "stage"];
    const cur = this._devLayout || "";
    const radio = (v, label, dis = false) => `<label class="row"><input type="radio" name="lay" data-mf="lay:${v}" ${cur === v ? "checked" : ""} ${dis ? "disabled" : ""}> ${esc(label)}</label>`;
    this.openModal({
      title: t("layout_device"),
      body: `<div class="field">${radio("", t("layout_home_default", { l: t(`layout_${this._cfg.theme.layout}`) }))}
        ${["mosaic", "rows", "rail", "stage"].map((l) => radio(l, `${t(`layout_${l}`)}${allowed.includes(l) ? "" : ` – ${t("layout_locked")}`}`, !allowed.includes(l))).join("")}</div>
        <p class="muted small">${esc(t("layout_saved_device"))}</p>`,
      actions: [{ id: "cancel", label: t("cancel") }, { id: "ok", label: t("save"), cls: "primary" }],
      onAction: (id, f) => {
        if (id !== "ok") return true;
        const pick = Object.entries(f).find(([k, v]) => k.startsWith("lay:") && v)?.[0].slice(4) || null;
        this._devLayout = pick || null;
        writeDeviceLayout(this._devLayout, globalThis.localStorage, this._hass.user?.id || "");
        this.render();
        this.toast(t("layout_saved_device"));
        return true;
      },
    });
  }

  _slides(cfg) { return ["", ...visibleRooms(cfg).map((r) => r.id)]; }

  _shell() {
    const { t } = this;
    const cfg = this._cfg, v = this._view.name;
    const layout = this._layout();
    const dash = v === "home" || v === "room" || v === "cat";
    const stage = (v === "home" || v === "room") && layout === "stage";
    const banner = this._hass.__demo ? `<div class="banner">${esc(t("demo_banner"))}</div>` : "";
    let content = "";
    if (v === "wizard") content = renderWizard(this);
    else if (v === "settings" && this._isAdmin) content = renderSettings(this);
    else if (v === "manage" && this._isAdmin) content = renderManage(this);
    else if (v === "cameras" && this._isAdmin) content = renderCamerasPage(this);
    else if (v === "scenarios" && this._isAdmin) content = renderScenariosPage(this);
    else if (v === "pairing" && this._isAdmin) content = renderPairingPage(this);
    else if (v === "media" && this._isAdmin) content = renderMediaPage(this);
    else if (v === "shopping" && this._shop) content = renderShoppingPage(this);
    else if (v === "status") content = renderStatusPage(this);
    else if (v === "page") content = renderPageView(this, cfg, this._view.page);
    else if (v === "cat") content = categoryHTML(this, cfg, this._view.cat, this._view.room || "");
    else if (v === "room") {
      content = roomHTML(this, cfg, this._view.room, { back: !stage, title: !stage });
      if (this._edit && this._isAdmin) {
        const hidden = Object.entries(cfg.entities).filter(([, p]) => p.hidden && (p.room || UNASSIGNED) === this._view.room);
        content += `<div class="page" style="margin-block-start:16px"><p class="muted small">${esc(t("drag_hint"))}</p><button class="btn" data-act="add-card" data-room="${esc(this._view.room)}">+ ${esc(t("add_card"))}</button>
          ${hidden.length ? `<h2>${esc(t("restore_hidden"))}</h2><div class="elist">${hidden.map(([eid, p]) => `<div class="erow"><div class="meta"><div class="nm">${esc(p.name || this._invMap.get(eid)?.name || eid)}</div></div><div class="acts"><button class="btn" data-act="e-unhide" data-eid="${esc(eid)}">${esc(t("restore"))}</button></div></div>`).join("")}</div>` : ""}</div>`;
      }
    } else content = dashboardHTML(this, cfg, { roomsGrid: layout !== "rail" });
    if (stage) content = this._stageHead(cfg) + content;

    const hideNav = dash && cfg.tablet.hide_nav && !this._navShown;
    const menu = this._narrow && customElements.get("ha-menu-button") ? `<ha-menu-button></ha-menu-button>` : "";
    const logo = `<span class="logo-wrap"><img class="logo logo-light" src="${LOGO}" alt="INFINITIX" width="176" height="32"><img class="logo logo-dark" src="${LOGO_DARK}" alt="INFINITIX" width="176" height="32"></span>`;
    const brand = `<div class="side-brand">${menu}${logo}<span class="side-sub" dir="ltr">Smart Home</span></div>`;
    const floating = hideNav || stage ? `<button class="iconbtn floating-nav" data-act="tablet-menu" aria-label="${esc(t("menu"))}">⋯</button>` : "";
    this._app.className = `app lay-${layout}`;

    if (v === "wizard") return `${banner}<div class="shell no-side"><main class="main content">${`<div class="wiz-brand">${logo}</div>`}${content}</main></div>`;

    const cur = (on) => `aria-current="${on ? "page" : "false"}"`;
    const rooms = visibleRooms(cfg).map((r) => `<button class="side-link" data-act="open-room" data-room="${esc(r.id)}" ${cur(v === "room" && this._view.room === r.id)}>${icon(r.icon || "mdi:door", "generic")}<span>${esc(roomName(r, t))}</span><span class="side-meta" data-room-temp="${esc(r.id)}">${roomTempText(this, cfg, r.id)}</span></button>`).join("");
    const pages = visiblePages(cfg).map((p) => `<button class="side-link" data-act="open-page" data-pid="${esc(p.id)}" ${cur(v === "page" && this._view.page === p.id)}>${icon(p.icon || "mdi:star-outline", "generic")}<span>${esc(p.name)}</span></button>`).join("");
    const systemsBlock = `<h2 class="side-label">${esc(t("systems"))}</h2><div class="side-group">${sideSystemsHTML(this, cfg, v === "cat" ? this._view.cat : "")}</div>`;
    const roomsBlock = rooms ? `<h2 class="side-label">${esc(t("rooms"))}</h2><div class="side-group">${rooms}</div>` : "";
    const pagesBlock = pages ? `<h2 class="side-label">${esc(t("pages"))}</h2><div class="side-group">${pages}</div>` : "";
    const now = new Date();
    const railClock = "";
    const tool = (act, ic, label, extra = "") => `<button class="side-tool" data-act="${act}" ${extra}>${icon(ic, "generic")}<span>${esc(label)}</span></button>`;
    const tools = [
      tool("layout-pick", "mdi:view-dashboard-variant-outline", t("layout_device")),
      tool("open-status", "mdi:timer-outline", t("sc_status"), cur(v === "status")),
      ...(this._isAdmin ? [
        ...(v === "room" ? [tool("toggle-edit", "mdi:pencil-outline", t("edit_mode"), `aria-pressed="${this._edit}"`)] : []),
        tool("open-settings", "mdi:cog-outline", t("settings"), cur(v === "settings")),
      ] : []),
    ].join("");
    const side = `<aside class="side" aria-label="${esc(t("navigation"))}">${brand}${railClock}
      <nav class="side-nav" aria-label="${esc(t("navigation"))}">
        <button class="side-home" data-act="go-home" ${cur(v === "home")}><span class="tile-ico">${icon("mdi:home-outline", "generic")}</span><strong>${esc(t("dashboard"))}</strong></button>
        ${layout === "rail" ? roomsBlock + systemsBlock : systemsBlock + roomsBlock}${pagesBlock}</nav>
      <div class="side-foot">${tools}</div></aside>`;
    const showSide = !stage && !hideNav;
    const chips = stage || hideNav ? "" : this._chipsBar(cfg);
    return `${banner}<div class="shell ${showSide ? "" : "no-side"}">${showSide ? side : ""}<main class="main content layout-${esc(layout)}">${chips}${content}</main></div>${floating}`;
  }

  /** Top information chips (reference design): home, status, date/time, weather. */
  _chipsBar(cfg) {
    const { t } = this, now = new Date();
    const items = visibleEntities(cfg).filter((e) => !["scene", "script", "shopping"].includes(e.pref.card));
    const unav = items.filter((e) => { const s = this._hass.states[e.eid]?.state; return !s || s === "unavailable" || s === "unknown"; }).length;
    const online = this._hass.connected !== false;
    const status = !online ? t("status_offline") : unav ? t("status_unavail", { n: unav }) : t("status_ok");
    const w = cfg.weather_entity && this._hass.states[cfg.weather_entity];
    return `<header class="chips-bar" aria-label="${esc(t("status_bar"))}">
      ${cfg.home.name ? `<div class="chip-info"><small>${esc(t("home_name"))}</small><strong>${esc(cfg.home.name)}</strong></div>` : ""}
      <div class="chip-info"><small>${esc(t("system_state"))}</small><span class="tag ${!online || unav ? "tag-warn" : ""}" data-sys-status>${esc(status)}</span></div>
      <div class="chip-info"><small>${esc(t("date_time"))}</small><time data-clock>${esc(formatClock(now, this.lang))}</time><span class="chip-sub" data-date>${esc(formatDate(now, this.lang))}</span></div>
      ${w ? `<button class="chip-info chip-btn" data-act="forecast"><small>${esc(t("weather"))}</small><strong data-chip-weather><bdi dir="ltr">${esc(w.attributes.temperature ?? "")}${esc(w.attributes.temperature_unit || "°")}</bdi></strong><span class="chip-sub">${esc(translateState(t, w.state) ?? w.state)}</span></button>` : ""}
    </header>`;
  }

  _stageHead(cfg) {
    const { t } = this, slides = this._slides(cfg), cur = this._view.name === "room" ? this._view.room : "";
    const i = Math.max(0, slides.indexOf(cur));
    const room = cfg.rooms.find((r) => r.id === cur);
    const rtl = this.dir === "rtl";
    return `<div class="stage-head"><button class="iconbtn" data-act="stage-prev" aria-label="${esc(t("move_up"))}">${rtl ? "→" : "←"}</button>
      <h1 class="stage-title">${esc(cur ? roomName(room, t) : t("home"))}</h1>
      <button class="iconbtn" data-act="stage-next" aria-label="${esc(t("next"))}">${rtl ? "←" : "→"}</button></div>
      <div class="stage-dots" aria-hidden="true">${slides.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>`;
  }

  _stageGo(delta) {
    const slides = this._slides(this._cfg), cur = this._view.name === "room" ? this._view.room : "";
    const i = (Math.max(0, slides.indexOf(cur)) + delta + slides.length) % slides.length;
    this._go(slides[i] ? { name: "room", room: slides[i] } : { name: "home" });
  }

  _ctx() {
    return { hass: this._hass, t: this.t, invMap: this._invMap, edit: this._edit && this._view.name === "room" && !this._wiz, inert: this._view.name === "wizard" };
  }

  _afterRender() {
    const token = this._token;
    const ctx = this._ctx();
    for (const job of this._lazy) {
      const grid = this._app.querySelector(`[data-lazy="${job.id}"]`);
      if (!grid) continue;
      let i = 0;
      const step = () => {
        if (token !== this._token || !grid.isConnected) return;
        const chunk = job.items.slice(i, i + 24);
        grid.insertAdjacentHTML("beforeend", chunk.map((e) => cardHTML(ctx, e.eid, e.pref)).join(""));
        this._bindCards(grid);
        i += 24;
        if (i < job.items.length) requestAnimationFrame(step);
      };
      step();
    }
    const mb = this._app.querySelector("ha-menu-button");
    if (mb) { mb.hass = this._hass; mb.narrow = this._narrow; }
    this._postRender?.();
    this._postRender = null;
  }

  _bindCards(root) {
    root.querySelectorAll(".ix-card[data-eid]").forEach((el) => { el._st = this._hass.states[el.dataset.eid]; });
  }

  // ------------------------------------------------------------ live updates
  _onHass() {
    if (!this._cfg || this._loading) return;
    this.applyTheme();
    const active = this.shadowRoot.activeElement;
    for (const el of this._app.querySelectorAll(".ix-card[data-eid]")) {
      const eid = el.dataset.eid, st = this._hass.states[eid];
      if (el._st === st || this._drag === eid) continue;
      // Skip only while a value is being typed or dragged (input/select); a tapped button keeps focus but must still refresh.
      if (active && el.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) continue;
      this._refreshCard(el, st);
    }
    this._app.querySelectorAll("[data-room-temp]").forEach((n) => { n.textContent = roomTempText(this, this._viewCfg() || this._cfg, n.dataset.roomTemp); });
    const vc = this._viewCfg() || this._cfg;
    this._app.querySelectorAll("[data-cat-status]").forEach((n) => { n.textContent = systemStatus(this, vc, n.dataset.catStatus, n.dataset.catRoom || ""); });
    const bar = this._app.querySelector(".chips-bar");
    if (bar && this._view.name !== "wizard") {
      const html = this._chipsBar(this._cfg);
      if (html !== this._chipsHTML) { this._chipsHTML = html; const tpl = document.createElement("template"); tpl.innerHTML = html; bar.replaceWith(tpl.content.firstElementChild); }
    }
    const w = this._app.querySelector("[data-weather]");
    if (w) { const tpl = document.createElement("template"); tpl.innerHTML = weatherHTML(this, this._viewCfg() || this._cfg); if (tpl.content.firstElementChild) w.replaceWith(tpl.content.firstElementChild); }
  }

  _refreshCard(el, st) {
    const eid = el.dataset.eid;
    const pref = this._viewCfg()?.entities[eid];
    if (!pref) return;
    el._st = st;
    if (el.dataset.card === "camera" && el.querySelector("img[data-cam]")) {
      const img = el.querySelector("img[data-cam]");
      const pic = st?.attributes?.entity_picture;
      if (pic) img.dataset.src = this._hass.hassUrl?.(pic) ?? pic;
      return;
    }
    const tpl = document.createElement("template");
    tpl.innerHTML = cardHTML(this._ctx(), eid, pref);
    const n = tpl.content.firstElementChild;
    n._st = st;
    const act = this.shadowRoot.activeElement;
    const idx = act && el.contains(act) ? [...el.querySelectorAll("button,[tabindex]")].indexOf(act) : -1;
    el.replaceWith(n);
    if (idx >= 0) n.querySelectorAll("button,[tabindex]")[idx]?.focus({ preventScroll: true }); // keep keyboard focus
  }

  _refreshCameras(force = false) {
    if (document.hidden && !force) return;
    this._app.querySelectorAll("img[data-cam]").forEach((img) => {
      const r = img.getBoundingClientRect();
      if (!force && (r.bottom < 0 || r.top > window.innerHeight)) return; // only what is on screen
      const base = img.dataset.src;
      if (base) img.src = `${base}${base.includes("?") ? "&" : "?"}_t=${Date.now()}`;
    });
  }

  _tick() {
    const now = new Date();
    if (this._saverOn) renderSaver(this);
    else if (saverEnabled(this) && !this._modal && !this._wiz && !this._manage && this._view.name !== "wizard"
      && Date.now() - this._lastActive >= this._cfg.display.saver.idle_min * 60000) showSaver(this);
    const set = (sel, text) => { this._app.querySelectorAll(sel).forEach((n) => { n.textContent = text; }); };
    set("[data-clock]", formatClock(now, this._lang));
    const first = (this._hass?.user?.name || "").split(" ")[0];
    set("[data-greet]", `${this.t(greetingKey(now.getHours()))}${first ? `, ${first}` : ""}`);
    set("[data-date]", formatDate(now, this._lang));
    set("[data-hdate]", hebrewDate(now, this._lang));
  }

  // ------------------------------------------------------------ events
  _onClick(e) {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "button")) return;
    this._dispatch(el);
  }
  _onChange(e) {
    const el = e.target;
    if (el.dataset?.act && (el.tagName === "SELECT" || el.tagName === "INPUT")) { this._drag = null; return this._dispatch(el); }
    if (el.dataset?.field && (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "color")) this._field(el);
  }
  _onInput(e) {
    const el = e.target;
    if (el.dataset?.act === "slider") {
      this._drag = el.closest("[data-eid]")?.dataset.eid || null;
      const out = el.parentElement.querySelector("output");
      if (out) out.textContent = `${Math.round(el.value)}${out.textContent.replace(/^[\d.\-]+/, "")}`;
    } else if (el.dataset?.field && el.type !== "checkbox" && el.type !== "color" && el.tagName === "INPUT") this._field(el);
  }
  _field(el) {
    const f = el.dataset.field;
    if (f.startsWith("c.") && !this._wiz) return cameraField(this, f, el);
    if (this._wiz) return wizardField(this, f, el);
    if (this._view.name === "settings" || this._view.name === "manage") return settingsField(this, f, el);
    if (this._view.name === "cameras") return cameraField(this, f, el);
  }

  _dispatch(el) {
    const act = el.dataset.act;
    if (act.startsWith("c-")) return camerasAct(this, act, el);
    if (act.startsWith("sc-")) return scenariosAct(this, act, el);
    if (act.startsWith("pr-")) return pairingAct(this, act, el);
    if (act.startsWith("md-")) return mediaAct(this, act, el);
    if (act.startsWith("sh-")) return shoppingAct(this, act, el);
    if (act.startsWith("pg-")) return pagesAct(this, act, el);
    if (this._wiz && (act.startsWith("w-") || act.startsWith("pk-"))) return wizardAct(this, act, el);
    if (/^(s|i|m)-/.test(act) || (this._view.name === "manage" && act.startsWith("pk-"))) return settingsAct(this, act, el);
    return this._dashAct(act, el);
  }

  _go(view) { this._view = view; this.render(); }

  async _dashAct(act, el) {
    const t = this.t;
    switch (act) {
      case "go-home": return this._go({ name: "home" });
      case "open-room": return this._go({ name: "room", room: el.dataset.room });
      case "open-settings": return this._isAdmin ? openSettings(this) : this.toast(t("admin_only"), true);
      case "toggle-edit": this._edit = !this._edit; return this.render();
      case "layout-pick": return this._layoutDialog();
      case "open-status": return this._go({ name: "status" });
      case "open-page": return this._go({ name: "page", page: el.dataset.pid });
      case "open-cat": return this._go({ name: "cat", cat: el.dataset.cat, room: el.dataset.room || "" });
      case "cat-batch": return this._lightingBatch(el.dataset.op, el.dataset.room || "");
      case "forecast": return openForecast(this);
      case "e-unhide": { if (!this._isAdmin) return; const p = this._cfg.entities[el.dataset.eid]; if (p) { p.hidden = false; this.persistSoon(); this.render(); } return; }
      case "add-card": return this._isAdmin ? openManage(this, el.dataset.room) : undefined;
      case "exit-admin": return this._exitToAdmin();
      case "tablet-menu": return this._tabletMenu();
      case "stage-prev": return this._stageGo(-1);
      case "stage-next": return this._stageGo(1);
      case "shop-open": { const c = el.closest(".ix-card"); return c && !c.classList.contains("inert") && this._view.name !== "wizard" ? openShopping(this, c.dataset.eid) : undefined; }
      default:
    }
    const card = el.closest(".ix-card");
    if (!card) return;
    if (card.classList.contains("inert") || this._view.name === "wizard") return; // preview never operates devices
    const eid = card.dataset.eid, domain = domainOf(eid), st = this._hass.states[eid];
    const caps = this._invMap.get(eid)?.capabilities ?? [];
    if (act.startsWith("e-")) return this._editAct(act, eid, card);
    if (!st || st.state === "unavailable") return;
    const a = st.attributes;
    const call = (d, s, data = {}) => this._call(eid, d, s, { entity_id: eid, ...data });

    switch (act) {
      case "toggle": {
        const on = domain === "media_player" ? st.state !== "off" : st.state === "on";
        return call(domain, on ? "turn_off" : "turn_on");
      }
      case "slider": {
        const v = Number(el.value);
        this._drag = null;
        switch (el.dataset.kind) {
          case "brightness_pct": return call("light", "turn_on", { brightness_pct: v });
          case "color_temp_kelvin": return call("light", "turn_on", { color_temp_kelvin: v });
          case "hue": return call("light", "turn_on", { hs_color: [v, a.hs_color?.[1] ?? 100] });
          case "cover_position": return call("cover", "set_cover_position", { position: v });
          case "fan_pct": return call("fan", "set_percentage", { percentage: v });
          case "volume": return call("media_player", "volume_set", { volume_level: v / 100 });
          default: return;
        }
      }
      case "cover": return call("cover", el.dataset.svc);
      case "oscillate": return call("fan", "oscillate", { oscillating: !a.oscillating });
      case "temp": {
        const unit = this._hass.config?.unit_system?.temperature || "°C";
        const step = Number(a.target_temp_step) || (unit === "°F" ? 1 : 0.5);
        const cur = Number(a.temperature);
        if (!Number.isFinite(cur)) return;
        const next = clamp(Math.round((cur + Number(el.dataset.dir) * step) / step) * step, Number(a.min_temp) || -Infinity, Number(a.max_temp) || Infinity);
        return call("climate", "set_temperature", { temperature: Number(next.toFixed(1)) });
      }
      case "select":
        return el.dataset.kind === "hvac_mode" ? call("climate", "set_hvac_mode", { hvac_mode: el.value }) : call("climate", "set_fan_mode", { fan_mode: el.value });
      case "activate": return call("scene", "turn_on");
      case "run": return call("script", "turn_on");
      case "media": return call("media_player", el.dataset.svc);
      case "lock-lock": return call("lock", "lock");
      case "lock-unlock": case "lock-open": {
        const r = await this._confirm(act === "lock-open" ? t("confirm_open_lock") : t("confirm_unlock"));
        return r.ok ? call("lock", act === "lock-open" ? "open" : "unlock") : undefined;
      }
      case "alarm": {
        let code;
        if (a.code_arm_required && a.code_format) { const r = await this._confirm(t(`act_${el.dataset.svc.replace("alarm_", "")}`), { code: true, danger: false }); if (!r.ok) return; code = r.code; }
        return call("alarm_control_panel", el.dataset.svc, code ? { code } : {});
      }
      case "alarm-disarm": {
        const r = await this._confirm(t("confirm_disarm"), { code: !!a.code_format });
        return r.ok ? call("alarm_control_panel", "alarm_disarm", r.code ? { code: r.code } : {}) : undefined;
      }
      case "cam-snap": return this._refreshCameras(true);
      case "cam-live": return this._camLive(eid, card);
      default:
    }
  }

  /** Service call with visible progress / success / error.  "Success" is shown only
   *  after Home Assistant has accepted and executed the service call; the displayed
   *  state itself always comes from HA, never from an optimistic guess. */
  async _call(eid, domain, service, data) {
    const cardEl = () => this._app.querySelector(`.ix-card[data-eid="${CSS_ESCAPE(eid)}"]`);
    cardEl()?.classList.add("busy");
    try {
      await this._hass.callService(domain, service, data);
      const c = cardEl(); c?.classList.remove("busy"); this._flash(c, "ok");
    } catch (err) {
      const c = cardEl(); c?.classList.remove("busy"); this._flash(c, "err");
      this.toast(`${this.t("failed")}: ${err?.message || err}`, true);
    }
  }
  _flash(c, kind) { if (!c) return; c.classList.add(`flash-${kind}`); setTimeout(() => c.classList.remove(`flash-${kind}`), 900); }

  async _camLive(eid, card) {
    const wrap = card.querySelector("[data-cam-wrap]");
    try {
      const r = await this._hass.callWS({ type: "camera/stream", entity_id: eid });
      const v = document.createElement("video");
      v.className = "cam"; v.autoplay = true; v.muted = true; v.playsInline = true; v.controls = true;
      if (!v.canPlayType("application/vnd.apple.mpegurl")) { this.toast(this.t("stream_unsupported"), true); return; }
      v.src = this._hass.hassUrl?.(r.url) ?? r.url;
      wrap.replaceChildren(v);
    } catch (err) {
      this.toast(`${this.t("stream_failed")}: ${err?.message || err}`, true);
    }
  }

  _exitToAdmin() {
    history.pushState(null, "", "/config");
    window.dispatchEvent(new CustomEvent("location-changed"));
  }
  _tabletMenu() {
    const t = this.t;
    this.openModal({
      title: t("brand"),
      body: "",
      actions: [
        ...(this._layout() === "stage" ? [] : [{ id: "nav", label: t("show_nav") }]),
        { id: "layout", label: t("layout_device") },
        { id: "status", label: t("sc_status") },
        ...(this._isAdmin ? [{ id: "settings", label: t("settings") }] : []),
        { id: "admin", label: t("exit_admin") },
        { id: "close", label: t("close"), cls: "primary" },
      ],
      onAction: (id) => {
        if (id === "nav") { this._navShown = true; this.render(); }
        if (id === "settings") openSettings(this);
        if (id === "layout") setTimeout(() => this._layoutDialog());
        if (id === "status") this._go({ name: "status" });
        if (id === "admin") this._exitToAdmin();
        return true;
      },
    });
  }

  // ------------------------------------------------------------ lighting batch (category view)
  _batchTargets(cfg, room) {
    return systemItems(cfg, "lighting", room).map((e) => e.eid)
      .filter((eid) => ["light", "switch"].includes(domainOf(eid)) && this._hass.states[eid] && !["unavailable", "unknown"].includes(this._hass.states[eid].state));
  }
  _isLightingBatchable(cfg, room) { return this._batchTargets(cfg, room).length > 0; }
  async _lightingBatch(op, room) {
    if (!["on", "off"].includes(op)) return;
    const targets = this._batchTargets(this._cfg, room);
    if (!targets.length) return;
    const scope = room ? roomName(this._cfg.rooms.find((r) => r.id === room), this.t) : this.t("whole_home");
    const r = await this._confirm(this.t(op === "on" ? "confirm_all_on" : "confirm_all_off", { n: targets.length, scope }), { danger: false });
    if (!r.ok) return;
    // Each entity is called with the user's own session, so HA checks every permission.
    for (const eid of targets) await this._call(eid, domainOf(eid), op === "on" ? "turn_on" : "turn_off", { entity_id: eid });
  }

  // ------------------------------------------------------------ drag and drop (edit mode)
  _dndStart(e) {
    const h = e.target.closest?.("[data-drag]");
    if (!h || !this._edit || !this._isAdmin) return;
    const card = h.closest(".ix-card[data-eid]");
    if (!card) return;
    e.preventDefault();
    this._dnd = { eid: card.dataset.eid, id: e.pointerId, over: null };
    card.classList.add("dragging");
    try { h.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }
  _dndMove(e) {
    const d = this._dnd;
    if (!d || e.pointerId !== d.id) return;
    const over = this.shadowRoot.elementFromPoint?.(e.clientX, e.clientY)?.closest(".ix-card[data-eid]");
    const eid = over?.dataset.eid || null;
    if (eid === d.over) return;
    this._app.querySelectorAll(".drop-target").forEach((n) => n.classList.remove("drop-target"));
    d.over = eid !== d.eid ? eid : null;
    if (d.over) over.classList.add("drop-target");
  }
  _dndEnd(e) {
    const d = this._dnd;
    if (!d || e.pointerId !== d.id) return;
    this._dnd = null;
    if (d.over) {
      const cfg = this._cfg, room = cfg.entities[d.eid]?.room || UNASSIGNED;
      if ((cfg.entities[d.over]?.room || UNASSIGNED) === room) {
        const ids = entitiesOfRoom(cfg, room).map((x) => x.eid);
        applyOrder(cfg.entities, reorder(ids, d.eid, d.over));
        this.persistSoon();
      }
    }
    this.render();
  }
  _dndCancel() { if (this._dnd) { this._dnd = null; this.render(); } }

  // ------------------------------------------------------------ edit mode
  _editAct(act, eid, card) {
    if (!this._isAdmin) return this.toast(this.t("admin_only"), true);
    const cfg = this._cfg, pref = cfg.entities[eid];
    if (!pref) return;
    if (act === "e-edit") return this._entityDialog(eid);
    if (act === "e-size") pref.size = { s: "m", m: "l", l: "s" }[pref.size] || "m";
    else if (act === "e-fav") pref.favorite = !pref.favorite;
    else if (act === "e-hide") pref.hidden = true;
    else if (act === "e-up" || act === "e-down") {
      const room = pref.room || UNASSIGNED;
      const all = entitiesOfRoom(cfg, room);
      all.forEach((e, i) => { e.pref.order = i; });
      const group = GROUP_OF_CARD[pref.card];
      const sib = all.filter((e) => GROUP_OF_CARD[e.pref.card] === group);
      const i = sib.findIndex((e) => e.eid === eid), j = i + (act === "e-up" ? -1 : 1);
      if (j >= 0 && j < sib.length) { const a = sib[i].pref.order; sib[i].pref.order = sib[j].pref.order; sib[j].pref.order = a; }
    }
    this.persistSoon();
    this.render();
  }

  _entityDialog(eid) {
    const t = this.t, cfg = this._cfg, pref = cfg.entities[eid];
    const rooms = [...cfg.rooms].sort((a, b) => a.order - b.order);
    const o = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
    this.openModal({
      title: t("entity_settings"),
      body: `<div class="muted small" style="direction:ltr;text-align:start">${esc(eid)}</div>
        <div class="field"><label class="label">${esc(t("display_name"))}</label><input class="input" data-mf="name" value="${esc(pref.name || "")}" maxlength="120"></div>
        <div class="field"><label class="label">${esc(t("icon"))}</label><input class="input" data-mf="icon" value="${esc(pref.icon || "")}" list="ix-icons" placeholder="mdi:…"><datalist id="ix-icons">${ROOM_ICONS.map((i) => `<option value="${i}">`).join("")}</datalist></div>
        <div class="field"><label class="label">${esc(t("assign_to"))}</label><select data-mf="room">${rooms.map((r) => o(r.id, roomName(r, t), pref.room || UNASSIGNED)).join("")}</select></div>
        <div class="field"><label class="label">${esc(t("card_type"))}</label><select data-mf="card">${CARD_TYPES_UI.map((c) => o(c, c, pref.card)).join("")}</select></div>
        <div class="field"><label class="label">${esc(t("entity_size"))}</label><select data-mf="size">${o("s", t("size_s"), pref.size)}${o("m", t("size_m"), pref.size)}${o("l", t("size_l"), pref.size)}</select></div>`,
      actions: [{ id: "cancel", label: t("cancel") }, { id: "save", label: t("save"), cls: "primary" }],
      onAction: (id, f) => {
        if (id !== "save") return true;
        pref.name = f.name.trim() || null;
        pref.icon = f.icon.trim().startsWith("mdi:") ? f.icon.trim() : null;
        pref.room = f.room; pref.card = f.card; pref.size = f.size;
        this.persistSoon(); this.render();
        return true;
      },
    });
  }
}

const CSS_ESCAPE = (s) => (window.CSS?.escape ? window.CSS.escape(s) : s.replace(/"/g, "\\\""));
