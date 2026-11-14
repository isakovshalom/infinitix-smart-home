"""Builds frontend/demo/fixture.json using the REAL backend classification code,
so the demo page shows exactly what the integration would compute for this data.
The data itself is fictional."""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from custom_components.infinitix.discovery import build_inventory, propose_config

AREAS = [
    {"id": "living", "name": "סלון", "icon": "mdi:sofa"},
    {"id": "kitchen", "name": "מטבח", "icon": "mdi:silverware-fork-knife"},
    {"id": "bedroom", "name": "חדר שינה", "icon": "mdi:bed"},
    {"id": "entrance", "name": "כניסה", "icon": "mdi:door"},
]
DEVICES = [{"id": f"dev_{a['id']}", "name": a["name"], "area_id": a["id"]} for a in AREAS]

# (entity_id, name, state, attrs, area, extra registry fields)
E = [
 ("light.living_main", "תאורת סלון", "on", {"supported_color_modes": ["color_temp"], "brightness": 180, "color_temp_kelvin": 3200, "min_color_temp_kelvin": 2200, "max_color_temp_kelvin": 6500}, "living", {}),
 ("light.living_strip", "פס לד", "on", {"supported_color_modes": ["hs"], "brightness": 120, "hs_color": [30, 80]}, "living", {}),
 ("cover.living_blind", "תריס סלון", "open", {"supported_features": 15, "current_position": 70}, "living", {}),
 ("climate.living_ac", "מזגן סלון", "cool", {"supported_features": 9, "hvac_modes": ["off", "cool", "heat", "auto"], "fan_modes": ["low", "high"], "fan_mode": "low", "temperature": 23, "current_temperature": 25, "min_temp": 16, "max_temp": 30, "target_temp_step": 1}, "living", {}),
 ("media_player.living_tv", "טלוויזיה", "playing", {"supported_features": 16384 | 1 | 4 | 32 | 16 | 128 | 256, "volume_level": 0.3, "media_title": "חדשות הערב"}, "living", {}),
 ("sensor.living_temp", "טמפרטורה בסלון", "25.4", {"device_class": "temperature", "unit_of_measurement": "°C"}, "living", {}),
 ("switch.living_outlet", "שקע טלוויזיה", "off", {"device_class": "outlet"}, "living", {}),
 ("binary_sensor.living_motion", "תנועה בסלון", "off", {"device_class": "motion"}, "living", {}),
 ("light.kitchen_spots", "ספוטים במטבח", "off", {"supported_color_modes": ["brightness"]}, "kitchen", {}),
 ("switch.kitchen_coffee", "מכונת קפה", "off", {}, "kitchen", {}),
 ("switch.kitchen_lamp", "מנורת שיש (מתג)", "on", {}, "kitchen", {}),
 ("sensor.kitchen_humidity", "לחות במטבח", "48", {"device_class": "humidity", "unit_of_measurement": "%"}, "kitchen", {}),
 ("light.bedroom_ceiling", "תאורת חדר שינה", "off", {"supported_color_modes": ["onoff"]}, "bedroom", {}),
 ("cover.bedroom_blind", "תריס חדר שינה", "closed", {"supported_features": 3, "current_position": 0}, "bedroom", {}),
 ("fan.bedroom_fan", "מאוורר", "on", {"supported_features": 1 | 2 | 32 | 16, "percentage": 40, "oscillating": False}, "bedroom", {}),
 ("sensor.bedroom_temp", "טמפרטורה בחדר שינה", "23.1", {"device_class": "temperature", "unit_of_measurement": "°C"}, "bedroom", {}),
 ("lock.front_door", "דלת כניסה", "locked", {"supported_features": 0}, "entrance", {}),
 ("alarm_control_panel.home", "אזעקה", "disarmed", {"supported_features": 3, "code_format": "number", "code_arm_required": False}, "entrance", {}),
 ("camera.entrance", "מצלמת כניסה", "idle", {"supported_features": 2}, "entrance", {}),
 ("binary_sensor.front_door_contact", "דלת כניסה (מגנט)", "off", {"device_class": "door"}, "entrance", {}),
 ("light.hallway_unavailable", "תאורת מסדרון", "unavailable", {"supported_color_modes": ["brightness"]}, "entrance", {}),
 ("scene.evening", "ערב נעים", "unknown", {}, None, {}),
 ("script.goodnight", "לילה טוב", "off", {}, None, {}),
 ("switch.garden_pump", "משאבת גינה (ללא חדר)", "off", {}, None, {}),
 ("sensor.garden_moisture", "לחות אדמה בגינה", "31", {"unit_of_measurement": "%"}, None, {}),
 ("sensor.router_rssi", "עוצמת אות", "-60", {"unit_of_measurement": "dBm"}, "living", {"entity_category": "diagnostic"}),
 ("light.old_disabled", "תאורה ישנה", "unavailable", {}, "living", {"disabled_by": "user"}),
 ("weather.home", "מזג אוויר", "sunny", {"temperature": 27, "temperature_unit": "°C"}, None, {}),
]
NO_REGISTRY = {"switch.garden_pump"}  # e.g. YAML entity without unique_id

reg, states = [], []
for eid, name, state, attrs, area, extra in E:
    attrs = {"friendly_name": name, **attrs}
    if "brightness" in attrs or "color_temp_kelvin" in attrs: pass
    states.append({"entity_id": eid, "state": state, "attributes": attrs})
    if eid in NO_REGISTRY: continue
    reg.append({"entity_id": eid, "device_id": f"dev_{area}" if area and eid.split(".")[0] not in ("scene", "script", "weather") else None,
                "area_id": None, "platform": "demo", "name": None, "original_name": name, **extra})

inv = build_inventory(AREAS, DEVICES, reg, states)
out = {"states": {s["entity_id"]: s for s in states}, "inventory": inv, "proposal": propose_config(inv)}
dest = pathlib.Path(__file__).resolve().parents[1] / "custom_components/infinitix/frontend/demo/fixture.json"
dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("fixture:", len(states), "states;", inv["summary"])
