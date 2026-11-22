// Handover protocol: a printable HTML page (rooms, devices, scenarios, signatures) built in the
// browser from the saved configuration and downloaded by the admin.  It contains no credentials,
// tokens or network addresses.

import { esc, locale } from "./util.js";
import { UNASSIGNED, entitiesOfRoom, roomName, visibleRooms } from "./logic.js";
import { scenarioSummaryText } from "./scenarios.js";

export async function downloadHandover(app) {
  const { t } = app, cfg = app._cfg;
  let scenarios = [];
  try { scenarios = (await app.callWS({ type: "infinitix/scenarios/list" })).scenarios; } catch { /* page still useful without */ }
  const name = (eid) => app._hass.states[eid]?.attributes?.friendly_name || app._invMap.get(eid)?.name || eid;
  const date = new Intl.DateTimeFormat(locale(app.lang), { dateStyle: "long" }).format(new Date());
  const rooms = visibleRooms(cfg).map((r) => ({ r, items: entitiesOfRoom(cfg, r.id) })).filter((x) => x.items.length);
  const html = `<!doctype html><html lang="${app.lang}" dir="${app.dir}"><head><meta charset="utf-8"><title>${esc(t("ho_title"))}</title>
<style>body{font:15px/1.5 Rubik,Arial,sans-serif;color:#101b23;max-width:820px;margin:24px auto;padding:0 16px}h1{border-bottom:4px solid #00caec;padding-bottom:8px}
h2{margin-top:28px;color:#0e7c99}table{border-collapse:collapse;width:100%}td,th{border:1px solid #dce6eb;padding:6px 10px;text-align:start}th{background:#e9f7fa}
.sig{display:flex;gap:32px;margin-top:48px}.sig div{flex:1;border-top:1px solid #101b23;padding-top:6px}@media print{body{margin:0}}</style></head><body>
<h1>${esc(t("ho_title"))}${cfg.home.name ? ` – ${esc(cfg.home.name)}` : ""}</h1><p>${esc(date)}</p>
<h2>${esc(t("ho_rooms"))}</h2><table><tr><th>${esc(t("ho_room"))}</th><th>${esc(t("ho_devices"))}</th></tr>
${rooms.map(({ r, items }) => `<tr><td>${esc(r.id === UNASSIGNED ? t("unassigned") : roomName(r, t))}</td><td>${esc(items.map((i) => name(i.eid)).join(", "))}</td></tr>`).join("")}</table>
<h2>${esc(t("ho_scen"))}</h2>${scenarios.length ? `<table><tr><th>${esc(t("sc_name"))}</th><th>${esc(t("ho_does"))}</th></tr>
${scenarios.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(scenarioSummaryText(app, s))}</td></tr>`).join("")}</table>` : `<p>—</p>`}
<h2>${esc(t("ho_notes"))}</h2><p style="min-height:90px;border:1px solid #dce6eb"></p>
<div class="sig"><div>${esc(t("ho_installer"))}</div><div>${esc(t("ho_customer"))}</div></div></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url; a.download = `infinitix-handover-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
