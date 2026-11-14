"""Export / import of INFINITIX configuration between homes.

The export never contains secrets or tokens (the stored config has none) and
separates the shared *design* from the home-specific *structure*.  On import
into another home entity ids are NOT trusted: a plan proposes a mapping, the
installer confirms or edits it in the import wizard, and only then is it applied.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from .const import EXPORT_FORMAT, EXPORT_FORMAT_VERSION, UNASSIGNED_ROOM


def _norm(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().casefold())


def export_config(
    config: dict[str, Any],
    inventory: dict[str, Any],
    *,
    include_structure: bool = True,
) -> dict[str, Any]:
    by_id = {e["entity_id"]: e for e in inventory["entities"]}
    area_name = {a["id"]: a["name"] for a in inventory["areas"]}

    doc: dict[str, Any] = {
        "format": EXPORT_FORMAT,
        "format_version": EXPORT_FORMAT_VERSION,
        "design": {
            "language": config["home"]["language"],
            "screen": config["home"]["screen"],
            "theme": copy.deepcopy(config["theme"]),
            "tablet": copy.deepcopy(config["tablet"]),
        },
    }
    if include_structure:
        rooms = []
        for r in config["rooms"]:
            rooms.append(
                {
                    "id": r["id"],
                    "name": r.get("name"),
                    "icon": r.get("icon"),
                    "order": r.get("order", 0),
                    "visible": r.get("visible", True),
                    "area_name": area_name.get(r.get("area_id")),
                }
            )
        entities = []
        for eid, pref in config["entities"].items():
            known = by_id.get(eid, {})
            entities.append(
                {
                    "entity_id": eid,
                    "domain": eid.split(".", 1)[0],
                    "device_class": known.get("device_class"),
                    "name_hint": known.get("name"),
                    **copy.deepcopy(pref),
                }
            )
        doc["structure"] = {
            "mode": config.get("mode", "auto"),
            "rooms": rooms,
            "entities": entities,
            "room_temp_sensor": dict(config.get("room_temp_sensor", {})),
            "weather_entity": config.get("weather_entity"),
        }
    return doc


def validate_export(doc: Any) -> str | None:
    """Return an error code if ``doc`` is not a usable export, else None."""
    if not isinstance(doc, dict) or doc.get("format") != EXPORT_FORMAT:
        return "not_an_infinitix_export"
    version = doc.get("format_version")
    if not isinstance(version, int) or version > EXPORT_FORMAT_VERSION:
        return "unsupported_version"
    if "design" not in doc or not isinstance(doc["design"], dict):
        return "missing_design"
    return None


def plan_import(doc: dict[str, Any], inventory: dict[str, Any]) -> dict[str, Any]:
    """Propose a mapping of exported rooms/entities onto this home."""
    structure = doc.get("structure") or {}
    areas = inventory["areas"]
    area_by_name = {_norm(a["name"]): a["id"] for a in areas}
    ents = inventory["entities"]
    ent_ids = {e["entity_id"]: e for e in ents}

    # name index per (domain, device_class); only unambiguous names are matched
    index: dict[tuple[str, str | None, str], list[str]] = {}
    for e in ents:
        index.setdefault((e["domain"], e["device_class"], _norm(e["name"])), []).append(
            e["entity_id"]
        )

    room_plan = []
    for r in structure.get("rooms", []):
        if r["id"] == UNASSIGNED_ROOM:
            room_plan.append({"room": r, "action": "keep_unassigned", "area_id": None})
            continue
        area_id = area_by_name.get(_norm(r.get("area_name") or r.get("name")))
        room_plan.append(
            {
                "room": r,
                "action": "map" if area_id else "create",
                "area_id": area_id,
            }
        )

    entity_plan = []
    exported_entities = list(structure.get("entities", []))
    weather = structure.get("weather_entity")
    if weather and all(e["entity_id"] != weather for e in exported_entities):
        # the weather entity is not a dashboard card, but it still needs mapping
        exported_entities.append(
            {
                "entity_id": weather,
                "domain": "weather",
                "device_class": None,
                "name_hint": None,
                "weather_only": True,
            }
        )
    for e in exported_entities:
        target = None
        how = "none"
        same = ent_ids.get(e["entity_id"])
        if same and same["domain"] == e["domain"]:
            target, how = e["entity_id"], "same_id"  # still needs confirmation
        else:
            key = (e["domain"], e.get("device_class"), _norm(e.get("name_hint")))
            candidates = index.get(key, [])
            if len(candidates) == 1 and key[2]:
                target, how = candidates[0], "same_name"
        entity_plan.append({"entity": e, "target": target, "match": how})

    return {
        "rooms": room_plan,
        "entities": entity_plan,
        "unmatched": sum(1 for p in entity_plan if p["target"] is None),
    }


def apply_import(
    config: dict[str, Any],
    doc: dict[str, Any],
    room_map: dict[str, dict[str, Any]],
    entity_map: dict[str, str | None],
    *,
    import_structure: bool,
) -> dict[str, Any]:
    """Return a new config with the import applied (merge, never wipe).

    room_map: exported room id -> {"action": "map"|"create"|"keep_unassigned"|"skip",
              "area_id": str|None}
    entity_map: exported entity_id -> target entity_id in this home, or None to skip.
    """
    new = copy.deepcopy(config)
    design = doc["design"]
    new["home"]["language"] = design.get("language", new["home"]["language"])
    new["home"]["screen"] = design.get("screen", new["home"]["screen"])
    new["theme"] = {**new["theme"], **design.get("theme", {})}
    new["tablet"] = {**new["tablet"], **design.get("tablet", {})}

    if not import_structure or "structure" not in doc:
        return new

    structure = doc["structure"]
    existing_rooms = {r["id"]: r for r in new["rooms"]}
    local_room_for: dict[str, str] = {}
    for r in structure.get("rooms", []):
        plan = room_map.get(r["id"], {"action": "skip"})
        action = plan.get("action", "skip")
        if action == "skip":
            continue
        if action == "keep_unassigned":
            local_id = UNASSIGNED_ROOM
            area_id = None
        else:
            area_id = plan.get("area_id")
            local_id = f"room_{area_id}" if area_id else f"room_imported_{r['id']}"
        local_room_for[r["id"]] = local_id
        room = {
            "id": local_id,
            "area_id": area_id,
            "name": r.get("name"),
            "icon": r.get("icon"),
            "order": r.get("order", len(existing_rooms)),
            "visible": r.get("visible", True),
        }
        existing_rooms[local_id] = {**existing_rooms.get(local_id, {}), **room}
    new["rooms"] = sorted(existing_rooms.values(), key=lambda x: x.get("order", 0))

    for e in structure.get("entities", []):
        target = entity_map.get(e["entity_id"])
        if not target:
            continue
        pref = {
            k: e.get(k)
            for k in ("card", "name", "icon", "hidden", "favorite", "size", "order")
        }
        pref["room"] = local_room_for.get(e.get("room"), None)
        new["entities"][target] = {**new["entities"].get(target, {}), **pref}

    # re-point per-room temperature sensors and the weather entity
    for exported_room, eid in structure.get("room_temp_sensor", {}).items():
        local_room = local_room_for.get(exported_room)
        target = entity_map.get(eid)
        if local_room and target:
            new["room_temp_sensor"][local_room] = target
    weather = structure.get("weather_entity")
    if weather and entity_map.get(weather):
        new["weather_entity"] = entity_map[weather]
    return new
