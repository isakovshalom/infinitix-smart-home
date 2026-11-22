// Add ONVIF cameras: discovery on the network or by address, then placed in a room.
// The password goes straight to Home Assistant's own ONVIF flow (server side) and is
// never kept in INFINITIX state: the form field is cleared as soon as the call returns.

import { esc } from "./util.js";
import { UNASSIGNED, roomName } from "./logic.js";

const fresh = () => ({ discovering: false, searched: false, devices: [], form: null, adding: false, error: null, added: [] });

export const camState = (app) => (app._cam ||= fresh());
export const resetCameras = (app) => { app._cam = fresh(); };

/** The config being edited: the wizard draft, or the live config in settings. */
const target = (app) => app._wiz?.work ?? app._cfg;

function roomOptions(app) {
  const cfg = target(app), { t } = app;
  const rooms = [...cfg.rooms].sort((a, b) => a.order - b.order).filter((r) => r.id !== UNASSIGNED && r.visible !== false);
  return [...rooms.map((r) => [r.id, roomName(r, t)]), [UNASSIGNED, t("unassigned")]];
}

export function renderCamerasPage(app) {
  return `<div class="page"><div class="row spread"><h1>${esc(app.t("cam_title"))}</h1><button class="btn" data-act="c-back">${esc(app.t("back"))}</button></div>${renderCameras(app)}</div>`;
}

export function renderCameras(app) {
  const { t } = app, c = camState(app);
  const rooms = roomOptions(app);
  let html = `<div class="panel"><h2 style="margin-block-start:0">${esc(t("cam_title"))}</h2><p class="muted">${esc(t("cam_note"))}</p>
    <div class="row"><button class="btn primary" data-act="c-discover" ${c.discovering ? "disabled" : ""}>${esc(c.discovering ? t("cam_searching") : t("cam_search"))}</button>
    <button class="btn" data-act="c-manual">${esc(t("cam_add_manual"))}</button></div>`;

  if (c.searched && !c.discovering) {
    html += c.devices.length
      ? `<h2>${esc(t("cam_found", { n: c.devices.length }))}</h2><div class="elist">${c.devices.map((d, i) => `<div class="erow" data-dev="${i}"><span></span>
          <div class="meta"><div class="nm">${esc(d.name)}</div><div class="id">${esc(d.host)}:${esc(d.port)}${d.hardware ? ` · ${esc(d.hardware)}` : ""}</div></div>
          <div class="acts"><button class="btn" data-act="c-pick">${esc(t("cam_use"))}</button></div></div>`).join("")}</div>`
      : `<p class="note">${esc(t("cam_none_found"))}</p>`;
  }

  const f = c.form;
  if (f) {
    const inp = (k, label, type = "text", extra = "") => `<div class="field"><label class="label" for="cam-${k}">${esc(label)}</label>
      <input id="cam-${k}" class="input" type="${type}" data-field="c.${k}" value="${esc(f[k] ?? "")}" ${extra}></div>`;
    html += `<h2>${esc(t("cam_add_manual"))}</h2>
      ${inp("name", t("cam_name"), "text", 'maxlength="60"')}
      <div class="row">${inp("host", t("cam_host"), "text", 'inputmode="decimal" autocomplete="off" dir="ltr"')}${inp("port", t("cam_port"), "number", 'min="1" max="65535" dir="ltr" style="max-width:120px"')}</div>
      <div class="row">${inp("username", t("cam_user"), "text", 'autocomplete="off" dir="ltr"')}${inp("password", t("cam_pass"), "password", 'autocomplete="new-password" dir="ltr"')}</div>
      <p class="muted small">${esc(t("cam_pass_note"))}</p>
      <div class="field"><label class="label" for="cam-room">${esc(t("cam_room"))}</label>
        <select id="cam-room" data-field="c.room">${rooms.map(([id, n]) => `<option value="${esc(id)}" ${id === f.room ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      ${c.error ? `<p class="note" role="alert">${esc(c.error)}</p>` : ""}
      <div class="row"><button class="btn primary" data-act="c-add" ${c.adding || !f.host ? "disabled" : ""}>${esc(c.adding ? t("cam_adding") : t("cam_connect"))}</button>
      <button class="btn" data-act="c-cancel">${esc(t("cancel"))}</button></div>`;
  }

  if (c.added.length) {
    html += `<h2>${esc(t("cam_added_list"))}</h2><div class="elist">${c.added.map((a) => `<div class="erow"><span class="badge ok">✓</span>
      <div class="meta"><div class="nm">${esc(a.name)}</div><div class="id">${esc(a.entity_id)}</div></div><span></span></div>`).join("")}</div>`;
  }
  return `${html}</div>`;
}

const blankForm = (app, extra = {}) => ({ name: "", host: "", port: 80, username: "", password: "", room: roomOptions(app)[0]?.[0] ?? UNASSIGNED, ...extra });

export function cameraField(app, field, el) {
  const c = camState(app);
  if (!c.form) return;
  const key = field.slice(2);
  c.form[key] = key === "port" ? Number(el.value) || 80 : el.value;
  if (key === "host") {
    const btn = app._app.querySelector('[data-act="c-add"]');
    if (btn) btn.disabled = c.adding || !c.form.host.trim();
  }
}

export async function camerasAct(app, act, el) {
  const { t } = app, c = camState(app);
  if (act === "c-back") { app._go({ name: "settings" }); return; }
  if (act === "c-manual") { c.form = blankForm(app); c.error = null; return app.render(); }
  if (act === "c-cancel") { c.form = null; c.error = null; return app.render(); }
  if (act === "c-pick") {
    const d = c.devices[Number(el.closest("[data-dev]").dataset.dev)];
    c.form = blankForm(app, { name: d.name, host: d.host, port: d.port }); c.error = null;
    return app.render();
  }
  if (act === "c-discover") {
    c.discovering = true; c.error = null; app.render();
    try { c.devices = (await app.callWS({ type: "infinitix/camera/discover" })).devices; }
    catch (err) { c.devices = []; c.error = errText(app, err); }
    c.discovering = false; c.searched = true;
    return app.render();
  }
  if (act === "c-add") {
    const f = c.form;
    if (!f || c.adding) return;
    c.adding = true; c.error = null; app.render();
    try {
      const r = await app.callWS({ type: "infinitix/camera/add", host: f.host.trim(), port: f.port, name: f.name.trim(), username: f.username, password: f.password });
      f.password = ""; // never keep the secret in panel state
      await app._loadInventory();
      const room = f.room, cfg = target(app);
      if (!r.entity_ids.length) c.error = t("cam_no_entities");
      let order = Object.keys(cfg.entities).length;
      for (const eid of r.entity_ids) {
        cfg.entities[eid] ||= { card: "camera", name: null, icon: null, room, hidden: false, favorite: false, size: "m", order: order++ };
        c.added.push({ name: app._invMap.get(eid)?.name || eid, entity_id: eid });
      }
      if (r.entity_ids.length) { c.form = null; app.toast(t("cam_added")); }
      if (app._wiz) app.workChanged(); else app.persistSoon(true);
    } catch (err) {
      f.password = "";
      c.error = errText(app, err);
    }
    c.adding = false;
    return app.render();
  }
}

function errText(app, err) {
  const code = err?.code;
  const key = `cam_err_${code}`;
  const msg = app.t(key);
  const detail = err?.message && err.message !== code ? ` (${String(err.message).replace(/^\{'error': "?|"?\}$/g, "").slice(0, 160)})` : "";
  return msg === key ? `${app.t("cam_err_unknown")}${detail}` : code === "onvif_error" ? `${msg}${detail}` : msg;
}
