"""Time-based scenarios: Shabbat timer, lights/switches by sunset/sunrise, Jewish calendar.

Scenarios run inside Home Assistant (not in the browser), so they work while the
dashboard is closed.  They are stored in INFINITIX's managed storage and do not
touch the user's own automations.

Time sources are Home Assistant's built-in integrations only; this module computes
no halachic times itself (Israel/diaspora, offsets and holidays come from the
Jewish Calendar integration's own options):

* fixed time               -> ``async_track_time_change``
* sunrise / sunset +- N min -> ``async_track_sunrise`` / ``async_track_sunset``
* candle lighting / havdalah -> the ``upcoming_candle_lighting`` / ``upcoming_havdalah``
                              timestamp sensors of HA's ``jewish_calendar`` integration
* Shabbat/Yom Tov condition -> its ``issur_melacha_in_effect`` binary sensor

The sensors are found through an explicit mapping chosen in the wizard
(``scenario_sources``), falling back to the integration's unique-id keys, because
entity ids differ between installations.

Safety rules
* a missing, unavailable or stale time source / condition sensor -> the action is
  skipped and a warning is recorded; nothing runs on a guessed time;
* every trigger occurrence has a key (its scheduled minute); an occurrence that
  already ran is never run again (no double execution);
* a missed point in time runs late only inside the scenario's catch-up window;
* after an HA restart, scenarios marked ``restore`` re-apply their state when the
  latest due scenario for that device can be determined unambiguously;
* every decision is appended to a capped run log.
Whether a given device or action is appropriate on Shabbat is the user's decision.
"""

from __future__ import annotations

import asyncio
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
from homeassistant.helpers.sun import get_astral_event_date, get_astral_event_next
from homeassistant.util import dt as dt_util

from .features import entitlements, locked_scenarios
from .validation import SCENARIO_LOG_MAX

_LOGGER = logging.getLogger(__name__)

JEWISH_DOMAIN = "jewish_calendar"
# key -> (entity domain, unique-id suffix used by HA's jewish_calendar)
SOURCE_DEFS = {
    "candle_lighting": ("sensor", "upcoming_candle_lighting"),
    "havdalah": ("sensor", "upcoming_havdalah"),
    "issur_melacha": ("binary_sensor", "issur_melacha_in_effect"),
}
# Kept for callers of 0.3.
JEWISH_SENSOR_KEY = {k: SOURCE_DEFS[k] for k in ("candle_lighting", "havdalah")}
ISSUR_KEY = SOURCE_DEFS["issur_melacha"]
ACTION_DOMAINS = ("light", "switch", "fan", "input_boolean")
UNKNOWN_STATES = ("unavailable", "unknown", None, "")
# An "upcoming" time this far in the past means the sensor stopped rolling forward.
STALE_PAST = timedelta(hours=26)
# The Shabbat sensor is re-evaluated at least daily by HA; a week without a report is stale.
STALE_REPORT = timedelta(days=8)
RESTORE_WINDOW = timedelta(hours=24)


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
    t = trigger["type"]
    if t == "time":
        return f"time {trigger['at']}"
    return f"{trigger['event']} {trigger.get('offset_min', 0):+d}min"


def occurrence_key(when: datetime) -> str:
    """Minute-precision UTC key of one trigger occurrence (used to prevent double runs)."""
    return dt_util.as_utc(when).replace(second=0, microsecond=0).isoformat()


def plan_restore(candidates: list[dict[str, Any]]) -> tuple[dict[str, str], set[str]]:
    """Pick the desired state per entity from restore-enabled scenarios.

    ``candidates``: [{"when": datetime|None, "actions": [...]}] for every enabled
    restore scenario touching the entity.  An entity is restored only when every
    scenario touching it has a known previous occurrence; the latest one wins.
    Two scenarios due in the same minute with different states are ambiguous.
    Returns (entity -> state, ambiguous entities).
    """
    per_entity: dict[str, list[tuple[datetime | None, str]]] = {}
    for c in candidates:
        for a in c["actions"]:
            per_entity.setdefault(a["entity_id"], []).append((c["when"], a["state"]))
    desired, ambiguous = {}, set()
    for eid, items in per_entity.items():
        if any(w is None for w, _ in items):
            ambiguous.add(eid)
            continue
        latest = max(w for w, _ in items)
        states = {s for w, s in items if w == latest}
        if len(states) != 1:
            ambiguous.add(eid)
            continue
        desired[eid] = states.pop()
    return desired, ambiguous


# ---------------------------------------------------------------- runner
class ScenarioRunner:
    """Arms every enabled scenario and executes it when its trigger fires."""

    def __init__(self, hass: HomeAssistant, manager) -> None:
        self.hass = hass
        self._manager = manager
        self._unsubs: dict[str, list[Callable[[], None]]] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._recovered = False

    # -- lifecycle
    @property
    def data(self) -> dict[str, Any]:
        return self._manager.data

    def locked(self) -> set[str]:
        return locked_scenarios(self.data.get("scenarios", []), entitlements(self.data.get("license")))

    @callback
    def async_reload(self) -> None:
        self.async_stop()
        locked = self.locked()
        for scenario in self.data.get("scenarios", []):
            if scenario.get("enabled") and scenario["id"] not in locked:
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

    # -- sources (mapping first, then the integration's unique-id keys; never guessed)
    def _auto_source(self, key: str) -> str | None:
        domain, suffix = SOURCE_DEFS[key]
        registry = er.async_get(self.hass)
        for entry in registry.entities.values():
            if (
                entry.platform == JEWISH_DOMAIN
                and entry.domain == domain
                and (entry.unique_id or "").endswith(f"-{suffix}")
                and not entry.disabled
            ):
                return entry.entity_id
        return None

    def source_entity(self, key: str) -> str | None:
        mapped = (self.data.get("scenario_sources") or {}).get(key)
        if mapped:
            return mapped
        return self._auto_source(key)

    def jewish_entity(self, domain: str, key: str) -> str | None:
        """0.3 compatible lookup by (domain, suffix)."""
        for k, (d, suffix) in SOURCE_DEFS.items():
            if d == domain and suffix == key:
                return self.source_entity(k)
        return None

    def source_status(self, key: str) -> dict[str, Any]:
        """{"entity_id", "origin", "status", "value"}; status ok|missing|unavailable|stale."""
        mapped = (self.data.get("scenario_sources") or {}).get(key)
        eid = self.source_entity(key)
        out: dict[str, Any] = {"entity_id": eid, "origin": "mapped" if mapped else ("auto" if eid else None), "value": None}
        state = self.hass.states.get(eid) if eid else None
        if eid is None or state is None:
            out["status"] = "missing"
            return out
        if state.state in UNKNOWN_STATES:
            out["status"] = "unavailable"
            return out
        now = dt_util.utcnow()
        if key == "issur_melacha":
            if state.state not in ("on", "off"):
                out["status"] = "unavailable"
                return out
            out["value"] = state.state
            reported = getattr(state, "last_reported", None) or state.last_updated
            out["status"] = "stale" if now - reported > STALE_REPORT else "ok"
            return out
        when = dt_util.parse_datetime(state.state)
        if when is None:
            out["status"] = "unavailable"
            return out
        when = dt_util.as_utc(when)
        out["value"] = when.isoformat()
        out["status"] = "stale" if when < now - STALE_PAST else "ok"
        return out

    def _source_time(self, key: str) -> datetime | None:
        st = self.source_status(key)
        return dt_util.parse_datetime(st["value"]) if st["status"] == "ok" and st["value"] else None

    def sources(self) -> dict[str, Any]:
        detail = {k: self.source_status(k) for k in SOURCE_DEFS}
        return {
            "sun": bool(self.hass.config.latitude or self.hass.config.longitude),
            # booleans kept for the 0.3 panel
            **{k: v["status"] != "missing" for k, v in detail.items()},
            "detail": detail,
        }

    # -- arming
    def _arm(self, scenario: dict[str, Any]) -> None:
        sid, trigger = scenario["id"], scenario["trigger"]
        kind = trigger["type"]

        def fire_at(scheduled: datetime) -> None:
            self.hass.async_create_task(
                self.async_run(sid, reason=describe_trigger(trigger), scheduled=scheduled)
            )

        if kind == "time":
            hour, minute = (int(x) for x in trigger["at"].split(":"))

            @callback
            def _time(now: datetime) -> None:
                fire_at(now)

            self._add(sid, async_track_time_change(self.hass, _time, hour=hour, minute=minute, second=0))
        elif kind == "sun":
            offset = timedelta(minutes=trigger.get("offset_min", 0))
            track = async_track_sunrise if trigger["event"] == "sunrise" else async_track_sunset

            @callback
            def _sun() -> None:
                fire_at(dt_util.utcnow())

            self._add(sid, track(self.hass, _sun, offset))
        elif kind == "jewish":
            self._arm_jewish(scenario, fire_at)

    def _arm_jewish(self, scenario: dict[str, Any], fire_at: Callable[[datetime], None]) -> None:
        sid, trigger = scenario["id"], scenario["trigger"]
        entity_id = self.source_entity(trigger["event"])
        if entity_id is None:
            _LOGGER.warning("Scenario %s needs HA's Jewish Calendar integration (not found); not armed", sid)
            return
        offset = timedelta(minutes=trigger.get("offset_min", 0))
        timer: dict[str, Callable[[], None] | None] = {"cancel": None}

        def schedule() -> None:
            if timer["cancel"]:
                timer["cancel"]()
                timer["cancel"] = None
            base = self._source_time(trigger["event"])
            if base is None:
                return  # missing / unavailable / stale: wait for a fresh value
            target = base + offset
            if target <= dt_util.utcnow():
                return  # past: the sensor will move to the next event (catch-up handles restarts)

            @callback
            def _fire(_now: datetime) -> None:
                timer["cancel"] = None
                fire_at(target)

            timer["cancel"] = async_track_point_in_utc_time(self.hass, _fire, target)

        @callback
        def _changed(_event: Event) -> None:
            schedule()

        schedule()
        self._add(sid, async_track_state_change_event(self.hass, [entity_id], _changed))
        self._add(sid, lambda: timer["cancel"] and timer["cancel"]())

    # -- time maths
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
        base = self._source_time(trigger["event"])
        if not base:
            return None
        target = base + offset
        return target.isoformat() if target > now else None

    def previous_occurrence(self, scenario: dict[str, Any], now: datetime | None = None) -> datetime | None:
        """Latest past occurrence of the trigger, or None when it cannot be known."""
        now = now or dt_util.utcnow()
        trigger = scenario["trigger"]
        if trigger["type"] == "time":
            hour, minute = (int(x) for x in trigger["at"].split(":"))
            local = dt_util.as_local(now)
            prev = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if prev > local:
                prev -= timedelta(days=1)
            return dt_util.as_utc(prev)
        offset = timedelta(minutes=trigger.get("offset_min", 0))
        if trigger["type"] == "sun":
            if not (self.hass.config.latitude or self.hass.config.longitude):
                return None
            today = dt_util.as_local(now).date()
            for day in (today, today - timedelta(days=1)):
                event = get_astral_event_date(self.hass, trigger["event"], day)
                if event is not None and event + offset <= now:
                    return dt_util.as_utc(event + offset)
            return None
        base = self._source_time(trigger["event"])
        if base is None:
            return None
        target = base + offset
        # The "upcoming" sensor only shows the previous event until it rolls over.
        return target if target <= now and now - target <= RESTORE_WINDOW else None

    # -- execution
    def _scenario(self, sid: str) -> dict[str, Any] | None:
        return next((s for s in self.data.get("scenarios", []) if s["id"] == sid), None)

    async def async_run(
        self,
        sid: str,
        reason: str = "manual",
        force: bool = False,
        scheduled: datetime | None = None,
    ) -> dict[str, Any]:
        scenario = self._scenario(sid)
        if scenario is None:
            return {"ok": False, "note": "not_found", "ran": False}
        lock = self._locks.setdefault(sid, asyncio.Lock())
        async with lock:
            key = occurrence_key(scheduled) if scheduled else None
            if key and scenario.get("last_fire") == key:
                return {"ok": True, "note": "duplicate", "ran": False}  # already handled; not logged twice
            if key:
                scenario["last_fire"] = key

            if not force:
                if sid in self.locked():
                    return await self._record(scenario, False, "locked_by_plan", executed=False, reason=reason, scheduled=key)
                when_local = dt_util.as_local(scheduled) if scheduled else dt_util.now()
                if not day_allowed(scenario["days"], when_local.weekday()):
                    return await self._record(scenario, True, "skipped_day", executed=False, reason=reason, scheduled=key)
                if scenario["shabbat"] != "any":
                    st = self.source_status("issur_melacha")
                    state = st["value"] if st["status"] == "ok" else None
                    allowed, note = shabbat_allowed(scenario["shabbat"], state)
                    if not allowed:
                        if st["status"] in ("stale",):
                            note = "shabbat_sensor_stale"
                        return await self._record(
                            scenario, note in ("not_shabbat", "shabbat"), note, executed=False, reason=reason, scheduled=key
                        )
            errors, notes = await self._execute(scenario["actions"])
            _LOGGER.info(
                "INFINITIX scenario %s ran (%s): %d action(s), %d error(s)", sid, reason, len(scenario["actions"]), len(errors)
            )
            note = "; ".join(errors + notes)[:300] or "ok"
            return await self._record(scenario, not errors, note, executed=True, reason=reason, scheduled=key)

    async def _execute(self, actions: list[dict[str, Any]], only: set[str] | None = None) -> tuple[list[str], list[str]]:
        errors: list[str] = []
        notes: list[str] = []
        for action in actions:
            entity_id = action["entity_id"]
            if only is not None and entity_id not in only:
                continue
            domain = entity_id.split(".", 1)[0]
            data: dict[str, Any] = {"entity_id": entity_id}
            if domain == "light" and action["state"] == "on" and action.get("brightness_pct"):
                st = self.hass.states.get(entity_id)
                modes = set((st.attributes.get("supported_color_modes") or []) if st else [])
                if modes and modes <= {"onoff"}:
                    notes.append(f"{entity_id}: no_brightness")  # capability missing: plain on
                else:
                    data["brightness_pct"] = action["brightness_pct"]
            try:
                await self.hass.services.async_call(domain, action_service(domain, action["state"]), data, blocking=True)
            except Exception as err:  # noqa: BLE001
                errors.append(f"{entity_id}: {err}")
        return errors, notes

    async def _record(
        self,
        scenario: dict[str, Any],
        ok: bool,
        note: str,
        *,
        executed: bool,
        reason: str = "manual",
        scheduled: str | None = None,
    ) -> dict[str, Any]:
        entry = {"at": dt_util.utcnow().isoformat(), "ok": ok, "note": note, "ran": executed}
        scenario["last_run"] = entry
        self._log({"id": scenario["id"], "name": scenario.get("name"), "reason": reason, "scheduled": scheduled, **entry})
        await self._manager.async_save()
        return entry

    def _log(self, entry: dict[str, Any]) -> None:
        log = self.data.setdefault("scenario_log", [])
        log.append(entry)
        del log[:-SCENARIO_LOG_MAX]

    # -- recovery after an HA restart
    async def async_recover(self, now: datetime | None = None) -> dict[str, Any]:
        """Run once after HA starts: late runs inside catch-up windows, then restore."""
        if self._recovered:
            return {"catchup": [], "restored": {}, "ambiguous": []}
        self._recovered = True
        now = now or dt_util.utcnow()
        locked = self.locked()
        active = [s for s in self.data.get("scenarios", []) if s.get("enabled") and s["id"] not in locked]

        caught: list[str] = []
        for sc in active:
            window = sc.get("catchup_min") or 0
            prev = self.previous_occurrence(sc, now)
            if not window or prev is None or now - prev > timedelta(minutes=window):
                continue
            last = sc.get("last_fire")
            if last and dt_util.parse_datetime(last) >= prev.replace(second=0, microsecond=0):
                continue  # it ran before the restart
            await self.async_run(sc["id"], reason="catch-up", scheduled=prev)
            caught.append(sc["id"])

        candidates = []
        for sc in active:
            if not sc.get("restore"):
                continue
            prev = self.previous_occurrence(sc, now)
            if prev is not None and now - prev > RESTORE_WINDOW:
                prev = None  # too old to be sure it is still the wanted state
            if prev is not None and not self._conditions_hold(sc, prev):
                continue  # it would have been skipped then: it does not decide the state
            candidates.append({"when": prev, "actions": sc["actions"]})
        desired, ambiguous = plan_restore(candidates)
        changed: dict[str, str] = {}
        for eid, state in desired.items():
            cur = self.hass.states.get(eid)
            if cur is None or cur.state in UNKNOWN_STATES or cur.state == state:
                continue
            errors, _ = await self._execute([{"entity_id": eid, "state": state}])
            if not errors:
                changed[eid] = state
        if changed or ambiguous:
            self._log({
                "id": "*", "name": "restore", "reason": "restart", "scheduled": None,
                "at": now.isoformat(), "ok": True, "ran": bool(changed),
                "note": (f"restored {len(changed)}" + (f"; ambiguous {len(ambiguous)}" if ambiguous else ""))[:300],
            })
            await self._manager.async_save()
        return {"catchup": caught, "restored": changed, "ambiguous": sorted(ambiguous)}

    def _conditions_hold(self, scenario: dict[str, Any], when: datetime) -> bool:
        if not day_allowed(scenario["days"], dt_util.as_local(when).weekday()):
            return False
        if scenario["shabbat"] == "any":
            return True
        st = self.source_status("issur_melacha")
        return shabbat_allowed(scenario["shabbat"], st["value"] if st["status"] == "ok" else None)[0]

    # -- views
    def warnings(self, scenario: dict[str, Any]) -> list[str]:
        out = []
        trig = scenario["trigger"]
        if trig["type"] == "jewish":
            st = self.source_status(trig["event"])["status"]
            if st != "ok":
                out.append(f"{trig['event']}_{st}")
        if trig["type"] == "sun" and not (self.hass.config.latitude or self.hass.config.longitude):
            out.append("sun_no_location")
        if scenario["shabbat"] != "any":
            st = self.source_status("issur_melacha")["status"]
            if st != "ok":
                out.append(f"issur_melacha_{st}")
        return out

    def upcoming(self, limit: int = 10) -> list[dict[str, Any]]:
        """Next trigger per enabled scenario with its planned actions, soonest first."""
        locked = self.locked()
        items = []
        for sc in self.data.get("scenarios", []):
            if not sc.get("enabled") or sc["id"] in locked:
                continue
            nxt = self.next_run(sc)
            if nxt:
                items.append({"id": sc["id"], "name": sc["name"], "at": nxt, "actions": sc["actions"],
                              "shabbat": sc["shabbat"], "days": sc["days"]})
        items.sort(key=lambda i: dt_util.parse_datetime(i["at"]))
        return items[:limit]
