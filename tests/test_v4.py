"""0.4: schema v4 migration, server-side permissions, scheduling robustness, Free/Pro."""

from datetime import timedelta

import pytest
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.infinitix import features
from custom_components.infinitix.const import DOMAIN, STORAGE_KEY
from custom_components.infinitix.scenarios import occurrence_key, plan_restore
from custom_components.infinitix.storage import migrate_data
from custom_components.infinitix.validation import ConfigError, validate_config, validate_pages, validate_sources


def _sc(sid="s1", **over):
    base = {
        "id": sid, "name": sid, "enabled": True,
        "trigger": {"type": "time", "at": "18:30"}, "days": [], "shabbat": "any",
        "actions": [{"entity_id": "light.lamp", "state": "off"}],
    }
    base.update(over)
    return base


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN, data={}, title="INFINITIX Smart Home")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _ws(client, i, **payload):
    await client.send_json({"id": i, **payload})
    return await client.receive_json()


def _runner(hass):
    return hass.data[DOMAIN]["runner"]


def _manager(hass):
    return hass.data[DOMAIN]["manager"]


# ------------------------------------------------------------------ migration
V03 = {
    "home": {"name": "בית", "language": "he", "screen": "tablet"},
    "theme": {"mode": "dark", "accent": "#123456", "layout": "rail"},
    "wizard": {"completed": True, "step": 9, "draft": {}},
    "rooms": [{"id": "r1", "area_id": "living", "name": "סלון", "icon": None, "order": 0, "visible": True}],
    "entities": {"light.lamp": {"card": "light", "name": "מנורה", "room": "r1", "hidden": False,
                                "favorite": True, "size": "l", "order": 3}},
    "scenarios": [_sc(last_run={"at": "2026-11-01T10:00:00+00:00", "ok": True, "ran": True, "note": "ok"})],
}


def test_migration_v3_to_v4_keeps_everything_and_is_rerunnable():
    once = migrate_data(V03, 3)
    twice = migrate_data(once, 3)
    assert once == twice  # running the migration again changes nothing
    for key in ("home", "theme", "rooms", "entities"):
        assert once[key] == V03[key]
    sc = once["scenarios"][0]
    assert sc["last_run"]["note"] == "ok" and sc["catchup_min"] == 0 and sc["restore"] is False
    assert once["license"] == {"tier": "free", "legacy": True}
    assert once["scenario_sources"] == {} and once["pages"] == [] and once["display"]["saver"]["enabled"] is False
    assert V03["scenarios"][0].get("catchup_min") is None  # input not mutated
    # and the result passes validation unchanged in its user data
    clean = validate_config(once)
    assert clean["entities"]["light.lamp"] == {**V03["entities"]["light.lamp"], "icon": None}
    assert clean["license"]["legacy"] is True


async def test_store_migration_from_v1_file_keeps_backup(hass, hass_storage):
    hass_storage[STORAGE_KEY] = {"version": 1, "minor_version": 1, "key": STORAGE_KEY,
                                 "data": {**V03, "theme": {"mode": "auto", "accent": None, "layout": "grid"}}}
    await _setup(hass)
    data = _manager(hass).data
    assert data["theme"]["layout"] == "mosaic" and data["entities"]["light.lamp"]["name"] == "מנורה"
    assert data["license"]["legacy"] is True
    backup = hass_storage[f"{STORAGE_KEY}.backup.v1"]["data"]
    assert backup["theme"]["layout"] == "grid"  # untouched pre-migration copy


async def test_newer_schema_is_refused_not_overwritten(hass, hass_storage):
    hass_storage[STORAGE_KEY] = {"version": 99, "minor_version": 1, "key": STORAGE_KEY, "data": {"x": 1}}
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert DOMAIN not in hass.data or "manager" not in hass.data[DOMAIN]
    assert hass_storage[STORAGE_KEY]["data"] == {"x": 1}


def test_v4_validation():
    assert validate_sources({"havdalah": "sensor.motzei", "bogus": "x.y", "candle_lighting": None}) == {"havdalah": "sensor.motzei"}
    with pytest.raises(ConfigError):
        validate_sources({"issur_melacha": "sensor.not_binary"})
    pages = validate_pages([{"id": "p", "name": "בוקר", "entities": ["light.a", "light.a", "switch.b"]}])
    assert pages[0]["entities"] == ["light.a", "switch.b"]
    with pytest.raises(ConfigError):
        validate_config({"display": {"saver": {"calendars": ["light.x"]}}})
    # the client can never raise its own plan
    assert validate_config({"license": {"tier": "enterprise"}})["license"]["tier"] == "free"


# ------------------------------------------------------------------ permissions
async def test_admin_only_commands_and_member_status(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    admin = await hass_ws_client(hass)
    assert (await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[_sc()]))["success"]

    user = await hass_ws_client(hass, hass_read_only_access_token)
    blocked = (
        {"type": "infinitix/scenarios/preview", "scenarios": []},
        {"type": "infinitix/scenarios/sources", "sources": {}},
        {"type": "infinitix/scenarios/log"},
        {"type": "infinitix/license/set", "tier": "pro"},
        {"type": "infinitix/import_apply", "document": {}, "room_map": {}, "entity_map": {}},
        {"type": "infinitix/scenarios/run", "scenario_id": "s1"},
    )
    for i, payload in enumerate(blocked, start=1):
        r = await _ws(user, i, **payload)
        assert not r["success"] and r["error"]["code"] == "unauthorized", payload["type"]

    status = await _ws(user, 20, type="infinitix/scenarios/status")
    assert status["success"]
    item = status["result"]["scenarios"][0]
    assert item["name"] == "s1" and "actions" not in item and "light.lamp" not in str(status["result"])

    cfg = (await _ws(user, 21, type="infinitix/get_config"))["result"]
    assert "scenario_log" not in cfg["config"] and "scenarios" not in cfg["config"]
    assert cfg["features"]["layouts"]


async def test_save_config_cannot_touch_server_owned_keys(hass, hass_ws_client):
    await _setup(hass)
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[_sc()])
    await _runner(hass).async_run("s1", force=True)
    before_log = list(_manager(hass).data["scenario_log"])
    r = await _ws(admin, 2, type="infinitix/save_config",
                  config={"scenario_log": [], "license": {"tier": "pro"}, "scenarios": [],
                          "scenario_sources": {"havdalah": "sensor.x"}})
    assert r["success"]
    data = _manager(hass).data
    assert data["scenario_log"] == before_log and data["license"]["tier"] == "free" and len(data["scenarios"]) == 1
    assert data["scenario_sources"] == {}  # only infinitix/scenarios/sources changes the mapping


# ------------------------------------------------------------------ layout independence
async def test_layout_change_keeps_customizations_and_sends_no_commands(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    for svc in ("turn_on", "turn_off", "toggle"):
        hass.services.async_register("light", svc, lambda c: calls.append(c))
    admin = await hass_ws_client(hass)
    r = await _ws(admin, 1, type="infinitix/save_config", config=V03)
    base = r["result"]["config"]
    for i, layout in enumerate(("mosaic", "rows", "stage", "rail"), start=2):
        cfg = {**base, "theme": {**base["theme"], "layout": layout}}
        r = await _ws(admin, i, type="infinitix/save_config", config=cfg)
        assert r["success"]
        saved = r["result"]["config"]
        assert saved["rooms"] == base["rooms"] and saved["entities"] == base["entities"]
    await hass.async_block_till_done()
    assert calls == []


# ------------------------------------------------------------------ scheduling
async def test_same_occurrence_never_runs_twice(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_off", lambda c: calls.append(1))
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[_sc()])
    when = dt_util.utcnow().replace(second=0, microsecond=0)
    r1 = await _runner(hass).async_run("s1", reason="t", scheduled=when)
    r2 = await _runner(hass).async_run("s1", reason="t", scheduled=when + timedelta(seconds=20))
    assert r1["ran"] and r2["note"] == "duplicate" and calls == [1]
    assert _manager(hass).data["scenarios"][0]["last_fire"] == occurrence_key(when)
    # saving the scenario again must not reset the de-duplication key
    await _ws(admin, 2, type="infinitix/scenarios/save", scenarios=[_sc(name="renamed")])
    assert (await _runner(hass).async_run("s1", scheduled=when))["note"] == "duplicate"


async def test_time_trigger_fires_once_and_logs(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_off", lambda c: calls.append(1))
    now = dt_util.now()
    at = now + timedelta(minutes=3)
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[_sc(trigger={"type": "time", "at": at.strftime("%H:%M")})])
    fire = at.replace(second=0, microsecond=0)
    async_fire_time_changed(hass, fire + timedelta(seconds=1))
    await hass.async_block_till_done()
    async_fire_time_changed(hass, fire + timedelta(seconds=2))  # same minute again
    await hass.async_block_till_done()
    assert calls == [1]
    log = (await _ws(admin, 2, type="infinitix/scenarios/log"))["result"]["log"]
    assert log[0]["id"] == "s1" and log[0]["ran"] and log[0]["scheduled"]


async def test_missing_sensor_skips_and_warns(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_off", lambda c: calls.append(1))
    admin = await hass_ws_client(hass)
    r = await _ws(admin, 1, type="infinitix/scenarios/save",
                  scenarios=[_sc(trigger={"type": "jewish", "event": "candle_lighting", "offset_min": 0}, shabbat="only")])
    sc = r["result"]["scenarios"][0]
    assert sc["next_run"] is None
    assert "candle_lighting_missing" in sc["warnings"] and "issur_melacha_missing" in sc["warnings"]
    res = await _runner(hass).async_run("s1", scheduled=dt_util.utcnow())
    assert not res["ran"] and res["note"] == "shabbat_sensor_unavailable" and calls == []
    assert _manager(hass).data["scenario_log"][-1]["note"] == "shabbat_sensor_unavailable"


async def test_stale_sensor_is_not_used(hass, hass_ws_client):
    await _setup(hass)
    hass.states.async_set("sensor.my_candles", (dt_util.utcnow() - timedelta(days=3)).isoformat())
    admin = await hass_ws_client(hass)
    r = await _ws(admin, 1, type="infinitix/scenarios/sources", sources={"candle_lighting": "sensor.my_candles"})
    detail = r["result"]["sources"]["detail"]["candle_lighting"]
    assert detail["origin"] == "mapped" and detail["status"] == "stale"
    r = await _ws(admin, 2, type="infinitix/scenarios/save",
                  scenarios=[_sc(trigger={"type": "jewish", "event": "candle_lighting", "offset_min": 0})])
    assert r["result"]["scenarios"][0]["next_run"] is None
    assert r["result"]["scenarios"][0]["warnings"] == ["candle_lighting_stale"]


async def test_explicit_mapping_beats_auto_discovery(hass, hass_ws_client):
    await _setup(hass)
    reg = er.async_get(hass)
    auto = reg.async_get_or_create("sensor", "jewish_calendar", "abc-upcoming_havdalah", suggested_object_id="auto_h")
    hass.states.async_set(auto.entity_id, (dt_util.utcnow() + timedelta(hours=5)).isoformat())
    target = dt_util.utcnow() + timedelta(hours=1)
    hass.states.async_set("sensor.renamed_havdalah", target.isoformat())
    admin = await hass_ws_client(hass)
    assert _runner(hass).source_status("havdalah")["origin"] == "auto"
    await _ws(admin, 1, type="infinitix/scenarios/sources", sources={"havdalah": "sensor.renamed_havdalah"})
    r = await _ws(admin, 2, type="infinitix/scenarios/save",
                  scenarios=[_sc(trigger={"type": "jewish", "event": "havdalah", "offset_min": 0})])
    assert r["result"]["scenarios"][0]["next_run"] == target.isoformat()
    assert r["result"]["upcoming"][0]["actions"][0]["entity_id"] == "light.lamp"


async def test_preview_runs_nothing(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_off", lambda c: calls.append(1))
    admin = await hass_ws_client(hass)
    r = await _ws(admin, 1, type="infinitix/scenarios/preview", scenarios=[_sc()])
    assert r["success"] and r["result"]["scenarios"][0]["next_run"]
    assert _manager(hass).data["scenarios"] == [] and calls == []


def test_plan_restore_rules():
    t1 = dt_util.utcnow() - timedelta(hours=3)
    t2 = dt_util.utcnow() - timedelta(hours=1)
    on = [{"entity_id": "light.a", "state": "on"}]
    off = [{"entity_id": "light.a", "state": "off"}]
    assert plan_restore([{"when": t1, "actions": on}, {"when": t2, "actions": off}]) == ({"light.a": "off"}, set())
    assert plan_restore([{"when": None, "actions": on}, {"when": t2, "actions": off}]) == ({}, {"light.a"})
    assert plan_restore([{"when": t2, "actions": on}, {"when": t2, "actions": off}]) == ({}, {"light.a"})


async def test_recovery_after_restart_catchup_and_restore(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_on", lambda c: calls.append(("on", c.data["entity_id"])))
    hass.services.async_register("light", "turn_off", lambda c: calls.append(("off", c.data["entity_id"])))
    hass.services.async_register("switch", "turn_on", lambda c: calls.append(("on", c.data["entity_id"])))
    hass.states.async_set("light.porch", "off")
    hass.states.async_set("switch.boiler", "off")
    now = dt_util.utcnow()
    local = dt_util.as_local(now)
    ago = lambda m: (local - timedelta(minutes=m)).strftime("%H:%M")  # noqa: E731
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[
        # missed 10 minutes ago, 30 min window -> runs late
        _sc("late", trigger={"type": "time", "at": ago(10)}, catchup_min=30,
            actions=[{"entity_id": "switch.boiler", "state": "on"}]),
        # missed 90 minutes ago, 30 min window -> not run late
        _sc("too_late", trigger={"type": "time", "at": ago(90)}, catchup_min=30,
            actions=[{"entity_id": "light.never", "state": "on"}]),
        # restore: porch on 5h ago, off 2h ago -> desired off (already off, nothing sent);
        _sc("porch_on", trigger={"type": "time", "at": ago(300)}, restore=True,
            actions=[{"entity_id": "light.porch", "state": "on"}]),
        _sc("porch_off", trigger={"type": "time", "at": ago(120)}, restore=True,
            actions=[{"entity_id": "light.porch", "state": "off"}]),
        # restore: hall on 1h ago -> hall currently off -> turned on
        _sc("hall_on", trigger={"type": "time", "at": ago(60)}, restore=True,
            actions=[{"entity_id": "light.hall", "state": "on"}]),
    ])
    hass.states.async_set("light.hall", "off")
    result = await _runner(hass).async_recover(now)
    assert result["catchup"] == ["late"]
    assert result["restored"] == {"light.hall": "on"}
    assert ("on", "switch.boiler") in calls and ("on", "light.hall") in calls
    assert not any(e == "light.never" or e == "light.porch" for _, e in calls)
    # a second recovery (e.g. a reload) does nothing
    calls.clear()
    assert (await _runner(hass).async_recover(now))["catchup"] == [] and calls == []


async def test_catchup_does_not_repeat_an_occurrence_that_ran(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("switch", "turn_on", lambda c: calls.append(1))
    local = dt_util.now()
    at = (local - timedelta(minutes=5)).replace(second=0, microsecond=0)
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[
        _sc(trigger={"type": "time", "at": at.strftime("%H:%M")}, catchup_min=60,
            actions=[{"entity_id": "switch.x", "state": "on"}])])
    await _runner(hass).async_run("s1", scheduled=at)  # ran before the restart
    calls.clear()
    assert (await _runner(hass).async_recover())["catchup"] == [] and calls == []


async def test_reload_does_not_run_recovery(hass, hass_ws_client):
    entry = await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_on", lambda c: calls.append(1))
    hass.states.async_set("light.hall", "off")
    at = (dt_util.now() - timedelta(minutes=30)).strftime("%H:%M")
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[
        _sc(trigger={"type": "time", "at": at}, restore=True, catchup_min=60,
            actions=[{"entity_id": "light.hall", "state": "on"}])])
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert calls == []


async def test_brightness_dropped_when_light_cannot_dim(hass, hass_ws_client):
    await _setup(hass)
    seen = []
    hass.services.async_register("light", "turn_on", lambda c: seen.append(dict(c.data)))
    hass.states.async_set("light.relay", "off", {"supported_color_modes": ["onoff"]})
    hass.states.async_set("light.dim", "off", {"supported_color_modes": ["brightness"]})
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/scenarios/save", scenarios=[_sc(actions=[
        {"entity_id": "light.relay", "state": "on", "brightness_pct": 40},
        {"entity_id": "light.dim", "state": "on", "brightness_pct": 40}])])
    res = await _runner(hass).async_run("s1", force=True)
    assert res["ran"] and "no_brightness" in res["note"]
    assert {"entity_id": "light.relay"} in seen and {"entity_id": "light.dim", "brightness_pct": 40} in seen


# ------------------------------------------------------------------ Free / Pro
def test_entitlements_proposal_and_legacy():
    assert features.entitlements({"tier": "free"})["enforced"] is False  # off until the business decides
    free = features.entitlements({"tier": "free"}, enforce=True)
    assert free["layouts"] == ["mosaic", "rows"] and free["max_scenarios"] == 3
    legacy = features.entitlements({"tier": "free", "legacy": True}, enforce=True)
    assert "stage" in legacy["layouts"] and legacy["max_scenarios"] == 100
    assert features.allowed_layout("stage", free) == "mosaic"


async def test_downgrade_never_deletes_and_locks_extras(hass, hass_ws_client, monkeypatch):
    monkeypatch.setattr(features, "ENFORCEMENT_ENABLED", True)
    await _setup(hass)
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/license/set", tier="pro")
    five = [_sc(f"s{i}") for i in range(5)]
    assert (await _ws(admin, 2, type="infinitix/scenarios/save", scenarios=five))["success"]
    r = await _ws(admin, 3, type="infinitix/license/set", tier="free")
    assert r["result"]["features"]["max_scenarios"] == 3
    view = (await _ws(admin, 4, type="infinitix/scenarios/list"))["result"]
    assert len(view["scenarios"]) == 5  # nothing deleted
    assert [s["locked"] for s in view["scenarios"]] == [False, False, False, True, True]
    assert (await _runner(hass).async_run("s4", scheduled=dt_util.utcnow()))["note"] == "locked_by_plan"
    # existing five may still be edited; a sixth is refused
    assert (await _ws(admin, 5, type="infinitix/scenarios/save", scenarios=five))["success"]
    r = await _ws(admin, 6, type="infinitix/scenarios/save", scenarios=[*five, _sc("s9")])
    assert not r["success"] and r["error"]["code"] == "plan_limit"
    # upgrading again unlocks them unchanged
    await _ws(admin, 7, type="infinitix/license/set", tier="pro")
    view = (await _ws(admin, 8, type="infinitix/scenarios/list"))["result"]
    assert not any(s["locked"] for s in view["scenarios"])


async def test_recovery_runs_on_ha_start(hass, hass_storage):
    from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
    from homeassistant.core import CoreState

    at = (dt_util.now() - timedelta(minutes=10)).strftime("%H:%M")
    hass_storage[STORAGE_KEY] = {"version": 4, "minor_version": 1, "key": STORAGE_KEY, "data": {
        "wizard": {"completed": True, "step": 0, "draft": {}},
        "scenarios": [{**_sc(trigger={"type": "time", "at": at}, catchup_min=30,
                             actions=[{"entity_id": "switch.boiler", "state": "on"}]),
                       "restore": False, "last_fire": None, "last_run": None}],
    }}
    calls = []
    hass.services.async_register("switch", "turn_on", lambda c: calls.append(1))
    hass.set_state(CoreState.not_running)
    await _setup(hass)
    assert calls == []
    hass.bus.async_fire(EVENT_HOMEASSISTANT_STARTED)
    await hass.async_block_till_done()
    assert calls == [1]
    assert _manager(hass).data["scenario_log"][-1]["reason"] == "catch-up"


async def test_inventory_with_real_devices_and_device_area(hass, hass_ws_client):
    """Regression (found on live HA): devices must be read from the registry values.
    Also checks the room rule: an entity's own area wins over its device's area."""
    from homeassistant.helpers import area_registry as ar, device_registry as dr
    entry = await _setup(hass)
    kitchen = ar.async_get(hass).async_create("Kitchen")
    living = ar.async_get(hass).async_create("Living")
    dev = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", "d1")}, name="Relay")
    dr.async_get(hass).async_update_device(dev.id, area_id=kitchen.id)
    reg = er.async_get(hass)
    a = reg.async_get_or_create("light", "test", "a", device_id=dev.id, suggested_object_id="a")
    b = reg.async_get_or_create("light", "test", "b", device_id=dev.id, suggested_object_id="b")
    reg.async_update_entity(b.entity_id, area_id=living.id)
    for e in (a, b):
        hass.states.async_set(e.entity_id, "off", {"friendly_name": e.entity_id})
    admin = await hass_ws_client(hass)
    inv = (await _ws(admin, 1, type="infinitix/get_inventory"))["result"]
    by = {e["entity_id"]: e for e in inv["entities"]}
    assert inv["summary"]["devices"] >= 1 and by[a.entity_id]["device_id"] == dev.id
    assert by[a.entity_id]["area_id"] == kitchen.id   # inherits device area
    assert by[b.entity_id]["area_id"] == living.id    # explicit entity area wins
