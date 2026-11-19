// Add Matter and Zigbee devices.  The pairing itself is done by Home Assistant's own
// integrations (Matter commissioning, ZHA, Zigbee2MQTT); this page starts it and shows what
// appeared.  The Matter setup code goes straight to Home Assistant and is not stored here.

import { esc } from "./util.js";

const fresh = () => ({ status: null, loading: false, error: null, baseline: null, joining: null, busy: false, matterMsg: null, poll: null });
export const prState = (app) => (app._pr ||= fresh());
export const resetPairing = (app) => { stopPoll(app); app._pr = fresh(); };

function stopPoll(app) { const s = app._pr; if (s?.poll) { clearTimeout(s.poll); s.poll = null; } }

async function load(app, { quiet = false } = {}) {
  const s = prState(app);
  if (!quiet) s.loading = true;
  try {
    s.status = await app.callWS({ type: "infinitix/pairing/status" });
    s.baseline ||= new Set(s.status.devices.map((d) => d.id));
    s.error = null;
  } catch (err) { s.error = err?.message || String(err); }
  s.loading = false;
  if (["wizard", "pairing"].includes(app._view.name)) { const keep = snapshot(app); app.render(); restore(app, keep); }
}

const snapshot = (app) => Object.fromEntries(["#pr-code", "#pr-topic"].map((q) => [q, app._app.querySelector(q)?.value]));
const restore = (app, keep) => { for (const [q, v] of Object.entries(keep)) { const el = app._app.querySelector(q); if (el && v != null) el.value = v; } };

function poll(app) {
  const s = prState(app);
  stopPoll(app);
  if (!s.joining || Date.now() > s.joining.until) { s.joining = null; return; }
  s.poll = setTimeout(async () => { await load(app, { quiet: true }); poll(app); }, 4000);
}

export function renderPairingPage(app) {
  return `<div class="page"><div class="row spread"><h1>${esc(app.t("pr_title"))}</h1><button class="btn" data-act="pr-back">${esc(app.t("back"))}</button></div>${renderPairing(app)}</div>`;
}

export function renderPairing(app) {
  const s = prState(app), { t } = app;
  if (!s.status && !s.loading) load(app);
  const st = s.status;
  const add = (dom) => `<a href="/config/integrations/dashboard/add?domain=${dom}" target="_top">${esc(t("pr_setup_link"))}</a>`;
  const proto = (p) => (st?.devices || []).filter((d) => d.protocol === p).length;
  const fresh = st ? st.devices.filter((d) => !s.baseline?.has(d.id)) : [];
  const joining = s.joining && Date.now() < s.joining.until;
  let html = `<div class="panel"><h2 style="margin-block-start:0">${esc(t("pr_title"))}</h2><p class="muted">${esc(t("pr_note"))}</p>
    ${s.error ? `<p class="note" role="alert">${esc(s.error)}</p>` : ""}${s.loading && !st ? `<p>${esc(t("busy"))}</p>` : ""}</div>`;
  if (st) {
    html += `<div class="panel"><h2 style="margin-block-start:0">Matter</h2>
      ${st.matter ? `<p class="muted small">${esc(t("pr_matter_hint"))}</p>
        <div class="row"><input id="pr-code" class="input" dir="ltr" style="flex:1 1 240px" placeholder="${esc(t("pr_matter_code"))}" aria-label="${esc(t("pr_matter_code"))}" autocomplete="off" maxlength="200">
        <button class="btn primary" data-act="pr-matter" ${s.busy ? "disabled" : ""}>${esc(s.busy ? t("busy") : t("pr_matter_add"))}</button></div>
        ${s.matterMsg ? `<p class="${s.matterMsg.ok ? "muted" : "note"}" role="status">${esc(s.matterMsg.text)}</p>` : ""}`
      : `<p class="note">${esc(t("pr_matter_missing"))} ${add("matter")}</p>`}
      <p class="muted small">${esc(t("pr_count", { n: proto("matter") }))}</p></div>
    <div class="panel"><h2 style="margin-block-start:0">Zigbee (ZHA)</h2>
      ${st.zha ? `<p class="muted small">${esc(t("pr_zigbee_hint"))}</p><div class="row"><button class="btn primary" data-act="pr-zha" ${s.busy ? "disabled" : ""}>${esc(t("pr_open_network"))}</button></div>`
        : `<p class="note">${esc(t("pr_zha_missing"))} ${add("zha")}</p>`}
      <p class="muted small">${esc(t("pr_count", { n: proto("zha") }))}</p></div>
    <div class="panel"><h2 style="margin-block-start:0">Zigbee2MQTT</h2>
      ${st.mqtt ? `<p class="muted small">${esc(t("pr_z2m_hint"))}</p>
        <div class="row"><input id="pr-topic" class="input" dir="ltr" value="zigbee2mqtt" style="max-width:240px" aria-label="${esc(t("pr_z2m_topic"))}" maxlength="64">
        <button class="btn primary" data-act="pr-z2m" ${s.busy ? "disabled" : ""}>${esc(t("pr_open_network"))}</button></div>`
        : `<p class="note">${esc(t("pr_mqtt_missing"))} ${add("mqtt")}</p>`}
      <p class="muted small">${esc(t("pr_count", { n: proto("mqtt") }))}</p></div>`;
    if (joining) html += `<div class="panel"><p role="status"><b>${esc(t("pr_joining"))}</b> ${esc(t("pr_joining_hint"))}</p></div>`;
    html += `<div class="panel"><h2 style="margin-block-start:0">${esc(t("pr_new"))}</h2>${fresh.length
      ? `<div class="elist">${fresh.map((d) => `<div class="erow"><span class="badge ok">+</span><div class="meta"><div class="nm">${esc(d.name)}</div><div class="id">${esc([d.manufacturer, d.model].filter(Boolean).join(" · "))} · ${esc(d.protocol)}</div></div><span></span></div>`).join("")}</div>`
      : `<p class="muted">${esc(t("pr_none_new"))}</p>`}
      <div class="row" style="margin-block-start:12px"><button class="btn" data-act="pr-refresh">${esc(t("rescan"))}</button></div></div>`;
  }
  return html;
}

export async function pairingAct(app, act) {
  const s = prState(app), { t } = app, q = (sel) => app._app.querySelector(sel);
  if (act === "pr-back") { resetPairing(app); return app._go({ name: "settings" }); }
  if (act === "pr-refresh") return load(app);
  if (act === "pr-zha" || act === "pr-z2m") {
    s.busy = true; s.error = null; app.render();
    try {
      const msg = { type: "infinitix/pairing/permit", protocol: act === "pr-zha" ? "zha" : "z2m", duration: 120 };
      if (act === "pr-z2m") msg.base_topic = q("#pr-topic")?.value.trim() || "zigbee2mqtt";
      await app.callWS(msg);
      s.joining = { until: Date.now() + 120000 };
      poll(app);
    } catch (err) { s.error = errText(app, err); }
    s.busy = false;
    return app.render();
  }
  if (act === "pr-matter") {
    const code = q("#pr-code")?.value.trim();
    if (!code) return;
    s.busy = true; s.matterMsg = null; app.render();
    try {
      await app.callWS({ type: "matter/commission", code });
      s.matterMsg = { ok: true, text: t("pr_matter_ok") };
      await load(app, { quiet: true });
    } catch (err) { s.matterMsg = { ok: false, text: `${t("pr_matter_fail")} (${String(err?.message || err).slice(0, 160)})` }; }
    s.busy = false;
    return app.render();
  }
}

function errText(app, err) {
  const key = `pr_err_${err?.code}`;
  const m = app.t(key);
  return m === key ? `${app.t("failed")}: ${err?.message || err}` : m;
}
