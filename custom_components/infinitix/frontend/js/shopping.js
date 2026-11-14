// Smart shopping list on top of Home Assistant's own `todo` entities (todo.shopping_list or any
// to-do list).  Items are stored by Home Assistant, so voice assistants, the HA app and other
// integrations see the same list.  "Smart" here means: quick multi-item entry, grouping by
// supermarket section (a built-in keyword table, display only, nothing is stored about you),
// large tap targets for use in the shop, and one-tap clearing of completed items.
// Purchase-history suggestions are NOT implemented.

import { esc } from "./util.js";

// Keywords per section (Hebrew / English / Russian).  Matching is "contains", case-insensitive.
const SECTIONS = [
  ["produce", ["עגבני", "מלפפון", "בצל", "תפוח", "בננ", "לימון", "גזר", "חסה", "פטרוז", "שום", "תפוז", "ירק", "פרי", "אבוקדו", "תפוח אדמה", "tomato", "cucumber", "onion", "apple", "banana", "lemon", "carrot", "lettuce", "potato", "fruit", "vegetable", "помидор", "огурц", "лук", "яблок", "банан", "лимон", "морков", "картоф", "овощ", "фрукт"]],
  ["dairy", ["חלב", "גבינ", "יוגורט", "שמנת", "קוטג", "חמאה", "ביצים", "ביצה", "milk", "cheese", "yogurt", "yoghurt", "cream", "butter", "egg", "молок", "сыр", "йогурт", "сметан", "масло", "яйц"]],
  ["meat", ["עוף", "בשר", "שניצל", "דג", "סלמון", "נקניק", "chicken", "beef", "meat", "fish", "salmon", "sausage", "курин", "мясо", "рыб", "колбас"]],
  ["bakery", ["לחם", "פיתה", "לחמני", "חלה", "עוגה", "bread", "pita", "bun", "challah", "cake", "хлеб", "булк", "пирог"]],
  ["pantry", ["אורז", "פסטה", "קמח", "סוכר", "שמן", "מלח", "שימורים", "קפה", "תה", "רוטב", "קורנפלקס", "דגנים", "rice", "pasta", "flour", "sugar", "oil", "salt", "coffee", "tea", "cereal", "рис", "макарон", "мука", "сахар", "масло", "соль", "кофе", "чай"]],
  ["drinks", ["מים", "מיץ", "קולה", "בירה", "יין", "סודה", "water", "juice", "cola", "beer", "wine", "soda", "вода", "сок", "пиво", "вино"]],
  ["frozen", ["קפוא", "גלידה", "frozen", "ice cream", "заморож", "мороженое"]],
  ["cleaning", ["סבון", "נייר טואלט", "מגבות", "אבקת כביסה", "מרכך", "שקיות", "ניקוי", "אקונומיקה", "soap", "toilet paper", "detergent", "bleach", "trash bag", "мыло", "туалетн", "порошок", "чистящ", "пакет"]],
  ["care", ["שמפו", "משחת שיניים", "דאודורנט", "טמפון", "חיתול", "shampoo", "toothpaste", "deodorant", "diaper", "шампунь", "зубная", "дезодорант", "подгузник"]],
];
export const sectionOf = (name) => {
  const n = String(name).toLowerCase();
  for (const [sec, words] of SECTIONS) if (words.some((w) => n.includes(w))) return sec;
  return "other";
};
const ORDER = [...SECTIONS.map(([s]) => s), "other"];

/** "milk, bread\neggs" -> ["milk","bread","eggs"]  (unique, trimmed, bounded) */
export const splitItems = (text) => [...new Set(String(text).split(/[\n,;،]+/).map((x) => x.trim().slice(0, 100)).filter(Boolean))].slice(0, 50);

const fresh = (eid) => ({ eid, items: [], loaded: false, error: null, group: true });
const state = (app) => app._shop;
export const openShopping = (app, eid) => { app._shop = fresh(eid); app._go({ name: "shopping" }); };

async function load(app) {
  const s = state(app);
  try { s.items = (await app.callWS({ type: "todo/item/list", entity_id: s.eid })).items || []; s.error = null; }
  catch (err) { s.error = err?.message || String(err); }
  s.loaded = true;
  if (app._view.name === "shopping") { const keep = app._app.querySelector("#sh-in")?.value; app.render(); if (keep) app._app.querySelector("#sh-in").value = keep; }
}

export function renderShoppingPage(app) {
  const s = state(app), { t } = app;
  if (!s) return "";
  if (!s.loaded) load(app);
  const open = s.items.filter((i) => i.status === "needs_action"), done = s.items.filter((i) => i.status === "completed");
  const name = app._hass.states[s.eid]?.attributes?.friendly_name || s.eid;
  const row = (i) => `<div class="shop-item ${i.status === "completed" ? "done" : ""}" data-uid="${esc(i.uid)}">
      <button class="shop-check" data-act="sh-toggle" role="checkbox" aria-checked="${i.status === "completed"}" aria-label="${esc(i.summary)}"><span aria-hidden="true">${i.status === "completed" ? "✓" : ""}</span></button>
      <span class="shop-name">${esc(i.summary)}</span><button class="iconbtn" data-act="sh-del" aria-label="${esc(t("remove"))}">✕</button></div>`;
  let groups = "";
  if (s.group) {
    const by = {};
    for (const i of open) (by[sectionOf(i.summary)] ||= []).push(i);
    groups = ORDER.filter((k) => by[k]).map((k) => `<h3 class="shop-sec">${esc(t(`shop_sec_${k}`))}</h3>${by[k].map(row).join("")}`).join("");
  } else groups = open.map(row).join("");
  return `<div class="page"><div class="row spread"><h1>${esc(name)}</h1><button class="btn" data-act="sh-back">${esc(t("back"))}</button></div>
    <div class="panel"><div class="row"><textarea id="sh-in" class="input" rows="2" style="flex:1 1 220px;padding-block:8px" placeholder="${esc(t("shop_add_ph"))}" aria-label="${esc(t("shop_add_ph"))}" maxlength="500"></textarea>
      <button class="btn primary" data-act="sh-add">${esc(t("add"))}</button></div><p class="muted small">${esc(t("shop_add_hint"))}</p>
      <label class="row"><input type="checkbox" class="chk" data-act="sh-group" ${s.group ? "checked" : ""}> ${esc(t("shop_group"))}</label></div>
    ${s.error ? `<p class="note" role="alert">${esc(s.error)}</p>` : ""}
    <div class="panel">${open.length ? groups : `<p class="muted">${esc(t(s.loaded ? "shop_empty" : "busy"))}</p>`}</div>
    ${done.length ? `<div class="panel"><div class="row spread"><h3 style="margin:0">${esc(t("shop_done", { n: done.length }))}</h3><button class="btn" data-act="sh-clear">${esc(t("shop_clear"))}</button></div>${done.map(row).join("")}</div>` : ""}</div>`;
}

export async function shoppingAct(app, act, el) {
  const s = state(app), { t } = app;
  if (act === "sh-back") return app._go({ name: "home" });
  if (act === "sh-group") { s.group = el.checked; return app.render(); }
  const uid = el.closest("[data-uid]")?.dataset.uid;
  const call = (svc, data) => app._hass.callService("todo", svc, data, { entity_id: s.eid });
  try {
    if (act === "sh-add") {
      const input = app._app.querySelector("#sh-in");
      const names = splitItems(input.value);
      if (!names.length) return;
      const have = new Set(s.items.filter((i) => i.status === "needs_action").map((i) => i.summary.toLowerCase()));
      for (const n of names) if (!have.has(n.toLowerCase())) await call("add_item", { item: n });
      input.value = "";
    } else if (act === "sh-toggle") {
      const it = s.items.find((i) => i.uid === uid);
      await call("update_item", { item: uid, status: it.status === "completed" ? "needs_action" : "completed" });
    } else if (act === "sh-del") await call("remove_item", { item: [uid] });
    else if (act === "sh-clear") await call("remove_completed_items", {});
  } catch (err) { app.toast(`${t("failed")}: ${err?.message || err}`, true); }
  return load(app);
}
