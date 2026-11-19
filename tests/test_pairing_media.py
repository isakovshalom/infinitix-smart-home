"""Pairing (ZHA / Zigbee2MQTT permit) and media-player flows, against real HA with fake services."""

import json

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.infinitix import media, pairing
from custom_components.infinitix.const import DOMAIN


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN, data={}, title="INFINITIX Smart Home")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_permit_calls_ha_services_and_validates(hass):
    zha, mqtt = [], []
    hass.services.async_register("zha", "permit", lambda c: zha.append(dict(c.data)))
    hass.services.async_register("mqtt", "publish", lambda c: mqtt.append(dict(c.data)))
    await pairing.async_permit(hass, "zha", 90, "x")
    assert zha == [{"duration": 90}]
    await pairing.async_permit(hass, "z2m", 60, "zigbee2mqtt")
    assert mqtt[0]["topic"] == "zigbee2mqtt/bridge/request/permit_join"
    assert json.loads(mqtt[0]["payload"]) == {"time": 60}
    for bad in ("../x", "/abs", "a b", ""):
        with pytest.raises(pairing.PairingError) as e:
            await pairing.async_permit(hass, "z2m", 60, bad)
        assert e.value.code == "invalid_topic"
    for d in (0, 255, True, "5"):
        with pytest.raises(pairing.PairingError) as e:
            await pairing.async_permit(hass, "zha", d, "x")
        assert e.value.code == "invalid_duration"
    with pytest.raises(pairing.PairingError):
        await pairing.async_permit(hass, "other", 60, "x")


async def test_permit_requires_integrations(hass):
    for proto, code in (("zha", "zha_missing"), ("z2m", "mqtt_missing")):
        with pytest.raises(pairing.PairingError) as e:
            await pairing.async_permit(hass, proto, 60, "zigbee2mqtt")
        assert e.value.code == code
    st = pairing.async_status(hass)
    assert st["matter"] is False and st["zha"] is False and st["mqtt"] is False


async def test_media_refuses_foreign_flows_and_bad_input(hass):
    with pytest.raises(media.MediaError) as e:
        await media.async_start(hass, "hue", "1.2.3.4")
    assert e.value.code == "invalid_domain"
    for host in ("a b", "http://x", "u@h", ""):
        with pytest.raises(media.MediaError) as e:
            await media.async_start(hass, "samsungtv", host)
        assert e.value.code == "invalid_host"
    with pytest.raises(media.MediaError) as e:
        await media.async_continue(hass, "does-not-exist", {})
    assert e.value.code == "unknown_flow"
    assert media.async_list(hass) == {"discovered": [], "configured": [], "manual": list(media.MANUAL_HOST_DOMAINS)}


async def test_pairing_and_media_commands_admin_only(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    user = await hass_ws_client(hass, hass_read_only_access_token)
    msgs = [{"type": "infinitix/pairing/status"}, {"type": "infinitix/pairing/permit", "protocol": "zha"},
            {"type": "infinitix/media/list"}, {"type": "infinitix/media/start", "domain": "denonavr"},
            {"type": "infinitix/media/continue", "flow_id": "x"}, {"type": "infinitix/media/abort", "flow_id": "x"}]
    for i, m in enumerate(msgs, start=1):
        await user.send_json({"id": i, **m})
        r = await user.receive_json()
        assert not r["success"] and r["error"]["code"] == "unauthorized", m
    admin = await hass_ws_client(hass)
    await admin.send_json({"id": 1, "type": "infinitix/pairing/status"})
    assert (await admin.receive_json())["success"]
