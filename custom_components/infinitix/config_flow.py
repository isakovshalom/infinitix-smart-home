"""Config flow and options flow for INFINITIX Smart Home."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback

from .const import (
    CONF_SHOW_IN_SIDEBAR,
    CONF_SIDEBAR_TITLE,
    DEFAULT_SIDEBAR_TITLE,
    DOMAIN,
    NAME,
)


class InfinitixConfigFlow(ConfigFlow, domain=DOMAIN):
    """One-step flow: confirm.  The rich setup happens in the INFINITIX wizard."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(
                title=NAME,
                data={},
                options={
                    CONF_SHOW_IN_SIDEBAR: True,
                    CONF_SIDEBAR_TITLE: DEFAULT_SIDEBAR_TITLE,
                },
            )
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> InfinitixOptionsFlow:
        return InfinitixOptionsFlow()


class InfinitixOptionsFlow(OptionsFlow):
    """Simple options.  Rich settings live in the panel (admin only)."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            title = (user_input.get(CONF_SIDEBAR_TITLE) or "").strip()
            return self.async_create_entry(
                data={
                    CONF_SHOW_IN_SIDEBAR: user_input[CONF_SHOW_IN_SIDEBAR],
                    CONF_SIDEBAR_TITLE: title or DEFAULT_SIDEBAR_TITLE,
                }
            )
        opts = self.config_entry.options
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_SHOW_IN_SIDEBAR, default=opts.get(CONF_SHOW_IN_SIDEBAR, True)
                ): bool,
                vol.Optional(
                    CONF_SIDEBAR_TITLE,
                    default=opts.get(CONF_SIDEBAR_TITLE, DEFAULT_SIDEBAR_TITLE),
                ): str,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
