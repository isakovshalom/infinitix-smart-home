// Layout choice per device/browser, and pure re-ordering helpers for edit mode.
// No DOM and no Home Assistant here (unit tested with `node --test`).
//
// Model: the server stores one *home default* (theme.layout, set from the wizard's
// screen type).  Each browser keeps its own choice locally, so a wall tablet can use
// Rail while phones use Rows.  Order, hidden cards, favourites and sizes live in the
// shared config (rooms/entities) and are the same in every layout; changing layout
// only changes how they are drawn and never sends a command to a device.

export const LAYOUTS = ["mosaic", "rows", "rail", "stage"];
export const SCREEN_DEFAULT = { mobile: "rows", tablet: "rail", desktop: "mosaic" };
const KEY = "infinitix.layout.v1";

export const defaultLayoutForScreen = (screen) => SCREEN_DEFAULT[screen] || "mosaic";

/**
 * The layout to draw.
 * stored: this device's own choice (or null); homeDefault: cfg.theme.layout;
 * allowed: layouts the plan allows; narrow: Rail needs width, so it falls back to Mosaic.
 */
export function resolveLayout({ stored, homeDefault, screen, allowed = LAYOUTS, narrow = false }) {
  let l = [stored, homeDefault, defaultLayoutForScreen(screen)].find((x) => LAYOUTS.includes(x)) || "mosaic";
  if (!allowed.includes(l)) l = allowed[0] || "mosaic";
  if (l === "rail" && narrow) l = allowed.includes("mosaic") ? "mosaic" : allowed[0];
  return l;
}

/** Device-local storage; may be unavailable (private mode, kiosk apps): never throws. */
export function readDeviceLayout(storage = globalThis.localStorage, userId = "") {
  try {
    const all = JSON.parse(storage?.getItem(KEY) || "{}");
    return LAYOUTS.includes(all[userId]) ? all[userId] : null;
  } catch { return null; }
}

export function writeDeviceLayout(layout, storage = globalThis.localStorage, userId = "") {
  try {
    const all = JSON.parse(storage?.getItem(KEY) || "{}");
    if (layout && LAYOUTS.includes(layout)) all[userId] = layout; else delete all[userId];
    storage?.setItem(KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}

/**
 * Move `fromId` to the position of `toId` inside `ids` (drag and drop result).
 * Returns a new array; unknown ids leave the order unchanged.
 */
export function reorder(ids, fromId, toId) {
  const from = ids.indexOf(fromId), to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return [...ids];
  const out = [...ids];
  out.splice(from, 1);
  out.splice(to, 0, fromId);
  return out;
}

/** Write `order` = index for each id (mutates prefs, which is the editing draft). */
export function applyOrder(prefs, ids) {
  ids.forEach((id, i) => { if (prefs[id]) prefs[id].order = i; });
  return prefs;
}
