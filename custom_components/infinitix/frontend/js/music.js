// Music: Spotify (personal accounts, Spotify Connect to amplifiers) and Music Assistant
// (YouTube Music, Spotify, radio ... streamed to amplifiers/speakers on the network).
// Sign-ins happen in Home Assistant's own screens or in Music Assistant; nothing secret
// passes through or stays in INFINITIX.  Each family member picks their own "my music" player.

import { esc } from "./util.js";

const fresh = () => ({ status: null, loading: false, error: null, busy: false, flow: null });
export const muState = (app) => (app._mu ||= fresh());
export const resetMusic = (app) => { app._mu = fresh(); };

export async function loadMusic(app, rerender = true) {
  const s = muState(app);
  if (s.loading) return;
  s.loading = true;
  try { s.status = await app.callWS({ type: "infinitix/music/status" }); s.error = null; }
  catch (err) { s.error = err?.message || String(err); s.status ||= { players: [], mine: null }; }
  s.loading = false;
  if (rerender) app.render();
}

const playerName = (app, eid) => app._hass.states[eid]?.attributes.friendly_name || app._invMap.get(eid)?.name || eid;
export const MY_MUSIC_PREF = { card: "media_player", name: null, icon: "mdi:music-circle-outline", room: null, hidden: false, favorite: false, size: "l", order: 0 };

/** Admin setup panel (shown in the Media page and in the wizard's media step). */
export function renderMusicSetup(app) {
  const s = muState(app), { t } = app;
  if (!s.status && !s.loading) loadMusic(app);
  const st = s.status;
  if (!st?.spotify) return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("mu_title"))}</h2><p class="muted">…</p></div>`;
  const sp = st.spotify, ma = st.music_assistant;
  const link = (href, label, primary = false) => `<a class="btn ${primary ? "primary" : ""}" href="${esc(href)}" target="_top">${esc(label)}</a>`;
  const flow = s.flow ? `<div id="mu-flow">${s.flow.fields.map((f) => `<div class="field"><label class="label">${esc(f.name === "url" ? t("mu_mass_url") : f.name === "token" ? t("mu_mass_token") : f.name)}</label>
      <input class="input" dir="ltr" data-mu-f="${esc(f.name)}" type="${f.name === "token" ? "password" : "text"}" value="${f.name === "token" ? "" : esc(f.default ?? (f.name === "url" ? "http://homeassistant.local:8095" : ""))}" autocomplete="off"></div>`).join("")}
      ${s.flow.error ? `<p class="note" role="alert">${esc(errText(app, s.flow.error))}</p>` : ""}
      <div class="row"><button class="btn primary" data-act="mu-submit" ${s.busy ? "disabled" : ""}>${esc(s.busy ? t("busy") : t("next"))}</button><button class="btn" data-act="mu-cancel">${esc(t("cancel"))}</button></div></div>` : "";
  return `<div class="panel" id="mu-setup"><h2 style="margin-block-start:0">${esc(t("mu_title"))}</h2><p class="muted">${esc(t("mu_note"))}</p>
    <h3>Spotify</h3><p class="muted small">${esc(t("mu_spotify_note"))}</p>
    ${sp.accounts.length ? `<div class="elist">${sp.accounts.map((a) => `<div class="erow"><span class="badge ok">✓</span><div class="meta"><div class="nm">${esc(a.title)}</div><div class="id">${esc(a.entity_ids.join(", "))}</div></div><span></span></div>`).join("")}</div>` : ""}
    <div class="row">${link(sp.add_url, sp.accounts.length ? t("mu_spotify_add_more") : t("mu_spotify_add"), true)}${link(sp.credentials_url, t("mu_spotify_creds"))}</div>
    <h3>Music Assistant · YouTube Music</h3><p class="muted small">${esc(t("mu_mass_note"))}</p>
    ${ma.entries.length ? `<div class="elist">${ma.entries.map((e) => `<div class="erow"><span class="badge ok">✓</span><div class="meta"><div class="nm">${esc(e.title)}</div><div class="id" dir="ltr">${esc(e.url || "")}</div></div>
        <div class="acts">${e.url ? `<a class="btn" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(t("mu_open_mass"))}</a>` : ""}</div></div>`).join("")}</div>
        <p class="muted small">${esc(t("mu_mass_providers"))}</p>`
      : flow || `<div class="row"><button class="btn primary" data-act="mu-mass" ${s.busy ? "disabled" : ""}>${esc(t("mu_mass_connect"))}</button></div><p class="muted small">${esc(t("mu_mass_server"))}</p>`}
    <h3>${esc(t("mu_amps"))}</h3><p class="muted small">${esc(t("mu_amps_note"))}</p>
    ${st.amplifiers.length ? `<p class="small">${st.amplifiers.map((p) => esc(p.name)).join(" · ")}</p>` : `<p class="muted small">${esc(t("mu_no_amps"))}</p>`}
    ${s.error ? `<p class="note" role="alert">${esc(s.error)}</p>` : ""}</div>`;
}

/** "My music" block on the dashboard, for every household member. */
export function myMusicHTML(app, lazyGrid) {
  const s = muState(app), { t } = app;
  if (!s.status && !s.loading) loadMusic(app);
  const mine = s.status?.mine;
  if (!s.status) return "";
  const players = playersFor(s.status);
  if (!players.length && !mine) return "";
  return `<section class="dash-section"><div class="row spread"><h2>${esc(t("mu_mine"))}</h2>
      <button class="linkbtn" data-act="mu-pick">${esc(mine ? t("mu_change") : t("mu_choose"))}</button></div>
    ${mine && app._hass.states[mine] ? lazyGrid(app, [{ eid: mine, pref: MY_MUSIC_PREF }]) : `<div class="empty">${esc(t("mu_none_chosen"))}</div>`}</section>`;
}

function playersFor(st) {
  if (st.players) return st.players;
  return [...st.spotify.accounts.flatMap((a) => a.entity_ids), ...st.music_assistant.players.map((p) => p.entity_id), ...st.amplifiers.map((p) => p.entity_id)];
}

export async function musicAct(app, act, el) {
  const s = muState(app), { t } = app;
  const run = async (msg) => {
    s.busy = true; app.render();
    try {
      const r = await app.callWS(msg);
      s.flow = r.status === "form" ? r : null;
      if (r.status === "created") app.toast(t("mu_connected"));
      else if (r.status === "abort") s.error = errText(app, r.reason);
    } catch (err) { s.error = errText(app, err?.code || err?.message); s.flow = null; }
    s.busy = false;
    await loadMusic(app);
  };
  switch (act) {
    case "mu-mass": return run({ type: "infinitix/music/mass/start" });
    case "mu-submit": {
      const data = {};
      for (const x of app._app.querySelectorAll("[data-mu-f]")) { data[x.dataset.muF] = x.value.trim(); if (x.type === "password") x.value = ""; }
      return run({ type: "infinitix/music/mass/continue", flow_id: s.flow.flow_id, data });
    }
    case "mu-cancel": { const id = s.flow?.flow_id; s.flow = null; if (id) app.callWS({ type: "infinitix/music/mass/abort", flow_id: id }).catch(() => {}); return app.render(); }
    case "mu-pick": {
      if (!s.status) await loadMusic(app, false);
      const players = playersFor(s.status), mine = s.status.mine;
      app.openModal({
        title: t("mu_mine"),
        body: `<p class="muted small">${esc(t("mu_pick_note"))}</p>${players.map((e) => `<label class="row"><input type="radio" name="mu" data-mf="p:${esc(e)}" ${e === mine ? "checked" : ""}> ${esc(playerName(app, e))}</label>`).join("")}
          <label class="row"><input type="radio" name="mu" data-mf="p:" ${!mine ? "checked" : ""}> ${esc(t("mu_none"))}</label>`,
        actions: [{ id: "cancel", label: t("cancel") }, { id: "ok", label: t("save"), cls: "primary" }],
        onAction: async (id, f) => {
          if (id !== "ok") return true;
          const pick = Object.entries(f).find(([k, v]) => k.startsWith("p:") && v)?.[0].slice(2) || null;
          try { s.status.mine = (await app.callWS({ type: "infinitix/music/my_player", entity_id: pick })).mine; app.toast(t("saved")); }
          catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
          app.render();
          return true;
        },
      });
      return;
    }
  }
}

function errText(app, code) {
  for (const key of [`mu_err_${code}`, `md_err_${code}`]) { const m = app.t(key); if (m !== key) return m; }
  return `${app.t("failed")}: ${code}`;
}
