// Home and room screens.  Used by the live dashboard and by the wizard preview.
// Cards are filled in progressively (lazy jobs) so hundreds of entities stay responsive.

import { esc, formatClock, formatDate, greetingKey } from "./util.js";
import { icon, translateState } from "./cards.js";
import { UNASSIGNED, entitiesOfRoom, favorites, groupEntities, roomName, scenes, visibleRooms } from "./logic.js";

let jobId = 0;
/** Placeholder grid whose cards are rendered later by the panel (`app._lazy`). */
function lazyGrid(app, items, extraClass = "") {
  const id = `lz${++jobId}`;
  app._lazy.push({ id, items });
  return `<div class="grid ${extraClass}" data-lazy="${id}"></div>`;
}

export function roomTempText(app, cfg, roomId) {
  const eid = cfg.room_temp_sensor?.[roomId];
  const st = eid && app._hass.states[eid];
  if (!st || st.state === "unavailable" || st.state === "unknown" || Number.isNaN(Number(st.state))) return "";
  return `${Number(st.state).toFixed(1).replace(/\.0$/, "")}${esc(st.attributes.unit_of_measurement || "°")}`;
}

export function weatherHTML(app, cfg) {
  const eid = cfg.weather_entity;
  const st = eid && app._hass.states[eid];
  if (!st) return "";
  const temp = st.attributes.temperature;
  const cond = translateState(app.t, st.state) ?? (app._hass.formatEntityState?.(st) ?? st.state);
  // A button: opens the 24-hour / 7-day forecast when the weather source provides one.
  return `<button class="weather" data-weather="${esc(eid)}" data-act="forecast" aria-label="${esc(app.t("forecast"))}">${icon("mdi:weather-partly-cloudy", "sensor")}<bdi dir="ltr">${temp != null ? esc(temp) + esc(st.attributes.temperature_unit || "°") : ""}</bdi><span class="muted small">${esc(cond)}</span></button>`;
}

export function homeHTML(app, cfg, { hero = true, roomsGrid = true } = {}) {
  const { t } = app;
  const now = new Date();
  const first = (app._hass.user?.name || "").split(" ")[0];
  const rooms = visibleRooms(cfg);
  const favs = favorites(cfg), sc = scenes(cfg);
  return `<div class="page">
    ${hero ? `<div class="hero">
      <div><div class="greet" data-greet>${esc(t(greetingKey(now.getHours())))}${first ? `, ${esc(first)}` : ""}</div>
        <div class="date" data-date>${esc(formatDate(now, app.lang))}${cfg.home.name ? ` · ${esc(cfg.home.name)}` : ""}</div></div>
      <div class="row" style="gap:16px">${weatherHTML(app, cfg)}<div class="clock" data-clock aria-live="off">${esc(formatClock(now, app.lang))}</div></div>
    </div>` : ""}
    ${roomsGrid ? `<h2>${esc(t("rooms"))}</h2>
    ${rooms.length ? `<div class="grid room-grid">${rooms.map((r) => roomTile(app, cfg, r)).join("")}</div>` : `<div class="empty">${esc(t("no_rooms"))}</div>`}` : ""}
    <h2>${esc(t("favorites"))}</h2>
    ${favs.length ? lazyGrid(app, favs) : `<div class="empty">${esc(t("no_favorites"))}</div>`}
    ${sc.length ? `<h2>${esc(t("scenes"))}</h2>${lazyGrid(app, sc)}` : ""}
  </div>`;
}

function roomTile(app, cfg, r) {
  const n = entitiesOfRoom(cfg, r.id).length;
  const tmp = roomTempText(app, cfg, r.id);
  return `<button class="room-tile" data-act="open-room" data-room="${esc(r.id)}">
    <div class="rt-top">${icon(r.icon || "mdi:door", "generic")}<span class="rt-meta" data-room-temp="${esc(r.id)}">${tmp}</span></div>
    <div><div class="rt-name">${esc(roomName(r, app.t))}</div><div class="rt-meta">${n}</div></div></button>`;
}

export function roomHTML(app, cfg, roomId, { back = true, title = true } = {}) {
  const { t } = app;
  const room = cfg.rooms.find((r) => r.id === roomId);
  if (!room) return `<div class="page"><div class="empty">${esc(t("none_in_room"))}</div></div>`;
  const groups = groupEntities(entitiesOfRoom(cfg, roomId));
  const tmp = roomTempText(app, cfg, roomId);
  return `<div class="page">
    <div class="row spread" style="margin-block-end:8px">
      <div class="row">${back ? `<button class="iconbtn" data-act="go-home" aria-label="${esc(t("back"))}">${app.dir === "rtl" ? "→" : "←"}</button>` : ""}
        ${title ? `<h1>${esc(roomName(room, t))}</h1>` : ""}</div>
      <span class="muted" data-room-temp="${esc(roomId)}">${tmp}</span></div>
    ${groups.length ? groups.map((g) => `<h2>${esc(t(`g_${g.group}`))}</h2>${lazyGrid(app, g.items)}`).join("") : `<div class="empty">${esc(t("none_in_room"))}</div>`}
  </div>`;
}
