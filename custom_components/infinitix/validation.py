"""Validation / sanitising of configuration sent by the frontend.

The frontend is untrusted input (a non-admin could craft a websocket message),
so everything that is stored is normalised here; unknown keys are dropped.
Pure Python, unit tested.
"""

from __future__ import annotations

from typing import Any

from .scenario_ops import ACTION_DOMAINS, OPS, VALUE_RANGE
from .const import CARD_TYPES, UNASSIGNED_ROOM
from .storage import LAYOUT_RENAMES, default_config

_ENTITY_ID_MAX = 255
_TEXT_MAX = 120
_SIZES = ("s", "m", "l")
_LANGS = ("he", "en", "ru")
_SCREENS = ("mobile", "tablet", "desktop")
_MODES = ("auto", "manual", "hybrid")
_THEME_MODES = ("auto", "light", "dark")
_LAYOUTS = ("mosaic", "rows", "rail", "stage")
_SCENARIO_MAX = 100
_ACTIONS_MAX = 50
_TRIGGER_SUN = ("sunrise", "sunset")
_TRIGGER_JEWISH = ("candle_lighting", "havdalah")
_SHABBAT = ("any", "only", "not")
_OFFSET_MAX = 360


class ConfigError(ValueError):
    """Raised when a payload cannot be accepted."""


def _text(value: Any, max_len: int = _TEXT_MAX) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ConfigError("expected string")
    value = value.strip()
    return value[:max_len] or None


def _entity_id(value: Any) -> str:
    if (
        not isinstance(value, str)
        or len(value) > _ENTITY_ID_MAX
        or value.count(".") != 1
        or value != value.lower()
        or " " in value
    ):
        raise ConfigError(f"invalid entity_id: {value!r}")
    return value


def _choice(value: Any, allowed: tuple[str, ...], default: str) -> str:
    return value if value in allowed else default


def _icon(value: Any) -> str | None:
    text = _text(value, 80)
    if text and not text.startswith("mdi:"):
        return None  # only Material Design Icons are rendered
    return text


_STATE_MODES = ("equals", "above", "below")


def _scenario_trigger(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ConfigError("scenario trigger must be an object")
    kind = raw.get("type")
    if kind == "manual":
        return {"type": "manual"}
    if kind == "state":
        mode = raw.get("mode")
        value = str(raw.get("value") if raw.get("value") is not None else "").strip()[:80]
        if mode not in _STATE_MODES or not value:
            raise ConfigError("state trigger needs a mode and a value")
        if mode != "equals":
            try:
                float(value)
            except ValueError as err:
                raise ConfigError("above/below needs a number") from err
        return {"type": "state", "entity_id": _entity_id(raw.get("entity_id")), "mode": mode, "value": value}
    if kind == "time":
        at = raw.get("at")
        try:
            hh, mm = str(at).split(":")
            if not (len(hh) == 2 and len(mm) == 2 and 0 <= int(hh) <= 23 and 0 <= int(mm) <= 59):
                raise ValueError
        except ValueError as err:
            raise ConfigError("trigger time must be HH:MM") from err
        return {"type": "time", "at": f"{hh}:{mm}"}
    allowed = _TRIGGER_SUN if kind == "sun" else _TRIGGER_JEWISH if kind == "jewish" else None
    if allowed is None:
        raise ConfigError("unknown trigger type")
    event = raw.get("event")
    offset = raw.get("offset_min", 0)
    if event not in allowed:
        raise ConfigError("unknown trigger event")
    if not isinstance(offset, int) or isinstance(offset, bool) or abs(offset) > _OFFSET_MAX:
        raise ConfigError("trigger offset out of range")
    return {"type": kind, "event": event, "offset_min": offset}


def _scenario_action(a: Any) -> dict[str, Any]:
    if not isinstance(a, dict):
        raise ConfigError("action must be an object")
    eid = _entity_id(a.get("entity_id"))
    domain = eid.split(".", 1)[0]
    if domain not in ACTION_DOMAINS:
        raise ConfigError(f"scenarios can control only {', '.join(ACTION_DOMAINS)}")
    op = a.get("op", a.get("state"))  # "state" is the pre-0.4 field name
    if op not in OPS[domain]:
        raise ConfigError(f"{domain} does not support {op!r} in scenarios")
    action: dict[str, Any] = {"entity_id": eid, "op": op}
    value = a.get("value", a.get("brightness_pct"))
    rng = VALUE_RANGE.get((domain, op))
    if (domain, op) == ("climate", "temperature") and value is None:
        raise ConfigError("temperature needs a value")
    if rng and value is not None:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not rng[0] <= value <= rng[1]:
            raise ConfigError(f"value for {domain} {op} must be {rng[0]}-{rng[1]}")
        action["value"] = value
    return action


def _scenario_last_run(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or not isinstance(raw.get("at"), str):
        return None
    return {
        "at": raw["at"][:40],
        "ok": bool(raw.get("ok")),
        "ran": bool(raw.get("ran")),
        "note": str(raw.get("note") or "")[:300],
    }


def validate_scenarios(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > _SCENARIO_MAX:
        raise ConfigError(f"scenarios must be a list of at most {_SCENARIO_MAX} items")
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            raise ConfigError("scenario must be an object")
        sid = _text(item.get("id"), 40)
        if not sid or sid in seen:
            raise ConfigError("scenario ids must be unique and non-empty")
        seen.add(sid)
        days = item.get("days") or []
        if not isinstance(days, list) or any(not isinstance(d, int) or isinstance(d, bool) or not 0 <= d <= 6 for d in days):
            raise ConfigError("scenario days must be numbers 0-6")
        actions_raw = item.get("actions") or []
        if not isinstance(actions_raw, list) or not 1 <= len(actions_raw) <= _ACTIONS_MAX:
            raise ConfigError("a scenario needs 1-50 actions")
        actions = [_scenario_action(a) for a in actions_raw]
        out.append(
            {
                "id": sid,
                "name": _text(item.get("name"), 80) or sid,
                "enabled": bool(item.get("enabled", True)),
                "trigger": _scenario_trigger(item.get("trigger")),
                "days": sorted(set(days)),
                "shabbat": _choice(item.get("shabbat"), _SHABBAT, "any"),
                "actions": actions,
                "dashboard": bool(item.get("dashboard", False)),
                "icon": _text(item.get("icon"), 40) or "",
                "last_run": _scenario_last_run(item.get("last_run")),
            }
        )
    return out


def validate_config(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ConfigError("config must be an object")
    out = default_config()

    home = raw.get("home") or {}
    out["home"] = {
        "name": _text(home.get("name")) or "",
        "language": _choice(home.get("language"), _LANGS, "he"),
        "screen": _choice(home.get("screen"), _SCREENS, "tablet"),
    }
    out["mode"] = _choice(raw.get("mode"), _MODES, "auto")

    theme = raw.get("theme") or {}
    accent = _text(theme.get("accent"), 9)
    if accent is not None and not (
        accent.startswith("#")
        and len(accent) in (4, 7, 9)
        and all(c in "0123456789abcdefABCDEF" for c in accent[1:])
    ):
        accent = None
    out["theme"] = {
        "mode": _choice(theme.get("mode"), _THEME_MODES, "auto"),
        "accent": accent,
        "layout": _choice(LAYOUT_RENAMES.get(theme.get("layout"), theme.get("layout")), _LAYOUTS, "mosaic"),
    }

    wizard = raw.get("wizard") or {}
    step = wizard.get("step", 0)
    draft = wizard.get("draft", {})
    out["wizard"] = {
        "completed": bool(wizard.get("completed", False)),
        "step": step if isinstance(step, int) and 0 <= step <= 20 else 0,
        # draft is only ever read back by the same wizard; keep it bounded
        "draft": draft if isinstance(draft, dict) and len(str(draft)) < 200_000 else {},
    }

    rooms = raw.get("rooms") or []
    if not isinstance(rooms, list) or len(rooms) > 200:
        raise ConfigError("rooms must be a list of at most 200 items")
    seen_rooms: set[str] = set()
    clean_rooms = []
    for i, room in enumerate(rooms):
        rid = _text(room.get("id"), 80)
        if not rid or rid in seen_rooms:
            raise ConfigError("room ids must be unique and non-empty")
        seen_rooms.add(rid)
        clean_rooms.append(
            {
                "id": rid,
                "area_id": _text(room.get("area_id"), 80),
                "name": _text(room.get("name")),
                "icon": _icon(room.get("icon")),
                "order": room["order"] if isinstance(room.get("order"), int) else i,
                "visible": bool(room.get("visible", True)),
            }
        )
    out["rooms"] = clean_rooms

    entities = raw.get("entities") or {}
    if not isinstance(entities, dict) or len(entities) > 5000:
        raise ConfigError("entities must be an object of at most 5000 items")
    clean_entities: dict[str, Any] = {}
    for eid, pref in entities.items():
        eid = _entity_id(eid)
        pref = pref or {}
        room = _text(pref.get("room"), 80)
        if room and room != UNASSIGNED_ROOM and room not in seen_rooms:
            room = None
        card = pref.get("card")
        clean_entities[eid] = {
            "card": card if card in CARD_TYPES else "generic",
            "name": _text(pref.get("name")),
            "icon": _icon(pref.get("icon")),
            "room": room,
            "hidden": bool(pref.get("hidden", False)),
            "favorite": bool(pref.get("favorite", False)),
            "size": _choice(pref.get("size"), _SIZES, "m"),
            "order": pref["order"] if isinstance(pref.get("order"), int) else 0,
        }
    out["entities"] = clean_entities

    temp = raw.get("room_temp_sensor") or {}
    out["room_temp_sensor"] = {
        rid: _entity_id(eid)
        for rid, eid in temp.items()
        if rid in seen_rooms or rid == UNASSIGNED_ROOM
    }
    weather = raw.get("weather_entity")
    out["weather_entity"] = _entity_id(weather) if weather else None
    if out["weather_entity"] and not out["weather_entity"].startswith("weather."):
        raise ConfigError("weather_entity must be a weather entity")

    tablet = raw.get("tablet") or {}
    out["tablet"] = {"hide_nav": bool(tablet.get("hide_nav", False))}

    seen = raw.get("seen_entities") or []
    if not isinstance(seen, list) or len(seen) > 20_000:
        raise ConfigError("seen_entities too large")
    out["seen_entities"] = [_entity_id(e) for e in seen]
    out["scenarios"] = validate_scenarios(raw.get("scenarios"))
    return out
