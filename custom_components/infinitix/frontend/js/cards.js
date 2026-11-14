// Card renderers.  Every control is rendered only if the entity actually supports it
// (capabilities come from the backend classification, values from the live state).
// Cards are strings; the panel handles events through data-act attributes.

import { esc, clamp } from "./util.js";

export const DEFAULT_ICON = {
  light: "mdi:lightbulb", switch: "mdi:toggle-switch-outline", outlet: "mdi:power-socket-eu", cover: "mdi:blinds",
  climate: "mdi:thermostat", sensor: "mdi:eye", binary_sensor: "mdi:radiobox-marked", scene: "mdi:palette",
  script: "mdi:script-text-play", camera: "mdi:cctv", alarm: "mdi:shield-home", lock: "mdi:lock",
  media_player: "mdi:speaker", fan: "mdi:fan", shopping: "mdi:cart-outline", generic: "mdi:help-circle-outline",
};
const FALLBACK_GLYPH = {
  light: "💡", switch: "⏻", outlet: "🔌", cover: "▤", climate: "🌡", sensor: "◔", binary_sensor: "◉", scene: "✦",
  script: "▶", camera: "📷", alarm: "🛡", lock: "🔒", media_player: "♪", fan: "✢", shopping: "🛒", generic: "•",
};

/** <ha-icon> inside Home Assistant; a plain glyph where it does not exist (demo page). */
export function icon(name, type = "generic", cls = "") {
  if (typeof customElements !== "undefined" && customElements.get("ha-icon")) {
    return `<ha-icon class="ico ${cls}" icon="${esc(name)}"></ha-icon>`;
  }
  return `<span class="ico ${cls}" aria-hidden="true">${FALLBACK_GLYPH[type] || "•"}</span>`;
}

const num = (v, d = null) => (typeof v === "number" && Number.isFinite(v) ? v : d);

function isActive(type, st) {
  if (!st) return false;
  const s = st.state;
  switch (type) {
    case "light": case "switch": case "outlet": case "fan": case "binary_sensor": case "script": return s === "on";
    case "cover": return s === "open" || s === "opening";
    case "climate": return s !== "off" && s !== "unavailable" && s !== "unknown";
    case "lock": return s === "unlocked";
    case "alarm": return s.startsWith("armed");
    case "media_player": return s === "playing";
    default: return false;
  }
}

// Only these raw states are translated by us; everything else goes to HA's own formatter,
// so an unrelated sensor state such as "open" in some enum is never mistaken for a UI word.
const STATE_KEYS = new Set(["on", "off", "open", "closed", "opening", "closing", "unavailable", "unknown", "locked", "unlocked", "locking",
  "unlocking", "disarmed", "armed_home", "armed_away", "armed_night", "armed_vacation", "arming", "pending", "triggered", "playing", "paused",
  "idle", "standby", "sunny", "clear-night", "cloudy", "partlycloudy", "rainy", "pouring", "snowy", "fog", "windy", "lightning",
  "lightning-rainy", "hail", "exceptional", "cool", "heat", "auto", "heat_cool", "dry", "fan_only"]);
export const translateState = (t, s) => (STATE_KEYS.has(s) ? t(s) : null);

export function stateLabel(ctx, st) {
  const k = st.state;
  const tr = translateState(ctx.t, k);
  if (tr) return tr;
  try { return ctx.hass.formatEntityState ? ctx.hass.formatEntityState(st) : k; } catch { return k; }
}

const switchBtn = (on, label) =>
  `<button class="switch-hit" data-act="toggle" role="switch" aria-checked="${on}" aria-label="${esc(label)}"><span class="switch" aria-hidden="true" ${on ? 'aria-checked="true"' : ""}></span></button>`;

const slider = (ctx, label, kind, min, max, value, step = 1, unit = "") =>
  `<div class="slider-row"><span>${esc(label)}</span>
    <input type="range" data-act="slider" data-kind="${kind}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label)}">
    <output>${Math.round(value)}${unit}</output></div>`;

const btn = (act, text, extra = "", cls = "") => `<button class="btn ${cls}" data-act="${act}" ${extra}>${esc(text)}</button>`;

// ------------------------------------------------------------------ bodies
const BODY = {
  light(ctx, eid, st, caps) {
    const a = st.attributes, on = st.state === "on";
    let html = "";
    if (on) {
      if (caps.includes("brightness")) {
        const pct = a.brightness != null ? Math.round((a.brightness / 255) * 100) : 100;
        html += slider(ctx, ctx.t("brightness"), "brightness_pct", 1, 100, pct, 1, "%");
      }
      if (caps.includes("color_temp")) {
        const lo = num(a.min_color_temp_kelvin, 2000), hi = num(a.max_color_temp_kelvin, 6500);
        html += slider(ctx, ctx.t("color_temp"), "color_temp_kelvin", lo, hi, clamp(num(a.color_temp_kelvin, lo), lo, hi), 50, "K");
      }
      if (caps.includes("color")) {
        html += slider(ctx, ctx.t("color"), "hue", 0, 360, num(a.hs_color?.[0], 0), 1, "°");
      }
    }
    return { right: switchBtn(on, "on/off"), body: html };
  },
  switch(ctx, eid, st) { return { right: switchBtn(st.state === "on", "on/off"), body: "" }; },
  outlet(ctx, eid, st) { return { right: switchBtn(st.state === "on", "on/off"), body: "" }; },
  fan(ctx, eid, st, caps) {
    const a = st.attributes, on = st.state === "on";
    let body = "";
    if (on && caps.includes("speed")) body += slider(ctx, ctx.t("speed"), "fan_pct", 1, 100, num(a.percentage, 50), num(a.percentage_step, 1), "%");
    if (on && caps.includes("oscillate")) body += `<div class="controls">${btn("oscillate", ctx.t("oscillate"), `aria-pressed="${!!a.oscillating}"`, a.oscillating ? "primary" : "")}</div>`;
    return { right: switchBtn(on, "on/off"), body };
  },
  cover(ctx, eid, st, caps) {
    const pos = num(st.attributes.current_position);
    let body = `<div class="controls">`;
    if (caps.includes("open")) body += btn("cover", ctx.t("act_open"), 'data-svc="open_cover"');
    if (caps.includes("stop")) body += btn("cover", ctx.t("act_stop"), 'data-svc="stop_cover"');
    if (caps.includes("close")) body += btn("cover", ctx.t("act_close"), 'data-svc="close_cover"');
    body += `</div>`;
    if (caps.includes("position") && pos != null) body += slider(ctx, ctx.t("position"), "cover_position", 0, 100, pos, 1, "%");
    return { body, state: pos != null ? `${stateLabel(ctx, st)} · ${pos}%` : null };
  },
  climate(ctx, eid, st, caps) {
    const a = st.attributes;
    const cur = num(a.current_temperature), tgt = num(a.temperature);
    const unit = ctx.hass.config?.unit_system?.temperature || "°C";
    let body = "";
    if (caps.includes("target_temperature") && tgt != null) {
      body += `<div class="stepper"><button class="btn" data-act="temp" data-dir="-1" aria-label="-">−</button>
        <span class="val" aria-label="${esc(ctx.t("target_temp"))}">${tgt}${esc(unit)}</span>
        <button class="btn" data-act="temp" data-dir="1" aria-label="+">+</button></div>`;
    } else if (caps.includes("target_temperature_range") && !caps.includes("target_temperature")) {
      body += `<div class="card-state">${esc(ctx.t("range_readonly"))}: ${num(a.target_temp_low, "–")}–${num(a.target_temp_high, "–")}${esc(unit)}</div>`;
    }
    if (caps.includes("hvac_mode") && Array.isArray(a.hvac_modes)) {
      body += `<div class="field" style="margin:0"><label class="label">${esc(ctx.t("hvac_mode"))}</label>
        <select data-act="select" data-kind="hvac_mode" aria-label="${esc(ctx.t("hvac_mode"))}">${a.hvac_modes
          .map((m) => `<option value="${esc(m)}" ${m === st.state ? "selected" : ""}>${esc(translateState(ctx.t, m) ?? m)}</option>`).join("")}</select></div>`;
    }
    if (caps.includes("fan_mode") && Array.isArray(a.fan_modes)) {
      body += `<div class="field" style="margin:0"><label class="label">${esc(ctx.t("fan_mode"))}</label>
        <select data-act="select" data-kind="fan_mode" aria-label="${esc(ctx.t("fan_mode"))}">${a.fan_modes
          .map((m) => `<option value="${esc(m)}" ${m === a.fan_mode ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></div>`;
    }
    return { body, state: cur != null ? `${ctx.t("current_temp")}: ${cur}${unit} · ${stateLabel(ctx, st)}` : null };
  },
  sensor(ctx, eid, st) {
    const unit = st.attributes.unit_of_measurement;
    const numeric = st.state !== "" && !Number.isNaN(Number(st.state));
    const val = numeric ? esc(st.state) : esc(stateLabel(ctx, st));
    return { body: `<div class="card-value">${val}${unit && numeric ? `<small>${esc(unit)}</small>` : ""}</div>`, noState: true };
  },
  binary_sensor(ctx, eid, st) { return { body: "" }; },
  scene(ctx) { return { body: `<div class="controls">${btn("activate", ctx.t("act_activate"), "", "primary")}</div>`, noState: true }; },
  script(ctx, eid, st) { return { body: `<div class="controls">${btn("run", ctx.t("act_run"), "", "primary")}</div>`, state: st.state === "on" ? ctx.t("busy") : null }; },
  lock(ctx, eid, st, caps) {
    const locked = st.state === "locked";
    let body = `<div class="controls">${locked ? btn("lock-unlock", ctx.t("act_unlock"), 'data-svc="unlock"', "danger") : btn("lock-lock", ctx.t("act_lock"), 'data-svc="lock"', "primary")}`;
    if (caps.includes("open")) body += btn("lock-open", ctx.t("act_open"), 'data-svc="open"', "danger");
    return { body: body + "</div>" };
  },
  alarm(ctx, eid, st, caps) {
    let body = `<div class="controls">`;
    for (const c of ["arm_home", "arm_away", "arm_night", "arm_vacation"]) if (caps.includes(c)) body += btn("alarm", ctx.t(`act_${c}`), `data-svc="alarm_${c}"`);
    if (st.state !== "disarmed") body += btn("alarm-disarm", ctx.t("act_disarm"), 'data-svc="alarm_disarm"', "danger");
    return { body: body + "</div>" };
  },
  camera(ctx, eid, st, caps) {
    const pic = st.attributes.entity_picture;
    const src = pic ? ctx.hass.hassUrl?.(pic) ?? pic : "";
    const body = `<div class="cam-wrap" data-cam-wrap>${src ? `<img class="cam" data-cam="${esc(eid)}" data-src="${esc(src)}" alt="" loading="lazy" src="${esc(src)}">` : `<div class="cam"></div>`}</div>
      <div class="controls">${caps.includes("stream") ? btn("cam-live", ctx.t("live")) : ""}${btn("cam-snap", ctx.t("snapshot"))}</div>`;
    return { body };
  },
  media_player(ctx, eid, st, caps) {
    const a = st.attributes;
    let body = "";
    const title = [a.media_title, a.media_artist].filter(Boolean).join(" – ");
    if (title) body += `<div class="card-state">${esc(title)}</div>`;
    const c = [];
    if (caps.includes("previous")) c.push(btn("media", ctx.t("act_prev"), 'data-svc="media_previous_track"'));
    if (caps.includes("play") || caps.includes("pause")) c.push(btn("media", st.state === "playing" ? ctx.t("act_pause") : ctx.t("act_play"), 'data-svc="media_play_pause"', "primary"));
    if (caps.includes("next")) c.push(btn("media", ctx.t("act_next"), 'data-svc="media_next_track"'));
    if (c.length) body += `<div class="controls">${c.join("")}</div>`;
    if (caps.includes("volume_set") && a.volume_level != null) body += slider(ctx, ctx.t("volume"), "volume", 0, 100, Math.round(a.volume_level * 100), 1, "%");
    const power = caps.includes("turn_on") && caps.includes("turn_off");
    return { right: power ? switchBtn(st.state !== "off" && st.state !== "unavailable", ctx.t("act_power")) : "", body };
  },
  shopping(ctx, eid, st) {
    const n = Number(st.state);
    return { body: `<div class="controls">${btn("shop-open", ctx.t("shop_open"), "", "primary")}</div>`, state: Number.isFinite(n) ? ctx.t("shop_count", { n }) : null };
  },
  generic(ctx, eid, st) { return { body: "" }; },
};

// ------------------------------------------------------------------ public
export function cardHTML(ctx, eid, pref) {
  const type = BODY[pref.card] ? pref.card : "generic";
  const st = ctx.hass.states[eid];
  const info = ctx.invMap.get(eid);
  const caps = info?.capabilities ?? [];
  const missing = !st;
  const unavail = missing || st.state === "unavailable";
  const unknown = !missing && st.state === "unknown";
  const name = pref.name || st?.attributes?.friendly_name || info?.name || eid;
  const active = isActive(type, st) && !unavail;
  const ic = pref.icon || st?.attributes?.icon || DEFAULT_ICON[type];

  let parts = { body: "" };
  let status = "";
  if (missing) {
    status = `<div class="card-state err">${esc(ctx.t("missing"))}</div>`;
  } else {
    try {
      parts = BODY[type](ctx, eid, st, caps) || { body: "" };
    } catch (err) {
      console.warn("INFINITIX: card render failed", eid, err);
      parts = { body: "" };
    }
    if (unavail) status = `<div class="card-state err">${esc(ctx.t("unavailable"))}</div>`;
    else if (unknown) status = `<div class="card-state err">${esc(ctx.t("unknown"))}</div>`;
    else if (!parts.noState) status = `<div class="card-state">${esc(parts.state ?? stateLabel(ctx, st))}</div>`;
  }

  const edit = ctx.edit
    ? `<div class="edit-row" role="group" aria-label="${esc(ctx.t("edit_mode"))}">
        <button class="iconbtn" data-act="e-up" aria-label="${esc(ctx.t("move_up"))}">↑</button>
        <button class="iconbtn" data-act="e-down" aria-label="${esc(ctx.t("move_down"))}">↓</button>
        <button class="iconbtn" data-act="e-size" aria-label="${esc(ctx.t("entity_size"))}">${esc(pref.size.toUpperCase())}</button>
        <button class="iconbtn" data-act="e-fav" aria-pressed="${!!pref.favorite}" aria-label="${esc(ctx.t("favorite"))}">★</button>
        <button class="iconbtn" data-act="e-hide" aria-label="${esc(ctx.t("hide"))}">⊘</button>
        <button class="iconbtn" data-act="e-edit" aria-label="${esc(ctx.t("entity_settings"))}">✎</button>
      </div>` : "";

  return `<div class="ix-card size-${esc(pref.size || "m")} ${active ? "is-on" : ""} ${unavail ? "unavail" : ""} ${ctx.inert ? "inert" : ""}"
      data-eid="${esc(eid)}" data-card="${esc(type)}">
    <div class="card-head">${icon(ic, type)}<div class="card-title" title="${esc(name)}">${esc(name)}</div>${parts.right ?? ""}</div>
    ${status}${parts.body ?? ""}${edit}</div>`;
}
