// "Home systems" navigation (lighting, covers, climate, ...) and the dashboard home,
// styled after the INFINITIX Smart Control 360° reference design.  Systems are derived
// from the card type of each entity, so nothing extra has to be configured.

import { esc, formatClock, formatDate, greetingKey } from "./util.js";
import { icon } from "./cards.js";
import { UNASSIGNED, GROUP_OF_CARD, GROUP_ORDER, visibleEntities, visibleRooms, favorites, roomName, entitiesOfRoom } from "./logic.js";
import { hebrewDate } from "./scenarios.js";
import { weatherHTML, roomTempText } from "./dashboard.js";
import { myMusicHTML } from "./music.js";

export const SYSTEM_ICON = {
  lighting: "mdi:lightbulb-group-outline", covers: "mdi:blinds", climate: "mdi:thermostat", media: "mdi:television",
  security: "mdi:shield-home-outline", sensors: "mdi:motion-sensor", scenes: "mdi:palette-outline", lists: "mdi:cart-outline",
};
const UNAVAIL = new Set(["unavailable", "unknown"]);
let jobId = 0;
function lazyGrid(app, items) {
  const id = `sy${++jobId}`;
  if (items.length) app._lazy.push({ id, items });
  return `<div class="grid" data-lazy="${id}"></div>`;
}

/** Entities of one system, optionally limited to one room. */
export function systemItems(cfg, group, room = "") {
  return visibleEntities(cfg).filter((e) => (GROUP_OF_CARD[e.pref.card] || "sensors") === group && (!room || (e.pref.room || UNASSIGNED) === room));
}

/** Systems that have at least one visible card, in display order. */
export function presentSystems(cfg) {
  const has = new Set(visibleEntities(cfg).map((e) => GROUP_OF_CARD[e.pref.card] || "sensors"));
  return GROUP_ORDER.filter((g) => has.has(g));
}

/** Short live summary, e.g. "3 דולקים · 5 כבויים" (counts come from HA states only). */
export function systemStatus(app, cfg, group, room = "") {
  const { t } = app, items = systemItems(cfg, group, room);
  if (!items.length) return t("sys_none");
  const st = (e) => app._hass.states[e.eid]?.state;
  const unav = items.filter((e) => !st(e) || UNAVAIL.has(st(e))).length;
  const tail = unav ? ` · ${t("sys_unavail", { n: unav })}` : "";
  if (group === "lighting") {
    const on = items.filter((e) => st(e) === "on").length, off = items.filter((e) => st(e) === "off").length;
    return `${t("sys_on", { n: on })} · ${t("sys_off", { n: off })}${tail}`;
  }
  if (group === "covers") {
    const open = items.filter((e) => ["open", "opening"].includes(st(e))).length;
    return `${t("sys_open", { n: open })} · ${t("sys_closed", { n: items.length - open - unav })}${tail}`;
  }
  return `${t("sys_avail", { n: items.length - unav, total: items.length })}`;
}

export function sideSystemsHTML(app, cfg, current) {
  const { t } = app;
  return presentSystems(cfg).map((g) => `<button class="side-cat" data-act="open-cat" data-cat="${g}" aria-current="${current === g ? "page" : "false"}">
      <span class="tile-ico">${icon(SYSTEM_ICON[g], "generic")}</span><strong>${esc(t(`g_${g}`))}</strong>
      <span class="side-count" aria-label="${esc(t("sys_count", { n: systemItems(cfg, g).length }))}">${systemItems(cfg, g).length}</span></button>`).join("");
}

// ------------------------------------------------------------------ dashboard home
function homeState(app, cfg) {
  const { t } = app;
  const items = visibleEntities(cfg).filter((e) => !["scene", "script", "shopping"].includes(e.pref.card));
  const unav = items.filter((e) => { const s = app._hass.states[e.eid]?.state; return !s || UNAVAIL.has(s); }).length;
  if (!items.length) return { title: t("dash_title_empty"), detail: t("dash_detail_empty") };
  return unav ? { title: t("dash_title_ok"), detail: t("dash_detail_unavail", { n: unav, total: items.length }), warn: true }
    : { title: t("dash_title_ok"), detail: t("dash_detail_ok", { n: items.length }) };
}

export function dashboardHTML(app, cfg, { roomsGrid = true } = {}) {
  const { t } = app, now = new Date();
  const first = (app._hass.user?.name || "").split(" ")[0];
  const state = homeState(app, cfg);
  const systems = presentSystems(cfg).filter((g) => g !== "scenes" && g !== "lists");
  const scenesList = visibleEntities(cfg).filter((e) => e.pref.card === "scene" || e.pref.card === "script");
  const favs = favorites(cfg);
  const rooms = visibleRooms(cfg);
  const shortcut = (act, attrs, ic, label) => `<button class="dash-shortcut" data-act="${act}" ${attrs}>${icon(ic, "generic")}<strong>${esc(label)}</strong></button>`;
  return `<div class="page">
    <header class="dash-heading"><h1 data-greet>${esc(t(greetingKey(now.getHours())))}${first ? `, ${esc(first)}` : ""}</h1><p>${esc(t("dash_sub"))}</p></header>
    <div class="dash-hero-grid">
      <section class="dash-hero"><div>${cfg.home.name ? `<span class="dash-pill">${esc(cfg.home.name)}</span>` : ""}<h2>${esc(state.title)}</h2>
        <p class="${state.warn ? "warn-text" : ""}" data-home-state>${esc(state.detail)}</p></div>
        <div class="dash-shortcuts">
          ${systems.includes("lighting") ? shortcut("open-cat", 'data-cat="lighting"', SYSTEM_ICON.lighting, t("g_lighting")) : ""}
          ${scenesList.length ? shortcut("open-cat", 'data-cat="scenes"', SYSTEM_ICON.scenes, t("g_scenes")) : ""}
          ${shortcut("open-status", "", "mdi:timer-outline", t("sc_status"))}
          ${systems.includes("climate") ? shortcut("open-cat", 'data-cat="climate"', SYSTEM_ICON.climate, t("g_climate")) : ""}
        </div></section>
      <section class="dash-clock" aria-label="${esc(t("clock"))}"><span>${esc(t("clock"))}</span>
        <time data-clock>${esc(formatClock(now, app.lang))}</time><strong data-date>${esc(formatDate(now, app.lang))}</strong>
        <small data-hdate>${esc(hebrewDate(now, app.lang))}</small>${weatherHTML(app, cfg)}</section>
    </div>
    ${systems.length ? `<div class="dash-metrics">${systems.map((g) => `<button class="dash-metric" data-act="open-cat" data-cat="${g}">
        <span class="tile-ico">${icon(SYSTEM_ICON[g], "generic")}</span><span><strong>${esc(t(`g_${g}`))}</strong>
        <small class="live-scope" data-cat-status="${g}">${esc(systemStatus(app, cfg, g))}</small></span></button>`).join("")}</div>` : ""}
    ${scenesList.length ? `<section class="dash-section"><div class="row spread"><h2>${esc(t("quick_scenes"))}</h2>
        <button class="linkbtn" data-act="open-cat" data-cat="scenes">${esc(t("all"))} ‹</button></div>${lazyGrid(app, scenesList.slice(0, 8))}</section>` : ""}
    ${app._view?.name === "wizard" ? "" : myMusicHTML(app, lazyGrid)}
    <section class="dash-section"><h2>${esc(t("favorites"))}</h2>${favs.length ? lazyGrid(app, favs) : `<div class="empty">${esc(t("no_favorites"))}</div>`}</section>
    ${roomsGrid ? `<section class="dash-section"><h2>${esc(t("rooms"))}</h2>${rooms.length ? `<div class="grid room-grid">${rooms.map((r) => roomTile(app, cfg, r)).join("")}</div>` : `<div class="empty">${esc(t("no_rooms"))}</div>`}</section>` : ""}
  </div>`;
}

function roomTile(app, cfg, r) {
  const n = entitiesOfRoom(cfg, r.id).length;
  return `<button class="room-tile" data-act="open-room" data-room="${esc(r.id)}">
    <div class="rt-top"><span class="tile-ico">${icon(r.icon || "mdi:door", "generic")}</span><span class="rt-meta" data-room-temp="${esc(r.id)}">${roomTempText(app, cfg, r.id)}</span></div>
    <div><div class="rt-name">${esc(roomName(r, app.t))}</div><div class="rt-meta">${esc(app.t("sys_count", { n }))}</div></div></button>`;
}

// ------------------------------------------------------------------ category (system) view
export function categoryHTML(app, cfg, group, room = "") {
  const { t } = app;
  const all = systemItems(cfg, group);
  const roomsWith = visibleRooms(cfg).filter((r) => all.some((e) => (e.pref.room || UNASSIGNED) === r.id));
  if (room && !roomsWith.some((r) => r.id === room)) room = "";
  const scope = room ? roomName(cfg.rooms.find((r) => r.id === room), t) : t("whole_home");
  const batch = group === "lighting" && app._isLightingBatchable?.(cfg, room)
    ? `<div class="row"><button class="btn primary" data-act="cat-batch" data-op="on" data-room="${esc(room)}">${esc(t("all_on"))}</button>
       <button class="btn" data-act="cat-batch" data-op="off" data-room="${esc(room)}">${esc(t("all_off"))}</button></div>` : "";
  const chips = roomsWith.length > 1 ? `<div class="chips" role="group" aria-label="${esc(t("rooms"))}">
      <button class="chip" data-act="open-cat" data-cat="${group}" data-room="" aria-pressed="${!room}">${esc(t("whole_home"))}</button>
      ${roomsWith.map((r) => `<button class="chip" data-act="open-cat" data-cat="${group}" data-room="${esc(r.id)}" aria-pressed="${room === r.id}">${esc(roomName(r, t))}</button>`).join("")}</div>` : "";
  const sections = (room ? roomsWith.filter((r) => r.id === room) : roomsWith).map((r) => {
    const items = systemItems(cfg, group, r.id);
    return `<section class="dash-section"><div class="row spread"><h2>${esc(roomName(r, t))}</h2><span class="muted small">${esc(t("sys_count", { n: items.length }))}</span></div>${lazyGrid(app, items)}</section>`;
  }).join("");
  return `<div class="page">
    <nav class="crumbs" aria-label="${esc(t("breadcrumb"))}"><ol><li><button class="linkbtn" data-act="go-home">${esc(t("home"))}</button></li>
      <li>${room ? `<button class="linkbtn" data-act="open-cat" data-cat="${group}" data-room="">${esc(t(`g_${group}`))}</button>` : `<span aria-current="page">${esc(t(`g_${group}`))}</span>`}</li>
      ${room ? `<li><span aria-current="page">${esc(scope)}</span></li>` : ""}</ol></nav>
    <div class="flow-heading"><h1>${esc(t(`g_${group}`))}</h1><span class="tag">${esc(scope)}</span></div>
    <section class="overview"><span class="tile-ico big">${icon(SYSTEM_ICON[group], "generic")}</span>
      <div class="ov-data"><h2>${esc(scope)}</h2><span class="live-scope" data-cat-status="${group}" data-cat-room="${esc(room)}">${esc(systemStatus(app, cfg, group, room))}</span></div>${batch}</section>
    ${chips}
    ${sections || `<div class="empty">${esc(t("sys_none"))}</div>`}
  </div>`;
}
