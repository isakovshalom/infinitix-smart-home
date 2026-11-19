// Run: node --test tests/js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLayout, readDeviceLayout, writeDeviceLayout, reorder, applyOrder, defaultLayoutForScreen } from "../../custom_components/infinitix/frontend/js/layout.js";
import { visibleEntities, entitiesOfRoom } from "../../custom_components/infinitix/frontend/js/logic.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test("wizard screen type is the default; device choice wins", () => {
  assert.equal(defaultLayoutForScreen("tablet"), "rail");
  assert.equal(resolveLayout({ stored: null, homeDefault: null, screen: "mobile" }), "rows");
  assert.equal(resolveLayout({ stored: null, homeDefault: "stage", screen: "mobile" }), "stage");
  assert.equal(resolveLayout({ stored: "rows", homeDefault: "stage", screen: "tablet" }), "rows");
  assert.equal(resolveLayout({ stored: "bogus", homeDefault: "rows" }), "rows");
});

test("rail falls back on narrow screens and plan limits apply", () => {
  assert.equal(resolveLayout({ stored: "rail", narrow: true }), "mosaic");
  assert.equal(resolveLayout({ stored: "stage", allowed: ["mosaic", "rows"] }), "mosaic");
});

test("device storage is per user and survives broken storage", () => {
  const s = mem();
  assert.equal(readDeviceLayout(s, "u1"), null);
  writeDeviceLayout("stage", s, "u1"); writeDeviceLayout("rows", s, "u2");
  assert.equal(readDeviceLayout(s, "u1"), "stage");
  assert.equal(readDeviceLayout(s, "u2"), "rows");
  writeDeviceLayout(null, s, "u1");
  assert.equal(readDeviceLayout(s, "u1"), null);
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(readDeviceLayout(broken), null);
  assert.equal(writeDeviceLayout("rows", broken), false);
  assert.equal(readDeviceLayout(undefined), null);
});

test("switching layouts never changes the customisations", () => {
  const cfg = {
    theme: { layout: "mosaic" }, rooms: [{ id: "r1", order: 0 }],
    entities: {
      "light.a": { room: "r1", order: 1, hidden: false, favorite: true, size: "l", card: "light" },
      "light.b": { room: "r1", order: 0, hidden: true, favorite: false, size: "s", card: "light" },
      "switch.c": { room: "r1", order: 2, hidden: false, favorite: false, size: "m", card: "switch" },
    },
  };
  const before = JSON.stringify(cfg.entities);
  const s = mem();
  for (const l of ["rows", "rail", "stage", "mosaic"]) {
    writeDeviceLayout(l, s);
    resolveLayout({ stored: readDeviceLayout(s), homeDefault: cfg.theme.layout });
    assert.deepEqual(entitiesOfRoom(cfg, "r1").map((e) => e.eid), ["light.a", "switch.c"]);
  }
  assert.equal(JSON.stringify(cfg.entities), before);
  assert.equal(visibleEntities(cfg).length, 2);
});

test("drag reorder", () => {
  assert.deepEqual(reorder(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
  assert.deepEqual(reorder(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(reorder(["a", "b"], "x", "a"), ["a", "b"]);
  const prefs = { a: { order: 5 }, b: { order: 9 } };
  applyOrder(prefs, ["b", "a"]);
  assert.deepEqual(prefs, { a: { order: 1 }, b: { order: 0 } });
});
