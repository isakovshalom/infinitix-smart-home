"""Camera brand presets (Hikvision / Uniview / Provision-ISR) and alarm systems (Risco / PIMA / Paradox)."""

import pytest
from homeassistant.helpers import device_registry as dr, entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.infinitix.camera_brands import BRANDS, build_stream_url
from custom_components.infinitix.cameras import CameraError
from custom_components.infinitix.const import DOMAIN


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN, data={}, title="INFINITIX Smart Home")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _ws(client, i, **payload):
    await client.send_json({"id": i, **payload})
    return await client.receive_json()


# ------------------------------------------------------------------ camera brands
def test_stream_urls_per_brand_and_no_credentials():
    assert build_stream_url("hikvision", "nvr", 3, "main", "10.0.0.5", 554) == "rtsp://10.0.0.5:554/Streaming/Channels/301"
    assert build_stream_url("hikvision", "ipc", 1, "sub", "10.0.0.5", 554) == "rtsp://10.0.0.5:554/Streaming/Channels/102"
    assert build_stream_url("uniview", "ipc", 1, "main", "cam.local", 554) == "rtsp://cam.local:554/media/video1"
    assert build_stream_url("uniview", "nvr", 10, "sub", "10.0.0.9", 554) == "rtsp://10.0.0.9:554/unicast/c10/s1/live"
    assert build_stream_url("provision", "nvr", 2, "main", "10.0.0.7", 554) == "rtsp://10.0.0.7:554?chID=2&streamType=main"
    assert build_stream_url("other", "ipc", 1, "main", "10.0.0.8", 8554, "stream1") == "rtsp://10.0.0.8:8554/stream1"
    assert BRANDS["provision"]["verified_paths"] is False  # shown as "verify on site" in the panel


def test_stream_url_rejects_bad_input():
    bad = [
        dict(brand="nope"), dict(channel=0), dict(channel=999), dict(stream="hd"),
        dict(host="user:pw@10.0.0.1"), dict(host="10.0.0.1/x"), dict(port=70000),
        dict(path="rtsp://evil/x"), dict(path="/a b"), dict(path="/x@y"),
        dict(brand="other", path=""),  # other brands need an explicit path
    ]
    for over in bad:
        args = {"brand": "hikvision", "kind": "ipc", "channel": 1, "stream": "main", "host": "10.0.0.1", "port": 554, "path": "", **over}
        with pytest.raises(CameraError):
            build_stream_url(args["brand"], args["kind"], args["channel"], args["stream"], args["host"], args["port"], args["path"])


async def test_camera_brand_commands_admin_only(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    admin = await hass_ws_client(hass)
    r = await _ws(admin, 1, type="infinitix/camera/brands")
    assert {b["id"] for b in r["result"]["brands"]} == {"hikvision", "uniview", "provision", "other"}
    r = await _ws(admin, 2, type="infinitix/camera/add_rtsp", brand="hikvision", host="bad host")
    assert not r["success"] and r["error"]["code"] == "invalid_host"
    user = await hass_ws_client(hass, hass_read_only_access_token)
    for i, m in enumerate(({"type": "infinitix/camera/brands"},
                           {"type": "infinitix/camera/add_rtsp", "brand": "uniview", "host": "10.0.0.1"}), start=1):
        r = await _ws(user, i, **m)
        assert not r["success"] and r["error"]["code"] == "unauthorized"


# ------------------------------------------------------------------ alarms
async def test_alarm_status_and_detection(hass, hass_ws_client):
    entry = await _setup(hass)
    admin = await hass_ws_client(hass)
    reg, dreg = er.async_get(hass), dr.async_get(hass)
    reg.async_get_or_create("alarm_control_panel", "risco", "p1", suggested_object_id="risco_home")
    # a PAI (MQTT) panel is recognised by its device manufacturer
    dev = dreg.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("mqtt", "pai")}, manufacturer="Paradox", name="EVO192")
    reg.async_get_or_create("alarm_control_panel", "mqtt", "pai1", device_id=dev.id, suggested_object_id="paradox_area_1")
    r = (await _ws(admin, 1, type="infinitix/alarm/status"))["result"]
    by = {b["id"]: b for b in r["brands"]}
    assert by["risco"]["available"] is True and by["risco"]["entities"] == ["alarm_control_panel.risco_home"]
    assert by["pima"]["available"] is False and by["pima"]["repo"].endswith("pima4ha")
    assert by["paradox"]["entities"] == ["alarm_control_panel.paradox_area_1"]
    assert by["paradox"]["available"] is False and r["mqtt"] is False  # PAI needs MQTT


async def test_alarm_flows(hass, hass_ws_client):
    await _setup(hass)
    admin = await hass_ws_client(hass)
    r = await _ws(admin, 1, type="infinitix/alarm/start", brand="pima")
    assert not r["success"] and r["error"]["code"] == "integration_missing"
    r = await _ws(admin, 2, type="infinitix/alarm/start", brand="paradox")
    assert not r["success"] and r["error"]["code"] == "no_flow"
    # Risco: HA's own flow starts with a cloud/local menu
    r = await _ws(admin, 3, type="infinitix/alarm/start", brand="risco")
    assert r["success"], r
    res = r["result"]
    assert res["status"] == "menu" and set(res["options"]) >= {"cloud", "local"}
    r = await _ws(admin, 4, type="infinitix/alarm/continue", flow_id=res["flow_id"], data={"next_step_id": "local"})
    form = r["result"]
    assert form["status"] == "form" and {"host", "port", "pin"} <= {f["name"] for f in form["fields"]}
    r = await _ws(admin, 5, type="infinitix/alarm/abort", flow_id=res["flow_id"])
    assert r["success"]
    # flows of other integrations can never be driven from here
    other = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    r = await _ws(admin, 6, type="infinitix/alarm/continue", flow_id=other["flow_id"], data={})
    assert not r["success"] and r["error"]["code"] == "unknown_flow"


async def test_alarm_commands_admin_only(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    user = await hass_ws_client(hass, hass_read_only_access_token)
    for i, m in enumerate(({"type": "infinitix/alarm/status"}, {"type": "infinitix/alarm/start", "brand": "risco"},
                           {"type": "infinitix/alarm/continue", "flow_id": "x"}, {"type": "infinitix/alarm/abort", "flow_id": "x"}), start=1):
        r = await _ws(user, i, **m)
        assert not r["success"] and r["error"]["code"] == "unauthorized"
