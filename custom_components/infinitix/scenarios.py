"""Time-based scenarios: Shabbat timer, lights/switches by sunset/sunrise, Jewish calendar.

Scenarios run inside Home Assistant (not in the browser), so they work while the
dashboard is closed.  They are stored in INFINITIX's managed storage and do not
touch the user's own automations.

Time sources are Home Assistant's built-in integrations only; this module computes
no halachic times itself:

* fixed time               -> ``async_track_time_change``
* sunrise / sunset +- N min -> ``async_track_sunrise`` / ``async_track_sunset``
                              (the ``sun`` integration, enabled by default)
* candle lighting / havdalah -> the ``upcoming_candle_lighting`` / ``upcoming_havdalah``
                              timestamp sensors of HA's ``jewish_calendar`` integration
                              (its own candle-lighting/havdalah offsets apply)
* Shabbat/Yom Tov condition -> its ``issur_melacha_in_effect`` binary sensor

Safety rules: a scenario whose time source or condition sensor is unavailable does
NOT run (it never acts on a stale or guessed time); every run is recorded.
Whether a given device or action is appropriate on Shabbat is the user's decision.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import (
    async_track_point_in_utc_time,
    async_track_state_change_event,
    async_track_sunrise,
    async_track_sunset,
    async_track_time_change,
)
from homeassistant.helpers.sun import get_astral_event_next
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

JEWISH_DOMAIN = "jewish_calendar"
JEWISH_SENSOR_KEY = {
    "candle_lighting": ("sensor", "upcoming_candle_lighting"),
    "havdalah": ("sensor", "upcoming_havdalah"),
}
ISSUR_KEY = ("binary_sensor", "issur_melacha_in_effect")
ACTION_DOMAINS = ("light", "switch", "fan", "input_boolean")
UNKNOWN_STATES = ("unavailable", "unknown", None, "")


# ---------------------------------------------------------------- pure helpers
def day_allowed(days: list[int], weekday: int) -> bool:
    """``days`` uses Python weekday numbers (Mon=0 ... Sun=6); empty = every day."""
    return not days or weekday in days


def shabbat_allowed(mode: str, state: str | None) -> tuple[bool, str]:
    """Evaluate the Shabbat/Yom Tov condition against the sensor state.

    Returns (allowed, note).  With a condition set and an unavailable sensor the
    scenario is skipped: we never guess.
    """
    if mode == "any":
        return True, ""
    if state in UNKNOWN_STATES:
        return False, "shabbat_sensor_unavailable"
    in_effect = state == "on"
    if mode == "only":
        return (in_effect, "" if in_effect else "not_shabbat")
    return (not in_effect, "" if not in_effect else "shabbat")  # mode == "not"


def action_service(domain: str, state: str) -> str:
    return "turn_on" if state == "on" else "turn_off"


def describe_trigger(trigger: dict[str, Any]) -> str:
    """Short machine-readable summary used in logs."""
    t = trigger["type"]
    if t == "time":
        return f"time {trigger['at']}"
    return f"{trigger['event']} {trigger.get('offset_min', 0):+d}min"


# ---------------------------------------------------------------- runner
class ScenarioRunner:
    """Arms every enabled scenario and executes it when its trigger fires."""

    def __init__(self, hass: HomeAssistant, manager) -> None:
        self.hass = hass
        self._manager = manager
        self._unsubs: dict[str, list[Callable[[], None]]] = {}

    # -- lifecycle
    @callback
    def async_reload(self) -> None:
        self.async_stop()
        for scenario in self._manager.data.get("scenarios", []):
            if scenario.get("enabled"):
                try:
                    self._arm(scenario)
                except Exception:  # noqa: BLE001 - one bad scenario must not stop the others
                    _LOGGER.exception("Could not arm scenario %s", scenario.get("id"))

    @callback
    def async_stop(self) -> None:
        for unsubs in self._unsubs.values():
            for unsub in unsubs:
                unsub()
        self._unsubs.clear()

    def _add(self, sid: str, unsub: Callable[[], None]) -> None:
        self._unsubs.setdefault(sid, []).append(unsub)

    # -- source lookup (entity ids are resolved from the registry, never guessed)
    def jewish_entity(self, domain: str, key: str) -> str | None:
        registry = er.async_get(self.hass)
        for entry in registry.entities.values():
            if (
                entry.platform == JEWISH_DOMAIN
                and entry.domain == domain
                and entry.unique_id.endswith(f"-{key}")
                and not entry.disabled
            ):
                return entry.entity_id
        return None

    def sources(self) -> dict[str, bool]:
        return {
            "sun": bool(self.hass.config.latitude or self.hass.config.longitude),  # sunrise/sunset need a home location
            "candle_lighting": self.jewish_entity(*JEWISH_SENSOR_KEY["candle_lighting"]) is not None,
            "havdalah": self.jewish_entity(*JEWISH_SENSOR_KEY["havdalah"]) is not None,
            "issur_melacha": self.jewish_entity(*ISSUR_KEY) is not None,
        }

    # -- arming
    def _arm(self, scenario: dict[str, Any]) -> None:
        sid, trigger = scenario["id"], scenario["trigger"]
        kind = trigger["type"]

        @callback
        def fire(*_args: Any) -> None:
            self.hass.async_create_task(self.async_run(sid, reason=describe_trigger(trigger)))

        if kind == "time":
            hour, minute = (int(x) for x in trigger["at"].split(":"))
            self._add(sid, async_track_time_change(self.hass, fire, hour=hour, minute=minute, second=0))
        elif kind == "sun":
            offset = timedelta(minutes=trigger.get("offset_min", 0))
            track = async_track_sunrise if trigger["event"] == "sunrise" else async_track_sunset
            self._add(sid, track(self.hass, fire, offset))
        elif kind == "jewish":
            self._arm_jewish(scenario, fire)

    def _arm_jewish(self, scenario: dict[str, Any], fire: Callable[..., None]) -> None:
        sid, trigger = scenario["id"], scenario["trigger"]
        entity_id = self.jewish_entity(*JEWISH_SENSOR_KEY[trigger["event"]])
        if entity_id is None:
            _LOGGER.warning("Scenario %s needs HA's Jewish Calendar integration (not found); not armed", sid)
            return
        offset = timedelta(minutes=trigger.get("offset_min", 0))
        timer: dict[str, Callable[[], None] | None] = {"cancel": None}
        fired_for: dict[str, datetime | None] = {"at": None}

        def schedule() -> None:
            if timer["cancel"]:
                timer["cancel"]()
                timer["cancel"] = None
            target = self._sensor_time(entity_id)
            if target is None:
                return  # sensor unavailable: wait for it to report a time
            target = target + offset
            if target <= dt_util.utcnow() or fired_for["at"] == target:
                return  # past (or already fired): the sensor will move to the next event

            @callback
            def _fire(_now: datetime) -> None:
                fired_for["at"] = target
                timer["cancel"] = None
                fire()

            timer["cancel"] = async_track_point_in_utc_time(self.hass, _fire, target)

        @callback
        def _changed(_event: Event) -> None:
            schedule()

        schedule()
        self._add(sid, async_track_state_change_event(self.hass, [entity_id], _changed))
        self._add(sid, lambda: timer["cancel"] and timer["cancel"]())

    def _sensor_time(self, entity_id: str) -> datetime | None:
        state = self.hass.states.get(entity_id)
        if state is None or state.state in UNKNOWN_STATES:
            return None
        return dt_util.parse_datetime(state.state)

    # -- preview
    def next_run(self, scenario: dict[str, Any]) -> str | None:
        """Next time the trigger itself fires (conditions are evaluated at run time)."""
        trigger = scenario["trigger"]
        now = dt_util.utcnow()
        if trigger["type"] == "time":
            hour, minute = (int(x) for x in trigger["at"].split(":"))
            local = dt_util.now()
            nxt = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if nxt <= local:
                nxt += timedelta(days=1)
            return nxt.isoformat()
        offset = timedelta(minutes=trigger.get("offset_min", 0))
        if trigger["type"] == "sun":
            when = get_astral_event_next(self.hass, trigger["event"], now, offset)
            return when.isoformat() if when else None
        entity_id = self.jewish_entity(*JEWISH_SENSOR_KEY[trigger["event"]])
        target = entity_id and self._sensor_time(entity_id)
        if not target:
            return None
        target += offset
        return target.isoformat() if target > now else None

    # -- execution
    async def async_run(self, sid: str, reason: str = "manual", force: bool = False) -> dict[str, Any]:
        scenario = next((s for s in self._manager.data.get("scenarios", []) if s["id"] == sid), None)
        if scenario is None:
            return {"ok": False, "note": "not_found"}

        note = ""
        if not force:
            if not day_allowed(scenario["days"], dt_util.now().weekday()):
                return await self._record(scenario, True, "skipped_day", executed=False)
            issur = self.jewish_entity(*ISSUR_KEY)
            state = self.hass.states.get(issur).state if issur and self.hass.states.get(issur) else None
            allowed, note = shabbat_allowed(scenario["shabbat"], state)
            if not allowed:
                return await self._record(scenario, note.startswith("not_") or note == "shabbat", note, executed=False)

        errors: list[str] = []
        for action in scenario["actions"]:
            entity_id = action["entity_id"]
            domain = entity_id.split(".", 1)[0]
            data: dict[str, Any] = {"entity_id": entity_id}
            if domain == "light" and action["state"] == "on" and action.get("brightness_pct"):
                data["brightness_pct"] = action["brightness_pct"]
            try:
                await self.hass.services.async_call(domain, action_service(domain, action["state"]), data, blocking=True)
            except Exception as err:  # noqa: BLE001
                errors.append(f"{entity_id}: {err}")
        _LOGGER.info("INFINITIX scenario %s ran (%s): %d action(s), %d error(s)", sid, reason, len(scenario["actions"]), len(errors))
        return await self._record(scenario, not errors, "; ".join(errors)[:300] or "ok", executed=True)

    async def _record(self, scenario: dict[str, Any], ok: bool, note: str, *, executed: bool) -> dict[str, Any]:
        entry = {"at": dt_util.utcnow().isoformat(), "ok": ok, "note": note, "ran": executed}
        scenario["last_run"] = entry
        await self._manager.async_save()
        return entry
