// Media players (TVs, AV receivers such as Denon): devices Home Assistant has discovered on the
// network, or added by address.  HA's own config flow does the work; extra questions it asks
// (for example a code shown on the TV) are shown here and sent straight back to HA.

import { esc } from "./util.js";

const fresh = () => ({ list: null, loading: false, error: null, busy: false, flow: null, added: [], manualDomain: "denonavr" });
export const mdState = (app) => (app._md ||= fresh());
export const resetMedia = (app) => { app._md = fresh(); };

const DOMAIN_NAMES = { denonavr: "Denon / Marantz", samsungtv: "Samsung TV", webostv: "LG webOS TV", yamaha_musiccast: "Yamaha MusicCast" };
const label = (d) => DOMAIN_NAMES[d] || d;

async function load(app) {
  const s = mdState(app);
  s.loading = true;
  try { s.list = await app.callWS({ type: "infinitix/media/list" }); s.error = null; }
  catch (err) { s.error = err?.message || String(err); }
  s.loading = false;
  if (["wizard", "media"].includes(app._view.name)) app.render();
}

export function renderMediaPage(app) {
  return `<div class="page"><div class="row spread"><h1>${esc(app.t("md_title"))}</h1><button class="btn" data-act="md-back">${esc(app.t("back"))}</button></div>${renderMedia(app)}</div>`;
}

export function renderMedia(app) {
  const s = mdState(app), { t } = app;
  if (!s.list && !s.loading) load(app);
  const l = s.list;
  let html = `<div class="panel"><h2 style="margin-block-start:0">${esc(t("md_title"))}</h2><p class="muted">${esc(t("md_note"))}</p>
    <div class="row"><button class="btn primary" data-act="md-refresh" ${s.loading ? "disabled" : ""}>${esc(s.loading ? t("scanning") : t("md_search"))}</button></div>
    ${s.error ? `<p class="note" role="alert">${esc(s.error)}</p>` : ""}</div>`;
  if (l) {
    html += `<div class="panel"><h2 style="margin-block-start:0">${esc(t("md_found", { n: l.discovered.length }))}</h2>${l.discovered.length
      ? `<div class="elist">${l.discovered.map((d) => `<div class="erow" data-flow="${esc(d.flow_id)}"><span></span><div class="meta"><div class="nm">${esc(d.name)}</div><div class="id">${esc(label(d.domain))}</div></div>
          <div class="acts"><button class="btn primary" data-act="md-confirm" ${s.busy ? "disabled" : ""}>${esc(t("md_add"))}</button></div></div>`).join("")}</div>`
      : `<p class="muted">${esc(t("md_none"))}</p>`}</div>`;
    html += `<div class="panel"><h2 style="margin-block-start:0">${esc(t("md_manual"))}</h2><p class="muted small">${esc(t("md_manual_hint"))}</p>
      <div class="row"><select id="md-domain" data-act="md-domain" aria-label="${esc(t("md_type"))}">${l.manual.map((d) => `<option value="${esc(d)}" ${d === s.manualDomain ? "selected" : ""}>${esc(label(d))}</option>`).join("")}</select>
      <input id="md-host" class="input" dir="ltr" style="flex:1 1 200px" placeholder="${esc(t(s.manualDomain === "denonavr" ? "md_host_optional" : "md_host"))}" aria-label="${esc(t("md_host"))}" maxlength="253" autocomplete="off">
      <button class="btn primary" data-act="md-start" ${s.busy ? "disabled" : ""}>${esc(s.busy ? t("busy") : t("md_connect"))}</button></div></div>`;
  }
  const f = s.flow;
  if (f) {
    const input = (x) => x.type === "boolean"
      ? `<label class="row"><input type="checkbox" class="chk" data-md-f="${esc(x.name)}" ${x.default ? "checked" : ""}> ${esc(x.name)}</label>`
      : x.type === "select"
        ? `<div class="field"><label class="label">${esc(x.name)}</label><select data-md-f="${esc(x.name)}">${x.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></div>`
        : x.type === "unsupported" ? ""
        : `<div class="field"><label class="label">${esc(x.name)}${x.required ? " *" : ""}</label><input class="input" dir="ltr" data-md-f="${esc(x.name)}" data-type="${esc(x.type)}" type="${x.type === "string" ? "text" : "number"}" value="${esc(x.default ?? "")}" autocomplete="off"></div>`;
    const unsupported = f.fields.some((x) => x.type === "unsupported");
    html += `<div class="panel" id="md-flow"><h2 style="margin-block-start:0">${esc(t("md_continue"))}</h2>
      ${f.fields.length ? f.fields.map(input).join("") : `<p class="muted">${esc(t("md_confirm_hint"))}</p>`}
      ${unsupported ? `<p class="note">${esc(t("md_unsupported"))} <a href="/config/integrations" target="_top">${esc(t("md_open_ha"))}</a></p>` : ""}
      ${f.error ? `<p class="note" role="alert">${esc(errText(app, f.error))}</p>` : ""}
      <div class="row"><button class="btn primary" data-act="md-submit" ${s.busy ? "disabled" : ""}>${esc(t("next"))}</button><button class="btn" data-act="md-cancel">${esc(t("cancel"))}</button></div></div>`;
  }
  if (s.error === null && s.added.length) {
    html += `<div class="panel"><h2 style="margin-block-start:0">${esc(t("md_added"))}</h2><div class="elist">${s.added.map((a) => `<div class="erow"><span class="badge ok">✓</span><div class="meta"><div class="nm">${esc(a.name)}</div><div class="id">${esc(a.entity_ids.join(", ") || t("md_no_entities"))}</div></div><span></span></div>`).join("")}</div></div>`;
  }
  if (l?.configured.length) html += `<p class="muted small">${esc(t("md_configured", { n: l.configured.length }))}</p>`;
  return html;
}

export async function mediaAct(app, act, el) {
  const s = mdState(app), { t } = app, q = (sel) => app._app.querySelector(sel);
  if (act === "md-back") { resetMedia(app); return app._go({ name: "settings" }); }
  if (act === "md-refresh") return load(app);
  if (act === "md-domain") { s.manualDomain = el.value; return app.render(); }
  const run = async (msg) => {
    s.busy = true; s.error = null; app.render();
    try { handle(app, await app.callWS(msg)); }
    catch (err) { s.error = errText(app, err?.code || err?.message); s.flow = null; }
    s.busy = false;
    const shown = s.error;
    await load(app); // refresh the lists (this clears the error), then show the outcome
    s.error = shown;
    app.render();
  };
  if (act === "md-confirm") return run({ type: "infinitix/media/continue", flow_id: el.closest("[data-flow]").dataset.flow, data: {} });
  if (act === "md-start") return run({ type: "infinitix/media/start", domain: s.manualDomain, host: q("#md-host")?.value.trim() || "" });
  if (act === "md-submit") {
    const data = {};
    for (const x of app._app.querySelectorAll("[data-md-f]")) {
      data[x.dataset.mdF] = x.type === "checkbox" ? x.checked : x.dataset.type === "integer" ? parseInt(x.value, 10) : x.dataset.type === "float" ? parseFloat(x.value) : x.value;
    }
    return run({ type: "infinitix/media/continue", flow_id: s.flow.flow_id, data });
  }
  if (act === "md-cancel") {
    const id = s.flow?.flow_id; s.flow = null;
    if (id) app.callWS({ type: "infinitix/media/abort", flow_id: id }).catch(() => {});
    return app.render();
  }
}

function handle(app, r) {
  const s = mdState(app);
  s.flow = null;
  if (r.status === "created") { s.added.push({ name: r.title || "", entity_ids: r.entity_ids }); app.toast(app.t("md_added")); }
  else if (r.status === "form") s.flow = { flow_id: r.flow_id, fields: r.fields, error: r.error };
  else if (r.status === "abort") s.error = errText(app, r.reason);
  else s.error = errText(app, "unsupported");
}

function errText(app, code) {
  const key = `md_err_${code}`;
  const m = app.t(key);
  return m === key ? `${app.t("failed")}: ${code}` : m;
}
