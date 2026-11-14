// Small pure helpers shared by the panel modules (no Home Assistant dependency).

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const clone = (o) => JSON.parse(JSON.stringify(o));

export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export const locale = (lang) => ({ he: "he-IL", ru: "ru-RU" }[lang] || "en-GB");

/** 24-hour clock, e.g. "07:05" */
export function formatClock(date, lang) {
  return new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }).format(date);
}

export function formatDate(date, lang) {
  return new Intl.DateTimeFormat(locale(lang), { weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** Greeting key by hour of day. */
export function greetingKey(hour) {
  if (hour >= 5 && hour < 12) return "greet_morning";
  if (hour >= 12 && hour < 17) return "greet_afternoon";
  if (hour >= 17 && hour < 22) return "greet_evening";
  return "greet_night";
}

export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

export const domainOf = (eid) => eid.split(".", 1)[0];

/** Re-number `order` of a list in place after it was re-arranged. */
export function renumber(list) {
  list.forEach((x, i) => (x.order = i));
  return list;
}

/** Move item at index i by delta inside array (returns true if moved). */
export function moveItem(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}
