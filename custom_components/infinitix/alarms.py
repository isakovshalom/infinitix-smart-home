"""Connect an alarm system (Risco, PIMA, Paradox) through Home Assistant.

INFINITIX does not talk to alarm panels and does not bundle vendor SDKs.  Each brand
is connected through the integration Home Assistant users already rely on, and the
panel only drives that integration's own config flow (codes and passwords go straight
to HA's flow; nothing is stored or logged here):

* Risco   -> HA's built-in ``risco`` integration (Risco Cloud, or local panel
             connection).  Uses the ``pyrisco`` library maintained for HA.
* PIMA    -> the community ``pima`` integration (github.com/birsch/pima4ha, for the
             Net4Pro network card), installed from HACS / Marketplace.  When it is
             installed its config flow is driven here; otherwise the panel explains how.
* Paradox -> the Paradox Alarm Interface (PAI) add-on / service, which talks to the
             panel through an IP150 module or serial and publishes it to HA with MQTT
             discovery.  The panel checks MQTT and lists the alarm entities PAI created.

The resulting ``alarm_control_panel`` entities use INFINITIX's existing alarm card
(arm / disarm with code confirmation, authorised by HA per user).  Admin-only.
Not verified against physical panels (see docs/TEST_REPORT.md).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.loader import IntegrationNotFound, async_get_integration

from .media import _serialize

_LOGGER = logging.getLogger(__name__)

BRANDS: dict[str, dict[str, Any]] = {
    "risco": {"name": "Risco", "domain": "risco", "kind": "builtin",
              "docs": "https://www.home-assistant.io/integrations/risco/"},
    "pima": {"name": "PIMA", "domain": "pima", "kind": "custom",
             "repo": "https://github.com/birsch/pima4ha", "card": "Net4Pro"},
    "paradox": {"name": "Paradox", "domain": None, "kind": "mqtt",
                "repo": "https://github.com/ParadoxAlarmInterface/hassio-repository",
                "docs": "https://github.com/ParadoxAlarmInterface/pai", "manufacturer": "paradox"},
}
FLOW_DOMAINS = tuple(b["domain"] for b in BRANDS.values() if b["domain"])
_WAIT_SECONDS = 20


class AlarmError(Exception):
    def __init__(self, code: str, detail: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


async def _available(hass: HomeAssistant, domain: str) -> bool:
    try:
        await async_get_integration(hass, domain)
    except IntegrationNotFound:
        return False
    return True


def _alarm_entities(hass: HomeAssistant, brand: str) -> list[str]:
    """alarm_control_panel entities that belong to this brand."""
    info = BRANDS[brand]
    ent_reg, dev_reg = er.async_get(hass), dr.async_get(hass)
    found = []
    for e in ent_reg.entities.values():
        if e.domain != "alarm_control_panel" or e.disabled:
            continue
        if info["domain"] and e.platform == info["domain"]:
            found.append(e.entity_id)
        elif info.get("manufacturer") and e.device_id:
            dev = dev_reg.async_get(e.device_id)
            if dev and info["manufacturer"] in (dev.manufacturer or "").lower():
                found.append(e.entity_id)
    return sorted(found)


async def async_status(hass: HomeAssistant) -> dict[str, Any]:
    mqtt_ready = bool(hass.config_entries.async_entries("mqtt"))
    out = []
    for key, info in BRANDS.items():
        domain = info["domain"]
        available = await _available(hass, domain) if domain else mqtt_ready
        entries = [{"entry_id": e.entry_id, "title": e.title} for e in hass.config_entries.async_entries(domain)] if domain else []
        out.append({
            "id": key, "name": info["name"], "kind": info["kind"], "available": available,
            "configured": entries, "entities": _alarm_entities(hass, key),
            **{k: info[k] for k in ("repo", "docs", "card") if k in info},
        })
    return {"brands": out, "mqtt": mqtt_ready}


async def _result(hass: HomeAssistant, flow_id: str, brand: str, result: dict[str, Any]) -> dict[str, Any]:
    rtype = result["type"]
    if rtype == FlowResultType.CREATE_ENTRY:
        entry_id = result["result"].entry_id
        registry = er.async_get(hass)
        entities: list[str] = []
        for _ in range(_WAIT_SECONDS * 2):
            entities = sorted(e.entity_id for e in er.async_entries_for_config_entry(registry, entry_id) if e.domain == "alarm_control_panel")
            if entities:
                break
            await asyncio.sleep(0.5)
        return {"status": "created", "entry_id": entry_id, "title": result.get("title"), "entity_ids": entities}
    if rtype == FlowResultType.ABORT:
        return {"status": "abort", "reason": result.get("reason", "unknown")}
    if rtype == FlowResultType.MENU:
        return {"status": "menu", "flow_id": flow_id, "step_id": result.get("step_id"), "options": list(result.get("menu_options") or [])}
    if rtype == FlowResultType.FORM:
        errors = result.get("errors") or {}
        return {"status": "form", "flow_id": flow_id, "step_id": result.get("step_id"),
                "fields": _serialize(result.get("data_schema")), "error": next(iter(errors.values()), None), "brand": brand}
    hass.config_entries.flow.async_abort(flow_id)
    return {"status": "unsupported", "reason": str(rtype)}


def _own_flow(hass: HomeAssistant, flow_id: str) -> str:
    for flow in hass.config_entries.flow.async_progress():
        if flow["flow_id"] == flow_id:
            if flow["handler"] in FLOW_DOMAINS:
                return next(k for k, v in BRANDS.items() if v["domain"] == flow["handler"])
            break
    raise AlarmError("unknown_flow")


async def async_start(hass: HomeAssistant, brand: str) -> dict[str, Any]:
    info = BRANDS.get(brand)
    if not info:
        raise AlarmError("invalid_brand")
    if not info["domain"]:
        raise AlarmError("no_flow")  # Paradox: set up through PAI + MQTT, not a config flow
    if not await _available(hass, info["domain"]):
        raise AlarmError("integration_missing")
    flow = hass.config_entries.flow
    try:
        started = await flow.async_init(info["domain"], context={"source": SOURCE_USER})
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Alarm flow %s could not start", brand)
        raise AlarmError("flow_failed", str(err)[:200]) from err
    return await _result(hass, started.get("flow_id", ""), brand, started)


async def async_continue(hass: HomeAssistant, flow_id: str, data: dict[str, Any]) -> dict[str, Any]:
    brand = _own_flow(hass, flow_id)
    try:
        result = await hass.config_entries.flow.async_configure(flow_id, data)
    except Exception as err:  # noqa: BLE001 - codes/passwords are never logged
        hass.config_entries.flow.async_abort(flow_id)
        raise AlarmError("flow_failed", str(err)[:200]) from err
    return await _result(hass, flow_id, brand, result)


def async_abort(hass: HomeAssistant, flow_id: str) -> None:
    _own_flow(hass, flow_id)
    hass.config_entries.flow.async_abort(flow_id)
