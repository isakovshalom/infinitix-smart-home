"""Discovery of areas, devices and entities already integrated in Home Assistant.

Read-only: nothing here calls a service or turns a device on.  The pure
`build_inventory` / `propose_config` / `find_new_entities` functions take plain
dicts so they can be unit tested without Home Assistant.
"""

from __future__ import annotations

from typing import Any

from .classify import classify_entity, is_temperature_sensor, is_weather_entity
from .const import UNASSIGNED_ROOM

# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def build_inventory(
    areas: list[dict[str, Any]],
    devices: list[dict[str, Any]],
    registry_entities: list[dict[str, Any]],
    states: list[dict[str, Any]],
) -> dict[str, Any]:
    """Combine registry rows and current states into one classified inventory.

    ``registry_entities`` rows: entity_id, device_id, area_id, disabled_by,
    hidden_by, entity_category, device_class, original_device_class, platform,
    name, original_name, icon, supported_features.
    ``states`` rows: entity_id, state, attributes.
    """
    area_by_id = {a["id"]: a for a in areas}
    device_by_id = {d["id"]: d for d in devices}
    state_by_id = {s["entity_id"]: s for s in states}

    items: dict[str, dict[str, Any]] = {}

    def add(entity_id: str, reg: dict[str, Any] | None) -> None:
        if entity_id in items:  # de-duplicate
            return
        st = state_by_id.get(entity_id)
        attrs = (st or {}).get("attributes") or {}
        device = device_by_id.get(reg["device_id"]) if reg and reg.get("device_id") else None

        area_id = None
        area_source = None
        if reg and reg.get("area_id"):  # explicit entity area wins
            area_id, area_source = reg["area_id"], "entity"
        elif device and device.get("area_id"):
            area_id, area_source = device["area_id"], "device"
        if area_id not in area_by_id:
            area_id, area_source = None, None

        name = (
            attrs.get("friendly_name")
            or (reg or {}).get("name")
            or (reg or {}).get("original_name")
            or entity_id
        )
        facts = {
            "entity_id": entity_id,
            "name": name,
            "disabled": bool(reg and reg.get("disabled_by")),
            "hidden": bool(reg and reg.get("hidden_by")),
            "entity_category": (reg or {}).get("entity_category"),
            "device_class": attrs.get("device_class")
            or (reg or {}).get("device_class")
            or (reg or {}).get("original_device_class"),
            "supported_features": attrs.get("supported_features")
            if attrs.get("supported_features") is not None
            else (reg or {}).get("supported_features"),
            "supported_color_modes": attrs.get("supported_color_modes"),
            "hvac_modes": attrs.get("hvac_modes"),
        }
        cls = classify_entity(facts)
        items[entity_id] = {
            "entity_id": entity_id,
            "name": name,
            "domain": entity_id.split(".", 1)[0],
            "device_class": facts["device_class"],
            "device_id": (reg or {}).get("device_id"),
            "device_name": (device or {}).get("name"),
            "integration": (reg or {}).get("platform"),
            "area_id": area_id,
            "area_source": area_source,
            "in_registry": reg is not None,
            "icon": (reg or {}).get("icon") or attrs.get("icon"),
            "unit": attrs.get("unit_of_measurement"),
            "state": (st or {}).get("state"),
            "available": bool(st) and st["state"] not in ("unavailable",),
            "disabled": facts["disabled"],
            "is_temperature_sensor": is_temperature_sensor(facts),
            "is_weather": is_weather_entity(facts),
            **cls,
        }

    for reg in registry_entities:
        add(reg["entity_id"], reg)
    for st in states:  # entities with no registry entry (e.g. YAML, no unique_id)
        add(st["entity_id"], None)

    entity_list = sorted(items.values(), key=lambda e: e["entity_id"])
    summary = {
        "areas": len(areas),
        "devices": len(devices),
        "entities": len(entity_list),
        "unassigned": sum(1 for e in entity_list if e["area_id"] is None),
        "hidden_by_default": sum(1 for e in entity_list if e["default_hidden"]),
        "disabled": sum(1 for e in entity_list if e["disabled"]),
        "without_registry": sum(1 for e in entity_list if not e["in_registry"]),
        "uncertain": sum(
            1 for e in entity_list if e["confidence"] == "low" and not e["default_hidden"]
        ),
        "by_card": _count_by(entity_list, lambda e: e["card"] if not e["default_hidden"] else None),
    }
    return {"areas": areas, "entities": entity_list, "summary": summary}


def _count_by(items: list[dict[str, Any]], key) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        k = key(item)
        if k:
            counts[k] = counts.get(k, 0) + 1
    return counts


def _entity_pref(item: dict[str, Any], room_id: str | None, order: int) -> dict[str, Any]:
    return {
        "card": item["card"],
        "name": None,
        "icon": None,
        "room": room_id,
        "hidden": False,
        "favorite": False,
        "size": "m",
        "order": order,
    }


def propose_config(inventory: dict[str, Any]) -> dict[str, Any]:
    """Build the proposed rooms/entities from an inventory (auto mode).

    Returns only the rooms/entities/temperature/weather parts; the caller merges
    it into the full config.
    """
    visible = [
        e
        for e in inventory["entities"]
        if not e["default_hidden"] and not e["disabled"] and e["card"]
    ]

    rooms: list[dict[str, Any]] = []
    room_for_area: dict[str, str] = {}
    area_order = sorted(inventory["areas"], key=lambda a: (a["name"] or "").casefold())
    for area in area_order:
        if any(e["area_id"] == area["id"] for e in visible):
            rid = f"room_{area['id']}"
            room_for_area[area["id"]] = rid
            rooms.append(
                {
                    "id": rid,
                    "area_id": area["id"],
                    "name": area["name"],
                    "icon": area.get("icon"),
                    "order": len(rooms),
                    "visible": True,
                }
            )
    if any(e["area_id"] is None for e in visible):
        rooms.append(
            {
                "id": UNASSIGNED_ROOM,
                "area_id": None,
                "name": None,  # frontend shows the localized "Unassigned" label
                "icon": "mdi:help-circle-outline",
                "order": len(rooms),
                "visible": True,
            }
        )

    entities: dict[str, dict[str, Any]] = {}
    per_room_counter: dict[str, int] = {}
    for e in visible:
        rid = room_for_area.get(e["area_id"]) if e["area_id"] else UNASSIGNED_ROOM
        idx = per_room_counter.get(rid, 0)
        per_room_counter[rid] = idx + 1
        entities[e["entity_id"]] = _entity_pref(e, rid, idx)

    room_temp: dict[str, str] = {}
    for e in visible:
        rid = entities[e["entity_id"]]["room"]
        if e["is_temperature_sensor"] and rid and rid not in room_temp:
            room_temp[rid] = e["entity_id"]

    weather = next((e["entity_id"] for e in inventory["entities"] if e["is_weather"]), None)
    return {
        "rooms": rooms,
        "entities": entities,
        "room_temp_sensor": room_temp,
        "weather_entity": weather,
    }


def find_new_entities(config: dict[str, Any], inventory: dict[str, Any]) -> list[dict[str, Any]]:
    """Entities that appeared after the last setup and were not yet offered.

    The result is a suggestion list: nothing is added or overwritten here.
    """
    known = set(config.get("entities", {}))
    seen = set(config.get("seen_entities", []))
    return [
        e
        for e in inventory["entities"]
        if e["entity_id"] not in known
        and e["entity_id"] not in seen
        and not e["default_hidden"]
        and not e["disabled"]
        and e["card"]
    ]


def find_missing_entities(config: dict[str, Any], inventory: dict[str, Any]) -> list[str]:
    """Configured entities that no longer exist in HA (reported, never deleted)."""
    present = {e["entity_id"] for e in inventory["entities"]}
    return sorted(eid for eid in config.get("entities", {}) if eid not in present)


# ---------------------------------------------------------------------------
# Home Assistant side
# ---------------------------------------------------------------------------


def collect_inventory(hass, user=None) -> dict[str, Any]:
    """Read registries and states from HA and build the inventory.

    If ``user`` is given, entities the user may not read are dropped.
    """
    from homeassistant.helpers import (  # noqa: PLC0415 - keep pure part importable
        area_registry as ar,
        device_registry as dr,
        entity_registry as er,
    )

    areas = [
        {"id": a.id, "name": a.name, "icon": a.icon}
        for a in ar.async_get(hass).areas.values()
    ]
    devices = [
        {
            "id": d.id,
            "name": d.name_by_user or d.name,
            "area_id": d.area_id,
            "manufacturer": d.manufacturer,
            "model": d.model,
        }
        for d in dr.async_get(hass).devices
    ]
    reg_rows = [
        {
            "entity_id": e.entity_id,
            "device_id": e.device_id,
            "area_id": e.area_id,
            "disabled_by": e.disabled_by.value if e.disabled_by else None,
            "hidden_by": e.hidden_by.value if e.hidden_by else None,
            "entity_category": e.entity_category.value if e.entity_category else None,
            "device_class": e.device_class,
            "original_device_class": e.original_device_class,
            "platform": e.platform,
            "name": e.name,
            "original_name": e.original_name,
            "icon": e.icon or e.original_icon,
            "supported_features": e.supported_features,
        }
        for e in er.async_get(hass).entities.values()
    ]
    state_rows = [
        {"entity_id": s.entity_id, "state": s.state, "attributes": dict(s.attributes)}
        for s in hass.states.async_all()
    ]

    if user is not None and not user.is_admin:
        from homeassistant.auth.permissions.const import POLICY_READ  # noqa: PLC0415

        def can_read(eid: str) -> bool:
            return user.permissions.check_entity(eid, POLICY_READ)

        reg_rows = [r for r in reg_rows if can_read(r["entity_id"])]
        state_rows = [s for s in state_rows if can_read(s["entity_id"])]

    return build_inventory(areas, devices, reg_rows, state_rows)
