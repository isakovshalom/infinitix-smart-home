// Alarm system: Risco (HA built-in integration), PIMA (community integration, Net4Pro card)
// or Paradox (PAI add-on over MQTT).  The panel only drives Home Assistant's own setup flow;
// codes and passwords go straight to HA and are cleared from the panel right after sending.

import { esc } from "./util.js";
import { UNASSIGNED } from "./logic.js";

const fresh = () => ({ status: null, loading: false, error: null, busy: false, brand: null, flow: null, added: [] });
export const alState = (app) => (app._al ||= fresh());
export const resetAlarm = (app) => { app._al = fresh(); };
const target = (app) => app._wiz?.work ?? app._cfg;
const SECRET = /pin|pass|code|token/i;

async function load(app) {
  const s = alState(app);
  s.loading = true;
  try { s.status = await app.callWS({ type: "infinitix/alarm/status" }); s.error = null; }
  catch (err) { s.error = err?.message || String(err); }
  s.loading = false;
  if (["wizard", "alarm"].includes(app._view.name)) app.render();
}

export function renderAlarmPage(app) {
  return `<div class="page"><div class="row spread"><h1>${esc(app.t("al_title"))}</h1><button class="btn" data-act="al-back">${esc(app.t("back"))}</button></div>${renderAlarm(app)}</div>`;
}

export function renderAlarm(app) {
  const s = alState(app), { t } = app;
  if (!s.status && !s.loading) load(app);
  const brands = s.status?.brands || [];
  const cur = brands.find((b) => b.id === s.brand);
  let html = `<div class="panel"><h2 style="margin-block-start:0">${esc(t("al_title"))}</h2><p class="muted">${esc(t("al_note"))}</p>
    <div class="choice-grid">${["risco", "pima", "paradox"].map((id) => {
      const b = brands.find((x) => x.id === id);
      const n = b?.entities.length || 0;
      return `<button class="choice" data-act="al-pick" data-brand="${id}" aria-pressed="${s.brand === id}"><b>${esc(b?.name || id)}</b>
        <span class="muted small">${esc(t(`al_how_${id}`))}</span>${n ? `<span class="badge ok">${esc(t("al_connected", { n }))}</span>` : ""}</button>`;
    }).join("")}<button class="choice" data-act="al-pick" data-brand="none" aria-pressed="${s.brand === "none"}"><b>${esc(t("al_none"))}</b><span class="muted small">${esc(t("al_none_d"))}</span></button></div>
    ${s.error ? `<p class="note" role="alert">${esc(s.error)}</p>` : ""}</div>`;
  if (cur) html += brandPanel(app, cur);
  if (s.added.length) html += `<div class="panel"><h2 style="margin-block-start:0">${esc(t("al_added"))}</h2><div class="elist">${s.added.map((e) => `<div class="erow"><span class="badge ok">✓</span><div class="meta"><div class="nm">${esc(app._invMap.get(e)?.name || e)}</div><div class="id">${esc(e)}</div></div><span></span></div>`).join("")}</div></div>`;
  return html;
}

function brandPanel(app, b) {
  const s = alState(app), { t } = app;
  const entities = b.entities.length ? `<p><b>${esc(t("al_found_entities"))}</b></p><div class="elist">${b.entities.map((e) => `<div class="erow"><span class="badge ok">✓</span><div class="meta"><div class="nm">${esc(app._invMap.get(e)?.name || e)}</div><div class="id">${esc(e)}</div></div>
      <div class="acts"><button class="btn" data-act="al-use" data-eid="${esc(e)}" ${target(app).entities[e] ? "disabled" : ""}>${esc(target(app).entities[e] ? t("al_on_dashboard") : t("al_add_dashboard"))}</button></div></div>`).join("")}</div>` : "";
  let body = "";
  if (b.id === "risco") {
    body = `<p class="muted small">${esc(t("al_risco_steps"))}</p>${s.flow ? flowHTML(app) : `<button class="btn primary" data-act="al-start" ${s.busy ? "disabled" : ""}>${esc(t("al_connect_risco"))}</button>`}`;
  } else if (b.id === "pima") {
    body = b.available
      ? `<p class="muted small">${esc(t("al_pima_ready"))}</p>${s.flow ? flowHTML(app) : `<button class="btn primary" data-act="al-start" ${s.busy ? "disabled" : ""}>${esc(t("al_connect_pima"))}</button>`}`
      : `<ol class="steps-list"><li>${esc(t("al_pima_1"))}</li><li>${esc(t("al_pima_2"))} <bdi dir="ltr">${esc(b.repo)}</bdi></li><li>${esc(t("al_pima_3"))}</li><li>${esc(t("al_pima_4"))}</li></ol>
         <div class="row"><a class="btn" href="${esc(b.repo)}" target="_blank" rel="noopener">${esc(t("al_open_repo"))}</a><button class="btn" data-act="al-refresh">${esc(t("al_check_again"))}</button></div>`;
  } else {
    body = `<p>${esc(t(b.available ? "al_mqtt_ok" : "al_mqtt_missing"))}</p>
      <ol class="steps-list"><li>${esc(t("al_pdx_1"))}</li><li>${esc(t("al_pdx_2"))} <bdi dir="ltr">${esc(b.repo)}</bdi></li><li>${esc(t("al_pdx_3"))}</li><li>${esc(t("al_pdx_4"))}</li></ol>
      <div class="row"><a class="btn" href="${esc(b.docs)}" target="_blank" rel="noopener">${esc(t("al_open_docs"))}</a>
      ${b.available ? "" : `<a class="btn" href="/config/integrations/dashboard/add?domain=mqtt" target="_top">${esc(t("al_add_mqtt"))}</a>`}
      <button class="btn" data-act="al-refresh">${esc(t("al_check_again"))}</button></div>`;
  }
  return `<div class="panel" id="al-brand"><h2 style="margin-block-start:0">${esc(b.name)}</h2>${body}${entities}
    <p class="muted small">${esc(t("al_sdk_note"))}</p></div>`;
}

function flowHTML(app) {
  const s = alState(app), { t } = app, f = s.flow;
  const label = (n) => (t(`al_f_${n}`) !== `al_f_${n}` ? t(`al_f_${n}`) : n);
  if (f.status === "menu") {
    return `<div id="al-flow"><p><b>${esc(t("al_choose_mode"))}</b></p><div class="row">${f.options.map((o) => `<button class="btn" data-act="al-menu" data-opt="${esc(o)}" ${s.busy ? "disabled" : ""}>${esc(label(o))}</button>`).join("")}
      <button class="btn" data-act="al-cancel">${esc(t("cancel"))}</button></div></div>`;
  }
  const input = (x) => x.type === "boolean"
    ? `<label class="row"><input type="checkbox" class="chk" data-al-f="${esc(x.name)}" ${x.default ? "checked" : ""}> ${esc(label(x.name))}</label>`
    : x.type === "select"
      ? `<div class="field"><label class="label">${esc(label(x.name))}</label><select data-al-f="${esc(x.name)}">${x.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></div>`
      : x.type === "unsupported" ? ""
      : `<div class="field"><label class="label">${esc(label(x.name))}${x.required ? " *" : ""}</label><input class="input" dir="ltr" data-al-f="${esc(x.name)}" data-type="${esc(x.type)}"
          type="${SECRET.test(x.name) ? "password" : x.type === "string" ? "text" : "number"}" value="${SECRET.test(x.name) ? "" : esc(x.default ?? "")}" autocomplete="${SECRET.test(x.name) ? "new-password" : "off"}"></div>`;
  const unsupported = f.fields.some((x) => x.type === "unsupported");
  return `<div id="al-flow">${f.fields.map(input).join("")}
    ${unsupported ? `<p class="note">${esc(t("md_unsupported"))} <a href="/config/integrations" target="_top">${esc(t("md_open_ha"))}</a></p>` : ""}
    <p class="muted small">${esc(t("al_secret_note"))}</p>
    ${f.error ? `<p class="note" role="alert">${esc(errText(app, f.error))}</p>` : ""}${s.busy ? `<p class="muted small" role="status">${esc(t("cam_wait"))}</p>` : ""}
    <div class="row"><button class="btn primary" data-act="al-submit" ${s.busy ? "disabled" : ""}>${esc(s.busy ? t("busy") : t("next"))}</button><button class="btn" data-act="al-cancel">${esc(t("cancel"))}</button></div></div>`;
}

function addToDashboard(app, eids) {
  const cfg = target(app);
  let order = Object.keys(cfg.entities).length;
  for (const eid of eids) cfg.entities[eid] ||= { card: "alarm", name: null, icon: null, room: UNASSIGNED, hidden: false, favorite: true, size: "l", order: order++ };
  if (app._wiz) app.workChanged(); else app.persistSoon(true);
}

export async function alarmAct(app, act, el) {
  const s = alState(app), { t } = app;
  const run = async (msg) => {
    s.busy = true; s.error = null; app.render();
    try { await handle(app, await app.callWS(msg)); }
    catch (err) { s.error = errText(app, err?.code || err?.message); s.flow = null; }
    s.busy = false;
    const shown = s.error; await load(app); s.error = shown; app.render();
  };
  switch (act) {
    case "al-back": resetAlarm(app); return app._go({ name: "settings" });
    case "al-pick": s.brand = el.dataset.brand; s.flow = null; s.error = null; return app.render();
    case "al-refresh": return load(app);
    case "al-start": return run({ type: "infinitix/alarm/start", brand: s.brand });
    case "al-menu": return run({ type: "infinitix/alarm/continue", flow_id: s.flow.flow_id, data: { next_step_id: el.dataset.opt } });
    case "al-submit": {
      const data = {};
      for (const x of app._app.querySelectorAll("[data-al-f]")) {
        data[x.dataset.alF] = x.type === "checkbox" ? x.checked : x.dataset.type === "integer" ? parseInt(x.value, 10) : x.dataset.type === "float" ? parseFloat(x.value) : x.value;
        if (x.type === "password") x.value = ""; // never keep the code in the page
      }
      return run({ type: "infinitix/alarm/continue", flow_id: s.flow.flow_id, data });
    }
    case "al-cancel": {
      const id = s.flow?.flow_id; s.flow = null;
      if (id) app.callWS({ type: "infinitix/alarm/abort", flow_id: id }).catch(() => {});
      return app.render();
    }
    case "al-use": addToDashboard(app, [el.dataset.eid]); app.toast(t("al_added")); return app.render();
  }
}

async function handle(app, r) {
  const s = alState(app);
  s.flow = null;
  if (r.status === "created") {
    await app._loadInventory();
    if (r.entity_ids.length) { addToDashboard(app, r.entity_ids); s.added.push(...r.entity_ids); }
    app.toast(app.t("al_added"));
  } else if (r.status === "form" || r.status === "menu") s.flow = r;
  else if (r.status === "abort") s.error = errText(app, r.reason);
  else s.error = errText(app, "unsupported");
}

function errText(app, code) {
  for (const key of [`al_err_${code}`, `md_err_${code}`]) { const m = app.t(key); if (m !== key) return m; }
  return `${app.t("failed")}: ${code}`;
}
