// Settings (admin), "manage entities" editor, export / import with re-mapping.

import { resetScenarios } from "./scenarios.js";
import { esc, clone } from "./util.js";
import { LANGUAGES } from "./i18n.js";
import { resetCameras } from "./cameras.js";
import { initPicker, renderPicker, renderPickerList, pickerAct, setField } from "./picker.js";
import { mergeProposal, startWizard, ensureUnassigned } from "./wizard.js";
import { roomName, UNASSIGNED } from "./logic.js";

import { pagesSettingsHTML } from "./pages.js";
import { agendaSources, showSaver } from "./saver.js";
import { defaultLayoutForScreen } from "./layout.js";

const FRONTEND_VERSION = "0.5.0";

export async function openSettings(app) {
  app._view = { name: "settings" };
  app.render();
  refreshSuggestions(app);
}

export async function refreshSuggestions(app) {
  if (!app._isAdmin) return;
  try {
    const r = await app.callWS({ type: "infinitix/scan" });
    app._inv = r.inventory;
    app._rebuildInvMap();
    app._suggest = { newIds: r.new_entities, missing: r.missing_entities, proposal: r.proposal };
    if (app._view.name === "settings") app.render();
  } catch (err) {
    console.warn("INFINITIX: scan failed", err);
  }
}

// ------------------------------------------------------------------ settings view
export function renderSettings(app) {
  const { t } = app, c = app._cfg;
  const s = app._suggest;
  const opts = (items, cur) => items.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`).join("");
  return `<div class="page">
    <h1>${esc(t("settings"))}</h1>
    <div class="panel"><h2 style="margin-block-start:0">${esc(t("s_general"))}</h2>
      <div class="field"><label class="label" for="s-name">${esc(t("home_name"))}</label><input id="s-name" class="input" data-field="s.home.name" value="${esc(c.home.name)}" maxlength="60"></div>
      <div class="field"><label class="label">${esc(t("language"))}</label><select data-act="s-lang">${opts(LANGUAGES, c.home.language)}</select></div>
      <div class="field"><label class="label">${esc(t("screen_type"))}</label><select data-act="s-screen">${opts([["mobile", t("screen_mobile")], ["tablet", t("screen_tablet")], ["desktop", t("screen_desktop")]], c.home.screen)}</select></div>
      <div class="field"><label class="label">${esc(t("theme"))}</label><select data-act="s-theme">${opts([["auto", t("theme_auto")], ["light", t("theme_light")], ["dark", t("theme_dark")]], c.theme.mode)}</select></div>
      <div class="field"><label class="label">${esc(t("layout"))}</label><select data-act="s-layout">${opts(["mosaic", "rows", "rail", "stage"].map((l) => [l, t(`layout_${l}`)]), c.theme.layout)}</select></div>
      <div class="field"><label class="label" for="s-accent">${esc(t("accent"))}</label><input id="s-accent" type="color" class="input" data-field="s.theme.accent" value="${esc(c.theme.accent || "#00caec")}" style="width:96px;padding:4px"></div></div>

    ${saverHTML(app)}
    ${pagesSettingsHTML(app)}
    <div class="panel"><h2 style="margin-block-start:0">${esc(t("s_tablet"))}</h2>
      <label class="row"><input type="checkbox" class="chk" data-act="s-hidenav" ${c.tablet.hide_nav ? "checked" : ""}> ${esc(t("hide_nav"))}</label>
      <p class="muted small">${esc(t("sidebar_hint"))}</p>
      <button class="btn" data-act="exit-admin">${esc(t("exit_admin"))}</button></div>

    <div class="panel"><h2 style="margin-block-start:0">${esc(t("manage_entities"))}</h2>
      <div class="row"><button class="btn primary" data-act="s-manage">${esc(t("manage_entities"))}</button>
        <button class="btn" data-act="s-wizard">${esc(t("reopen_wizard"))}</button>
        <button class="btn" data-act="s-cameras">${esc(t("cam_add_btn"))}</button>
        <button class="btn" data-act="s-pairing">${esc(t("pr_title"))}</button>
        <button class="btn" data-act="s-media">${esc(t("md_title"))}</button>
        <button class="btn" data-act="s-alarm">${esc(t("al_title"))}</button>
        <button class="btn" data-act="s-scenarios">${esc(t("sc_title"))}</button></div>
      <p class="muted small">${esc(t("reopen_note"))}</p>
      ${s?.newIds?.length ? `<div class="row"><span class="badge ok">${esc(t("new_entities", { n: s.newIds.length }))}</span>
        <button class="btn" data-act="s-add-new">${esc(t("add_new"))}</button><button class="btn" data-act="s-dismiss-new">${esc(t("dismiss"))}</button></div>` : ""}
      ${s?.missing?.length ? `<div class="row" style="margin-block-start:8px"><span class="badge warn">${esc(t("missing_entities", { n: s.missing.length }))}</span>
        <button class="btn" data-act="s-remove-missing">${esc(t("remove"))}</button></div>` : ""}</div>

    <div class="panel"><h2 style="margin-block-start:0">${esc(t("export"))} / ${esc(t("import"))}</h2>
      <div class="row"><button class="btn" data-act="s-export" data-structure="0">${esc(t("export_design"))}</button>
        <button class="btn" data-act="s-export" data-structure="1">${esc(t("export_all"))}</button>
        <button class="btn" data-act="s-import-pick">${esc(t("import"))}</button>
        <input type="file" accept="application/json,.json" data-act="s-import-file" hidden></div></div>
    ${app._import ? renderImport(app) : ""}
    <p class="muted small">${esc(t("version"))}: ${esc(app._panelCfg?.config?.version || FRONTEND_VERSION)} · ${esc(t("plan"))}: ${esc(t(`plan_${app._features?.tier || "free"}`))}${app._features && !app._features.enforced ? ` – ${esc(t("plan_not_enforced"))}` : ""}</p></div>`;
}

function saverHTML(app) {
  const { t } = app, sv = app._cfg.display?.saver || { enabled: false, idle_min: 5, weather: true, agenda: true, calendars: [] };
  const sources = agendaSources(app);
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("saver"))}</h2>
    <label class="row"><input type="checkbox" class="chk" data-act="s-saver" ${sv.enabled ? "checked" : ""}> ${esc(t("saver_enable"))}</label>
    <div class="field"><label class="label" for="s-saver-idle">${esc(t("saver_idle"))}</label><input id="s-saver-idle" class="input" type="number" min="1" max="240" data-act="s-saver-idle" value="${sv.idle_min}" dir="ltr" style="max-width:120px"></div>
    <label class="row"><input type="checkbox" class="chk" data-act="s-saver-weather" ${sv.weather ? "checked" : ""}> ${esc(t("saver_weather"))}</label>
    <label class="row"><input type="checkbox" class="chk" data-act="s-saver-agenda" ${sv.agenda ? "checked" : ""}> ${esc(t("saver_agenda"))}</label>
    <fieldset class="pg-room"><legend>${esc(t("saver_sources"))}</legend>${sources.length ? sources.map((e) => `<label class="row"><input type="checkbox" class="chk" data-act="s-saver-cal" data-eid="${esc(e)}" ${sv.calendars.includes(e) ? "checked" : ""}> ${esc(app._hass.states[e]?.attributes.friendly_name || e)}</label>`).join("") : `<p class="muted small">${esc(t("saver_no_sources"))}</p>`}</fieldset>
    <button class="btn" data-act="s-saver-preview">${esc(t("saver_preview"))}</button></div>`;
}

// ------------------------------------------------------------------ manage entities
export function openManage(app, roomFilter = "") {
  app._manage = { draft: clone(app._cfg) };
  initPicker(app, { room: roomFilter });
  app._newSet = new Set(app._suggest?.newIds || []);
  app._view = { name: "manage" };
  app.render();
}

export function renderManage(app) {
  const { t } = app;
  app._postRender = () => renderPickerList(app);
  return `<div class="page"><div class="row spread"><h1>${esc(t("manage_entities"))}</h1>
    <div class="row"><button class="btn" data-act="m-cancel">${esc(t("cancel"))}</button><button class="btn primary" data-act="m-save">${esc(t("save"))}</button></div></div>
    <div class="panel">${renderPicker(app)}</div></div>`;
}

// ------------------------------------------------------------------ import
function renderImport(app) {
  const { t } = app, im = app._import;
  const roomOpt = (r) => {
    const cur = im.roomMap[r.room.id];
    const val = cur.action === "map" ? `area:${cur.area_id}` : cur.action;
    const areas = im.areas.map((a) => `<option value="area:${esc(a.id)}" ${val === `area:${a.id}` ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    return `<select data-act="i-room" aria-label="${esc(r.room.name || "")}"><option value="create" ${val === "create" ? "selected" : ""}>${esc(t("import_create_room"))}</option>${areas}<option value="skip" ${val === "skip" ? "selected" : ""}>${esc(t("import_skip"))}</option></select>`;
  };
  const matchBadge = (p) => {
    const tgt = im.entityMap[p.entity.entity_id];
    if (!tgt) return `<span class="badge warn">${esc(t("import_no_match"))}</span>`;
    return `<span class="badge ${p.match === "same_name" ? "ok" : "warn"}">${esc(p.match === "same_id" ? t("import_match_same_id") : t("import_match_same_name"))}</span>`;
  };
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("import_title"))}</h2><p class="muted">${esc(t("import_note"))}</p>
    <h3>${esc(t("import_rooms"))}</h3><div class="elist">${im.plan.rooms.map((r) => `<div class="erow" data-iroom="${esc(r.room.id)}"><span></span><div class="meta"><div class="nm">${esc(r.room.name || t("unassigned"))}</div></div><div class="acts">${r.room.id === UNASSIGNED ? "" : roomOpt(r)}</div></div>`).join("")}</div>
    <h3 style="margin-block-start:16px">${esc(t("import_entities"))} (${im.plan.entities.filter((p) => !p.entity.weather_only).length})</h3>
    <div class="elist">${im.plan.entities.filter((p) => !p.entity.weather_only).slice(0, im.limit).map((p) => {
      const tgt = im.entityMap[p.entity.entity_id];
      const tgtItem = tgt && im.entities.find((e) => e.entity_id === tgt);
      return `<div class="erow" data-ient="${esc(p.entity.entity_id)}"><span></span>
        <div class="meta"><div class="nm">${esc(p.entity.name || p.entity.name_hint || p.entity.entity_id)}</div><div class="id">${esc(p.entity.entity_id)} → ${esc(tgt || "—")}</div>
        <div class="tags">${matchBadge(p)}${tgtItem ? `<span class="badge">${esc(tgtItem.name)}</span>` : ""}</div></div>
        <div class="acts"><button class="btn" data-act="i-change">${esc(t("edit"))}</button></div></div>`;
    }).join("")}${im.plan.entities.length > im.limit ? `<button class="btn" data-act="i-more">+</button>` : ""}</div>
    <div class="row" style="margin-block-start:16px"><button class="btn" data-act="i-cancel">${esc(t("cancel"))}</button><button class="btn primary" data-act="i-apply">${esc(t("import_apply"))}</button></div></div>`;
}

async function startImport(app, file) {
  const { t } = app;
  let doc;
  try { doc = JSON.parse(await file.text()); } catch { app.toast(t("import_invalid"), true); return; }
  try {
    const r = await app.callWS({ type: "infinitix/import_plan", document: doc });
    const roomMap = {}, entityMap = {};
    for (const p of r.plan.rooms) roomMap[p.room.id] = { action: p.action, area_id: p.area_id };
    for (const p of r.plan.entities) entityMap[p.entity.entity_id] = p.target;
    app._import = { doc, plan: r.plan, areas: r.areas, entities: r.entities, roomMap, entityMap, limit: 80 };
    app.render();
  } catch (err) {
    app.toast(err?.code === "not_an_infinitix_export" || err?.code === "unsupported_version" ? t("import_invalid") : `${t("failed")}: ${err?.message || err}`, true);
  }
}

// ------------------------------------------------------------------ events
export function settingsField(app, field, el) {
  if (field.startsWith("pk.")) return setField(app, field, el);
  if (field === "s.home.name") app._cfg.home.name = el.value;
  else if (field === "s.theme.accent") { app._cfg.theme.accent = el.value; app.applyTheme(); }
  app.persistSoon();
}

export async function settingsAct(app, act, el) {
  const c = app._cfg, { t } = app;
  if (app._view.name === "manage" && pickerAct(app, act, el)) return;
  switch (act) {
    case "s-lang": c.home.language = el.value; app.setLang(el.value); app.persistSoon(); return app.render();
    case "s-screen": c.home.screen = el.value; c.theme.layout = defaultLayoutForScreen(el.value); app.persistSoon(); return app.render();
    case "s-theme": c.theme.mode = el.value; app.applyTheme(); return app.persistSoon();
    case "s-layout": c.theme.layout = el.value; app.persistSoon(); return app.render();
    case "s-hidenav": c.tablet.hide_nav = el.checked; return app.persistSoon();
    case "s-saver": case "s-saver-weather": case "s-saver-agenda": case "s-saver-idle": case "s-saver-cal": {
      c.display ||= { saver: { enabled: false, idle_min: 5, weather: true, agenda: true, calendars: [] } };
      const sv = c.display.saver;
      if (act === "s-saver") sv.enabled = el.checked;
      else if (act === "s-saver-weather") sv.weather = el.checked;
      else if (act === "s-saver-agenda") sv.agenda = el.checked;
      else if (act === "s-saver-idle") sv.idle_min = Math.max(1, Math.min(240, Math.round(Number(el.value)) || 5));
      else { const e = el.dataset.eid; sv.calendars = el.checked ? [...new Set([...sv.calendars, e])].slice(0, 20) : sv.calendars.filter((x) => x !== e); app._agenda = null; }
      return app.persistSoon();
    }
    case "s-saver-preview": app._lastActive = Date.now(); return showSaver(app);
    case "s-wizard": return startWizard(app);
    case "s-manage": return openManage(app);
    case "s-pairing": return app._go({ name: "pairing" });
    case "s-media": return app._go({ name: "media" });
    case "s-alarm": return app._go({ name: "alarm" });
    case "s-scenarios": resetScenarios(app); return app._go({ name: "scenarios" });
    case "s-cameras": resetCameras(app); return app._go({ name: "cameras" });
    case "s-add-new": {
      mergeProposal(c, app._suggest.proposal, new Set(app._suggest.newIds));
      await app.callWS({ type: "infinitix/dismiss_new", entity_ids: app._suggest.newIds }).catch(() => {});
      app._suggest.newIds = [];
      app.persistSoon(true);
      return app.render();
    }
    case "s-dismiss-new":
      await app.callWS({ type: "infinitix/dismiss_new", entity_ids: app._suggest.newIds });
      app._suggest.newIds = [];
      return app.render();
    case "s-remove-missing":
      for (const eid of app._suggest.missing) delete c.entities[eid];
      app._suggest.missing = [];
      app.persistSoon(true);
      return app.render();
    case "s-export": {
      try {
        const doc = await app.callWS({ type: "infinitix/export", include_structure: el.dataset.structure === "1" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
        a.download = `infinitix-${el.dataset.structure === "1" ? "config" : "design"}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
      return;
    }
    case "s-import-pick": return el.parentElement.querySelector("input[type=file]").click();
    case "s-import-file": if (el.files?.[0]) await startImport(app, el.files[0]); el.value = ""; return;
    case "i-room": {
      const rid = el.closest("[data-iroom]").dataset.iroom, v = el.value;
      app._import.roomMap[rid] = v.startsWith("area:") ? { action: "map", area_id: v.slice(5) } : { action: v, area_id: null };
      return;
    }
    case "i-more": app._import.limit += 80; return app.render();
    case "i-cancel": app._import = null; return app.render();
    case "i-change": return changeImportTarget(app, el.closest("[data-ient]").dataset.ient);
    case "i-apply": {
      const im = app._import;
      try {
        const r = await app.callWS({ type: "infinitix/import_apply", document: im.doc, room_map: im.roomMap, entity_map: im.entityMap, import_structure: !!im.doc.structure });
        app._cfg = r.config;
        app._import = null;
        app.setLang(app._cfg.home.language);
        app.toast(t("import_done"));
        app.render();
      } catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
      return;
    }
    case "m-cancel": app._manage = null; return openSettings(app);
    case "m-save": {
      try {
        const draft = ensureUnassigned(app._manage.draft);
        draft.seen_entities = app._inv.entities.map((e) => e.entity_id);
        const r = await app.callWS({ type: "infinitix/save_config", config: draft });
        app._cfg = r.config;
        app._manage = null;
        app.toast(t("ok"));
        return openSettings(app);
      } catch (err) { app.toast(`${t("save_failed")}: ${err?.message || err}`, true); }
      return;
    }
    default:
  }
}

function changeImportTarget(app, exportedId) {
  const { t } = app, im = app._import;
  const p = im.plan.entities.find((x) => x.entity.entity_id === exportedId);
  const cands = im.entities.filter((e) => e.domain === p.entity.domain);
  const cur = im.entityMap[exportedId] || "";
  app.openModal({
    title: p.entity.name || p.entity.name_hint || exportedId,
    body: `<div class="field"><label class="label">${esc(t("import_entities"))}</label>
      <select data-mf="target"><option value="">${esc(t("import_skip"))}</option>${cands.map((e) => `<option value="${esc(e.entity_id)}" ${e.entity_id === cur ? "selected" : ""}>${esc(e.name)} (${esc(e.entity_id)})</option>`).join("")}</select></div>`,
    actions: [{ id: "cancel", label: t("cancel") }, { id: "ok", label: t("confirm"), cls: "primary" }],
    onAction: (id, form) => {
      if (id === "ok") { im.entityMap[exportedId] = form.target || null; app.render(); }
      return true;
    },
  });
}
