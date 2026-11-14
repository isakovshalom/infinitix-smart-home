// DEMO MODE: a fake `hass` object so the panel can be opened in a plain browser.
// Everything here is simulated and clearly marked in the UI (orange banner).
// It does NOT talk to Home Assistant; real behaviour is verified separately.
import "../infinitix-panel.js";

const fx = await (await fetch("./fixture.json")).json();
const clone = (o) => JSON.parse(JSON.stringify(o));
let states = clone(fx.states);
let stored = {
  home: { name: "", language: "he", screen: "tablet" }, mode: "auto",
  theme: { mode: "auto", accent: null, layout: "grid" },
  wizard: { completed: false, step: 0, draft: {} },
  rooms: [], entities: {}, room_temp_sensor: {}, weather_entity: null, tablet: { hide_nav: false }, seen_entities: [],
};
if (new URLSearchParams(location.search).get("done") === "1") {
  stored = { ...stored, ...clone(fx.proposal), wizard: { completed: true, step: 0, draft: {} } };
  stored.home.name = "הבית של דנה";
  for (const id of ["light.living_main", "cover.living_blind", "climate.living_ac", "lock.front_door"]) if (stored.entities[id]) stored.entities[id].favorite = true;
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = document.createElement("infinitix-panel");
document.body.append(panel);

function setState(eid, patch) {
  const cur = states[eid];
  states = { ...states, [eid]: { ...cur, ...patch, attributes: { ...cur.attributes, ...(patch.attributes || {}) } } };
  push();
}
function push() { panel.hass = makeHass(); }

const SERVICES = {
  async "turn_on"(d, eid) {
    const a = {};
    if (d.brightness_pct != null) a.brightness = Math.round((d.brightness_pct / 100) * 255);
    if (d.color_temp_kelvin != null) a.color_temp_kelvin = d.color_temp_kelvin;
    if (d.hs_color) a.hs_color = d.hs_color;
    setState(eid, { state: eid.startsWith("scene.") ? "2026-01-01T00:00:00" : "on", attributes: a });
  },
  async "turn_off"(d, eid) { setState(eid, { state: "off" }); },
  async set_cover_position(d, eid) { setState(eid, { state: d.position ? "open" : "closed", attributes: { current_position: d.position } }); },
  async open_cover(d, eid) { setState(eid, { state: "open", attributes: { current_position: 100 } }); },
  async close_cover(d, eid) { setState(eid, { state: "closed", attributes: { current_position: 0 } }); },
  async stop_cover() {},
  async set_temperature(d, eid) { setState(eid, { attributes: { temperature: d.temperature } }); },
  async set_hvac_mode(d, eid) { setState(eid, { state: d.hvac_mode }); },
  async set_fan_mode(d, eid) { setState(eid, { attributes: { fan_mode: d.fan_mode } }); },
  async set_percentage(d, eid) { setState(eid, { attributes: { percentage: d.percentage } }); },
  async oscillate(d, eid) { setState(eid, { attributes: { oscillating: d.oscillating } }); },
  async lock(d, eid) { setState(eid, { state: "locked" }); },
  async unlock(d, eid) { setState(eid, { state: "unlocked" }); },
  async alarm_arm_home(d, eid) { setState(eid, { state: "armed_home" }); },
  async alarm_arm_away(d, eid) { setState(eid, { state: "armed_away" }); },
  async alarm_disarm(d, eid) {
    if (d.code !== "1234") throw new Error("Invalid code (demo code is 1234)");
    setState(eid, { state: "disarmed" });
  },
  async volume_set(d, eid) { setState(eid, { attributes: { volume_level: d.volume_level } }); },
  async media_play_pause(d, eid) { setState(eid, { state: states[eid].state === "playing" ? "paused" : "playing" }); },
};

function makeHass() {
  return {
    __demo: true, states, language: "he", user: { name: "דנה כהן", is_admin: true },
    config: { unit_system: { temperature: "°C" } }, themes: { darkMode: matchMedia("(prefers-color-scheme: dark)").matches },
    hassUrl: (p) => p,
    async callService(domain, service, data) {
      await delay(150);
      const eid = data.entity_id;
      if (eid === "light.hallway_unavailable") throw new Error("Entity unavailable");
      const fn = SERVICES[service];
      if (!fn) throw new Error(`demo: service ${domain}.${service} not simulated`);
      await fn(data, eid);
    },
    async callWS(msg) {
      await delay(60);
      switch (msg.type) {
        case "infinitix/get_config": return { config: clone(stored), is_admin: true, options: {} };
        case "infinitix/get_inventory": return clone(fx.inventory);
        case "infinitix/scan": return { inventory: clone(fx.inventory), proposal: clone(fx.proposal), new_entities: stored.wizard.completed ? ["switch.garden_pump"] : [], missing_entities: [] };
        case "infinitix/save_wizard": stored.wizard = { ...stored.wizard, step: msg.step, draft: msg.draft }; return {};
        case "infinitix/save_config": stored = clone(msg.config); return { config: clone(stored) };
        case "infinitix/dismiss_new": return {};
        default: throw Object.assign(new Error(`demo: ${msg.type} is not simulated (covered by backend tests)`), { code: "demo_unsupported" });
      }
    },
    connection: { subscribeMessage: async () => () => {} },
  };
}
push();
window.__demo = { panel, setState, getStored: () => clone(stored), states: () => states };
