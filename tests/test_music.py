"""Music: Spotify accounts, Music Assistant setup relay, per-user "my music" player."""

from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.infinitix.const import DOMAIN


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN, data={}, title="INFINITIX Smart Home")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def _ws(client, i, **payload):
    await client.send_json({"id": i, **payload})
    return await client.receive_json()


async def test_status_lists_accounts_and_amplifiers(hass, hass_ws_client):
    await _setup(hass)
    sp = MockConfigEntry(domain="spotify", title="דנה", data={})
    sp.add_to_hass(hass)
    reg = er.async_get(hass)
    reg.async_get_or_create("media_player", "spotify", "acc1", config_entry=sp, suggested_object_id="spotify_dana")
    hass.states.async_set("media_player.spotify_dana", "idle", {"source_list": ["Denon AVR", "Kitchen"]})
    reg.async_get_or_create("media_player", "denonavr", "amp", suggested_object_id="living_amp")
    hass.states.async_set("media_player.living_amp", "on", {"friendly_name": "Living amp"})
    admin = await hass_ws_client(hass)
    r = (await _ws(admin, 1, type="infinitix/music/status"))["result"]
    assert r["spotify"]["accounts"] == [{"entry_id": sp.entry_id, "title": "דנה", "entity_ids": ["media_player.spotify_dana"]}]
    assert r["spotify"]["add_url"].endswith("domain=spotify")
    assert [a["entity_id"] for a in r["amplifiers"]] == ["media_player.living_amp"]
    assert r["music_assistant"]["available"] is True


async def test_my_player_is_per_user_and_private(hass, hass_ws_client, hass_read_only_access_token, hass_admin_user):
    await _setup(hass)
    hass.states.async_set("media_player.spotify_dana", "idle", {})
    hass.states.async_set("media_player.spotify_avi", "idle", {})
    user = await hass_ws_client(hass, hass_read_only_access_token)
    r = await _ws(user, 1, type="infinitix/music/my_player", entity_id="media_player.spotify_avi")
    assert r["success"] and r["result"]["mine"] == "media_player.spotify_avi"
    bad = await _ws(user, 2, type="infinitix/music/my_player", entity_id="light.kitchen")
    assert not bad["success"] and bad["error"]["code"] == "invalid_player"
    admin = await hass_ws_client(hass)
    await _ws(admin, 1, type="infinitix/music/my_player", entity_id="media_player.spotify_dana")
    accounts = hass.data[DOMAIN]["manager"].data["music_accounts"]
    assert len(accounts) == 2 and accounts[hass_admin_user.id] == "media_player.spotify_dana"
    # each user sees only their own choice, and members do not get the full table
    r = (await _ws(user, 3, type="infinitix/music/status"))["result"]
    assert r["mine"] == "media_player.spotify_avi" and "spotify" not in r
    cfg = (await _ws(user, 4, type="infinitix/get_config"))["result"]["config"]
    assert "music_accounts" not in cfg
    # a general config save never overwrites the per-user choices
    await _ws(admin, 2, type="infinitix/save_config", config={"music_accounts": {}})
    assert len(hass.data[DOMAIN]["manager"].data["music_accounts"]) == 2
    # clearing
    r = await _ws(user, 5, type="infinitix/music/my_player", entity_id=None)
    assert r["result"]["mine"] is None and len(hass.data[DOMAIN]["manager"].data["music_accounts"]) == 1


async def test_music_assistant_flow_relay_and_admin_only(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    admin = await hass_ws_client(hass)
    r = await _ws(admin, 1, type="infinitix/music/mass/start")
    assert r["success"], r
    res = r["result"]
    assert res["status"] == "form" and [f["name"] for f in res["fields"]] == ["url"]
    assert (await _ws(admin, 2, type="infinitix/music/mass/abort", flow_id=res["flow_id"]))["success"]
    other = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    r = await _ws(admin, 3, type="infinitix/music/mass/continue", flow_id=other["flow_id"], data={})
    assert not r["success"] and r["error"]["code"] == "unknown_flow"
    user = await hass_ws_client(hass, hass_read_only_access_token)
    for i, m in enumerate(({"type": "infinitix/music/mass/start"}, {"type": "infinitix/music/mass/continue", "flow_id": "x"},
                           {"type": "infinitix/music/mass/abort", "flow_id": "x"}), start=1):
        r = await _ws(user, i, **m)
        assert not r["success"] and r["error"]["code"] == "unauthorized"
