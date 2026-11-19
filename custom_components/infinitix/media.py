"""Find and add media players (TVs, Denon / Yamaha receivers, ...) through Home Assistant.

* discovery - Home Assistant itself discovers devices on the LAN (SSDP / zeroconf / DHCP) and
              keeps them as pending config flows.  We list the pending flows of media integrations.
              The Denon integration additionally searches the network when its host is left empty.
* adding    - we continue HA's own config flow; follow-up questions (e.g. an on-screen TV code)
              are relayed to the user and sent straight back to HA.  Nothing is stored here.

Only integrations in MEDIA_DOMAINS can be driven (a flow of any other integration is refused).
Admin-only (see websocket_api.py).  Not verified against a physical TV or receiver (docs/TEST_REPORT.md).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er

_LOGGER = logging.getLogger(__name__)

MEDIA_DOMAINS = (
    "denonavr", "samsungtv", "webostv", "yamaha_musiccast", "androidtv_remote", "roku", "cast",
    "dlna_dmr", "sonos", "bravia", "apple_tv", "heos", "kodi", "philips_js", "vizio", "onkyo",
)
# Integrations whose first ("user") step asks for a host; verified in HA's source.
MANUAL_HOST_DOMAINS = ("denonavr", "samsungtv", "webostv", "yamaha_musiccast")
_HOST_MAX = 253
_FIELD_TYPES = ("string", "integer", "float", "boolean", "select")


class MediaError(Exception):
    def __init__(self, code: str, detail: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


def async_list(hass: HomeAssistant) -> dict[str, Any]:
    discovered = []
    for flow in hass.config_entries.flow.async_progress():
        domain = flow["handler"]
        if domain not in MEDIA_DOMAINS or flow["context"].get("source") == SOURCE_USER:
            continue
        ph = flow["context"].get("title_placeholders") or {}
        discovered.append(
            {"flow_id": flow["flow_id"], "domain": domain, "name": str(ph.get("name") or ph.get("host") or domain)}
        )
    configured = [
        {"entry_id": e.entry_id, "domain": e.domain, "name": e.title}
        for d in MEDIA_DOMAINS
        for e in hass.config_entries.async_entries(d)
    ]
    return {"discovered": discovered, "configured": configured, "manual": list(MANUAL_HOST_DOMAINS)}


def _serialize(schema: Any) -> list[dict[str, Any]]:
    """Form fields the panel can render; same serializer HA's own flow API uses."""
    if schema is None:
        return []
    try:
        import probatio  # HA 2026.11+

        raw = probatio.to_field_list(schema, custom_serializer=cv.custom_serializer)
    except ImportError:  # older HA
        import voluptuous_serialize

        raw = voluptuous_serialize.convert(schema, custom_serializer=cv.custom_serializer)
    fields = []
    for f in raw if isinstance(raw, list) else []:
        if f.get("type") not in _FIELD_TYPES:
            fields.append({"name": f.get("name"), "type": "unsupported"})
            continue
        item = {k: f[k] for k in ("name", "type", "required", "default") if k in f}
        if f["type"] == "select":
            item["options"] = [o if isinstance(o, str) else (o[0] if isinstance(o, (list, tuple)) else str(o)) for o in f.get("options", [])]
        fields.append(item)
    return fields


async def _wait_for_players(hass: HomeAssistant, entry_id: str) -> list[str]:
    registry = er.async_get(hass)
    for _ in range(30):
        found = [e.entity_id for e in er.async_entries_for_config_entry(registry, entry_id) if e.domain == "media_player"]
        if found:
            return sorted(found)
        await asyncio.sleep(0.5)
    return []


async def _result(hass: HomeAssistant, flow_id: str, result: dict[str, Any]) -> dict[str, Any]:
    rtype = result["type"]
    if rtype == FlowResultType.CREATE_ENTRY:
        entry_id = result["result"].entry_id
        return {"status": "created", "entry_id": entry_id, "title": result.get("title"), "entity_ids": await _wait_for_players(hass, entry_id)}
    if rtype == FlowResultType.ABORT:
        return {"status": "abort", "reason": result.get("reason", "unknown")}
    if rtype == FlowResultType.FORM:
        errors = result.get("errors") or {}
        return {
            "status": "form",
            "flow_id": flow_id,
            "step_id": result.get("step_id"),
            "fields": _serialize(result.get("data_schema")),
            "error": next(iter(errors.values()), None),
        }
    hass.config_entries.flow.async_abort(flow_id)
    return {"status": "unsupported", "reason": str(rtype)}


def _own_flow(hass: HomeAssistant, flow_id: str) -> None:
    for flow in hass.config_entries.flow.async_progress():
        if flow["flow_id"] == flow_id:
            if flow["handler"] in MEDIA_DOMAINS:
                return
            break
    raise MediaError("unknown_flow")


async def async_start(hass: HomeAssistant, domain: str, host: str) -> dict[str, Any]:
    if domain not in MANUAL_HOST_DOMAINS:
        raise MediaError("invalid_domain")
    host = host.strip()
    if len(host) > _HOST_MAX or any(c in host for c in " /\\@?#"):
        raise MediaError("invalid_host")
    if not host and domain != "denonavr":  # only Denon can search the network by itself
        raise MediaError("invalid_host")
    flow = hass.config_entries.flow
    started = await flow.async_init(domain, context={"source": SOURCE_USER})
    flow_id = started["flow_id"]
    try:
        result = await flow.async_configure(flow_id, {"host": host} if host else {})
        return await _result(hass, flow_id, result)
    except Exception as err:  # noqa: BLE001
        flow.async_abort(flow_id)
        _LOGGER.warning("Media flow %s failed: %s", domain, err)
        raise MediaError("flow_failed", str(err)) from err


async def async_continue(hass: HomeAssistant, flow_id: str, data: dict[str, Any]) -> dict[str, Any]:
    _own_flow(hass, flow_id)
    try:
        result = await hass.config_entries.flow.async_configure(flow_id, data)
        return await _result(hass, flow_id, result)
    except Exception as err:  # noqa: BLE001
        hass.config_entries.flow.async_abort(flow_id)
        raise MediaError("flow_failed", str(err)) from err


def async_abort(hass: HomeAssistant, flow_id: str) -> None:
    _own_flow(hass, flow_id)
    hass.config_entries.flow.async_abort(flow_id)
