"""What a scenario may do to a device (one place for validation and execution).

Deliberately a short allow-list.  Not allowed: unlocking, disarming an alarm, opening a gate
or garage door, anything that needs a code.  A scenario can only lock, never unlock.
The panel keeps a matching table in frontend/js/scenarios.js (OPS).
"""

from __future__ import annotations

from typing import Any

# domain -> op -> (service, fixed service data)
OPS: dict[str, dict[str, tuple[str, dict[str, Any]]]] = {
    "light": {"on": ("turn_on", {}), "off": ("turn_off", {})},
    "switch": {"on": ("turn_on", {}), "off": ("turn_off", {})},
    "fan": {"on": ("turn_on", {}), "off": ("turn_off", {})},
    "input_boolean": {"on": ("turn_on", {}), "off": ("turn_off", {})},
    "cover": {"open": ("open_cover", {}), "close": ("close_cover", {}), "stop": ("stop_cover", {})},
    "climate": {
        "off": ("turn_off", {}),
        "cool": ("set_hvac_mode", {"hvac_mode": "cool"}),
        "heat": ("set_hvac_mode", {"hvac_mode": "heat"}),
        "auto": ("set_hvac_mode", {"hvac_mode": "auto"}),
        "temperature": ("set_temperature", {}),
    },
    "media_player": {"on": ("turn_on", {}), "off": ("turn_off", {})},
    "lock": {"lock": ("lock", {})},
    "vacuum": {"start": ("start", {}), "dock": ("return_to_base", {})},
    "scene": {"activate": ("turn_on", {})},
    "script": {"activate": ("turn_on", {})},
}
ACTION_DOMAINS = tuple(OPS)

# ops that carry a number in `value`: (min, max)
VALUE_RANGE = {("climate", "temperature"): (5, 35), ("light", "on"): (1, 100)}


def service_call(entity_id: str, op: str, value: Any = None) -> tuple[str, str, dict[str, Any]]:
    """(domain, service, service data) for a validated action."""
    domain = entity_id.split(".", 1)[0]
    service, fixed = OPS[domain][op]
    data: dict[str, Any] = {"entity_id": entity_id, **fixed}
    if value is not None:
        if (domain, op) == ("climate", "temperature"):
            data["temperature"] = value
        elif (domain, op) == ("light", "on"):
            data["brightness_pct"] = value
    return domain, service, data
