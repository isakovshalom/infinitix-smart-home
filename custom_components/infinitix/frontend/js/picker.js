// Entity picker: search + filters by room / type / device / integration, per-entity
// classification with explanation, multi-select and bulk actions.
// It edits `app.workCfg()` (the wizard draft or the "manage entities" draft).

import { esc } from "./util.js";
import { CARD_TYPES_UI } from "./constants.js";
import { UNASSIGNED, filterInventory, isIncluded, newPref, roomForArea, roomName, uniqueValues } from "./logic.js";

export function initPicker(app, keep = {}) {
  app._pk = { q: "", room: "", domain: "", device: "", integration: "", onlyIncluded: false, showHidden: false, onlyNew: false, sel: new Set(), limit: 60, ...keep };
}

const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(label)}</option>`;

export function renderPicker(app) {
  const { t } = app;
  const w = app.workCfg(), inv = app._inv, f = app._pk;
  const rooms = [...w.rooms].sort((a, b) => a.order - b.order);
  const devices = [...new Map(inv.entities.filter((e) => e.device_id).map((e) => [e.device_id, e.device_name || e.device_id])).entries()];
  return `<div class="filters">
      <input class="input" type="search" data-field="pk.q" placeholder="${esc(t("search"))}" value="${esc(f.q)}" aria-label="${esc(t("search"))}">
      <select data-field="pk.room" aria-label="${esc(t("filter_room"))}">${opt("", `${t("filter_room")}: ${t("all")}`, f.room)}${rooms.map((r) => opt(r.id, roomName(r, t), f.room)).join("")}</select>
      <select data-field="pk.domain" aria-label="${esc(t("filter_type"))}">${opt("", `${t("filter_type")}: ${t("all")}`, f.domain)}${uniqueValues(inv, "domain").map((d) => opt(d, d, f.domain)).join("")}</select>
      <select data-field="pk.device" aria-label="${esc(t("filter_device"))}">${opt("", `${t("filter_device")}: ${t("all")}`, f.device)}${devices.map(([id, n]) => opt(id, n, f.device)).join("")}</select>
      <select data-field="pk.integration" aria-label="${esc(t("filter_integration"))}">${opt("", `${t("filter_integration")}: ${t("all")}`, f.integration)}${uniqueValues(inv, "integration").map((d) => opt(d, d, f.integration)).join("")}</select>
    </div>
    <div class="filters">
      <label class="row"><input type="checkbox" class="chk" data-field="pk.onlyIncluded" ${f.onlyIncluded ? "checked" : ""}> ${esc(t("only_included"))}</label>
      <label class="row"><input type="checkbox" class="chk" data-field="pk.showHidden" ${f.showHidden ? "checked" : ""}> ${esc(t("show_hidden"))}</label>
      ${app._newSet?.size ? `<label class="row"><input type="checkbox" class="chk" data-field="pk.onlyNew" ${f.onlyNew ? "checked" : ""}> ${esc(t("only_new"))}</label>` : ""}
    </div>
    <div id="pk-bulk"></div>
    <div id="pk-list" class="elist"></div>`;
}

function roomLabel(app, w, e) {
  const rid = w.entities[e.entity_id]?.room ?? roomForArea(w, e.area_id);
  const room = w.rooms.find((r) => r.id === rid);
  return room ? roomName(room, app.t) : app.t("unassigned");
}

function rowHTML(app, w, e) {
  const { t } = app;
  const pref = w.entities[e.entity_id];
  const inc = isIncluded(w, e.entity_id);
  const st = app._hass.states[e.entity_id];
  const tags = [`<span class="badge">${esc(roomLabel(app, w, e))}</span>`, `<span class="badge">${esc(e.domain)}${e.device_class ? ` · ${esc(e.device_class)}` : ""}</span>`];
  if (st) tags.push(`<span class="badge">${esc(st.state)}</span>`);
  if (e.integration) tags.push(`<span class="badge">${esc(e.integration)}</span>`);
  if (app._newSet?.has(e.entity_id)) tags.push(`<span class="badge ok">${esc(t("only_new"))}</span>`);
  if (e.hidden_reason && e.hidden_reason !== "disabled") tags.push(`<span class="badge">${esc(t(`hidden_reason_${e.hidden_reason}`))}</span>`);
  let note = "";
  if (e.disabled) note = `<div class="note">${esc(t("disabled_note"))}</div>`;
  else if (e.confidence === "low" || e.reason === "switch_unclassified") {
    tags.push(`<span class="badge warn">${esc(t("conf_low"))}</span>`);
    const key = e.suggestion === "light" ? "conf_hint_light" : `reason_${e.reason}`;
    const text = t(key);
    if (text !== key) note = `<div class="note">${esc(text)}</div>`;
  }
  const cardSel = inc && !e.disabled
    ? `<select data-act="pk-card" aria-label="${esc(t("card_type"))}">${CARD_TYPES_UI.map((c) => opt(c, c, pref.card)).join("")}</select>` : "";
  return `<div class="erow ${inc ? "" : "off"}" data-eid="${esc(e.entity_id)}">
    <input type="checkbox" class="chk" data-act="pk-sel" aria-label="select" ${app._pk.sel.has(e.entity_id) ? "checked" : ""}>
    <div class="meta"><div class="nm">${esc(pref?.name || e.name)}</div><div class="id">${esc(e.entity_id)}</div>
      <div class="tags">${tags.join("")}</div>${note}</div>
    <div class="acts">${cardSel}
      <button class="switch-hit" data-act="pk-include" role="switch" aria-checked="${inc}" aria-label="${esc(t("included"))}" ${e.disabled ? "disabled" : ""}><span class="switch" ${inc ? 'aria-checked="true"' : ""}></span></button></div></div>`;
}

export function renderPickerList(app) {
  const root = app._app.querySelector("#pk-list");
  if (!root) return;
  const w = app.workCfg();
  const items = filterInventory(app._inv, w, app._pk, app._newSet || new Set());
  const shown = items.slice(0, app._pk.limit);
  root.innerHTML = (shown.map((e) => rowHTML(app, w, e)).join("") || `<div class="empty">${esc(app.t("none_in_room"))}</div>`) +
    (items.length > shown.length ? `<button class="btn" data-act="pk-more">+ ${items.length - shown.length}</button>` : "");
  root._items = items;
  renderBulk(app);
}

function renderBulk(app) {
  const el = app._app.querySelector("#pk-bulk");
  if (!el) return;
  const { t } = app, w = app.workCfg(), n = app._pk.sel.size;
  el.innerHTML = `<div class="row" style="margin-block-end:12px">
    <button class="btn" data-act="pk-selall">${esc(t("select_all_visible"))}</button>
    ${n ? `<span class="badge">${esc(t("selected_n", { n }))}</span>
      <button class="btn" data-act="pk-bulk" data-op="include">${esc(t("bulk_include"))}</button>
      <button class="btn" data-act="pk-bulk" data-op="exclude">${esc(t("bulk_exclude"))}</button>
      <button class="btn" data-act="pk-bulk" data-op="favorite">${esc(t("bulk_favorite"))}</button>
      <select data-act="pk-bulk-room" aria-label="${esc(t("bulk_assign"))}"><option value="">${esc(t("bulk_assign"))}</option>${w.rooms.map((r) => opt(r.id, roomName(r, t), "")).join("")}</select>
      <button class="btn" data-act="pk-clear">${esc(t("clear_visible"))}</button>` : ""}</div>`;
}

export function include(app, eid, on) {
  const w = app.workCfg();
  const item = app._inv.entities.find((e) => e.entity_id === eid);
  if (!item || (on && item.disabled)) return;
  const cur = w.entities[eid];
  if (on) {
    if (cur) cur.hidden = false;
    else w.entities[eid] = newPref(item, w);
  } else if (cur) {
    cur.hidden = true;
  }
}

export function setField(app, field, el) {
  const key = field.slice(3);
  app._pk[key] = el.type === "checkbox" ? el.checked : el.value;
  app._pk.limit = 60;
  renderPickerList(app);
}

/** Returns true if the action was handled. */
export function pickerAct(app, act, el) {
  const w = app.workCfg();
  const row = el.closest("[data-eid]");
  const eid = row?.dataset.eid;
  switch (act) {
    case "pk-sel":
      el.checked ? app._pk.sel.add(eid) : app._pk.sel.delete(eid);
      renderBulk(app);
      return true;
    case "pk-selall":
      for (const e of app._app.querySelector("#pk-list")._items || []) app._pk.sel.add(e.entity_id);
      renderPickerList(app);
      return true;
    case "pk-clear":
      app._pk.sel.clear();
      renderPickerList(app);
      return true;
    case "pk-more":
      app._pk.limit += 60;
      renderPickerList(app);
      return true;
    case "pk-include":
      include(app, eid, !isIncluded(w, eid));
      app.workChanged();
      renderPickerList(app);
      return true;
    case "pk-card":
      if (w.entities[eid]) w.entities[eid].card = el.value;
      app.workChanged();
      return true;
    case "pk-bulk": {
      for (const id of app._pk.sel) {
        if (el.dataset.op === "include") include(app, id, true);
        else if (el.dataset.op === "exclude") include(app, id, false);
        else if (el.dataset.op === "favorite") { include(app, id, true); if (w.entities[id]) w.entities[id].favorite = true; }
      }
      app.workChanged();
      renderPickerList(app);
      return true;
    }
    case "pk-bulk-room":
      if (!el.value) return true;
      for (const id of app._pk.sel) {
        include(app, id, true);
        if (w.entities[id]) w.entities[id].room = el.value;
      }
      app.workChanged();
      renderPickerList(app);
      return true;
    default:
      return false;
  }
}
