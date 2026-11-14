"""INFINITIX Smart Home: a self-building dashboard for Home Assistant."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import CoreState, Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import (
    CONF_SHOW_IN_SIDEBAR,
    CONF_SIDEBAR_TITLE,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
    FRONTEND_VERSION,
    PANEL_MODULE,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT,
    STATIC_URL,
)
from .scenarios import JEWISH_DOMAIN, ScenarioRunner
from .storage import ConfigManager
from .websocket_api import async_register_commands

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent / "frontend"


def _options(entry: ConfigEntry) -> dict:
    return {
        CONF_SHOW_IN_SIDEBAR: entry.options.get(CONF_SHOW_IN_SIDEBAR, True),
        CONF_SIDEBAR_TITLE: entry.options.get(CONF_SIDEBAR_TITLE, DEFAULT_SIDEBAR_TITLE),
    }


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register things that must exist once per HA run (not per entry)."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    if not domain_data.get("static_registered"):
        # Local, packaged frontend: works with no internet and no Node.js.
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(FRONTEND_DIR), cache_headers=False)]
        )
        async_register_commands(hass)
        domain_data["static_registered"] = True
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = hass.data.setdefault(DOMAIN, {})
    manager = ConfigManager(hass)
    await manager.async_load()  # raises (entry fails to load) on a newer-than-known schema
    domain_data["manager"] = manager
    domain_data["options"] = _options(entry)

    await _async_register_panel(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    _async_start_scenarios(hass, entry, manager)
    return True


@callback
def _async_start_scenarios(hass: HomeAssistant, entry: ConfigEntry, manager: ConfigManager) -> None:
    """Arm scenarios once HA is fully started (time sources load late), and re-arm
    when the Jewish Calendar integration adds its entities."""
    runner = ScenarioRunner(hass, manager)
    hass.data[DOMAIN]["runner"] = runner

    @callback
    def _registry_changed(event: Event) -> None:
        if event.data.get("action") != "create":
            return
        reg_entry = er.async_get(hass).async_get(event.data["entity_id"])
        if reg_entry and reg_entry.platform == JEWISH_DOMAIN:
            runner.async_reload()

    entry.async_on_unload(hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, _registry_changed))
    entry.async_on_unload(runner.async_stop)

    if hass.state is CoreState.running:
        runner.async_reload()
    else:
        async def _started(_event: Event) -> None:
            runner.async_reload()

        entry.async_on_unload(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _started))


async def _async_register_panel(hass: HomeAssistant, entry: ConfigEntry) -> None:
    opts = _options(entry)
    hass.data[DOMAIN]["options"] = opts
    # Panels are additive; remove first so option changes re-register cleanly.
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_WEBCOMPONENT,
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{STATIC_URL}/{PANEL_MODULE}?v={FRONTEND_VERSION}",
        sidebar_title=opts[CONF_SIDEBAR_TITLE] if opts[CONF_SHOW_IN_SIDEBAR] else None,
        sidebar_icon="mdi:home-automation" if opts[CONF_SHOW_IN_SIDEBAR] else None,
        require_admin=False,  # regular users use the dashboard; admin APIs are protected server side
        config={"domain": DOMAIN, "version": FRONTEND_VERSION},
        embed_iframe=False,
    )


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await _async_register_panel(hass, entry)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    hass.data[DOMAIN].pop("runner", None)
    hass.data[DOMAIN].pop("manager", None)
    hass.data[DOMAIN].pop("options", None)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Removing the integration deletes the stored configuration."""
    await ConfigManager(hass).async_remove()
