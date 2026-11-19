"""Music services (Spotify, YouTube Music, ...) and streaming to amplifiers, through Home Assistant.

* Spotify       -> HA's built-in ``spotify`` integration.  Each family member links a
                   *personal* Spotify account (OAuth sign-in on Spotify's site, done in HA's
                   own "add integration" screen; several accounts = several entries).  Its
                   media player can move playback to any Spotify Connect device, e.g. an
                   amplifier or receiver ("select_source").
* Music Assistant -> HA's built-in ``music_assistant`` integration, connected to a Music
                   Assistant server (add-on or container).  Music Assistant holds the personal
                   logins of each provider (Spotify, YouTube Music, Apple Music, Tidal, Deezer,
                   radio, ...) and streams to players on the network (DLNA, AirPlay, Chromecast,
                   Sonos, HEOS/Denon, ...).  HA's own "YouTube" integration only reads channel
                   statistics and cannot play music, so YouTube Music goes through Music Assistant.

INFINITIX stores no tokens or passwords: OAuth happens in HA's own UI, provider logins live
in Music Assistant.  The only thing stored here is each HA user's chosen "my music" player
(an entity id).  Admin-only except the per-user choice.  Not verified with real accounts.
"""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import entity_registry as er
from homeassistant.loader import IntegrationNotFound, async_get_integration

from .media import _serialize

_LOGGER = logging.getLogger(__name__)

SPOTIFY = "spotify"
MASS = "music_assistant"
MUSIC_PLATFORMS = (SPOTIFY, MASS)
ADD_URL = "/config/integrations/dashboard/add?domain="


class MusicError(Exception):
    def __init__(self, code: str, detail: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


async def _available(hass: HomeAssistant, domain: str) -> bool:
    try:
        await async_get_integration(hass, domain)
    except IntegrationNotFound:
        return False
    return True


def _players(hass: HomeAssistant, platform: str | None = None) -> list[dict[str, Any]]:
    """Media players from HA's states (registry entries add the platform, when there is one)."""
    reg = er.async_get(hass)
    out = []
    for st in hass.states.async_all("media_player"):
        e = reg.async_get(st.entity_id)
        if e and e.disabled:
            continue
        plat = e.platform if e else None
        if platform and plat != platform:
            continue
        out.append({
            "entity_id": st.entity_id, "platform": plat, "config_entry_id": e.config_entry_id if e else None,
            "name": st.attributes.get("friendly_name") or st.entity_id,
            "sources": list(st.attributes.get("source_list") or [])[:50],
        })
    return sorted(out, key=lambda p: p["name"])


async def async_status(hass: HomeAssistant) -> dict[str, Any]:
    spotify_players = _players(hass, SPOTIFY)
    accounts = [
        {"entry_id": entry.entry_id, "title": entry.title,
         "entity_ids": [p["entity_id"] for p in spotify_players if p["config_entry_id"] == entry.entry_id]}
        for entry in hass.config_entries.async_entries(SPOTIFY)
    ]
    mass_entries = [{"entry_id": e.entry_id, "title": e.title, "url": e.data.get("url")} for e in hass.config_entries.async_entries(MASS)]
    return {
        "spotify": {"available": await _available(hass, SPOTIFY), "accounts": accounts, "add_url": ADD_URL + SPOTIFY,
                    "credentials_url": "/config/application_credentials"},
        "music_assistant": {"available": await _available(hass, MASS), "entries": mass_entries,
                            "players": _players(hass, MASS), "add_url": ADD_URL + MASS},
        "amplifiers": [p for p in _players(hass) if p["platform"] not in MUSIC_PLATFORMS],
    }


# ------------------------------------------------------------------ Music Assistant setup (URL form)
async def _result(hass: HomeAssistant, flow_id: str, result: dict[str, Any]) -> dict[str, Any]:
    rtype = result["type"]
    if rtype == FlowResultType.CREATE_ENTRY:
        return {"status": "created", "entry_id": result["result"].entry_id, "title": result.get("title")}
    if rtype == FlowResultType.ABORT:
        return {"status": "abort", "reason": result.get("reason", "unknown")}
    if rtype == FlowResultType.FORM:
        errors = result.get("errors") or {}
        return {"status": "form", "flow_id": flow_id, "step_id": result.get("step_id"),
                "fields": _serialize(result.get("data_schema")), "error": next(iter(errors.values()), None)}
    hass.config_entries.flow.async_abort(flow_id)
    return {"status": "unsupported", "reason": str(rtype)}  # e.g. an external sign-in step


def _own_flow(hass: HomeAssistant, flow_id: str) -> None:
    for flow in hass.config_entries.flow.async_progress():
        if flow["flow_id"] == flow_id and flow["handler"] == MASS:
            return
    raise MusicError("unknown_flow")


async def async_start_mass(hass: HomeAssistant) -> dict[str, Any]:
    if not await _available(hass, MASS):
        raise MusicError("integration_missing")
    try:
        started = await hass.config_entries.flow.async_init(MASS, context={"source": SOURCE_USER})
    except Exception as err:  # noqa: BLE001 - e.g. the integration cannot load its library
        _LOGGER.warning("Music Assistant setup could not start")
        raise MusicError("flow_failed", str(err)[:200]) from err
    return await _result(hass, started.get("flow_id", ""), started)


async def async_continue_mass(hass: HomeAssistant, flow_id: str, data: dict[str, Any]) -> dict[str, Any]:
    _own_flow(hass, flow_id)
    try:
        result = await hass.config_entries.flow.async_configure(flow_id, data)
    except Exception as err:  # noqa: BLE001 - tokens are never logged
        hass.config_entries.flow.async_abort(flow_id)
        raise MusicError("flow_failed", str(err)[:200]) from err
    return await _result(hass, flow_id, result)


def async_abort_mass(hass: HomeAssistant, flow_id: str) -> None:
    _own_flow(hass, flow_id)
    hass.config_entries.flow.async_abort(flow_id)


# ------------------------------------------------------------------ per-user "my music"
def validate_my_player(hass: HomeAssistant, user, entity_id: str | None) -> str | None:
    """A user may pick any media player they are allowed to read (or clear the choice)."""
    if not entity_id:
        return None
    if not entity_id.startswith("media_player.") or hass.states.get(entity_id) is None:
        raise MusicError("invalid_player")
    perms = user.permissions
    if not user.is_admin and not perms.check_entity(entity_id, "read"):
        raise MusicError("unauthorized_player")
    return entity_id
