"""WebSocket API used by the INFINITIX panel.

Authorization is enforced here, on the server:
* read commands require an authenticated user and only return entities that the
  user may read (HA entity permissions);
* every command that changes configuration, scans the whole system or touches
  import/export is decorated with ``require_admin``.
Hiding buttons in the frontend is only a convenience, never the protection.

Device control does not go through this API at all: the panel calls the normal
Home Assistant services, which HA authorizes per user and per entity.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
)

from .cameras import CameraError, async_add_camera, async_discover
from .const import DOMAIN
from .discovery import (
    collect_inventory,
    find_missing_entities,
    find_new_entities,
    propose_config,
)
from .portability import apply_import, export_config, plan_import, validate_export
from . import media, pairing
from .validation import ConfigError, validate_config, validate_scenarios


def _manager(hass: HomeAssistant):
    return hass.data[DOMAIN]["manager"]


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    for command in (
        ws_get_config,
        ws_get_inventory,
        ws_scan,
        ws_save_config,
        ws_save_wizard,
        ws_dismiss_new,
        ws_export,
        ws_import_plan,
        ws_import_apply,
        ws_subscribe_registry,
        ws_camera_discover,
        ws_camera_add,
        ws_pairing_status,
        ws_pairing_permit,
        ws_media_list,
        ws_media_start,
        ws_media_continue,
        ws_media_abort,
        ws_scenarios_list,
        ws_scenarios_save,
        ws_scenarios_run,
    ):
        websocket_api.async_register_command(hass, command)


@websocket_api.websocket_command({vol.Required("type"): "infinitix/get_config"})
@callback
def ws_get_config(hass, connection, msg) -> None:
    """Return the stored configuration (readable by every logged-in user)."""
    data = _manager(hass).data
    connection.send_result(
        msg["id"],
        {
            "config": data,
            "is_admin": connection.user.is_admin,
            "options": hass.data[DOMAIN]["options"],
        },
    )


@websocket_api.websocket_command({vol.Required("type"): "infinitix/get_inventory"})
@callback
def ws_get_inventory(hass, connection, msg) -> None:
    """Classified entity list, limited to what this user may read."""
    inventory = collect_inventory(hass, connection.user)
    connection.send_result(msg["id"], inventory)


@websocket_api.websocket_command({vol.Required("type"): "infinitix/scan"})
@websocket_api.require_admin
@callback
def ws_scan(hass, connection, msg) -> None:
    """Read areas/devices/entities/states.  Read-only: never calls a service."""
    config = _manager(hass).data
    inventory = collect_inventory(hass, connection.user)
    connection.send_result(
        msg["id"],
        {
            "inventory": inventory,
            "proposal": propose_config(inventory),
            "new_entities": [e["entity_id"] for e in find_new_entities(config, inventory)],
            "missing_entities": find_missing_entities(config, inventory),
        },
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "infinitix/save_config", vol.Required("config"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_config(hass, connection, msg) -> None:
    try:
        clean = validate_config(msg["config"])
    except ConfigError as err:
        connection.send_error(msg["id"], "invalid_config", str(err))
        return
    # Scenarios are edited only through infinitix/scenarios/* (they carry server-owned
    # run history), so a general config save never overwrites them.
    clean["scenarios"] = _manager(hass).data.get("scenarios", [])
    await _manager(hass).async_replace(clean)
    connection.send_result(msg["id"], {"config": _manager(hass).data})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "infinitix/save_wizard",
        vol.Required("step"): vol.All(int, vol.Range(min=0, max=20)),
        vol.Required("draft"): dict,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save_wizard(hass, connection, msg) -> None:
    """Persist wizard progress only (does not touch the live dashboard)."""
    manager = _manager(hass)
    candidate = {**manager.data, "wizard": {**manager.data["wizard"], "step": msg["step"], "draft": msg["draft"]}}
    try:
        manager.data = validate_config(candidate)
    except ConfigError as err:
        connection.send_error(msg["id"], "invalid_config", str(err))
        return
    await manager.async_save()
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "infinitix/dismiss_new",
        vol.Required("entity_ids"): [str],
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_dismiss_new(hass, connection, msg) -> None:
    """Remember that these entities were offered, so they are not suggested again."""
    manager = _manager(hass)
    seen = set(manager.data["seen_entities"]) | set(msg["entity_ids"])
    manager.data["seen_entities"] = sorted(seen)
    await manager.async_save()
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "infinitix/export",
        vol.Optional("include_structure", default=True): bool,
    }
)
@websocket_api.require_admin
@callback
def ws_export(hass, connection, msg) -> None:
    inventory = collect_inventory(hass, connection.user)
    connection.send_result(
        msg["id"],
        export_config(
            _manager(hass).data, inventory, include_structure=msg["include_structure"]
        ),
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "infinitix/import_plan", vol.Required("document"): dict}
)
@websocket_api.require_admin
@callback
def ws_import_plan(hass, connection, msg) -> None:
    error = validate_export(msg["document"])
    if error:
        connection.send_error(msg["id"], error, error)
        return
    inventory = collect_inventory(hass, connection.user)
    connection.send_result(
        msg["id"],
        {
            "plan": plan_import(msg["document"], inventory),
            "areas": inventory["areas"],
            "entities": [
                {k: e[k] for k in ("entity_id", "name", "domain", "area_id")}
                for e in inventory["entities"]
                if not e["default_hidden"] or e["is_weather"]
            ],
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "infinitix/import_apply",
        vol.Required("document"): dict,
        vol.Required("room_map"): dict,
        vol.Required("entity_map"): dict,
        vol.Optional("import_structure", default=True): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_import_apply(hass, connection, msg) -> None:
    error = validate_export(msg["document"])
    if error:
        connection.send_error(msg["id"], error, error)
        return
    manager = _manager(hass)
    try:
        merged = apply_import(
            manager.data,
            msg["document"],
            msg["room_map"],
            msg["entity_map"],
            import_structure=msg["import_structure"],
        )
        clean = validate_config(merged)
    except (ConfigError, KeyError, TypeError) as err:
        connection.send_error(msg["id"], "invalid_import", str(err))
        return
    await manager.async_replace(clean)
    connection.send_result(msg["id"], {"config": manager.data})


@websocket_api.websocket_command({vol.Required("type"): "infinitix/subscribe_registry"})
@websocket_api.require_admin
@callback
def ws_subscribe_registry(hass, connection, msg) -> None:
    """Notify the panel when areas/devices/entities change (no payload data)."""

    @callback
    def _forward(event) -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], {"event": event.event_type})
        )

    unsubs = [
        hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, _forward),
        hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, _forward),
        hass.bus.async_listen(ar.EVENT_AREA_REGISTRY_UPDATED, _forward),
    ]

    @callback
    def _unsub() -> None:
        for unsub in unsubs:
            unsub()

    connection.subscriptions[msg["id"]] = _unsub
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "infinitix/camera/discover"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_camera_discover(hass, connection, msg) -> None:
    """Find ONVIF cameras on the network (read-only WS-Discovery)."""
    try:
        devices = await async_discover(hass)
    except CameraError as err:
        connection.send_error(msg["id"], err.code, err.detail or err.code)
        return
    connection.send_result(msg["id"], {"devices": devices})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "infinitix/camera/add",
        vol.Required("host"): str,
        vol.Optional("port", default=80): int,
        vol.Optional("name", default=""): str,
        vol.Optional("username", default=""): str,
        vol.Optional("password", default=""): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_camera_add(hass, connection, msg) -> None:
    """Add an ONVIF camera via Home Assistant's own ONVIF config flow.

    The password is handed straight to HA's flow and is never stored or logged here.
    """
    try:
        result = await async_add_camera(
            hass,
            {k: msg.get(k) for k in ("host", "port", "name", "username", "password")},
        )
    except CameraError as err:
        connection.send_error(msg["id"], err.code, err.detail or err.code)
        return
    connection.send_result(msg["id"], result)


def _runner(hass: HomeAssistant):
    return hass.data[DOMAIN].get("runner")


def _scenario_view(hass: HomeAssistant) -> dict[str, Any]:
    runner = _runner(hass)
    items = []
    for sc in _manager(hass).data.get("scenarios", []):
        items.append({**sc, "next_run": runner.next_run(sc) if runner and sc.get("enabled") else None})
    return {"scenarios": items, "sources": runner.sources() if runner else {}}


@websocket_api.websocket_command({vol.Required("type"): "infinitix/scenarios/list"})
@websocket_api.require_admin
@callback
def ws_scenarios_list(hass, connection, msg) -> None:
    """Scenarios with their next trigger time and which HA time sources exist."""
    connection.send_result(msg["id"], _scenario_view(hass))


@websocket_api.websocket_command(
    {vol.Required("type"): "infinitix/scenarios/save", vol.Required("scenarios"): list}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_scenarios_save(hass, connection, msg) -> None:
    manager = _manager(hass)
    try:
        clean = validate_scenarios(msg["scenarios"])
    except ConfigError as err:
        connection.send_error(msg["id"], "invalid_scenarios", str(err))
        return
    # last_run is owned by the server: keep ours, ignore the client's.
    old = {s["id"]: s.get("last_run") for s in manager.data.get("scenarios", [])}
    for sc in clean:
        sc["last_run"] = old.get(sc["id"])
    manager.data["scenarios"] = clean
    await manager.async_save()
    if _runner(hass):
        _runner(hass).async_reload()
    connection.send_result(msg["id"], _scenario_view(hass))


@websocket_api.websocket_command(
    {vol.Required("type"): "infinitix/scenarios/run", vol.Required("scenario_id"): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_scenarios_run(hass, connection, msg) -> None:
    """Run a scenario's actions now (ignores day/Shabbat conditions: explicit admin action)."""
    runner = _runner(hass)
    if runner is None:
        connection.send_error(msg["id"], "not_ready", "scenario runner is not running")
        return
    result = await runner.async_run(msg["scenario_id"], reason="manual", force=True)
    if result.get("note") == "not_found":
        connection.send_error(msg["id"], "not_found", "no such scenario")
        return
    connection.send_result(msg["id"], {"last_run": result})


# ------------------------------------------------------------------ pairing (Matter / Zigbee)
@websocket_api.websocket_command({vol.Required("type"): "infinitix/pairing/status"})
@websocket_api.require_admin
@callback
def ws_pairing_status(hass, connection, msg) -> None:
    connection.send_result(msg["id"], pairing.async_status(hass))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "infinitix/pairing/permit",
        vol.Required("protocol"): vol.In(["zha", "z2m"]),
        vol.Optional("duration", default=120): int,
        vol.Optional("base_topic", default="zigbee2mqtt"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_pairing_permit(hass, connection, msg) -> None:
    try:
        await pairing.async_permit(hass, msg["protocol"], msg["duration"], msg["base_topic"])
    except pairing.PairingError as err:
        connection.send_error(msg["id"], err.code, err.detail or err.code)
        return
    except Exception as err:  # noqa: BLE001 - HA service errors
        connection.send_error(msg["id"], "permit_failed", str(err))
        return
    connection.send_result(msg["id"], {"duration": msg["duration"]})


# ------------------------------------------------------------------ media players
def _media_call(fn):
    async def run(hass, connection, msg):
        try:
            connection.send_result(msg["id"], await fn(hass, msg))
        except media.MediaError as err:
            connection.send_error(msg["id"], err.code, err.detail or err.code)
    return run


@websocket_api.websocket_command({vol.Required("type"): "infinitix/media/list"})
@websocket_api.require_admin
@callback
def ws_media_list(hass, connection, msg) -> None:
    connection.send_result(msg["id"], media.async_list(hass))


@websocket_api.websocket_command(
    {vol.Required("type"): "infinitix/media/start", vol.Required("domain"): str, vol.Optional("host", default=""): str}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_media_start(hass, connection, msg) -> None:
    async def go(h, m):
        return await media.async_start(h, m["domain"], m["host"])
    await _media_call(go)(hass, connection, msg)


@websocket_api.websocket_command(
    {vol.Required("type"): "infinitix/media/continue", vol.Required("flow_id"): str, vol.Optional("data", default=dict): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_media_continue(hass, connection, msg) -> None:
    async def go(h, m):
        return await media.async_continue(h, m["flow_id"], m["data"])
    await _media_call(go)(hass, connection, msg)


@websocket_api.websocket_command({vol.Required("type"): "infinitix/media/abort", vol.Required("flow_id"): str})
@websocket_api.require_admin
@callback
def ws_media_abort(hass, connection, msg) -> None:
    try:
        media.async_abort(hass, msg["flow_id"])
    except media.MediaError as err:
        connection.send_error(msg["id"], err.code, err.code)
        return
    connection.send_result(msg["id"], {})
