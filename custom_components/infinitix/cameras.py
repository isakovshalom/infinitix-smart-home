"""Add ONVIF cameras through Home Assistant's own ONVIF integration.

INFINITIX does not talk to cameras and does not store camera credentials.  It
drives Home Assistant's built-in ``onvif`` config flow on behalf of an
administrator, so HA owns the connection, the credentials and the entities:

* discovery  -> ``onvif.config_flow.async_discovery`` (WS-Discovery on the LAN);
* adding     -> the ``onvif`` config flow, steps ``user`` -> ``configure``;
* result     -> the camera entities HA created for the new config entry, which
               the panel then places in a room.

Everything here is admin-only (see websocket_api.py).  Nothing in this module
has been verified against a physical ONVIF camera (see docs/TEST_REPORT.md).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import entity_registry as er
from homeassistant.requirements import async_get_integration_with_requirements

_LOGGER = logging.getLogger(__name__)

ONVIF_DOMAIN = "onvif"
_ENTITY_WAIT_SECONDS = 15
_HOST_MAX = 253
_TEXT_MAX = 120


class CameraError(Exception):
    """A user-presentable failure; ``code`` maps to a translated message."""

    def __init__(self, code: str, detail: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


def _configured_ids(hass: HomeAssistant) -> set[str]:
    return {
        entry.unique_id
        for entry in hass.config_entries.async_entries(ONVIF_DOMAIN)
        if entry.unique_id
    }


def _configured_hosts(hass: HomeAssistant) -> set[str]:
    return {
        str(entry.data.get("host"))
        for entry in hass.config_entries.async_entries(ONVIF_DOMAIN)
        if entry.data.get("host")
    }


async def async_discover(hass: HomeAssistant) -> list[dict[str, Any]]:
    """WS-Discovery for ONVIF devices on the HA host's network (read-only)."""
    try:
        integration = await async_get_integration_with_requirements(hass, ONVIF_DOMAIN)
        flow_module = await integration.async_get_platform("config_flow")
        found = await flow_module.async_discovery(hass)
    except Exception as err:  # noqa: BLE001 - discovery depends on the LAN; report, don't crash
        _LOGGER.warning("ONVIF discovery failed: %s", err)
        raise CameraError("discovery_failed", str(err)) from err

    known_ids, known_hosts = _configured_ids(hass), _configured_hosts(hass)
    devices: list[dict[str, Any]] = []
    for item in found:
        host = item.get("host")
        if not host or item.get("device_id") in known_ids or host in known_hosts:
            continue  # already added in HA
        devices.append(
            {
                "host": host,
                "port": item.get("port") or 80,
                "name": item.get("name") or host,
                "hardware": item.get("hardware"),
            }
        )
    return devices


def _clean(data: dict[str, Any]) -> dict[str, Any]:
    host = str(data.get("host", "")).strip()
    if not host or len(host) > _HOST_MAX or any(c in host for c in " /\\@?#"):
        raise CameraError("invalid_host")
    port = data.get("port", 80)
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise CameraError("invalid_port")
    return {
        "name": (str(data.get("name") or host).strip() or host)[:_TEXT_MAX],
        "host": host,
        "port": port,
        "username": str(data.get("username") or "")[:_TEXT_MAX],
        "password": str(data.get("password") or "")[:_TEXT_MAX],
    }


async def async_add_camera(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Run HA's ONVIF config flow with the given connection details."""
    conf = _clean(data)
    if conf["host"] in _configured_hosts(hass):
        raise CameraError("already_configured")

    flow = hass.config_entries.flow
    result = await flow.async_init(ONVIF_DOMAIN, context={"source": SOURCE_USER})
    flow_id = result["flow_id"]
    try:
        # First step offers "search automatically"; we already know the address.
        result = await flow.async_configure(flow_id, {"auto": False})
        if result["type"] != FlowResultType.FORM or result["step_id"] != "configure":
            raise CameraError("unexpected_flow", f"{result['type']} {result.get('step_id')}")
        result = await flow.async_configure(flow_id, conf)
    except CameraError:
        flow.async_abort(flow_id)
        raise
    except Exception as err:  # noqa: BLE001
        flow.async_abort(flow_id)
        _LOGGER.warning("ONVIF flow failed: %s", err)
        raise CameraError("flow_failed", str(err)) from err

    rtype = result["type"]
    if rtype == FlowResultType.CREATE_ENTRY:
        entry_id = result["result"].entry_id
        entities = await _async_wait_for_camera_entities(hass, entry_id)
        return {"entry_id": entry_id, "title": result.get("title"), "entity_ids": entities}

    if rtype == FlowResultType.FORM:
        # Wrong credentials / port etc.: HA reports it as form errors.  Abort the
        # flow so nothing is left half-configured, and return the code.
        errors = result.get("errors") or {}
        code = next(iter(errors.values()), "unknown")
        flow.async_abort(flow_id)
        raise CameraError(code, str(result.get("description_placeholders") or ""))

    if rtype == FlowResultType.ABORT:
        raise CameraError(result.get("reason", "unknown"))

    flow.async_abort(flow_id)
    raise CameraError("unexpected_flow", str(rtype))


async def _async_wait_for_camera_entities(hass: HomeAssistant, entry_id: str) -> list[str]:
    """The entry sets up asynchronously; wait briefly for its camera entities."""
    registry = er.async_get(hass)
    for _ in range(_ENTITY_WAIT_SECONDS * 2):
        found = [
            e.entity_id
            for e in er.async_entries_for_config_entry(registry, entry_id)
            if e.domain == "camera"
        ]
        if found:
            return sorted(found)
        await asyncio.sleep(0.5)
    return []
