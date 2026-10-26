"""Config and options flow for Ordiscale TV."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
)

from . import tv_tokens
from .const import (
    CONF_PAIRING_ENABLED,
    CONF_REVOKE,
    CONF_USER_CREATED,
    CONF_USER_ID,
    DEFAULT_PAIRING_ENABLED,
    DOMAIN,
    NEW_USER,
    TV_USER_NAME,
)


class OrdiscaleTVConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up the TV user and activate pairing."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose: create a new non-admin user or reuse an existing one."""
        candidates = {
            user.id: user.name or user.id
            for user in await self.hass.auth.async_get_users()
            if user.is_active
            and not user.system_generated
            and not user.is_admin
            and not user.is_owner
        }
        errors: dict[str, str] = {}

        if user_input is not None:
            choice = user_input[CONF_USER_ID]
            if choice == NEW_USER:
                user = await self.hass.auth.async_create_user(
                    TV_USER_NAME, group_ids=[GROUP_ID_USER], local_only=True
                )
                if user.is_admin:
                    # Only possible on an instance without owner; never keep it.
                    await self.hass.auth.async_remove_user(user)
                    return self.async_abort(reason="user_would_be_admin")
                return self.async_create_entry(
                    title=TV_USER_NAME,
                    data={CONF_USER_ID: user.id, CONF_USER_CREATED: True},
                    options={CONF_PAIRING_ENABLED: DEFAULT_PAIRING_ENABLED},
                )
            if choice in candidates:
                return self.async_create_entry(
                    title=TV_USER_NAME,
                    data={CONF_USER_ID: choice, CONF_USER_CREATED: False},
                    options={CONF_PAIRING_ENABLED: DEFAULT_PAIRING_ENABLED},
                )
            errors["base"] = "invalid_user"

        german = (self.hass.config.language or "").startswith("de")
        new_label = (
            f"Neuen Benutzer „{TV_USER_NAME}“ anlegen (empfohlen)"
            if german
            else f"Create new user “{TV_USER_NAME}” (recommended)"
        )
        options = [SelectOptionDict(value=NEW_USER, label=new_label)] + [
            SelectOptionDict(value=uid, label=name)
            for uid, name in sorted(candidates.items(), key=lambda i: i[1].lower())
        ]
        schema = vol.Schema(
            {
                vol.Required(CONF_USER_ID, default=NEW_USER): SelectSelector(
                    SelectSelectorConfig(
                        options=options, mode=SelectSelectorMode.LIST
                    )
                )
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Return the options flow."""
        return OrdiscaleTVOptionsFlow()


class OrdiscaleTVOptionsFlow(OptionsFlow):
    """Switch pairing on/off and revoke paired TVs."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Show the options."""
        user = await self.hass.auth.async_get_user(
            self.config_entry.data[CONF_USER_ID]
        )
        tokens = {
            token.id: f"{token.client_name or token.client_id} "
            f"({token.created_at:%d.%m.%Y %H:%M})"
            for token in (tv_tokens(user) if user else [])
        }

        if user_input is not None:
            for token_id in user_input.get(CONF_REVOKE, []):
                if token_id in tokens and (
                    token := self.hass.auth.async_get_refresh_token(token_id)
                ):
                    self.hass.auth.async_remove_refresh_token(token)
            return self.async_create_entry(
                data={CONF_PAIRING_ENABLED: user_input[CONF_PAIRING_ENABLED]}
            )

        fields: dict[Any, Any] = {
            vol.Required(
                CONF_PAIRING_ENABLED,
                default=self.config_entry.options.get(
                    CONF_PAIRING_ENABLED, DEFAULT_PAIRING_ENABLED
                ),
            ): bool
        }
        if tokens:
            fields[vol.Optional(CONF_REVOKE, default=[])] = cv.multi_select(tokens)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(fields),
            description_placeholders={"count": str(len(tokens))},
        )
