"""Add Matter / Zigbee devices.

INFINITIX does not speak Matter or Zigbee itself; it drives Home Assistant's own integrations:

* Matter    - the admin panel calls HA's ``matter/commission`` / ``matter/commission_on_network``
              websocket commands directly (they exist only when the Matter integration and its
              server are set up); this module only reports whether Matter is available.
* Zigbee    - ZHA: the ``zha.permit`` service opens the network for joining (HA's own service).
* Zigbee2MQTT - publishes ``{"time": N}`` to ``<base>/bridge/request/permit_join`` through HA's
              ``mqtt.publish`` service (Zigbee2MQTT's documented request topic; unverified on a
              real Zigbee2MQTT in this build).

Admin-only (see websocket_api.py).
"""

from __future__ import annotations

import json
import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

PROTOCOL_DOMAINS = ("matter", "zha", "mqtt")
_BASE_TOPIC = re.compile(r"^[A-Za-z0-9_\-/]{1,64}$")
DURATION_MAX = 254


class PairingError(Exception):
    def __init__(self, code: str, detail: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


def _loaded(hass: HomeAssistant, domain: str) -> bool:
    return any(e.state.value == "loaded" for e in hass.config_entries.async_entries(domain))


def async_status(hass: HomeAssistant) -> dict[str, Any]:
    """Which protocols are available, and the devices HA already has for them."""
    registry = dr.async_get(hass)
    devices: list[dict[str, Any]] = []
    for dev in registry.devices.values():
        domains = {
            e.domain
            for e_id in dev.config_entries
            if (e := hass.config_entries.async_get_entry(e_id)) is not None
        }
        proto = next((d for d in PROTOCOL_DOMAINS if d in domains), None)
        if proto is None or dev.disabled:
            continue
        devices.append(
            {
                "id": dev.id,
                "name": dev.name_by_user or dev.name or dev.model or dev.id,
                "manufacturer": dev.manufacturer,
                "model": dev.model,
                "protocol": proto,
            }
        )
    return {
        "matter": _loaded(hass, "matter"),
        "zha": hass.services.has_service("zha", "permit"),
        "mqtt": hass.services.has_service("mqtt", "publish"),
        "devices": devices,
    }


async def async_permit(hass: HomeAssistant, protocol: str, duration: int, base_topic: str) -> None:
    if not isinstance(duration, int) or isinstance(duration, bool) or not 1 <= duration <= DURATION_MAX:
        raise PairingError("invalid_duration")
    if protocol == "zha":
        if not hass.services.has_service("zha", "permit"):
            raise PairingError("zha_missing")
        await hass.services.async_call("zha", "permit", {"duration": duration}, blocking=True)
    elif protocol == "z2m":
        if not hass.services.has_service("mqtt", "publish"):
            raise PairingError("mqtt_missing")
        if not _BASE_TOPIC.match(base_topic) or base_topic.startswith("/") or ".." in base_topic:
            raise PairingError("invalid_topic")
        await hass.services.async_call(
            "mqtt",
            "publish",
            {"topic": f"{base_topic}/bridge/request/permit_join", "payload": json.dumps({"time": duration})},
            blocking=True,
        )
    else:
        raise PairingError("invalid_protocol")
