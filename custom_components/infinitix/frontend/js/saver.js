// Screensaver (clock, Hebrew date, weather, agenda), weather forecast and agenda data.
// All data comes from the logged-in Home Assistant session: the selected weather entity
// (HA's weather/subscribe_forecast), calendar entities (HA calendar API) and to-do
// entities (todo/item/list).  Nothing is fetched from the internet by the panel.

import { esc, formatClock, formatDate, locale } from "./util.js";
import { hebrewDate } from "./scenarios.js";
import { translateState } from "./cards.js";

const F_DAILY = 1, F_HOURLY = 2;
const LOGO_DARK = new URL("../brand/infinitix-logo-dark.png", import.meta.url).href;
const AGENDA_TTL = 5 * 60 * 1000;

// ------------------------------------------------------------------ forecast
/** Subscribe to the forecast types the weather entity supports.  Returns an unsubscribe. */
export function subscribeForecast(app, onUpdate) {
  const eid = app._cfg?.weather_entity, st = eid && app._hass.states[eid];
  app._fc = { entity: eid, hourly: null, daily: null, supported: { hourly: false, daily: false } };
  if (!st || app._hass.__demo) return () => {};
  const feat = Number(st.attributes.supported_features) || 0;
  const subs = [];
  for (const [type, bit] of [["hourly", F_HOURLY], ["daily", F_DAILY]]) {
    if (!(feat & bit)) continue;
    app._fc.supported[type] = true;
    subs.push(app._hass.connection.subscribeMessage((m) => { app._fc[type] = m.forecast || []; onUpdate(); },
      { type: "weather/subscribe_forecast", forecast_type: type, entity_id: eid }).catch(() => null));
  }
  return () => subs.forEach((p) => p.then((u) => { try { u?.(); } catch { /* closed */ } }));
}

function forecastHTML(app, { hourly = true, daily = true, compact = false } = {}) {
  const { t } = app, fc = app._fc;
  if (!fc || (!fc.supported.hourly && !fc.supported.daily)) return `<p class="muted">${esc(t("forecast_none"))}</p>`;
  const unit = app._hass.states[fc.entity]?.attributes.temperature_unit || "°";
  const hour = (iso) => new Intl.DateTimeFormat(locale(app.lang), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  const day = (iso) => new Intl.DateTimeFormat(locale(app.lang), { weekday: "short", day: "numeric" }).format(new Date(iso));
  const cond = (c) => translateState(t, c) ?? c ?? "";
  let html = "";
  if (hourly && fc.supported.hourly) {
    const items = (fc.hourly || []).filter((f) => new Date(f.datetime) > Date.now() - 3600e3).slice(0, compact ? 8 : 24);
    if (fc.hourly && !items.length && compact) return html;
    html += `<h3>${esc(t("forecast_hourly"))}</h3>${fc.hourly ? `<div class="fc-row" role="list">${items.map((f) => `<div class="fc" role="listitem"><span class="muted small">${esc(hour(f.datetime))}</span><b>${esc(Math.round(f.temperature))}${esc(unit)}</b><span class="small">${esc(cond(f.condition))}</span>${f.precipitation_probability != null ? `<span class="muted small">${esc(f.precipitation_probability)}%</span>` : ""}</div>`).join("")}</div>` : `<p class="muted">${esc(t("forecast_loading"))}</p>`}`;
  }
  if (daily && fc.supported.daily) {
    const items = (fc.daily || []).slice(0, 7);
    html += `<h3>${esc(t("forecast_daily"))}</h3>${fc.daily ? `<div class="fc-row" role="list">${items.map((f) => `<div class="fc" role="listitem"><span class="muted small">${esc(day(f.datetime))}</span><b>${esc(Math.round(f.temperature))}${f.templow != null ? ` / ${esc(Math.round(f.templow))}` : ""}${esc(unit)}</b><span class="small">${esc(cond(f.condition))}</span></div>`).join("")}</div>` : `<p class="muted">${esc(t("forecast_loading"))}</p>`}`;
  }
  return html;
}

export function openForecast(app) {
  const { t } = app;
  const body = () => `<div data-fc-body>${forecastHTML(app)}</div>`;
  const unsub = subscribeForecast(app, () => {
    const n = app._overlay.querySelector("[data-fc-body]");
    if (n) n.innerHTML = forecastHTML(app);
  });
  app.openModal({
    title: t("forecast"), body: body(),
    actions: [{ id: "close", label: t("close"), cls: "primary" }],
    onAction: () => { unsub(); return true; },
  });
  app._modalCleanup = unsub;
}

// ------------------------------------------------------------------ agenda
export function agendaSources(app) {
  return Object.keys(app._hass.states).filter((e) => e.startsWith("calendar.") || e.startsWith("todo.")).sort();
}

export async function loadAgenda(app, force = false) {
  const cfg = app._cfg, sources = cfg?.display?.saver?.calendars || [];
  if (!force && app._agenda && Date.now() - app._agenda.at < AGENDA_TTL) return app._agenda;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 86400e3);
  const events = [], reminders = [];
  await Promise.all(sources.map(async (eid) => {
    try {
      if (eid.startsWith("calendar.")) {
        const list = await app._hass.callApi("GET", `calendars/${eid}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
        for (const ev of list || []) events.push({ summary: ev.summary, start: ev.start?.dateTime || ev.start?.date || ev.start, allDay: !!ev.start?.date && !ev.start?.dateTime });
      } else {
        const r = await app._hass.callWS({ type: "todo/item/list", entity_id: eid });
        for (const it of r.items || []) {
          if (it.status !== "needs_action" || !it.due) continue;
          if (new Date(it.due) <= end) reminders.push({ summary: it.summary, due: it.due });
        }
      }
    } catch { /* source not readable for this user: skip */ }
  }));
  events.sort((a, b) => new Date(a.start) - new Date(b.start));
  reminders.sort((a, b) => new Date(a.due) - new Date(b.due));
  app._agenda = { at: Date.now(), events, reminders };
  return app._agenda;
}

function agendaHTML(app) {
  const { t } = app, a = app._agenda;
  if (!a) return `<p class="muted">…</p>`;
  const today = new Date().toDateString();
  const time = (iso, allDay) => (allDay ? t("all_day") : formatClock(new Date(iso), app.lang));
  const label = (iso) => (new Date(iso).toDateString() === today ? t("agenda_today") : t("agenda_tomorrow"));
  if (!a.events.length && !a.reminders.length) return `<p class="muted">${esc(t("agenda_empty"))}</p>`;
  return `${a.events.slice(0, 6).map((e) => `<div class="ag-item"><span class="muted small">${esc(label(e.start))} · ${esc(time(e.start, e.allDay))}</span><span>${esc(e.summary)}</span></div>`).join("")}
    ${a.reminders.length ? `<h3>${esc(t("reminders"))}</h3>${a.reminders.slice(0, 5).map((r) => `<div class="ag-item"><span class="muted small">${esc(label(r.due))}</span><span>${esc(r.summary)}</span></div>`).join("")}` : ""}`;
}

// ------------------------------------------------------------------ screensaver
export function saverEnabled(app) {
  return !!(app._cfg?.wizard.completed && app._cfg.display?.saver?.enabled && app._features?.screensaver !== false);
}

export function showSaver(app) {
  if (app._saverOn) return;
  app._saverOn = true;
  const s = app._cfg.display.saver;
  if (s.weather) app._saverUnsub = subscribeForecast(app, () => renderSaver(app));
  if (s.agenda) loadAgenda(app).then(() => renderSaver(app));
  renderSaver(app);
  app._saverEl.querySelector(".saver")?.focus();
}

export function hideSaver(app) {
  if (!app._saverOn) return;
  app._saverOn = false;
  app._saverUnsub?.(); app._saverUnsub = null;
  app._saverEl.innerHTML = "";
}

export function renderSaver(app) {
  if (!app._saverOn) return;
  const { t } = app, s = app._cfg.display.saver, now = new Date();
  const w = app._cfg.weather_entity && app._hass.states[app._cfg.weather_entity];
  const weather = s.weather && w ? `<div class="sv-weather"><b><bdi dir="ltr">${esc(w.attributes.temperature ?? "")}${esc(w.attributes.temperature_unit || "°")}</bdi></b> <span>${esc(translateState(t, w.state) ?? w.state)}</span>
    ${forecastHTML(app, { daily: false, compact: true })}</div>` : "";
  // Small position drift against burn-in on always-on wall tablets (disabled with reduced motion via CSS).
  const drift = `--dx:${(now.getMinutes() % 5) * 6 - 12}px;--dy:${(now.getMinutes() % 3) * 8 - 8}px`;
  app._saverEl.innerHTML = `<div class="saver" role="dialog" aria-modal="true" aria-label="${esc(t("saver"))}" tabindex="-1" style="${drift}">
    <div class="sv-inner"><img class="sv-logo" src="${LOGO_DARK}" alt="INFINITIX" width="200" height="36">
    <div class="sv-clock">${esc(formatClock(now, app.lang))}</div>
    <div class="sv-date">${esc(formatDate(now, app.lang))} · ${esc(hebrewDate(now, app.lang))}</div>
    <div class="sv-cols">${weather}${s.agenda ? `<div class="sv-agenda"><h3>${esc(t("agenda"))}</h3>${agendaHTML(app)}</div>` : ""}</div>
    <p class="muted small">${esc(t("saver_tap"))}</p></div></div>`;
}
