"""Entity classification: maps a Home Assistant entity to a dashboard card.

Pure Python (no Home Assistant imports) so it can be unit tested on its own.

Input is a plain dict ("facts") describing one entity; output is a dict with the
suggested card, a confidence level, a machine readable reason code and the
capabilities that were actually detected.  Controls that are not supported by
the entity must never be rendered, so capabilities are derived from
`supported_features` / `supported_color_modes` and the other attributes.
"""

from __future__ import annotations

import re
from typing import Any

# --- supported_features bit masks (Home Assistant entity feature flags) ------
COVER_OPEN = 1
COVER_CLOSE = 2
COVER_SET_POSITION = 4
COVER_STOP = 8
COVER_OPEN_TILT = 16
COVER_CLOSE_TILT = 32
COVER_STOP_TILT = 64
COVER_SET_TILT_POSITION = 128

CLIMATE_TARGET_TEMPERATURE = 1
CLIMATE_TARGET_TEMPERATURE_RANGE = 2
CLIMATE_TARGET_HUMIDITY = 4
CLIMATE_FAN_MODE = 8
CLIMATE_PRESET_MODE = 16
CLIMATE_SWING_MODE = 32
CLIMATE_TURN_OFF = 128
CLIMATE_TURN_ON = 256

MEDIA_PAUSE = 1
MEDIA_SEEK = 2
MEDIA_VOLUME_SET = 4
MEDIA_VOLUME_MUTE = 8
MEDIA_PREVIOUS_TRACK = 16
MEDIA_NEXT_TRACK = 32
MEDIA_TURN_ON = 128
MEDIA_TURN_OFF = 256
MEDIA_PLAY_MEDIA = 512
MEDIA_VOLUME_STEP = 1024
MEDIA_SELECT_SOURCE = 2048
MEDIA_STOP = 4096
MEDIA_PLAY = 16384

LOCK_OPEN = 1

ALARM_ARM_HOME = 1
ALARM_ARM_AWAY = 2
ALARM_ARM_NIGHT = 4
ALARM_TRIGGER = 8
ALARM_ARM_VACATION = 32

CAMERA_ON_OFF = 1
CAMERA_STREAM = 2

FAN_SET_SPEED = 1
FAN_OSCILLATE = 2
FAN_DIRECTION = 4
FAN_PRESET_MODE = 8
FAN_TURN_OFF = 16
FAN_TURN_ON = 32

LIGHT_BRIGHTNESS_MODES = {
    "brightness",
    "color_temp",
    "hs",
    "xy",
    "rgb",
    "rgbw",
    "rgbww",
    "white",
}
LIGHT_COLOR_MODES = {"hs", "xy", "rgb", "rgbw", "rgbww"}

# Domains that are never shown as cards by default.
HIDDEN_DOMAINS = {
    "update",
    "button",
    "number",
    "select",
    "text",
    "event",
    "tag",
    "persistent_notification",
    "person",
    "zone",
    "sun",
    "device_tracker",
    "automation",
    "conversation",
    "stt",
    "tts",
    "calendar",
    "image",
    "scene_",  # placeholder, keeps the set explicit
}
HIDDEN_DOMAINS.discard("scene_")

# Words in an entity name that suggest a switch controls a light.
_LIGHT_HINT = re.compile(
    r"(light|lamp|bulb|\bled\b|תאורה|מנור|נור[הת]|ספוט)", re.IGNORECASE
)


def _features(facts: dict[str, Any]) -> int:
    value = facts.get("supported_features")
    return int(value) if isinstance(value, (int, float)) else 0


def _has(features: int, flag: int) -> bool:
    return bool(features & flag)


def _result(
    card: str | None,
    confidence: str,
    reason: str,
    capabilities: list[str] | None = None,
    *,
    suggestion: str | None = None,
    default_hidden: bool = False,
    hidden_reason: str | None = None,
) -> dict[str, Any]:
    return {
        "card": card,
        "confidence": confidence,
        "reason": reason,
        "capabilities": capabilities or [],
        "suggestion": suggestion,
        "default_hidden": default_hidden,
        "hidden_reason": hidden_reason,
    }


def classify_entity(facts: dict[str, Any]) -> dict[str, Any]:
    """Return the suggested card for an entity.

    Expected keys in ``facts`` (all optional except ``entity_id``):
    entity_category, disabled, hidden, device_class, supported_features,
    supported_color_modes, hvac_modes, name.
    """
    entity_id: str = facts["entity_id"]
    domain = entity_id.split(".", 1)[0]
    device_class = facts.get("device_class")
    features = _features(facts)

    # --- visibility defaults -------------------------------------------
    if facts.get("disabled"):
        return _result(
            None,
            "high",
            "disabled_in_ha",
            default_hidden=True,
            hidden_reason="disabled",
        )
    if facts.get("entity_category") in ("diagnostic", "config"):
        hidden_reason = facts["entity_category"]
    elif facts.get("hidden"):
        hidden_reason = "hidden_in_ha"
    else:
        hidden_reason = None

    if domain in HIDDEN_DOMAINS:
        return _result(
            "generic",
            "medium",
            "unsupported_domain",
            default_hidden=True,
            hidden_reason=hidden_reason or "unsupported_domain",
        )

    res = _classify_domain(domain, device_class, features, facts)
    if hidden_reason:
        res["default_hidden"] = True
        res["hidden_reason"] = hidden_reason
    return res


def _classify_domain(
    domain: str, device_class: str | None, features: int, facts: dict[str, Any]
) -> dict[str, Any]:
    if domain == "light":
        modes = set(facts.get("supported_color_modes") or [])
        caps = ["on_off"]
        if modes & LIGHT_BRIGHTNESS_MODES:
            caps.append("brightness")
        if "color_temp" in modes:
            caps.append("color_temp")
        if modes & LIGHT_COLOR_MODES:
            caps.append("color")
        return _result("light", "high", "domain_light", caps)

    if domain == "switch":
        caps = ["on_off"]
        if device_class == "outlet":
            return _result("outlet", "high", "switch_outlet", caps)
        if device_class == "switch":
            return _result("switch", "high", "switch_device_class", caps)
        if _LIGHT_HINT.search(str(facts.get("name") or "")):
            # Never assume: stay a generic switch, but tell the user.
            return _result(
                "switch",
                "low",
                "switch_name_hints_light",
                caps,
                suggestion="light",
            )
        return _result("switch", "medium", "switch_unclassified", caps)

    if domain in ("input_boolean",):
        return _result("switch", "medium", "input_boolean", ["on_off"])

    if domain == "cover":
        caps = []
        if _has(features, COVER_OPEN):
            caps.append("open")
        if _has(features, COVER_CLOSE):
            caps.append("close")
        if _has(features, COVER_STOP):
            caps.append("stop")
        if _has(features, COVER_SET_POSITION):
            caps.append("position")
        if _has(features, COVER_OPEN_TILT) or _has(features, COVER_CLOSE_TILT):
            caps.append("tilt")
        if _has(features, COVER_SET_TILT_POSITION):
            caps.append("tilt_position")
        return _result("cover", "high", "domain_cover", caps)

    if domain == "climate":
        caps = []
        if _has(features, CLIMATE_TARGET_TEMPERATURE):
            caps.append("target_temperature")
        if _has(features, CLIMATE_TARGET_TEMPERATURE_RANGE):
            caps.append("target_temperature_range")
        if _has(features, CLIMATE_FAN_MODE):
            caps.append("fan_mode")
        if _has(features, CLIMATE_PRESET_MODE):
            caps.append("preset_mode")
        if _has(features, CLIMATE_SWING_MODE):
            caps.append("swing_mode")
        if facts.get("hvac_modes"):
            caps.append("hvac_mode")
        return _result("climate", "high", "domain_climate", caps)

    if domain == "fan":
        caps = ["on_off"]
        if _has(features, FAN_SET_SPEED):
            caps.append("speed")
        if _has(features, FAN_OSCILLATE):
            caps.append("oscillate")
        if _has(features, FAN_PRESET_MODE):
            caps.append("preset_mode")
        return _result("fan", "high", "domain_fan", caps)

    if domain == "lock":
        caps = ["lock", "unlock"]
        if _has(features, LOCK_OPEN):
            caps.append("open")
        return _result("lock", "high", "domain_lock", caps)

    if domain == "alarm_control_panel":
        caps = ["disarm"]
        for flag, name in (
            (ALARM_ARM_HOME, "arm_home"),
            (ALARM_ARM_AWAY, "arm_away"),
            (ALARM_ARM_NIGHT, "arm_night"),
            (ALARM_ARM_VACATION, "arm_vacation"),
        ):
            if _has(features, flag):
                caps.append(name)
        return _result("alarm", "high", "domain_alarm", caps)

    if domain == "camera":
        caps = ["snapshot"]
        if _has(features, CAMERA_STREAM):
            caps.append("stream")
        if _has(features, CAMERA_ON_OFF):
            caps.append("on_off")
        return _result("camera", "high", "domain_camera", caps)

    if domain == "media_player":
        caps = []
        for flag, name in (
            (MEDIA_TURN_ON, "turn_on"),
            (MEDIA_TURN_OFF, "turn_off"),
            (MEDIA_PLAY, "play"),
            (MEDIA_PAUSE, "pause"),
            (MEDIA_STOP, "stop"),
            (MEDIA_PREVIOUS_TRACK, "previous"),
            (MEDIA_NEXT_TRACK, "next"),
            (MEDIA_VOLUME_SET, "volume_set"),
            (MEDIA_VOLUME_MUTE, "volume_mute"),
            (MEDIA_VOLUME_STEP, "volume_step"),
            (MEDIA_SELECT_SOURCE, "select_source"),
        ):
            if _has(features, flag):
                caps.append(name)
        return _result("media_player", "high", "domain_media_player", caps)

    if domain == "scene":
        return _result("scene", "high", "domain_scene", ["activate"])

    if domain == "script":
        return _result("script", "high", "domain_script", ["run"])

    if domain == "todo":
        # HA's shopping list is todo.shopping_list; other to-do lists can also be shown
        # as a list card, but the user should confirm that is what they want.
        if facts["entity_id"] == "todo.shopping_list":
            return _result("shopping", "high", "domain_todo_shopping", ["items"])
        return _result("shopping", "low", "domain_todo_list", ["items"])

    if domain == "sensor":
        return _result("sensor", "high", "domain_sensor", [])

    if domain == "binary_sensor":
        return _result("binary_sensor", "high", "domain_binary_sensor", [])

    if domain == "weather":
        # Used only by the home-screen weather widget, chosen explicitly.
        return _result(
            "generic",
            "high",
            "weather_widget",
            [],
            default_hidden=True,
            hidden_reason="weather_widget",
        )

    if domain in ("humidifier", "water_heater", "vacuum", "valve", "siren"):
        # Real domains without a dedicated card yet: show state read-only.
        return _result("generic", "low", "no_dedicated_card", [])

    return _result("generic", "low", "unknown_domain", [])


# Sensors that make good "main temperature sensor" candidates.
def is_temperature_sensor(facts: dict[str, Any]) -> bool:
    return (
        facts["entity_id"].startswith("sensor.")
        and facts.get("device_class") == "temperature"
    )


def is_weather_entity(facts: dict[str, Any]) -> bool:
    return facts["entity_id"].startswith("weather.")
