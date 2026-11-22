// Scenarios: an easy three-step builder (what -> when -> finish), ready-made ideas that tick the
// matching devices for you, and one-tap buttons on the home screen.
//
// Scenarios run inside Home Assistant (server side), so they work with the panel closed.  This
// page only edits them; run times shown come from the server.  The OPS table below mirrors the
// server allow-list in scenario_ops.py (the server validates again and is the authority).

import { esc, locale, uid } from "./util.js";
import { translateState } from "./cards.js";
import { UNASSIGNED, isIncluded, roomName } from "./logic.js";
import { byOrder } from "./util.js";

// domain -> allowed ops, first one is the default
const OPS = {
  light: ["on", "off"], switch: ["on", "off"], fan: ["on", "off"], input_boolean: ["on", "off"],
  cover: ["open", "close", "stop"], climate: ["off", "cool", "heat", "auto", "temperature"],
  media_player: ["on", "off"], lock: ["lock"], vacuum: ["start", "dock"], scene: ["activate"], script: ["activate"],
};
const DOMAIN_ORDER = ["light", "switch", "fan", "cover", "climate", "media_player", "lock", "vacuum", "scene", "script", "input_boolean"];
const dom = (eid) => eid.split(".", 1)[0];
const ICONS = ["✨", "🏠", "🚪", "🌅", "🌙", "🎬", "🎉", "✈️", "🕯️", "💡", "🔒", "❄️"];

const LIVING = /סלון|living|lounge|salon|гостин/i;
const ENTRY = /כניסה|מבואה|entry|hall|foyer|прихож/i;

// Ready-made ideas.  `rules` pick devices from the user's own inventory by domain and room name;
// outlets/switches are never ticked automatically (an outlet may power a fridge).
const TEMPLATES = {
  leave: { icon: "🚪", trigger: { type: "manual" }, dashboard: true, rules: [{ d: "light", op: "off" }, { d: "fan", op: "off" }, { d: "media_player", op: "off" }, { d: "climate", op: "off" }, { d: "lock", op: "lock" }] },
  arrive: { icon: "🏠", trigger: { type: "manual" }, dashboard: true, rules: [{ d: "light", op: "on", room: [ENTRY, LIVING] }] },
  morning: { icon: "🌅", trigger: { type: "time", at: "07:00" }, rules: [{ d: "cover", op: "open" }] },
  night: { icon: "🌙", trigger: { type: "time", at: "23:30" }, rules: [{ d: "light", op: "off" }, { d: "cover", op: "close" }, { d: "lock", op: "lock" }] },
  movie: { icon: "🎬", trigger: { type: "manual" }, dashboard: true, rules: [{ d: "light", op: "off", room: [LIVING] }, { d: "cover", op: "close", room: [LIVING] }, { d: "media_player", op: "on", room: [LIVING] }] },
  guests: { icon: "🎉", trigger: { type: "manual" }, dashboard: true, rules: [{ d: "light", op: "on", value: 70, room: [LIVING, ENTRY] }] },
  vacation: { icon: "✈️", trigger: { type: "manual" }, dashboard: true, rules: [{ d: "light", op: "off" }, { d: "fan", op: "off" }, { d: "media_player", op: "off" }, { d: "climate", op: "off" }, { d: "lock", op: "lock" }] },
  shabbat_in: { icon: "🕯️", trigger: { type: "jewish", event: "candle_lighting", offset_min: 0 }, rules: [{ d: "light", op: "on" }] },
  shabbat_out: { icon: "🕯️", trigger: { type: "jewish", event: "havdalah", offset_min: 0 }, rules: [{ d: "light", op: "off" }] },
  sunset: { icon: "💡", trigger: { type: "sun", event: "sunset", offset_min: 0 }, rules: [{ d: "light", op: "on" }] },
  sunrise: { icon: "💡", trigger: { type: "sun", event: "sunrise", offset_min: 0 }, rules: [{ d: "light", op: "off" }] },
};

const fresh = () => ({ loaded: false, loading: false, list: [], sources: {}, draft: null, error: null, busy: false });
export const scState = (app) => (app._sc ||= fresh());
export const resetScenarios = (app) => { app._sc = fresh(); app._quick = null; };

const apply = (s, r) => { s.list = r.scenarios; s.sources = r.sources; };

async function load(app) {
  const s = scState(app);
  s.loading = true;
  try { apply(s, await app.callWS({ type: "infinitix/scenarios/list" })); s.loaded = true; }
  catch (err) { s.error = err?.message || String(err); }
  s.loading = false;
  app.render();
}

/** Hebrew-calendar date (Intl's built-in calendar; the day changes at midnight, not at sunset). */
export const hebrewDate = (d, lang) => new Intl.DateTimeFormat(`${lang === "he" ? "he" : lang === "ru" ? "ru" : "en"}-u-ca-hebrew`, { day: "numeric", month: "long", year: "numeric" }).format(d);

// ------------------------------------------------------------------ devices
const cfgOf = (app) => (app._view?.name === "wizard" && app._previewCfg) || app._cfg;

function devName(app, eid) {
  return app._hass.states[eid]?.attributes?.friendly_name || app._invMap.get(eid)?.name || app._invMap.get(eid)?.original_name || eid;
}

/** Entities a scenario may control, limited to what is on the dashboard. */
function candidates(app) {
  const cfg = cfgOf(app), any = cfg && Object.keys(cfg.entities || {}).length > 0;
  return app._inv.entities.filter((e) => OPS[dom(e.entity_id)] && (any ? isIncluded(cfg, e.entity_id) : !e.default_hidden));
}

const roomOf = (app, eid) => cfgOf(app)?.entities?.[eid]?.room || UNASSIGNED;

function roomsWithDevices(app) {
  const cfg = cfgOf(app), list = candidates(app), by = new Map();
  for (const e of list) { const r = roomOf(app, e.entity_id); (by.get(r) || by.set(r, []).get(r)).push(e); }
  const rooms = [...(cfg?.rooms || [])].sort(byOrder).filter((r) => by.has(r.id));
  if (by.has(UNASSIGNED) && !rooms.some((r) => r.id === UNASSIGNED)) rooms.push({ id: UNASSIGNED, name: null });
  return rooms.map((r) => ({
    room: r, name: roomName(r, app.t),
    items: by.get(r.id).sort((a, b) => DOMAIN_ORDER.indexOf(dom(a.entity_id)) - DOMAIN_ORDER.indexOf(dom(b.entity_id)) || devName(app, a.entity_id).localeCompare(devName(app, b.entity_id))),
  }));
}

function applyRules(app, rules) {
  const out = [];
  for (const group of roomsWithDevices(app)) {
    for (const e of group.items) {
      const rule = rules.find((r) => r.d === dom(e.entity_id) && (!r.room || r.room.some((rx) => rx.test(group.name))));
      if (rule) out.push(rule.value ? { entity_id: e.entity_id, op: rule.op, value: rule.value } : { entity_id: e.entity_id, op: rule.op });
    }
  }
  return out;
}

// ------------------------------------------------------------------ text helpers
function triggerText(app, tr) {
  const { t } = app;
  if (tr.type === "manual") return t("sc_ev_manual");
  if (tr.type === "time") return t("sc_at_time", { at: tr.at });
  if (tr.type === "state") {
    const mode = t(`sc_st_${tr.mode}`), val = tr.mode === "equals" ? (translateState(t, tr.value) ?? tr.value) : tr.value;
    return t("sc_ev_state_text", { dev: devName(app, tr.entity_id), mode, value: val });
  }
  const off = tr.offset_min ? (tr.offset_min > 0 ? t("sc_after", { n: tr.offset_min }) : t("sc_before", { n: -tr.offset_min })) : "";
  return `${t(`sc_ev_${tr.event}`)}${off ? ` ${off}` : ""}`;
}

const dayName = (app, d) => new Intl.DateTimeFormat(locale(app.lang), { weekday: "short" }).format(new Date(2024, 0, 1 + d));
const actionText = (app, a) => {
  const { t } = app, v = a.value != null ? ` ${a.value}${a.op === "temperature" ? "°" : "%"}` : "";
  return `${devName(app, a.entity_id)} → ${t(`scop_${a.op}`)}${v}`;
};

export const scenarioSummaryText = (app, d) => summary(app, d);

function summary(app, d) {
  const { t } = app;
  let when = triggerText(app, d.trigger);
  if (d.days.length) when += ` · ${d.days.map((n) => dayName(app, n)).join(" ")}`;
  if (d.shabbat !== "any") when += ` · ${t(`sc_shabbat_${d.shabbat}`)}`;
  const names = d.actions.slice(0, 4).map((a) => devName(app, a.entity_id)).join(", ");
  const more = d.actions.length > 4 ? ` ${t("sc_sum_more", { n: d.actions.length - 4 })}` : "";
  return `${when}. ${t("sc_sum_do", { n: d.actions.length, list: names + more })}`;
}

// ------------------------------------------------------------------ page (settings → scenarios)
export function renderScenariosPage(app) {
  return `<div class="page"><div class="row spread"><h1>${esc(app.t("sc_title"))}</h1><button class="btn" data-act="sc-back">${esc(app.t("back"))}</button></div>${renderScenariosBody(app)}</div>`;
}

/** Page body, also used by wizard step 5. */
export function renderScenariosBody(app) {
  const s = scState(app), { t } = app;
  if (!s.loaded && !s.loading) load(app);
  const fmt = (iso) => (iso ? `${new Intl.DateTimeFormat(locale(app.lang), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))} (${hebrewDate(new Date(iso), app.lang)})` : null);
  const needJewish = s.list.some((x) => x.trigger.type === "jewish") || s.draft?.trigger.type === "jewish";
  let html = s.error ? `<p class="note" role="alert">${esc(s.error)}</p>` : "";
  if (needJewish && s.loaded && !s.sources.candle_lighting) html += `<p class="note" role="alert">${esc(t("sc_need_jewish"))}</p>`;
  if (s.draft) return html + builder(app, s.draft);

  html += `<div class="panel"><h2 style="margin-block-start:0">${esc(t("sc_start_h"))}</h2><p class="muted">${esc(t("sc_start_hint"))}</p>
    <div class="tpl-grid">${Object.entries(TEMPLATES).map(([k, tp]) => `<button class="tpl" data-act="sc-tpl" data-tpl="${k}"><span class="tpl-ic" aria-hidden="true">${tp.icon}</span><b>${esc(t(`tpl_${k}`))}</b><span class="muted small">${esc(t(`tpl_${k}_d`))}</span></button>`).join("")}
      <button class="tpl scratch" data-act="sc-new"><span class="tpl-ic" aria-hidden="true">＋</span><b>${esc(t("sc_scratch"))}</b><span class="muted small">${esc(t("sc_scratch_d"))}</span></button></div>
    <p class="muted small">${esc(t("sc_today", { greg: new Intl.DateTimeFormat(locale(app.lang), { weekday: "long", day: "numeric", month: "long" }).format(new Date()), heb: hebrewDate(new Date(), app.lang) }))}</p></div>`;
  html += s.list.length ? `<h2>${esc(t("sc_my"))}</h2>` : (s.loaded ? `<p class="muted">${esc(t("sc_empty"))}</p>` : "");
  html += `<div class="elist">${s.list.map((x) => {
    const nxt = fmt(x.next_run), last = x.last_run;
    const lastRes = last ? (last.ran ? (last.ok ? t("ok") : t("failed")) : (t(`sc_note_${last.note}`) !== `sc_note_${last.note}` ? t(`sc_note_${last.note}`) : last.note)) : "";
    return `<div class="erow ${x.enabled ? "" : "off"}" data-sid="${esc(x.id)}"><label class="row"><input type="checkbox" class="chk" data-act="sc-toggle" ${x.enabled ? "checked" : ""} aria-label="${esc(t("sc_enabled"))}"></label>
      <div class="meta"><div class="nm">${x.icon ? `<span aria-hidden="true">${esc(x.icon)}</span> ` : ""}${esc(x.name)}${x.dashboard ? ` <span class="muted small">· ${esc(t("sc_home_title"))}</span>` : ""}</div>
      <div class="id">${esc(summary(app, x))}</div>
      <div class="id">${x.enabled && nxt ? esc(t("sc_next", { when: nxt })) : ""}${last ? `${x.enabled && nxt ? " · " : ""}${esc(t("sc_last", { when: fmt(last.at), res: lastRes }))}` : ""}</div></div>
      <div class="acts"><button class="btn" data-act="sc-run">${esc(t("sc_run_now"))}</button><button class="btn" data-act="sc-edit">${esc(t("edit"))}</button><button class="btn danger" data-act="sc-del">${esc(t("remove"))}</button></div></div>`;
  }).join("")}</div>`;
  return html;
}

// ------------------------------------------------------------------ the builder
function builder(app, d) {
  const { t } = app;
  const steps = [t("sc_s1"), t("sc_s2"), t("sc_s3")];
  const bar = `<ol class="sc-steps" aria-label="${esc(t("sc_step_of", { n: d.step }))}">${steps.map((l, i) => `<li ${d.step === i + 1 ? 'aria-current="step"' : ""} class="${d.step > i + 1 ? "done" : ""}"><span>${i + 1}</span>${esc(l)}</li>`).join("")}</ol>`;
  const body = d.step === 1 ? stepWhat(app, d) : d.step === 2 ? stepWhen(app, d) : stepFinish(app, d);
  const last = d.step === 3, busy = scState(app).busy;
  return `<div class="panel" id="sc-editor">${bar}${body}
    ${d.error ? `<p class="note" role="alert">${esc(d.error)}</p>` : ""}
    <div class="row sc-nav"><button class="btn" data-act="${d.step === 1 ? "sc-cancel" : "sc-prev"}">${esc(d.step === 1 ? t("cancel") : t("back"))}</button>
      ${last ? `<button class="btn" data-act="sc-save" ${busy ? "disabled" : ""}>${esc(t("save"))}</button><button class="btn primary" data-act="sc-save-run" ${busy ? "disabled" : ""}>${esc(t("sc_save_run"))}</button>`
        : `<button class="btn primary" data-act="sc-next">${esc(t("sc_continue"))}</button>`}</div></div>`;
}

function stepWhat(app, d) {
  const { t } = app, groups = roomsWithDevices(app), pick = (eid) => d.actions.find((a) => a.entity_id === eid);
  if (!groups.length) return `<h2 style="margin-block-start:0">${esc(t("sc_s1_h"))}</h2><div class="empty">${esc(t("sc_no_devices"))}</div>`;
  return `<h2 style="margin-block-start:0">${esc(t("sc_s1_h"))}</h2><p class="muted">${esc(t("sc_s1_hint"))} <b>${esc(t("sc_selected", { n: d.actions.length }))}</b></p>
    ${groups.map((g) => {
      const n = g.items.filter((e) => pick(e.entity_id)).length;
      const open = d.open ? d.open.includes(g.room.id) || n > 0 : n > 0 || groups.length === 1;
      return `<details class="sc-room" data-room="${esc(g.room.id)}" ${open ? "open" : ""}><summary>${esc(g.name)} <span class="muted small">${n ? `· ${esc(t("sc_selected", { n }))}` : ""}</span></summary>
        ${g.items.map((e) => deviceRow(app, e, pick(e.entity_id))).join("")}</details>`;
    }).join("")}
    <p class="muted small">${esc(t("sc_safety_note"))}</p>`;
}

function deviceRow(app, e, a) {
  const { t } = app, eid = e.entity_id, d = dom(eid), ops = OPS[d];
  const name = esc(devName(app, eid));
  let extra = "";
  if (a && d === "light" && a.op === "on") extra = `<label class="sc-val"><span class="muted small">${esc(t("sc_brightness"))}</span><input class="input" type="number" min="1" max="100" step="1" inputmode="numeric" dir="ltr" data-sc-val="${esc(eid)}" value="${a.value ?? ""}" placeholder="—"></label>`;
  if (a && d === "climate" && a.op === "temperature") extra = `<label class="sc-val"><span class="muted small">${esc(t("sc_degrees"))}</span><input class="input" type="number" min="5" max="35" step="0.5" inputmode="decimal" dir="ltr" data-sc-val="${esc(eid)}" value="${a.value ?? 22}"></label>`;
  return `<div class="sc-dev ${a ? "on" : ""}" data-eid="${esc(eid)}"><label class="row"><input type="checkbox" class="chk" data-act="sc-pick" ${a ? "checked" : ""}><span class="sc-dn">${name}</span></label>
    ${a ? `<div class="sc-ops" role="group" aria-label="${name}">${ops.map((o) => `<button class="chip" data-act="sc-op" data-op="${o}" aria-pressed="${a.op === o}">${esc(t(`scop_${o}`))}</button>`).join("")}</div>${extra}` : ""}</div>`;
}

const WHEN = [["manual", "sc_ev_manual", "sc_ev_manual_d", "👆"], ["time", "sc_ev_time", null, "⏰"], ["sunrise", "sc_ev_sunrise", null, "🌅"], ["sunset", "sc_ev_sunset", null, "🌇"],
  ["candle_lighting", "sc_ev_candle_lighting", null, "🕯️"], ["havdalah", "sc_ev_havdalah", null, "✨"], ["state", "sc_ev_state", "sc_ev_state_d", "📡"]];
const whenKind = (tr) => (tr.type === "sun" || tr.type === "jewish" ? tr.event : tr.type);

function stepWhen(app, d) {
  const { t } = app, tr = d.trigger, kind = whenKind(tr);
  let detail = "";
  if (kind === "time") detail = `<div class="field"><label class="label" for="sc-at">${esc(t("sc_time"))}</label><input id="sc-at" class="input" type="time" value="${esc(tr.at)}" dir="ltr" style="max-width:160px"></div>`;
  else if (tr.type === "sun" || tr.type === "jewish") {
    const o = tr.offset_min || 0;
    detail = `<div class="field"><span class="label">${esc(t("sc_off_label"))}</span><div class="row">${[-30, -15, 0, 15, 30].map((n) => `<button class="chip" data-act="sc-offp" data-n="${n}" aria-pressed="${o === n}">${esc(n === 0 ? t("sc_exact") : n > 0 ? t("sc_after", { n }) : t("sc_before", { n: -n }))}</button>`).join("")}
      <input id="sc-off" class="input" type="number" min="-360" max="360" step="1" value="${o}" dir="ltr" style="max-width:100px" aria-label="${esc(t("sc_offset"))}"></div><p class="muted small">${esc(t("sc_offset_hint"))}</p></div>`;
  } else if (kind === "state") {
    const cfg = cfgOf(app), ents = app._inv.entities.filter((e) => !e.default_hidden && (!cfg || !Object.keys(cfg.entities || {}).length || isIncluded(cfg, e.entity_id)))
      .sort((a, b) => devName(app, a.entity_id).localeCompare(devName(app, b.entity_id)));
    const vals = ["on", "off", "open", "closed", "locked", "unlocked", "home", "not_home"];
    detail = `<div class="field"><label class="label" for="sc-sent">${esc(t("sc_st_becomes"))}</label><select id="sc-sent"><option value="">${esc(t("sc_st_pick"))}</option>${ents.map((e) => `<option value="${esc(e.entity_id)}" ${tr.entity_id === e.entity_id ? "selected" : ""}>${esc(devName(app, e.entity_id))}</option>`).join("")}</select></div>
      <div class="row"><select id="sc-smode" aria-label="${esc(t("sc_st_becomes"))}">${["equals", "above", "below"].map((m) => `<option value="${m}" ${tr.mode === m ? "selected" : ""}>${esc(t(`sc_st_${m}`))}</option>`).join("")}</select>
      ${tr.mode === "equals" ? `<select id="sc-sval" aria-label="${esc(t("sc_st_value"))}">${vals.map((v) => `<option value="${v}" ${tr.value === v ? "selected" : ""}>${esc(translateState(t, v) ?? v)}</option>`).join("")}</select>`
        : `<input id="sc-sval" class="input" type="number" step="any" dir="ltr" value="${esc(tr.value)}" aria-label="${esc(t("sc_st_value"))}" style="max-width:120px">`}</div>`;
  }
  const dayChips = [6, 0, 1, 2, 3, 4, 5].map((n) => `<button class="chip" data-act="sc-day" data-n="${n}" aria-pressed="${d.days.includes(n)}">${esc(dayName(app, n))}</button>`).join("");
  const opts = tr.type === "manual" ? "" : `<details class="sc-more" ${d.days.length || d.shabbat !== "any" ? "open" : ""}><summary>${esc(t("sc_more_opts"))}</summary>
    <div class="field"><span class="label">${esc(t("sc_days"))}</span><div class="row">${dayChips}</div><p class="muted small">${esc(t("sc_days_hint"))}</p></div>
    <div class="field"><span class="label">${esc(t("sc_shabbat"))}</span><div class="row">${["any", "only", "not"].map((v) => `<button class="chip" data-act="sc-shab" data-v="${v}" aria-pressed="${d.shabbat === v}">${esc(t(`sc_shabbat_${v}`))}</button>`).join("")}</div>
      <p class="muted small">${esc(t("sc_shabbat_hint"))}</p></div></details>`;
  return `<h2 style="margin-block-start:0">${esc(t("sc_s2_h"))}</h2>
    <div class="choice-grid">${WHEN.map(([k, label, desc, ic]) => `<button class="choice" data-act="sc-when" data-kind="${k}" aria-pressed="${kind === k}"><span aria-hidden="true" style="font-size:1.4em">${ic}</span><b>${esc(t(label))}</b>${desc ? `<span class="muted small">${esc(t(desc))}</span>` : ""}</button>`).join("")}</div>
    ${detail ? `<div style="margin-block-start:16px">${detail}</div>` : ""}${opts}`;
}

function stepFinish(app, d) {
  const { t } = app;
  return `<h2 style="margin-block-start:0">${esc(t("sc_s3_h"))}</h2>
    <div class="field"><label class="label" for="sc-name">${esc(t("sc_name"))}</label><input id="sc-name" class="input" type="text" maxlength="80" value="${esc(d.name)}"></div>
    <div class="field"><span class="label">${esc(t("sc_icon"))}</span><div class="row">${ICONS.map((i) => `<button class="chip ic" data-act="sc-icon" data-ic="${i}" aria-pressed="${d.icon === i}" aria-label="${i}">${i}</button>`).join("")}</div></div>
    <label class="row sc-dashrow"><input id="sc-dash" type="checkbox" class="chk" ${d.dashboard ? "checked" : ""}><span><b>${esc(t("sc_show_dash"))}</b><br><span class="muted small">${esc(t("sc_show_dash_d"))}</span></span></label>
    <div class="sc-summary"><b>${esc(t("sc_summary"))}</b><p>${esc(summary(app, d))}</p>
      <ul class="small">${d.actions.map((a) => `<li>${esc(actionText(app, a))}</li>`).join("")}</ul></div>`;
}

/** Copy the visible form values into the draft (called before every re-render and step change). */
function sync(app) {
  const d = scState(app).draft, root = app._app.querySelector("#sc-editor");
  if (!d || !root) return;
  const q = (sel) => root.querySelector(sel);
  if (d.step === 1) {
    d.open = [...root.querySelectorAll("details.sc-room[open]")].map((x) => x.dataset.room);
    root.querySelectorAll("[data-sc-val]").forEach((inp) => {
      const a = d.actions.find((x) => x.entity_id === inp.dataset.scVal);
      if (!a) return;
      const n = inp.value === "" ? null : Number(inp.value);
      if (n == null || Number.isNaN(n)) delete a.value; else a.value = n;
    });
  } else if (d.step === 2) {
    const tr = d.trigger;
    if (tr.type === "time" && q("#sc-at")) tr.at = q("#sc-at").value || tr.at;
    if ((tr.type === "sun" || tr.type === "jewish") && q("#sc-off")) tr.offset_min = Math.max(-360, Math.min(360, Math.round(Number(q("#sc-off").value) || 0)));
    if (tr.type === "state") {
      if (q("#sc-sent")) tr.entity_id = q("#sc-sent").value;
      if (q("#sc-smode")) tr.mode = q("#sc-smode").value;
      if (q("#sc-sval")) tr.value = q("#sc-sval").value;
    }
  } else if (d.step === 3) {
    if (q("#sc-name")) d.name = q("#sc-name").value;
    if (q("#sc-dash")) d.dashboard = q("#sc-dash").checked;
  }
}

/** A scenario as the server stores it (no UI-only fields). */
const clean = (d) => ({ id: d.id, name: d.name, enabled: d.enabled, trigger: d.trigger, days: d.days, shabbat: d.shabbat, actions: d.actions, dashboard: !!d.dashboard, icon: d.icon || "" });

async function persist(app, list) {
  const s = scState(app);
  s.busy = true;
  try { apply(s, await app.callWS({ type: "infinitix/scenarios/save", scenarios: list.map(clean) })); s.error = null; app._quick = null; return true; }
  catch (err) { s.error = err?.message || String(err); return false; }
  finally { s.busy = false; }
}

const newDraft = (app, over = {}) => ({ id: uid("sc"), name: "", enabled: true, trigger: { type: "manual" }, days: [], shabbat: "any", actions: [], dashboard: false, icon: "", step: 1, isNew: true, ...over });

function validStep(app, d) {
  const { t } = app;
  if (d.step === 1 && !d.actions.length) return t("sc_need_action");
  if (d.step === 1 && d.actions.some((a) => a.op === "temperature" && a.value == null)) return t("sc_need_action");
  if (d.step === 2 && d.trigger.type === "state" && (!d.trigger.entity_id || d.trigger.value === "" || d.trigger.value == null)) return t("sc_need_state");
  return "";
}

async function runScenario(app, sid) {
  const { t } = app;
  try {
    const res = await app.callWS({ type: "infinitix/scenarios/run", scenario_id: sid });
    app.toast(res.last_run.ok ? t("sc_ran") : `${t("failed")}: ${res.last_run.note}`, !res.last_run.ok);
  } catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
}

export async function scenariosAct(app, act, el) {
  const s = scState(app), { t } = app;
  if (act === "sc-quick") return quickRun(app, el);
  if (act === "sc-quick-new") { resetScenarios(app); scState(app).draft = null; return app._go({ name: "scenarios" }); }
  if (act === "sc-back") { resetScenarios(app); return app._go({ name: "settings" }); }
  const sid = el.closest("[data-sid]")?.dataset.sid;
  const find = () => s.list.find((x) => x.id === sid);
  const d = s.draft;
  if (d) sync(app);
  switch (act) {
    case "sc-new": s.draft = newDraft(app); return app.render();
    case "sc-tpl": {
      const tp = TEMPLATES[el.dataset.tpl];
      s.draft = newDraft(app, { name: t(`tpl_${el.dataset.tpl}`), icon: tp.icon, trigger: JSON.parse(JSON.stringify(tp.trigger)), dashboard: !!tp.dashboard, actions: applyRules(app, tp.rules) });
      return app.render();
    }
    case "sc-edit": { const x = find(); s.draft = { ...JSON.parse(JSON.stringify(x)), step: 1, isNew: false }; return app.render(); }
    case "sc-cancel": s.draft = null; return app.render();
    case "sc-next": {
      const err = validStep(app, d);
      if (err) { d.error = err; return app.render(); }
      d.error = ""; d.step += 1;
      if (d.step === 3 && !d.name.trim()) d.name = "";
      return app.render();
    }
    case "sc-prev": d.error = ""; d.step -= 1; return app.render();
    case "sc-pick": {
      const eid = el.closest("[data-eid]").dataset.eid;
      if (el.checked) d.actions.push({ entity_id: eid, op: OPS[dom(eid)][0] });
      else d.actions = d.actions.filter((a) => a.entity_id !== eid);
      return app.render();
    }
    case "sc-op": {
      const a = d.actions.find((x) => x.entity_id === el.closest("[data-eid]").dataset.eid);
      a.op = el.dataset.op;
      if (a.op === "temperature") a.value = a.value ?? 22; else delete a.value;
      return app.render();
    }
    case "sc-when": {
      const k = el.dataset.kind, keepOff = d.trigger.offset_min || 0;
      d.trigger = k === "manual" ? { type: "manual" } : k === "time" ? { type: "time", at: d.trigger.at || "20:00" }
        : k === "state" ? { type: "state", entity_id: "", mode: "equals", value: "on" }
        : k === "sunrise" || k === "sunset" ? { type: "sun", event: k, offset_min: keepOff } : { type: "jewish", event: k, offset_min: keepOff };
      if (k === "manual") { d.days = []; d.shabbat = "any"; }
      return app.render();
    }
    case "sc-offp": d.trigger.offset_min = Number(el.dataset.n); return app.render();
    case "sc-day": { const n = Number(el.dataset.n); d.days = d.days.includes(n) ? d.days.filter((x) => x !== n) : [...d.days, n]; return app.render(); }
    case "sc-shab": d.shabbat = el.dataset.v; return app.render();
    case "sc-icon": d.icon = d.icon === el.dataset.ic ? "" : el.dataset.ic; return app.render();
    case "sc-save":
    case "sc-save-run": {
      const err = validStep(app, d);
      if (err) { d.error = err; return app.render(); }
      const item = { ...d, name: d.name.trim() || t("sc_new") };
      const list = d.isNew ? [...s.list, item] : s.list.map((x) => (x.id === d.id ? item : x));
      if (!(await persist(app, list))) { d.error = s.error; return app.render(); }
      s.draft = null;
      app.toast(t("sc_saved"));
      if (act === "sc-save-run") await runScenario(app, d.id);
      return load(app);
    }
    case "sc-toggle": {
      if (!find()) return;
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
      await runScenario(app, sid);
      return load(app);
    }
  }
}

// ------------------------------------------------------------------ home-screen buttons
/** Buttons for scenarios an admin flagged "show on the dashboard".  Visible to every user. */
export function quickHTML(app) {
  if (app._wiz || app._hass.__demo || !app._cfg) return "";
  const q = (app._quick ||= { loaded: false, loading: false, list: [], busy: null });
  const { t } = app;
  if (!q.loaded && !q.loading) {
    q.loading = true;
    app.callWS({ type: "infinitix/scenarios/quick_list" })
      .then((r) => { q.list = r.scenarios; }).catch(() => { q.list = []; })
      .finally(() => { q.loaded = true; q.loading = false; if (app._view.name === "home") app.render(); });
  }
  if (!q.loaded) return "";
  const admin = app._isAdmin;
  if (!q.list.length && !admin) return "";
  const tiles = q.list.map((x) => {
    const bad = x.last_run && x.last_run.ran && !x.last_run.ok;
    return `<button class="scn-tile ${q.busy === x.id ? "busy" : ""}" data-act="sc-quick" data-qid="${esc(x.id)}" ${q.busy ? "disabled" : ""}>
      <span class="scn-ic" aria-hidden="true">${esc(x.icon || "✨")}</span><span class="scn-nm">${esc(x.name)}</span>${bad ? `<span class="scn-bad" role="img" aria-label="${esc(t("failed"))}">!</span>` : ""}</button>`;
  }).join("");
  const add = admin ? (q.list.length
    ? `<button class="scn-tile add" data-act="sc-quick-new"><span class="scn-ic" aria-hidden="true">＋</span><span class="scn-nm">${esc(t("sc_home_add"))}</span></button>`
    : `<button class="scn-empty" data-act="sc-quick-new"><span class="scn-ic" aria-hidden="true">＋</span><span><b>${esc(t("sc_home_empty_t"))}</b><br><span class="muted small">${esc(t("sc_home_empty_d"))}</span></span></button>`) : "";
  return `<h2>${esc(t("sc_home_title"))}</h2><div class="scn-row">${tiles}${add}</div>`;
}

async function quickRun(app, el) {
  const q = app._quick, id = el.dataset.qid, { t } = app;
  if (!q || q.busy) return;
  q.busy = id; app.render();
  const name = q.list.find((x) => x.id === id)?.name || "";
  try {
    const res = await app.callWS({ type: "infinitix/scenarios/quick_run", scenario_id: id });
    app.toast(res.last_run.ok ? t("sc_quick_ran", { name }) : `${t("sc_quick_failed")}: ${res.last_run.note}`, !res.last_run.ok);
  } catch (err) { app.toast(`${t("sc_quick_failed")}: ${err?.message || err}`, true); }
  q.busy = null; q.loaded = false;
  app.render();
}
