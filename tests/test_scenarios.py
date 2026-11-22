"""Scenarios, v2/v3 storage migration, ru language and camera input checks."""

from datetime import timedelta

import pytest
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.infinitix.cameras import CameraError, _clean
from custom_components.infinitix.const import DOMAIN
from custom_components.infinitix.scenarios import day_allowed, shabbat_allowed
from custom_components.infinitix.storage import migrate_data
from custom_components.infinitix.validation import ConfigError, validate_config, validate_scenarios


def _sc(**over):
    base = {
        "id": "s1", "name": "x", "enabled": True,
        "trigger": {"type": "time", "at": "18:30"}, "days": [], "shabbat": "any",
        "actions": [{"entity_id": "light.lamp", "state": "off"}],
    }
    base.update(over)
    return base


# ---- pure logic
def test_shabbat_condition_never_guesses():
    assert shabbat_allowed("any", None) == (True, "")
    assert shabbat_allowed("only", "on")[0] is True
    assert shabbat_allowed("only", "off")[0] is False
    assert shabbat_allowed("not", "on")[0] is False
    assert shabbat_allowed("not", "off")[0] is True
    for mode in ("only", "not"):
        assert shabbat_allowed(mode, "unavailable") == (False, "shabbat_sensor_unavailable")
        assert shabbat_allowed(mode, None)[0] is False


def test_days():
    assert day_allowed([], 3) and day_allowed([3], 3) and not day_allowed([0, 1], 3)


# ---- validation
def test_scenario_validation_accepts_good_and_rejects_bad():
    out = validate_scenarios([_sc(trigger={"type": "sun", "event": "sunset", "offset_min": -20}, days=[4, 4, 1])])
    assert out[0]["days"] == [1, 4] and out[0]["trigger"]["offset_min"] == -20
    bad = [
        _sc(trigger={"type": "time", "at": "25:00"}),
        _sc(trigger={"type": "time", "at": "9:5"}),
        _sc(trigger={"type": "sun", "event": "noon"}),
        _sc(trigger={"type": "jewish", "event": "havdalah", "offset_min": 9999}),
        _sc(actions=[]),
        _sc(actions=[{"entity_id": "lock.door", "state": "on"}]),   # only safe domains
        _sc(actions=[{"entity_id": "light.a", "state": "toggle"}]),
        _sc(days=[7]),
        [_sc(), _sc()],  # duplicate ids (handled below)
    ]
    for item in bad[:-1]:
        with pytest.raises(ConfigError):
            validate_scenarios([item])
    with pytest.raises(ConfigError):
        validate_scenarios(bad[-1])


def test_config_without_scenarios_gets_empty_list():
    assert validate_config({})["scenarios"] == []


# ---- storage
def test_migration_v1_renames_layout_and_adds_scenarios():
    old = {"theme": {"mode": "auto", "accent": None, "layout": "grid"}}
    new = migrate_data(old, 1)
    assert new["theme"]["layout"] == "mosaic" and new["scenarios"] == []
    assert migrate_data({"theme": {"layout": "list"}}, 1)["theme"]["layout"] == "rows"
    assert migrate_data({"theme": {"layout": "rail"}}, 2)["theme"]["layout"] == "rail"


def test_russian_and_legacy_layout_validation():
    cfg = validate_config({"home": {"language": "ru"}, "theme": {"layout": "grid"}})
    assert cfg["home"]["language"] == "ru" and cfg["theme"]["layout"] == "mosaic"
    assert validate_config({"home": {"language": "fr"}})["home"]["language"] == "he"


# ---- cameras input checks (no network)
def test_camera_input_cleaning():
    ok = _clean({"host": " 192.168.1.20 ", "port": 8000, "name": "", "username": "u", "password": "p"})
    assert ok["host"] == "192.168.1.20" and ok["name"] == "192.168.1.20" and ok["port"] == 8000
    for bad in ({"host": ""}, {"host": "a b"}, {"host": "http://x/"}, {"host": "u@h"}):
        with pytest.raises(CameraError) as e:
            _clean(bad)
        assert e.value.code == "invalid_host"
    for port in (0, 70000, "80", True):
        with pytest.raises(CameraError) as e:
            _clean({"host": "h", "port": port})
        assert e.value.code == "invalid_port"


# ---- runner against real HA
async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN, data={}, title="INFINITIX Smart Home")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def _save(client, scenarios, i=1):
    await client.send_json({"id": i, "type": "infinitix/scenarios/save", "scenarios": scenarios})
    return await client.receive_json()


async def test_time_scenario_fires_and_records(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_off", lambda c: calls.append(c.data["entity_id"]))
    hass.states.async_set("light.lamp", "on")
    now = dt_util.now()
    at = (now + timedelta(minutes=5)).strftime("%H:%M")
    client = await hass_ws_client(hass)
    msg = await _save(client, [_sc(trigger={"type": "time", "at": at})])
    assert msg["success"], msg
    assert msg["result"]["scenarios"][0]["next_run"]
    fire_at = (now + timedelta(minutes=5)).replace(second=0, microsecond=0) + timedelta(seconds=1)
    async_fire_time_changed(hass, fire_at)
    await hass.async_block_till_done()
    assert calls == ["light.lamp"]
    saved = hass.data[DOMAIN]["manager"].data["scenarios"][0]["last_run"]
    assert saved["ran"] and saved["ok"]


async def test_shabbat_condition_blocks_when_sensor_missing_or_wrong(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_off", lambda c: calls.append(1))
    client = await hass_ws_client(hass)
    await _save(client, [_sc(shabbat="not")])
    runner = hass.data[DOMAIN]["runner"]
    # No jewish_calendar entities at all -> must not act.
    res = await runner.async_run("s1")
    assert not res["ran"] and res["note"] == "shabbat_sensor_unavailable" and not calls

    reg = er.async_get(hass)
    ent = reg.async_get_or_create("binary_sensor", "jewish_calendar", "abc-issur_melacha_in_effect", suggested_object_id="issur")
    hass.states.async_set(ent.entity_id, "on")
    assert not (await runner.async_run("s1"))["ran"] and not calls
    hass.states.async_set(ent.entity_id, "off")
    assert (await runner.async_run("s1"))["ran"] and calls == [1]


async def test_jewish_trigger_follows_sensor_and_offset(hass, hass_ws_client):
    await _setup(hass)
    calls = []
    hass.services.async_register("light", "turn_off", lambda c: calls.append(1))
    reg = er.async_get(hass)
    ent = reg.async_get_or_create("sensor", "jewish_calendar", "abc-upcoming_havdalah", suggested_object_id="havdalah")
    target = dt_util.utcnow() + timedelta(hours=2)
    hass.states.async_set(ent.entity_id, target.isoformat())
    client = await hass_ws_client(hass)
    msg = await _save(client, [_sc(trigger={"type": "jewish", "event": "havdalah", "offset_min": 10})])
    expect = (target + timedelta(minutes=10)).isoformat()
    assert msg["result"]["scenarios"][0]["next_run"] == expect
    async_fire_time_changed(hass, target + timedelta(minutes=10, seconds=1))
    await hass.async_block_till_done()
    assert calls == [1]
    # sensor unavailable -> no next run, nothing armed
    hass.states.async_set(ent.entity_id, "unavailable")
    await hass.async_block_till_done()
    msg2 = await _save(client, [_sc(trigger={"type": "jewish", "event": "havdalah"})], i=2)
    assert msg2["result"]["scenarios"][0]["next_run"] is None


async def test_scenario_commands_admin_only_and_general_save_keeps_them(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    admin = await hass_ws_client(hass)
    assert (await _save(admin, [_sc()]))["success"]
    # a general save from the panel must not wipe scenarios
    await admin.send_json({"id": 2, "type": "infinitix/save_config", "config": {"scenarios": []}})
    assert (await admin.receive_json())["success"]
    assert len(hass.data[DOMAIN]["manager"].data["scenarios"]) == 1

    user = await hass_ws_client(hass, hass_read_only_access_token)
    for i, m in enumerate(({"type": "infinitix/scenarios/list"}, {"type": "infinitix/scenarios/save", "scenarios": []},
                           {"type": "infinitix/scenarios/run", "scenario_id": "s1"}), start=1):
        await user.send_json({"id": i, **m})
        r = await user.receive_json()
        assert not r["success"] and r["error"]["code"] == "unauthorized"


# ---- 0.4.0: richer actions, state triggers, dashboard buttons
from custom_components.infinitix.scenarios import state_crossed  # noqa: E402
from custom_components.infinitix.scenario_ops import service_call  # noqa: E402


def test_ops_allow_list():
    ok = validate_scenarios([_sc(actions=[
        {"entity_id": "cover.a", "op": "close"}, {"entity_id": "climate.b", "op": "temperature", "value": 24},
        {"entity_id": "lock.c", "op": "lock"}, {"entity_id": "scene.d", "op": "activate"},
        {"entity_id": "light.e", "op": "on", "value": 40}, {"entity_id": "media_player.f", "op": "off"}])])
    assert [a["op"] for a in ok[0]["actions"]][:2] == ["close", "temperature"]
    for bad in ({"entity_id": "lock.c", "op": "unlock"}, {"entity_id": "alarm_control_panel.x", "op": "disarm"},
                {"entity_id": "cover.a", "op": "on"}, {"entity_id": "climate.b", "op": "temperature"},
                {"entity_id": "climate.b", "op": "temperature", "value": 99}, {"entity_id": "light.e", "op": "on", "value": 0}):
        with pytest.raises(ConfigError):
            validate_scenarios([_sc(actions=[bad])])


def test_service_mapping():
    assert service_call("cover.a", "close") == ("cover", "close_cover", {"entity_id": "cover.a"})
    assert service_call("climate.b", "cool")[2]["hvac_mode"] == "cool"
    assert service_call("climate.b", "temperature", 23)[2]["temperature"] == 23
    assert service_call("light.e", "on", 30)[2]["brightness_pct"] == 30
    assert service_call("scene.d", "activate")[:2] == ("scene", "turn_on")


def test_state_trigger_validation_and_edge():
    t = validate_scenarios([_sc(trigger={"type": "state", "entity_id": "sensor.t", "mode": "above", "value": "28"})])[0]["trigger"]
    assert t["mode"] == "above"
    for bad in ({"type": "state", "entity_id": "sensor.t", "mode": "above", "value": "hot"},
                {"type": "state", "entity_id": "sensor.t", "mode": "near", "value": "1"},
                {"type": "state", "entity_id": "sensor.t", "mode": "equals", "value": ""}):
        with pytest.raises(ConfigError):
            validate_scenarios([_sc(trigger=bad)])
    assert validate_scenarios([_sc(trigger={"type": "manual"})])[0]["trigger"] == {"type": "manual"}
    above = {"mode": "above", "value": "28"}
    assert state_crossed(above, "27", "29") and not state_crossed(above, "29", "30")
    assert not state_crossed(above, "unavailable", "unknown") and state_crossed(above, "unavailable", "30")
    eq = {"mode": "equals", "value": "on"}
    assert state_crossed(eq, "off", "on") and not state_crossed(eq, "on", "on") and not state_crossed(eq, "off", "unavailable")


def test_migration_v3_to_v4_converts_actions():
    old = {"scenarios": [{"id": "a", "actions": [{"entity_id": "light.x", "state": "on", "brightness_pct": 50}]}]}
    sc = migrate_data(old, 3)["scenarios"][0]
    assert sc["actions"] == [{"entity_id": "light.x", "op": "on", "value": 50}] and sc["dashboard"] is False


async def test_dashboard_button_any_user_only_for_flagged(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    calls = []
    hass.services.async_register("cover", "close_cover", lambda c: calls.append(c.data["entity_id"]))
    admin = await hass_ws_client(hass)
    shown = _sc(id="shown", dashboard=True, trigger={"type": "manual"}, actions=[{"entity_id": "cover.a", "op": "close"}])
    hidden = _sc(id="hidden", trigger={"type": "manual"}, actions=[{"entity_id": "cover.b", "op": "close"}])
    assert (await _save(admin, [shown, hidden]))["success"]
    user = await hass_ws_client(hass, hass_read_only_access_token)
    await user.send_json({"id": 1, "type": "infinitix/scenarios/quick_list"})
    r = await user.receive_json()
    assert [s["id"] for s in r["result"]["scenarios"]] == ["shown"]
    await user.send_json({"id": 2, "type": "infinitix/scenarios/quick_run", "scenario_id": "hidden"})
    assert (await user.receive_json())["error"]["code"] == "not_found" and not calls
    await user.send_json({"id": 3, "type": "infinitix/scenarios/quick_run", "scenario_id": "shown"})
    assert (await user.receive_json())["success"] and calls == ["cover.a"]
    # the full list stays admin-only
    await user.send_json({"id": 4, "type": "infinitix/scenarios/list"})
    assert (await user.receive_json())["error"]["code"] == "unauthorized"
