"""Integration tests against a real Home Assistant core (hass fixture)."""

from homeassistant import config_entries
from homeassistant.helpers import area_registry as ar, entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.infinitix.const import DOMAIN


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN, data={}, title="INFINITIX Smart Home")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_config_flow_creates_single_entry(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] == "form"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == "create_entry"
    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert again["type"] == "abort"


async def test_options_flow(hass):
    entry = await _setup(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"show_in_sidebar": False, "sidebar_title": ""}
    )
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()
    assert hass.data[DOMAIN]["options"]["show_in_sidebar"] is False
    assert hass.data[DOMAIN]["options"]["sidebar_title"] == "INFINITIX"


async def test_panel_registered_and_removed(hass):
    entry = await _setup(hass)
    assert "infinitix" in hass.data["frontend_panels"]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert "infinitix" not in hass.data["frontend_panels"]


async def test_scan_is_read_only_and_finds_areas(hass, hass_ws_client):
    await _setup(hass)
    area = ar.async_get(hass).async_create("Living room")
    reg = er.async_get(hass)
    ent = reg.async_get_or_create("light", "test", "1", suggested_object_id="lamp")
    reg.async_update_entity(ent.entity_id, area_id=area.id)
    hass.states.async_set("light.lamp", "off", {"friendly_name": "Lamp", "supported_color_modes": ["brightness"]})
    calls = []
    hass.services.async_register("light", "turn_on", lambda c: calls.append(c))

    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "infinitix/scan"})
    msg = await client.receive_json()
    assert msg["success"], msg
    rooms = msg["result"]["proposal"]["rooms"]
    assert [r["name"] for r in rooms] == ["Living room"]
    assert msg["result"]["proposal"]["entities"]["light.lamp"]["card"] == "light"
    assert calls == []  # scanning never operates devices


async def test_admin_commands_rejected_for_non_admin(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    for i, payload in enumerate((
        {"type": "infinitix/scan"},
        {"type": "infinitix/save_config", "config": {}},
        {"type": "infinitix/export"},
        {"type": "infinitix/save_wizard", "step": 1, "draft": {}},
        {"type": "infinitix/import_plan", "document": {}},
        {"type": "infinitix/dismiss_new", "entity_ids": []},
        {"type": "infinitix/subscribe_registry"},
    ), start=1):
        await client.send_json({"id": i, **payload})
        msg = await client.receive_json()
        assert not msg["success"] and msg["error"]["code"] == "unauthorized", payload["type"]
    # reading the config is allowed for any logged-in user
    await client.send_json({"id": 50, "type": "infinitix/get_config"})
    msg = await client.receive_json()
    assert msg["success"] and msg["result"]["is_admin"] is False


async def test_save_persists_across_reload_and_rediscovery_keeps_it(hass, hass_ws_client):
    entry = await _setup(hass)
    client = await hass_ws_client(hass)
    cfg = {
        "home": {"name": "בית", "language": "he", "screen": "tablet"},
        "rooms": [{"id": "r1", "area_id": None, "name": "סלון", "icon": "mdi:sofa", "order": 0, "visible": True}],
        "entities": {"light.lamp": {"card": "light", "name": "מנורה מותאמת", "room": "r1", "favorite": True}},
        "wizard": {"completed": True, "step": 7, "draft": {}},
    }
    await client.send_json({"id": 1, "type": "infinitix/save_config", "config": cfg})
    assert (await client.receive_json())["success"]

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)
    await client.send_json({"id": 2, "type": "infinitix/get_config"})
    saved = (await client.receive_json())["result"]["config"]
    assert saved["entities"]["light.lamp"]["name"] == "מנורה מותאמת" and saved["wizard"]["completed"]

    # a rescan must not touch the stored choices
    hass.states.async_set("light.lamp", "on", {})
    hass.states.async_set("light.new_one", "on", {})
    await client.send_json({"id": 3, "type": "infinitix/scan"})
    scan = (await client.receive_json())["result"]
    assert "light.new_one" in scan["new_entities"] and "light.lamp" not in scan["new_entities"]
    await client.send_json({"id": 4, "type": "infinitix/get_config"})
    again = (await client.receive_json())["result"]["config"]
    assert again["entities"]["light.lamp"]["name"] == "מנורה מותאמת"


async def test_invalid_config_rejected(hass, hass_ws_client):
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "infinitix/save_config", "config": {"entities": {"BAD": {}}}})
    msg = await client.receive_json()
    assert not msg["success"] and msg["error"]["code"] == "invalid_config"


async def test_inventory_filters_by_user_permission(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    hass.states.async_set("light.visible", "on", {})
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": "infinitix/get_inventory"})
    msg = await client.receive_json()
    assert msg["success"]  # read-only user can read states, so it sees the entity
    assert "light.visible" in [e["entity_id"] for e in msg["result"]["entities"]]
