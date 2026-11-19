// Scenarios page: Shabbat timer, sunrise/sunset, Jewish-calendar times.  The scenarios run
// inside Home Assistant (server side), so they work with the panel closed.  This page only
// edits them; the next run times shown come from the server.

import { esc, locale, uid } from "./util.js";

const TEMPLATES = {
  shabbat_on: { name_key: "sc_tpl_shabbat_on", trigger: { type: "jewish", event: "candle_lighting", offset_min: 0 }, state: "on" },
  shabbat_off: { name_key: "sc_tpl_shabbat_off", trigger: { type: "jewish", event: "havdalah", offset_min: 0 }, state: "off" },
  sunset_on: { name_key: "sc_tpl_sunset_on", trigger: { type: "sun", event: "sunset", offset_min: 0 }, state: "on" },
  sunrise_off: { name_key: "sc_tpl_sunrise_off", trigger: { type: "sun", event: "sunrise", offset_min: 0 }, state: "off" },
  night_off: { name_key: "sc_tpl_night_off", trigger: { type: "time", at: "23:30" }, state: "off" },
  morning: { name_key: "sc_tpl_morning", trigger: { type: "time", at: "07:00" }, state: "on", days: [6, 0, 1, 2, 3, 4], shabbat: "not" },
};
const SOURCE_KEYS = [["candle_lighting", "sensor."], ["havdalah", "sensor."], ["issur_melacha", "binary_sensor."]];
const DOMAINS = ["light", "switch", "fan", "input_boolean"];
const fresh = () => ({ loaded: false, loading: false, list: [], sources: {}, upcoming: [], draft: null, error: null, busy: false, preview: null, log: null, srcEdit: false });
export const scState = (app) => (app._sc ||= fresh());
export const resetScenarios = (app) => { app._sc = fresh(); };

const apply = (s, r) => { s.list = r.scenarios; s.sources = r.sources; s.upcoming = r.upcoming || []; s.features = r.features; };

async function load(app) {
  const s = scState(app);
  s.loading = true;
  try { apply(s, await app.callWS({ type: "infinitix/scenarios/list" })); s.loaded = true; }
  catch (err) { s.error = err?.message || String(err); }
  s.loading = false;
  app.render();
}

export function renderScenariosPage(app) {
  return `<div class="page"><div class="row spread"><h1>${esc(app.t("sc_title"))}</h1><button class="btn" data-act="sc-back">${esc(app.t("back"))}</button></div>${renderScenariosBody(app)}</div>`;
}

/** Hebrew-calendar date (Intl's built-in calendar; the day changes at midnight, not at sunset). */
export const hebrewDate = (d, lang) => new Intl.DateTimeFormat(`${lang === "he" ? "he" : lang === "ru" ? "ru" : "en"}-u-ca-hebrew`, { day: "numeric", month: "long", year: "numeric" }).format(d);

export function renderScenariosBody(app) {
  const s = scState(app), { t } = app;
  if (!s.loaded && !s.loading) load(app);
  const dayName = (d) => new Intl.DateTimeFormat(locale(app.lang), { weekday: "short" }).format(new Date(2024, 0, 1 + d));
  const fmt = (iso) => (iso ? `${new Intl.DateTimeFormat(locale(app.lang), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))} (${hebrewDate(new Date(iso), app.lang)})` : null);
  const src = s.sources || {};
  const needJewish = s.list.some((x) => x.trigger.type === "jewish") || s.draft?.trigger.type === "jewish";
  let html = `<div class="panel"><p class="muted">${esc(t("sc_note"))}</p>
    <p><b>${esc(t("sc_today", { greg: new Intl.DateTimeFormat(locale(app.lang), { weekday: "long", day: "numeric", month: "long" }).format(new Date()), heb: hebrewDate(new Date(), app.lang) }))}</b></p>
    <p class="muted small">${esc(t("sc_hebrew_note"))}</p><p class="muted small">${esc(t("sc_halacha_note"))}</p>
    ${needJewish && s.loaded && !src.candle_lighting ? `<p class="note" role="alert">${esc(t("sc_need_jewish"))}</p>` : ""}
    <div class="row">${Object.entries(TEMPLATES).map(([k, tp]) => `<button class="btn" data-act="sc-tpl" data-tpl="${k}">+ ${esc(t(tp.name_key))}</button>`).join("")}
      <button class="btn primary" data-act="sc-new">+ ${esc(t("sc_new"))}</button></div></div>`;
  if (s.loaded) html += sourcesHTML(app, needJewish) + upcomingHTML(app, fmt);
  if (s.error) html += `<p class="note" role="alert">${esc(s.error)}</p>`;
  if (s.draft) html += editor(app, s.draft, dayName) + previewHTML(app, fmt);
  html += s.list.length || !s.loaded ? "" : `<p class="muted">${esc(t("sc_empty"))}</p>`;
  html += `<div class="elist">${s.list.map((x) => {
    const nxt = fmt(x.next_run), last = x.last_run;
    return `<div class="erow ${x.enabled ? "" : "off"}" data-sid="${esc(x.id)}"><label class="row"><input type="checkbox" class="chk" data-act="sc-toggle" ${x.enabled ? "checked" : ""} aria-label="${esc(t("sc_enabled"))}"></label>
      <div class="meta"><div class="nm">${esc(x.name)}</div>
      <div class="id">${esc(triggerText(app, x.trigger))}${x.days.length ? ` · ${esc(x.days.map(dayName).join(" "))}` : ""}${x.shabbat !== "any" ? ` · ${esc(t(`sc_shabbat_${x.shabbat}`))}` : ""}</div>
      <div class="id">${esc(x.actions.map((a) => `${(app._invMap.get(a.entity_id)?.name || a.entity_id)} → ${t(a.state)}`).join(", "))}</div>
      ${x.locked ? `<div><span class="badge warn">${esc(t("sc_locked"))}</span></div>` : ""}
      ${(x.warnings || []).map((w) => `<div class="note small" role="note">${esc(t(`sc_w_${w}`))}</div>`).join("")}
      <div class="id">${x.enabled ? esc(nxt ? t("sc_next", { when: nxt }) : t("sc_next_none")) : ""}${last ? ` · ${esc(t("sc_last", { when: fmt(last.at), res: last.ran ? (last.ok ? t("ok") : t("failed")) : (t(`sc_note_${last.note}`) !== `sc_note_${last.note}` ? t(`sc_note_${last.note}`) : last.note) }))}` : ""}</div></div>
      <div class="acts"><button class="btn" data-act="sc-run">${esc(t("sc_run_now"))}</button><button class="btn" data-act="sc-edit">${esc(t("edit"))}</button><button class="btn danger" data-act="sc-del">${esc(t("remove"))}</button></div></div>`;
  }).join("")}</div>`;
  html += logHTML(app, fmt);
  return html;
}

const statusBadge = (t, st) => `<span class="badge ${st === "ok" ? "ok" : st === "missing" ? "err" : "warn"}">${esc(t(`src_${st}`))}</span>`;

function sourcesHTML(app, needJewish) {
  const s = scState(app), { t } = app, det = s.sources?.detail || {};
  const any = Object.values(det).some((d) => d.status !== "missing");
  if (!needJewish && !any && !s.srcEdit) return "";
  const pick = (key, prefix) => {
    const d = det[key] || {}, cur = d.origin === "mapped" ? d.entity_id : "";
    const ents = Object.keys(app._hass.states).filter((e) => e.startsWith(prefix)).sort();
    return `<div class="src-row" data-src="${key}"><label class="label" for="src-${key}">${esc(t(`sc_src_${key}`))}</label>
      <select id="src-${key}"><option value="">${esc(t("sc_src_auto"))}${d.origin === "auto" && d.entity_id ? ` (${esc(d.entity_id)})` : ""}</option>${ents.map((e) => `<option value="${esc(e)}" ${e === cur ? "selected" : ""}>${esc(app._hass.states[e]?.attributes.friendly_name || e)} – ${esc(e)}</option>`).join("")}</select>
      <span>${statusBadge(t, d.status || "missing")} ${d.value ? `<span class="muted small" dir="ltr">${esc(d.value.length > 12 && d.value.includes("T") ? new Date(d.value).toLocaleString(app.lang === "he" ? "he-IL" : "en-GB", { hourCycle: "h23" }) : d.value)}</span>` : ""}</span></div>`;
  };
  return `<div class="panel" id="sc-sources"><h2 style="margin-block-start:0">${esc(t("sc_sources"))}</h2><p class="muted small">${esc(t("sc_sources_note"))}</p>
    ${SOURCE_KEYS.map(([k, p]) => pick(k, p)).join("")}
    <button class="btn" data-act="sc-src-save">${esc(t("sc_src_check"))}</button></div>`;
}

function upcomingHTML(app, fmt) {
  const s = scState(app), { t } = app, det = s.sources?.detail || {};
  const times = ["candle_lighting", "havdalah"].filter((k) => det[k]?.status === "ok" && det[k].value);
  if (!s.upcoming.length && !times.length) return "";
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("sc_upcoming"))}</h2>
    ${times.length ? `<p><b>${esc(t("sc_times"))}:</b> ${times.map((k) => `${esc(t(`sc_ev_${k}`))} – ${esc(fmt(det[k].value))}`).join(" · ")}</p>` : ""}
    <div class="elist">${s.upcoming.map((u) => `<div class="erow"><div class="meta"><div class="nm">${esc(fmt(u.at))} · ${esc(u.name)}</div>
      ${u.actions ? `<div class="id">${esc(u.actions.map((a) => `${app._invMap.get(a.entity_id)?.name || a.entity_id} → ${t(a.state)}${a.brightness_pct ? ` ${a.brightness_pct}%` : ""}`).join(", "))}</div>` : ""}</div></div>`).join("")}</div></div>`;
}

function previewHTML(app, fmt) {
  const s = scState(app), { t } = app, p = s.preview;
  if (!p) return "";
  const x = p.scenarios[0];
  return `<div class="panel" role="status"><h3 style="margin-block-start:0">${esc(t("sc_preview_title"))}</h3>
    <p>${esc(x.next_run ? t("sc_next", { when: fmt(x.next_run) }) : t("sc_next_none"))}</p>
    ${(x.warnings || []).map((w) => `<p class="note small">${esc(t(`sc_w_${w}`))}</p>`).join("")}
    <p class="small">${esc(x.actions.map((a) => `${app._invMap.get(a.entity_id)?.name || a.entity_id} → ${t(a.state)}${a.brightness_pct ? ` ${a.brightness_pct}%` : ""}`).join(", "))}</p></div>`;
}

function logHTML(app, fmt) {
  const s = scState(app), { t } = app;
  if (!s.log) return `<div class="row"><button class="btn" data-act="sc-log">${esc(t("sc_log"))}</button></div>`;
  const note = (n) => (t(`sc_note_${n}`) !== `sc_note_${n}` ? t(`sc_note_${n}`) : n);
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("sc_log"))}</h2>${s.log.length ? `<div class="elist">${s.log.map((l) => `<div class="erow"><div class="meta">
    <div class="nm">${esc(fmt(l.at))} · ${esc(l.name || l.id)}</div><div class="id">${esc(l.reason === "catch-up" ? t("sc_reason_catchup") : l.reason === "restart" ? t("sc_reason_restart") : l.reason === "manual" ? t("sc_reason_manual") : l.reason)} · ${l.ran ? esc(l.ok ? t("ok") : t("failed")) : ""} ${esc(note(l.note))}</div></div></div>`).join("")}</div>` : `<p class="muted">${esc(t("sc_log_empty"))}</p>`}</div>`;
}

/** Read-only status for every household member (server: infinitix/scenarios/status). */
export function renderStatusPage(app) {
  const { t } = app, st = (app._scStatus ||= { loaded: false });
  if (!st.loaded && !st.loading) {
    st.loading = true;
    app.callWS({ type: "infinitix/scenarios/status" }).then((r) => Object.assign(st, r, { loaded: true, error: null }))
      .catch((e) => Object.assign(st, { loaded: true, error: e?.message || String(e), scenarios: [], upcoming: [], times: {} }))
      .finally(() => { st.loading = false; setTimeout(() => { app._scStatus = null; }, 60000); if (app._view.name === "status") app.render(); });
  }
  const fmt = (iso) => (iso ? `${new Intl.DateTimeFormat(locale(app.lang), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))}` : "");
  const times = Object.entries(st.times || {}).filter(([k, v]) => k !== "issur_melacha" && v.status === "ok" && v.value);
  return `<div class="page"><div class="row spread"><h1>${esc(t("sc_status_title"))}</h1>${app._isAdmin ? `<button class="btn" data-act="sc-open-edit">${esc(t("edit"))}</button>` : ""}</div>
    <p class="muted">${esc(t("sc_status_note"))}</p>
    ${st.error ? `<p class="note" role="alert">${esc(st.error)}</p>` : ""}
    ${!st.loaded ? `<p class="muted">…</p>` : ""}
    ${times.length ? `<div class="panel"><b>${esc(t("sc_times"))}</b><p>${times.map(([k, v]) => `${esc(t(`sc_ev_${k}`))}: ${esc(fmt(v.value))} (${esc(hebrewDate(new Date(v.value), app.lang))})`).join("<br>")}</p></div>` : ""}
    ${st.loaded && !(st.scenarios || []).length ? `<p class="muted">${esc(t("sc_empty"))}</p>` : ""}
    <div class="elist">${(st.scenarios || []).map((x) => `<div class="erow ${x.enabled ? "" : "off"}"><div class="meta"><div class="nm">${esc(x.name)}</div>
      <div class="id">${x.enabled && !x.locked ? esc(x.next_run ? t("sc_next", { when: fmt(x.next_run) }) : t("sc_next_none")) : esc(x.locked ? t("sc_locked") : t("off"))}${x.last_run ? ` · ${esc(t("sc_last", { when: fmt(x.last_run.at), res: x.last_run.ran ? (x.last_run.ok ? t("ok") : t("failed")) : (t(`sc_note_${x.last_run.note}`) !== `sc_note_${x.last_run.note}` ? t(`sc_note_${x.last_run.note}`) : x.last_run.note) }))}` : ""}</div>
      ${(x.warnings || []).map((w) => `<div class="note small">${esc(t(`sc_w_${w}`))}</div>`).join("")}</div></div>`).join("")}</div></div>`;
}

function triggerText(app, tr) {
  const { t } = app;
  if (tr.type === "time") return t("sc_at_time", { at: tr.at });
  const off = tr.offset_min ? (tr.offset_min > 0 ? t("sc_after", { n: tr.offset_min }) : t("sc_before", { n: -tr.offset_min })) : "";
  return `${t(`sc_ev_${tr.event}`)}${off ? ` ${off}` : ""}`;
}

function editor(app, d, dayName) {
  const { t } = app, tr = d.trigger;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;
  const ents = app._inv.entities.filter((e) => DOMAINS.includes(e.entity_id.split(".", 1)[0])).sort((a, b) => (a.name || a.entity_id).localeCompare(b.name || b.entity_id));
  const evKey = tr.type === "time" ? "time" : tr.event;
  return `<div class="panel" id="sc-editor"><h2 style="margin-block-start:0">${esc(d.isNew ? t("sc_new") : t("edit"))}</h2>
    <div class="field"><label class="label" for="sc-name">${esc(t("sc_name"))}</label><input id="sc-name" class="input" type="text" maxlength="80" value="${esc(d.name)}"></div>
    <div class="row"><div class="field"><label class="label" for="sc-trig">${esc(t("sc_when"))}</label>
      <select id="sc-trig" data-act="sc-trig">${[["time", t("sc_ev_time")], ["sunrise", t("sc_ev_sunrise")], ["sunset", t("sc_ev_sunset")], ["candle_lighting", t("sc_ev_candle_lighting")], ["havdalah", t("sc_ev_havdalah")]].map(([v, l]) => opt(v, l, evKey)).join("")}</select></div>
      ${tr.type === "time"
        ? `<div class="field"><label class="label" for="sc-at">${esc(t("sc_time"))}</label><input id="sc-at" class="input" type="time" value="${esc(tr.at)}" dir="ltr"></div>`
        : `<div class="field"><label class="label" for="sc-off">${esc(t("sc_offset"))}</label><input id="sc-off" class="input" type="number" min="-360" max="360" step="1" value="${tr.offset_min || 0}" dir="ltr" style="max-width:120px"></div>`}</div>
    ${tr.type === "time" ? "" : `<p class="muted small">${esc(t("sc_offset_hint"))}</p>`}
    <div class="field"><span class="label">${esc(t("sc_days"))}</span><div class="row">${[6, 0, 1, 2, 3, 4, 5].map((n) => `<label class="row"><input type="checkbox" class="chk" data-sc-day="${n}" ${d.days.includes(n) ? "checked" : ""}> ${esc(dayName(n))}</label>`).join("")}</div><p class="muted small">${esc(t("sc_days_hint"))}</p></div>
    <div class="field"><label class="label" for="sc-shabbat">${esc(t("sc_shabbat"))}</label><select id="sc-shabbat">${["any", "only", "not"].map((v) => opt(v, t(`sc_shabbat_${v}`), d.shabbat)).join("")}</select>
      <p class="muted small">${esc(t("sc_shabbat_hint"))}</p></div>
    <div class="field"><span class="label">${esc(t("sc_actions"))}</span>
      ${d.actions.map((a, i) => `<div class="row" data-ai="${i}"><span>${esc(app._invMap.get(a.entity_id)?.name || a.entity_id)} → <b>${esc(t(a.state))}</b></span>
        ${a.state === "on" && canDim(app, a.entity_id) ? `<label class="row small">${esc(t("sc_brightness"))} <input class="input" type="number" min="1" max="100" step="1" data-sc-bri="${i}" value="${a.brightness_pct || ""}" placeholder="—" dir="ltr" style="max-width:90px"></label>` : ""}
        <button class="btn" data-act="sc-act-del">${esc(t("remove"))}</button></div>`).join("")}
      <div class="row"><select id="sc-ent" aria-label="${esc(t("sc_device"))}"><option value="">${esc(t("sc_pick_device"))}</option>${ents.map((e) => opt(e.entity_id, e.name || e.entity_id, "")).join("")}</select>
        <select id="sc-state" aria-label="${esc(t("sc_state"))}">${opt("on", t("on"), d.state)}${opt("off", t("off"), d.state)}</select>
        <button class="btn" data-act="sc-act-add">${esc(t("add"))}</button></div></div>
    <div class="row"><div class="field"><label class="label" for="sc-catchup">${esc(t("sc_catchup"))}</label><input id="sc-catchup" class="input" type="number" min="0" max="720" step="5" value="${d.catchup_min || 0}" dir="ltr" style="max-width:120px"></div></div>
    <p class="muted small">${esc(t("sc_catchup_hint"))}</p>
    <label class="row"><input type="checkbox" class="chk" id="sc-restore" ${d.restore ? "checked" : ""}> ${esc(t("sc_restore"))}</label>
    <p class="muted small">${esc(t("sc_restore_hint"))}</p>
    ${d.error ? `<p class="note" role="alert">${esc(d.error)}</p>` : ""}
    <div class="row"><button class="btn" data-act="sc-preview">${esc(t("sc_preview"))}</button><button class="btn primary" data-act="sc-save" ${scState(app).busy ? "disabled" : ""}>${esc(t("save"))}</button><button class="btn" data-act="sc-cancel">${esc(t("cancel"))}</button></div></div>`;
}

/** Brightness only for lights that report a dimmable colour mode. */
function canDim(app, eid) {
  if (!eid.startsWith("light.")) return false;
  const modes = app._hass.states[eid]?.attributes.supported_color_modes || [];
  return modes.some((m) => m !== "onoff");
}

/** Copy the form values into the draft (called before every re-render and on save). */
function sync(app) {
  const s = scState(app), d = s.draft, q = (sel) => app._app.querySelector(sel);
  if (!d || !q("#sc-editor")) return;
  d.name = q("#sc-name").value;
  const ev = q("#sc-trig").value;
  if (ev === "time") d.trigger = { type: "time", at: q("#sc-at")?.value || d.trigger.at || "20:00" };
  else d.trigger = { type: ev === "sunrise" || ev === "sunset" ? "sun" : "jewish", event: ev, offset_min: Number(q("#sc-off")?.value) || 0 };
  d.days = [...app._app.querySelectorAll("[data-sc-day]")].filter((x) => x.checked).map((x) => Number(x.dataset.scDay));
  d.shabbat = q("#sc-shabbat").value;
  d.state = q("#sc-state").value;
  d.catchup_min = Math.max(0, Math.min(720, Math.round(Number(q("#sc-catchup")?.value) || 0)));
  d.restore = !!q("#sc-restore")?.checked;
  app._app.querySelectorAll("[data-sc-bri]").forEach((inp) => {
    const a = d.actions[Number(inp.dataset.scBri)], v = Math.round(Number(inp.value));
    if (!a) return;
    if (v >= 1 && v <= 100) a.brightness_pct = v; else delete a.brightness_pct;
  });
}

const payload = (list) => list.map(({ next_run, isNew, error, state, warnings, locked, ...x }) => x);

async function persist(app, list) {
  const s = scState(app);
  s.busy = true;
  try { apply(s, await app.callWS({ type: "infinitix/scenarios/save", scenarios: payload(list) })); s.error = null; return true; }
  catch (err) { s.error = err?.message || String(err); return false; }
  finally { s.busy = false; }
}

export async function scenariosAct(app, act, el) {
  const s = scState(app), { t } = app;
  const sid = el.closest("[data-sid]")?.dataset.sid;
  const find = () => s.list.find((x) => x.id === sid);
  switch (act) {
    case "sc-back": resetScenarios(app); return app._go({ name: "settings" });
    case "sc-new": s.preview = null; s.draft = { id: uid("sc"), name: "", enabled: true, trigger: { type: "time", at: "20:00" }, days: [], shabbat: "any", actions: [], state: "on", catchup_min: 0, restore: false, isNew: true }; return app.render();
    case "sc-open-edit": resetScenarios(app); return app._go({ name: "scenarios" });
    case "sc-log": {
      try { s.log = (await app.callWS({ type: "infinitix/scenarios/log", limit: 50 })).log; } catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
      return app.render();
    }
    case "sc-src-save": {
      const sources = {};
      for (const [k] of SOURCE_KEYS) { const v = app._app.querySelector(`#src-${k}`)?.value; if (v) sources[k] = v; }
      try { apply(s, await app.callWS({ type: "infinitix/scenarios/sources", sources })); app.toast(t("saved")); }
      catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
      return app.render();
    }
    case "sc-preview": {
      sync(app);
      const d = s.draft;
      if (!d.actions.length) { d.error = t("sc_need_action"); return app.render(); }
      try { s.preview = await app.callWS({ type: "infinitix/scenarios/preview", scenarios: payload([{ ...d, name: d.name.trim() || t("sc_new") }]) }); d.error = null; }
      catch (err) { d.error = err?.message || String(err); s.preview = null; }
      return app.render();
    }
    case "sc-tpl": {
      const tp = TEMPLATES[el.dataset.tpl];
      s.preview = null;
      s.draft = { id: uid("sc"), name: t(tp.name_key), enabled: true, trigger: { ...tp.trigger }, days: [...(tp.days || [])], shabbat: tp.shabbat || "any", actions: [], state: tp.state, catchup_min: 0, restore: false, isNew: true };
      return app.render();
    }
    case "sc-edit": { const x = find(); s.preview = null; s.draft = { ...JSON.parse(JSON.stringify(x)), state: x.actions[0]?.state || "on" }; return app.render(); }
    case "sc-cancel": s.draft = null; s.preview = null; return app.render();
    case "sc-trig": sync(app); return app.render();
    case "sc-act-add": {
      sync(app);
      const eid = app._app.querySelector("#sc-ent").value;
      if (eid && !s.draft.actions.some((a) => a.entity_id === eid)) s.draft.actions.push({ entity_id: eid, state: s.draft.state });
      return app.render();
    }
    case "sc-act-del": sync(app); s.draft.actions.splice(Number(el.closest("[data-ai]").dataset.ai), 1); return app.render();
    case "sc-save": {
      sync(app);
      const d = s.draft;
      if (!d.actions.length) { d.error = t("sc_need_action"); return app.render(); }
      const item = { ...d, name: d.name.trim() || t("sc_new") };
      const list = d.isNew ? [...s.list, item] : s.list.map((x) => (x.id === d.id ? { ...item, last_run: x.last_run } : x));
      if (await persist(app, list)) { s.draft = null; s.preview = null; app.toast(t("sc_saved")); } else d.error = s.error;
      return app.render();
    }
    case "sc-toggle": {
      const x = find(); if (!x) return;
      if (!(await persist(app, s.list.map((y) => (y.id === sid ? { ...y, enabled: el.checked } : y))))) app.toast(s.error, true);
      return app.render();
    }
    case "sc-del": {
      const r = await app._confirm(t("sc_confirm_delete"), { danger: true });
      if (!r.ok) return;
      await persist(app, s.list.filter((y) => y.id !== sid));
      return app.render();
    }
    case "sc-run": {
      const r = await app._confirm(t("sc_confirm_run"), { danger: false });
      if (!r.ok) return;
      try {
        const res = await app.callWS({ type: "infinitix/scenarios/run", scenario_id: sid });
        app.toast(res.last_run.ok ? t("sc_ran") : `${t("failed")}: ${res.last_run.note}`, !res.last_run.ok);
      } catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
      return load(app);
    }
  }
}
