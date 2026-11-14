// Pure view-model logic (no DOM, no Home Assistant): grouping, ordering, filtering.

import { byOrder } from "./util.js";

export const UNASSIGNED = "__unassigned__";

export const GROUP_OF_CARD = {
  light: "lighting", switch: "lighting", outlet: "lighting", fan: "lighting",
  cover: "covers", climate: "climate", media_player: "media",
  lock: "security", alarm: "security", camera: "security",
  sensor: "sensors", binary_sensor: "sensors", generic: "sensors",
  scene: "scenes", script: "scenes", shopping: "lists",
};
export const GROUP_ORDER = ["lighting", "covers", "climate", "media", "security", "sensors", "scenes", "lists"];

/** Entities of the dashboard (not hidden), as [{eid, pref}], ordered. */
export function visibleEntities(cfg) {
  return Object.entries(cfg.entities)
    .filter(([, p]) => !p.hidden)
    .map(([eid, pref]) => ({ eid, pref }))
    .sort((a, b) => a.pref.order - b.pref.order || a.eid.localeCompare(b.eid));
}

export function entitiesOfRoom(cfg, roomId) {
  return visibleEntities(cfg).filter((e) => (e.pref.room || UNASSIGNED) === roomId);
}

/** Rooms to show: visible ones in order; the unassigned room only if it has entities. */
export function visibleRooms(cfg) {
  return [...cfg.rooms]
    .filter((r) => r.visible !== false)
    .sort(byOrder)
    .filter((r) => r.id !== UNASSIGNED || entitiesOfRoom(cfg, UNASSIGNED).length > 0);
}

export function groupEntities(list) {
  const groups = {};
  for (const e of list) {
    const g = GROUP_OF_CARD[e.pref.card] || "sensors";
    (groups[g] ||= []).push(e);
  }
  return GROUP_ORDER.filter((g) => groups[g]?.length).map((g) => ({ group: g, items: groups[g] }));
}

export const favorites = (cfg) => visibleEntities(cfg).filter((e) => e.pref.favorite && e.pref.card !== "scene" && e.pref.card !== "script");
export const scenes = (cfg) => visibleEntities(cfg).filter((e) => e.pref.card === "scene" || e.pref.card === "script");

export function roomName(room, t) {
  if (room.id === UNASSIGNED && !room.name) return t("unassigned");
  return room.name || t("unassigned");
}

export const isIncluded = (cfg, eid) => !!cfg.entities[eid] && !cfg.entities[eid].hidden;

/** Filtering for the entity picker. `f` = {q, room, domain, device, integration, onlyIncluded, showHidden, onlyNew}. */
export function filterInventory(inv, cfg, f, newSet = new Set()) {
  const q = (f.q || "").trim().toLowerCase();
  return inv.entities.filter((e) => {
    if (!f.showHidden && e.default_hidden && !isIncluded(cfg, e.entity_id)) return false;
    if (f.onlyIncluded && !isIncluded(cfg, e.entity_id)) return false;
    if (f.onlyNew && !newSet.has(e.entity_id)) return false;
    if (f.room) {
      const room = cfg.entities[e.entity_id]?.room ?? roomForArea(cfg, e.area_id);
      if ((room || UNASSIGNED) !== f.room) return false;
    }
    if (f.domain && e.domain !== f.domain) return false;
    if (f.device && e.device_id !== f.device) return false;
    if (f.integration && e.integration !== f.integration) return false;
    if (q && !(`${e.name} ${e.entity_id} ${e.device_name || ""}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

export function roomForArea(cfg, areaId) {
  if (!areaId) return UNASSIGNED;
  return cfg.rooms.find((r) => r.area_id === areaId)?.id ?? UNASSIGNED;
}

export function uniqueValues(inv, key) {
  return [...new Set(inv.entities.map((e) => e[key]).filter(Boolean))].sort();
}

/** Default pref for adding an entity to the dashboard. */
export function newPref(item, cfg) {
  const room = roomForArea(cfg, item.area_id);
  const order = Object.values(cfg.entities).filter((p) => p.room === room).length;
  return { card: item.card || "generic", name: null, icon: null, room, hidden: false, favorite: false, size: "m", order };
}
