// Nine-step setup wizard: home (name + language), rooms, add Matter/Zigbee devices, media players,
// scenarios, device review, cameras, customize, preview.
// The wizard edits a draft; nothing touches the live dashboard until "Save & open".
// Progress is saved to the server after every change so it survives a reload.

import { esc, clone, uid, moveItem, renumber } from "./util.js";
import { makeT, LANGUAGES } from "./i18n.js";
import { renderCameras, cameraField, resetCameras } from "./cameras.js";
import { renderPairing, resetPairing } from "./pairing.js";
import { renderMedia, resetMedia } from "./media.js";
import { renderAlarm, resetAlarm } from "./alarm.js";
import { renderScenariosBody, resetScenarios } from "./scenarios.js";
import { ROOM_ICONS, DEFAULT_CONFIG } from "./constants.js";
import { defaultLayoutForScreen } from "./layout.js";
import { UNASSIGNED, roomName, entitiesOfRoom, visibleEntities, isIncluded } from "./logic.js";
import { initPicker, renderPicker, renderPickerList, pickerAct, setField } from "./picker.js";
import { roomHTML } from "./dashboard.js";
import { dashboardHTML } from "./systems.js";
import { icon } from "./cards.js";

const TOTAL = 10;
const ROOMS_STEP = 1, REVIEW_STEP = 5;

// ------------------------------------------------------------------ draft helpers
export function ensureUnassigned(w) {
  for (const p of Object.values(w.entities)) {
    if (!p.room || (p.room !== UNASSIGNED && !w.rooms.some((r) => r.id === p.room))) p.room = UNASSIGNED;
  }
  const needed = Object.values(w.entities).some((p) => p.room === UNASSIGNED);
  if (needed && !w.rooms.some((r) => r.id === UNASSIGNED)) {
    w.rooms.push({ id: UNASSIGNED, area_id: null, name: null, icon: "mdi:help-circle-outline", order: w.rooms.length, visible: true });
  }
  return w;
}

/** Additive merge of an automatic proposal: never overrides what the user already has. */
export function mergeProposal(w, proposal, onlyIds) {
  const addRoom = (room) => {
    if (room && !w.rooms.some((r) => r.id === room.id)) w.rooms.push({ ...room, order: w.rooms.length });
  };
  if (!onlyIds) proposal.rooms.forEach(addRoom);
  for (const [eid, pref] of Object.entries(proposal.entities)) {
    if (w.entities[eid] || (onlyIds && !onlyIds.has(eid))) continue;
    if (pref.room && !w.rooms.some((r) => r.id === pref.room)) addRoom(proposal.rooms.find((r) => r.id === pref.room));
    w.entities[eid] = { ...pref };
  }
  for (const [rid, eid] of Object.entries(proposal.room_temp_sensor || {})) {
    if (!w.room_temp_sensor[rid] && w.rooms.some((r) => r.id === rid)) w.room_temp_sensor[rid] = eid;
  }
  if (!w.weather_entity && proposal.weather_entity) w.weather_entity = proposal.weather_entity;
  ensureUnassigned(w);
}

// ------------------------------------------------------------------ lifecycle
export function startWizard(app, { fresh = false } = {}) {
  const cfg = app._cfg;
  let work, step = 0;
  const saved = cfg.wizard?.draft;
  if (!cfg.wizard.completed && saved && saved.work) {
    work = saved.work;
    step = Math.min(cfg.wizard.step || 0, TOTAL - 1);
  } else if (cfg.wizard.completed) {
    work = clone(cfg); // re-opening keeps every customization
  } else {
    work = DEFAULT_CONFIG();
    work.home.language = app.lang;
    work.home.screen = app._narrow ? "mobile" : "tablet";
    work.theme.layout = defaultLayoutForScreen(work.home.screen); // the screen type picks the default layout
  }
  // Drafts saved by 0.3 have no 0.4 sections: fill them without touching anything else.
  work.display ||= { saver: { enabled: false, idle_min: 5, weather: true, agenda: true, calendars: [] } };
  work.pages ||= [];
  work.scenario_sources ||= {};
  delete work.wizard;
  work.wizard = { completed: false, step: 0, draft: {} };
  app._wiz = { step, work, scan: null, scanning: false, scanError: null, missing: [], saving: false, previewRoom: null, favq: "" };
  app._view = { name: "wizard" };
  initPicker(app);
  resetCameras(app); resetPairing(app); resetMedia(app); resetScenarios(app); resetAlarm(app);
  runScan(app); // areas and devices are needed from the rooms step on
}

let progressTimer = null;
function saveProgress(app, immediate = false) {
  clearTimeout(progressTimer);
  const go = () => {
    const wz = app._wiz;
    if (!wz || app._hass.__demoNoWS) return;
    const { wizard, ...rest } = wz.work;
    app.callWS({ type: "infinitix/save_wizard", step: wz.step, draft: { work: rest } }).catch(() => {});
  };
  immediate ? go() : (progressTimer = setTimeout(go, 700));
}

async function runScan(app) {
  const wz = app._wiz;
  wz.scanning = true; wz.scanError = null;
  app.render();
  try {
    const r = await app.callWS({ type: "infinitix/scan" });
    wz.scan = r;
    app._inv = r.inventory;
    app._rebuildInvMap();
    app._newSet = app._cfg.wizard.completed ? new Set(r.new_entities) : new Set();
    wz.missing = r.missing_entities;
    const w = wz.work;
    const ids = r.inventory.entities.map((e) => e.entity_id);
    if (w.mode !== "manual" && !Object.keys(w.entities).length && w.rooms.every((r) => r.id === UNASSIGNED)) mergeProposal(w, r.proposal, null);
    else if (wz.knownIds && w.mode !== "manual") mergeProposal(w, r.proposal, new Set(ids.filter((id) => !wz.knownIds.has(id)))); // devices paired during the wizard
    wz.knownIds = new Set(ids);
    saveProgress(app, true);
  } catch (err) {
    wz.scanError = err?.message || String(err);
  }
  wz.scanning = false;
  app.render();
}

function goStep(app, n) {
  const wz = app._wiz;
  wz.step = Math.max(0, Math.min(TOTAL - 1, n));
  ensureUnassigned(wz.work);
  if (wz.step === REVIEW_STEP && !wz.scanning) runScan(app); // pick up devices added in steps 3-4
  else if (wz.step >= 1 && !wz.scan && !wz.scanning) runScan(app);
  else app.render();
  saveProgress(app, true);
  app._app.querySelector(".content")?.scrollTo?.(0, 0);
}

async function finish(app) {
  const wz = app._wiz;
  const w = ensureUnassigned(clone(wz.work));
  w.wizard = { completed: true, step: 0, draft: {} };
  w.seen_entities = app._inv.entities.map((e) => e.entity_id); // everything offered so far
  wz.saving = true; app.render();
  try {
    const r = await app.callWS({ type: "infinitix/save_config", config: w });
    app._cfg = r.config;
    app._wiz = null;
    app._edit = false;
    app._view = { name: "home" };
    app.toast(app.t("ok"));
  } catch (err) {
    wz.saving = false;
    app.toast(`${app.t("save_failed")}: ${err?.message || err}`, true);
  }
  app.render();
}

// ------------------------------------------------------------------ rendering
const choice = (act, val, cur, title, desc = "", extra = "") =>
  `<button class="choice" data-act="${act}" data-val="${esc(val)}" aria-pressed="${val === cur}" ${extra}><b>${esc(title)}</b>${desc ? `<span class="muted small">${esc(desc)}</span>` : ""}</button>`;

export function renderWizard(app) {
  const wz = app._wiz, { t } = app, steps = t("wiz_steps");
  const body = [stepHome, stepRooms, stepPairing, stepMedia, stepScenarios, stepReview, stepCameras, stepAlarm, stepCustomize, stepPreview][wz.step](app, wz);
  const last = wz.step === TOTAL - 1;
  const nextDisabled = wz.saving || ((wz.step === ROOMS_STEP || wz.step === REVIEW_STEP) && (wz.scanning || !!wz.scanError || !wz.scan));
  return `<div class="page wiz">
    <div class="row spread"><h1>${esc(t("wiz_title"))}</h1><span class="muted small">${esc(t("wiz_step", { n: wz.step + 1, total: TOTAL }))} · ${esc(steps[wz.step])}</span></div>
    <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL}" aria-valuenow="${wz.step + 1}">${steps.map((_, i) => `<i class="${i < wz.step ? "done" : i === wz.step ? "now" : ""}"></i>`).join("")}</div>
    ${body}
    <div class="wiz-foot">
      <button class="btn" data-act="w-back" ${wz.step === 0 ? "disabled" : ""}>${esc(t("back"))}</button>
      <span class="muted small" style="align-self:center">${esc(t("progress_saved"))}</span>
      ${last ? `<button class="btn primary" data-act="w-finish" ${wz.saving ? "disabled" : ""}>${esc(wz.saving ? t("saving") : t("save_open"))}</button>`
             : `<button class="btn primary" data-act="w-next" ${nextDisabled ? "disabled" : ""}>${esc(t("next"))}</button>`}
    </div></div>`;
}

function stepHome(app, wz) {
  const { t } = app, h = wz.work.home;
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("wiz_welcome"))}</h2><p class="muted">${esc(t("wiz_welcome_sub"))}</p>
    <div class="field"><label class="label" for="homename">${esc(t("home_name"))}</label><input id="homename" class="input" data-field="w.home.name" value="${esc(h.name)}" maxlength="60"></div>
    <div class="field"><span class="label">${esc(t("lang_title"))}</span>
      <div class="choice-grid">${LANGUAGES.map(([code, label]) => choice("w-lang", code, h.language, label, "", `lang="${code}" dir="${code === "he" ? "rtl" : "ltr"}"`)).join("")}</div></div>
    <div class="field"><span class="label">${esc(t("screen_type"))}</span><div class="choice-grid">
      ${choice("w-screen", "mobile", h.screen, t("screen_mobile"))}${choice("w-screen", "tablet", h.screen, t("screen_tablet"))}${choice("w-screen", "desktop", h.screen, t("screen_desktop"))}</div></div></div>`;
}

const stepPairing = (app) => renderPairing(app);
const stepMedia = (app) => renderMedia(app);
const stepAlarm = (app) => renderAlarm(app);
const stepScenarios = (app) => renderScenariosBody(app);

function stepReview(app, wz) {
  return `${stepScan(app, wz)}${unassignedBlock(app, wz)}${stepDevices(app)}`;
}

function stepCameras(app) {
  return renderCameras(app);
}

function stepScan(app, wz) {
  const { t } = app;
  let html = `<div class="panel"><h2 style="margin-block-start:0">${esc(t("scan_title"))}</h2><p class="muted">${esc(t("scan_note"))}</p>`;
  if (wz.scanning) html += `<p>${esc(t("scanning"))}</p>`;
  if (wz.scanError) html += `<p class="note">${esc(t("scan_failed"))}: ${esc(wz.scanError)}</p><button class="btn" data-act="w-rescan">${esc(t("rescan"))}</button>`;
  if (wz.scan) {
    const s = wz.scan.inventory.summary;
    const stat = (n, label) => `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`;
    html += `<div class="stats">${stat(s.areas, t("s_areas"))}${stat(s.devices, t("s_devices"))}${stat(s.entities, t("s_entities"))}${stat(s.unassigned, t("s_unassigned"))}
      ${stat(s.hidden_by_default, t("s_hidden"))}${stat(s.disabled, t("s_disabled"))}${stat(s.without_registry, t("s_noreg"))}${stat(s.uncertain, t("s_uncertain"))}</div>
      <div class="row" style="margin-block-start:16px">`;
    const n = wz.scan.new_entities.length;
    if (app._cfg.wizard.completed && n) html += `<span class="badge ok">${esc(t("new_entities", { n }))}</span><button class="btn" data-act="w-add-new">${esc(t("add_new"))}</button>`;
    if (wz.missing.length) html += `<span class="badge warn">${esc(t("missing_entities", { n: wz.missing.length }))}</span>`;
    html += `<button class="btn" data-act="w-rescan">${esc(t("rescan"))}</button></div>`;
  }
  return html + `</div>`;
}

function stepRooms(app, wz) {
  const { t } = app, w = wz.work;
  const rooms = [...w.rooms].sort((a, b) => a.order - b.order);
  const usedAreas = new Set(w.rooms.map((r) => r.area_id).filter(Boolean));
  const freeAreas = (app._inv.areas || []).filter((a) => !usedAreas.has(a.id));
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("rooms_title"))}</h2><p class="muted">${esc(t("rooms_note"))}</p>
    <div class="row" style="margin-block-end:16px"><input id="new-room" class="input" style="flex:1 1 200px" maxlength="60" placeholder="${esc(t("room_create_ph"))}" aria-label="${esc(t("room_create_ph"))}">
      <button class="btn primary" data-act="w-room-create" ${wz.creatingRoom ? "disabled" : ""}>+ ${esc(t("room_create"))}</button></div>${wz.roomError ? `<p class="note" role="alert">${esc(wz.roomError)}</p>` : ""}
    <div class="elist">${rooms.map((r, i) => `<div class="erow" data-room="${esc(r.id)}">
      <input type="checkbox" class="chk" data-act="w-room-vis" ${r.visible !== false ? "checked" : ""} aria-label="${esc(t("visible"))}">
      <div class="meta">${r.id === UNASSIGNED ? `<div class="nm">${esc(t("unassigned"))}</div>` :
        `<input class="input" style="width:100%" data-field="w.rname" value="${esc(r.name || "")}" aria-label="${esc(t("display_name"))}" maxlength="60">`}
        <div class="tags"><span class="badge">${entitiesOfRoom(w, r.id).length}</span>${r.area_id ? `<span class="badge">Area</span>` : ""}</div></div>
      <div class="acts">
        <select data-act="w-room-icon" aria-label="${esc(t("icon"))}">${[...new Set([r.icon, ...ROOM_ICONS].filter(Boolean))].map((ic) => `<option value="${esc(ic)}" ${ic === r.icon ? "selected" : ""}>${esc(ic)}</option>`).join("")}</select>
        <button class="iconbtn" data-act="w-room-up" aria-label="${esc(t("move_up"))}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="iconbtn" data-act="w-room-down" aria-label="${esc(t("move_down"))}" ${i === rooms.length - 1 ? "disabled" : ""}>↓</button>
        ${r.id !== UNASSIGNED ? `<button class="iconbtn" data-act="w-room-del" aria-label="${esc(t("remove"))}">✕</button>` : ""}</div></div>`).join("")}</div>
    <div class="row" style="margin-block-start:16px">
      ${freeAreas.length ? `<select data-act="w-room-add-area" aria-label="${esc(t("add_area"))}"><option value="">${esc(t("add_area"))}</option>${freeAreas.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("")}</select>` : ""}
      <button class="btn" data-act="w-room-add-custom">+ ${esc(t("add_custom_room"))}</button></div>
`;
}

function unassignedBlock(app, wz) {
  const { t } = app, w = wz.work;
  const realRooms = [...w.rooms].sort((a, b) => a.order - b.order).filter((r) => r.id !== UNASSIGNED);
  const unassigned = Object.entries(w.entities).filter(([, p]) => !p.hidden && (!p.room || p.room === UNASSIGNED));
  if (!unassigned.length) return "";
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("assign_unassigned"))} (${unassigned.length})</h2><div class="elist">${unassigned.map(([eid, p]) => {
    const inv = app._invMap.get(eid);
    return `<div class="erow" data-eid="${esc(eid)}"><span></span><div class="meta"><div class="nm">${esc(p.name || inv?.name || eid)}</div><div class="id">${esc(eid)}</div></div>
      <div class="acts"><select data-act="w-assign" aria-label="${esc(t("assign_to"))}"><option value="">${esc(t("assign_to"))}</option>${realRooms.map((r) => `<option value="${esc(r.id)}">${esc(roomName(r, t))}</option>`).join("")}</select></div></div>`;
  }).join("")}</div></div>`;
}

function stepDevices(app) {
  app._postRender = () => renderPickerList(app);
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(app.t("devices_title"))}</h2>${renderPicker(app)}</div>`;
}

function favListHTML(app, wz) {
  const q = wz.favq.trim().toLowerCase();
  const items = visibleEntities(wz.work).filter((e) => e.pref.card !== "scene" && e.pref.card !== "script")
    .filter((e) => !q || `${e.pref.name || ""} ${app._invMap.get(e.eid)?.name || ""} ${e.eid}`.toLowerCase().includes(q)).slice(0, 80);
  return items.map((e) => `<div class="erow" data-eid="${esc(e.eid)}"><span></span>
    <div class="meta"><div class="nm">${esc(e.pref.name || app._invMap.get(e.eid)?.name || e.eid)}</div><div class="id">${esc(e.eid)}</div></div>
    <div class="acts"><button class="iconbtn" data-act="w-fav" aria-pressed="${!!e.pref.favorite}" aria-label="${esc(app.t("favorite"))}">★</button></div></div>`).join("");
}

function stepCustomize(app, wz) {
  const { t } = app, w = wz.work;
  const temps = app._inv.entities.filter((e) => e.is_temperature_sensor && !e.disabled);
  const weather = app._inv.entities.filter((e) => e.is_weather);
  const rooms = [...w.rooms].sort((a, b) => a.order - b.order).filter((r) => r.id !== UNASSIGNED && r.visible !== false);
  const sel = (act, cur, opts, extra = "") => `<select data-act="${act}" ${extra}><option value="">${esc(t("none"))}</option>${opts.map((e) => `<option value="${esc(e.entity_id)}" ${e.entity_id === cur ? "selected" : ""}>${esc(e.name)} (${esc(e.entity_id)})</option>`).join("")}</select>`;
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("custom_title"))}</h2>
    <div class="field"><span class="label">${esc(t("theme"))}</span><div class="choice-grid">${choice("w-theme", "auto", w.theme.mode, t("theme_auto"))}${choice("w-theme", "light", w.theme.mode, t("theme_light"))}${choice("w-theme", "dark", w.theme.mode, t("theme_dark"))}</div></div>
    <div class="field"><label class="label" for="accent">${esc(t("accent"))}</label><input id="accent" type="color" class="input" data-field="w.theme.accent" value="${esc(w.theme.accent || "#00caec")}" style="width:96px;padding:4px"></div>
    <div class="field"><span class="label">${esc(t("layout"))}</span><div class="choice-grid">${["mosaic", "rows", "rail", "stage"].map((l) => choice("w-layout", l, w.theme.layout, t(`layout_${l}`), t(`layout_${l}_d`))).join("")}</div></div></div>
  <div class="panel"><h2 style="margin-block-start:0">${esc(t("saver"))}</h2>
    <label class="row"><input type="checkbox" class="chk" data-act="w-saver" ${w.display.saver.enabled ? "checked" : ""}> ${esc(t("saver_enable"))}</label>
    ${w.display.saver.enabled ? `<div class="field"><label class="label" for="w-saver-idle">${esc(t("saver_idle"))}</label><input id="w-saver-idle" class="input" type="number" min="1" max="240" data-act="w-saver-idle" value="${w.display.saver.idle_min}" dir="ltr" style="max-width:120px"></div>` : ""}</div>
  <div class="panel"><h2 style="margin-block-start:0">${esc(t("main_temp"))}</h2>
    ${rooms.length ? rooms.map((r) => `<div class="field" data-room="${esc(r.id)}"><label class="label">${esc(roomName(r, t))}</label>${sel("w-temp", w.room_temp_sensor[r.id], temps)}</div>`).join("") : `<div class="empty">${esc(t("no_rooms"))}</div>`}
    <div class="field"><label class="label">${esc(t("weather_entity"))}</label>${sel("w-weather", w.weather_entity, weather)}<span class="muted small">${esc(t("weather_note"))}</span></div></div>
  <div class="panel"><h2 style="margin-block-start:0">${esc(t("pick_favorites"))}</h2>
    <div class="filters"><input class="input" type="search" data-field="wz.favq" placeholder="${esc(t("search"))}" value="${esc(wz.favq)}"></div><div id="fav-list" class="elist">${favListHTML(app, wz)}</div></div>`;
}

function stepPreview(app, wz) {
  const { t } = app;
  const w = ensureUnassigned(clone(wz.work));
  app._previewCfg = w;
  app._lazy = [];
  const rooms = w.rooms.filter((r) => r.visible !== false);
  const chips = `<div class="row" style="margin-block-end:12px"><button class="tab" data-act="w-prev-room" data-room="" aria-current="${!wz.previewRoom ? "page" : "false"}">${esc(t("home"))}</button>
    ${rooms.map((r) => `<button class="tab" data-act="w-prev-room" data-room="${esc(r.id)}" aria-current="${wz.previewRoom === r.id ? "page" : "false"}">${esc(roomName(r, t))}</button>`).join("")}</div>`;
  const view = wz.previewRoom ? roomHTML(app, w, wz.previewRoom) : dashboardHTML(app, w);
  return `<div class="panel"><div class="banner" style="border-radius:12px;margin-block-end:12px">${esc(t("preview_banner"))}</div>${chips}<div class="layout-${esc(w.theme.layout)}" data-preview>${view}</div></div>`;
}

// ------------------------------------------------------------------ events
export function wizardField(app, field, el) {
  const wz = app._wiz, w = wz.work;
  if (field.startsWith("pk.")) return setField(app, field, el);
  if (field.startsWith("c.")) return cameraField(app, field, el);
  if (field === "wz.favq") {
    wz.favq = el.value;
    app._app.querySelector("#fav-list").innerHTML = favListHTML(app, wz);
    return;
  }
  if (field === "w.rname") {
    const room = w.rooms.find((r) => r.id === el.closest("[data-room]").dataset.room);
    if (room) room.name = el.value.trim() || null;
  } else if (field === "w.home.name") w.home.name = el.value;
  else if (field === "w.theme.accent") { w.theme.accent = el.value; app.applyTheme(); }
  saveProgress(app);
}

export function wizardAct(app, act, el) {
  const wz = app._wiz, w = wz.work, val = el.dataset.val;
  const roomId = el.closest("[data-room]")?.dataset.room;
  const sorted = () => [...w.rooms].sort((a, b) => a.order - b.order);
  const rerender = () => { app.render(); saveProgress(app); };
  if (pickerAct(app, act, el)) { saveProgress(app); return; }
  switch (act) {
    case "w-back": return goStep(app, wz.step - 1);
    case "w-next": return goStep(app, wz.step + 1);
    case "w-finish": return finish(app);
    case "w-rescan": return runScan(app);
    case "w-lang": w.home.language = val; app.setLang(val); return rerender();
    case "w-screen": w.home.screen = val; if (!wz.layoutPicked) w.theme.layout = defaultLayoutForScreen(val); return rerender();
    case "w-mode": w.mode = val; return rerender();
    case "w-theme": w.theme.mode = val; app.applyTheme(); return rerender();
    case "w-layout": w.theme.layout = val; wz.layoutPicked = true; return rerender();
    case "w-saver": w.display.saver.enabled = el.checked; return rerender();
    case "w-saver-idle": w.display.saver.idle_min = Math.max(1, Math.min(240, Math.round(Number(el.value)) || 5)); return saveProgress(app);
    case "w-add-new": mergeProposal(w, wz.scan.proposal, new Set(wz.scan.new_entities)); app._newSet = new Set(); app.toast(app.t("ok")); return rerender();
    case "w-room-vis": { const r = w.rooms.find((x) => x.id === roomId); if (r) r.visible = el.checked; return rerender(); }
    case "w-room-icon": { const r = w.rooms.find((x) => x.id === roomId); if (r) r.icon = el.value; return rerender(); }
    case "w-room-up": case "w-room-down": { const l = sorted(); moveItem(l, l.findIndex((x) => x.id === roomId), act === "w-room-up" ? -1 : 1); renumber(l); return rerender(); }
    case "w-room-del":
      w.rooms = w.rooms.filter((x) => x.id !== roomId);
      for (const p of Object.values(w.entities)) if (p.room === roomId) p.room = UNASSIGNED;
      delete w.room_temp_sensor[roomId];
      ensureUnassigned(w); renumber(sorted());
      return rerender();
    case "w-room-add-area": {
      const a = (app._inv.areas || []).find((x) => x.id === el.value);
      if (a) w.rooms.push({ id: `room_${a.id}`, area_id: a.id, name: a.name, icon: a.icon || null, order: w.rooms.length, visible: true });
      return rerender();
    }
    case "w-room-create": return createRoom(app);
    case "w-room-add-custom": w.rooms.push({ id: uid("room"), area_id: null, name: app.t("room_name_new"), icon: "mdi:door", order: w.rooms.length, visible: true }); return rerender();
    case "w-assign": { const eid = el.closest("[data-eid]").dataset.eid; if (el.value && w.entities[eid]) w.entities[eid].room = el.value; return rerender(); }
    case "w-temp": { if (el.value) w.room_temp_sensor[roomId] = el.value; else delete w.room_temp_sensor[roomId]; return saveProgress(app); }
    case "w-weather": w.weather_entity = el.value || null; return saveProgress(app);
    case "w-fav": { const eid = el.closest("[data-eid]").dataset.eid; w.entities[eid].favorite = !w.entities[eid].favorite; el.setAttribute("aria-pressed", String(w.entities[eid].favorite)); return saveProgress(app); }
    case "w-prev-room": wz.previewRoom = el.dataset.room || null; return app.render();
    default:
  }
}

/** Create a real Home Assistant area (admin websocket command) and add it as a room. */
async function createRoom(app) {
  const wz = app._wiz, w = wz.work, input = app._app.querySelector("#new-room");
  const name = input?.value.trim();
  if (!name) return;
  wz.creatingRoom = true; wz.roomError = null; app.render();
  try {
    const a = await app.callWS({ type: "config/area_registry/create", name });
    (app._inv.areas ||= []).push({ id: a.area_id, name: a.name, icon: a.icon || null });
    w.rooms.push({ id: `room_${a.area_id}`, area_id: a.area_id, name: a.name, icon: a.icon || "mdi:door", order: w.rooms.length, visible: true });
  } catch (err) { wz.roomError = `${app.t("room_create_failed")}: ${err?.message || err}`; }
  wz.creatingRoom = false;
  app.render(); saveProgress(app);
}

export const wizardWorkChanged = (app) => saveProgress(app);
