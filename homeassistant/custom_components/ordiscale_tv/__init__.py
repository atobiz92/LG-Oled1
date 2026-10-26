"""Ordiscale TV: pair the Ordiscale Launcher with Home Assistant by QR code.

Flow: the TV calls the open endpoint /pair/start and shows a QR code with the
approval page plus a six-character code. An admin opens the page on the
phone, types the code and approves. The TV polls /pair/poll and receives a
refresh token of its own, issued to a non-admin user.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
from pathlib import Path

from homeassistant.auth.models import RefreshToken, User
from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.util.hass_dict import HassKey

from .const import (
    CLIENT_ID,
    CLIENT_NAME_PREFIX,
    CLIENT_NAME_SEPARATOR,
    CONF_PAIRING_ENABLED,
    CONF_USER_CREATED,
    CONF_USER_ID,
    DEFAULT_PAIRING_ENABLED,
    DOMAIN,
    PANEL_ELEMENT,
    PANEL_JS,
    PANEL_URL_PATH,
    POLL_RATE_LIMIT,
    START_RATE_LIMIT,
    STATIC_URL,
    VERSION,
)
from .pairing import PairingError, PairingManager, RateLimiter

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


@dataclass
class OrdiscaleTVData:
    """Runtime state shared by the HTTP views and WebSocket commands."""

    manager: PairingManager = field(default_factory=PairingManager)
    start_limiter: RateLimiter = field(
        default_factory=lambda: RateLimiter(*START_RATE_LIMIT)
    )
    poll_limiter: RateLimiter = field(
        default_factory=lambda: RateLimiter(*POLL_RATE_LIMIT)
    )
    entry: ConfigEntry | None = None

    @property
    def pairing_enabled(self) -> bool:
        """True if the entry is loaded and pairing is switched on."""
        return self.entry is not None and self.entry.options.get(
            CONF_PAIRING_ENABLED, DEFAULT_PAIRING_ENABLED
        )


DATA_KEY: HassKey[OrdiscaleTVData] = HassKey(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register views, WebSocket commands and the panel script once per start.

    Routes cannot be removed from aiohttp at runtime, so they are registered
    here and check on every request whether a config entry is loaded.
    """
    # Imported here so the module import stays light for the config flow.
    from . import http_api, websocket  # noqa: PLC0415

    hass.data[DATA_KEY] = OrdiscaleTVData()
    http_api.async_register_views(hass)
    websocket.async_register_commands(hass)
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"{STATIC_URL}/{PANEL_JS}",
                str(Path(__file__).parent / "frontend" / PANEL_JS),
                cache_headers=False,
            )
        ]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Activate pairing and the hidden approval page."""
    data = hass.data[DATA_KEY]
    data.entry = entry
    data.manager.clear()
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        # No sidebar title: the page is only reached through the QR code.
        sidebar_title=None,
        sidebar_icon=None,
        module_url=f"{STATIC_URL}/{PANEL_JS}?v={VERSION}",
        embed_iframe=False,
        require_admin=False,  # the page explains itself to non-admins
        config={"version": VERSION},
    )
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Deactivate pairing; issued tokens stay valid."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    data = hass.data[DATA_KEY]
    data.entry = None
    data.manager.clear()
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Revoke all TV tokens; delete the TV user if this integration created it."""
    user = await hass.auth.async_get_user(entry.data[CONF_USER_ID])
    if user is None:
        return
    if entry.data.get(CONF_USER_CREATED):
        await hass.auth.async_remove_user(user)  # removes its tokens too
        _LOGGER.info("TV-Benutzer und alle TV-Zugänge entfernt")
        return
    for token in tv_tokens(user):
        hass.auth.async_remove_refresh_token(token)
    _LOGGER.info("Alle TV-Zugänge widerrufen")


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Drop open pairings as soon as pairing is switched off."""
    if not entry.options.get(CONF_PAIRING_ENABLED, DEFAULT_PAIRING_ENABLED):
        hass.data[DATA_KEY].manager.clear()


def tv_tokens(user: User) -> list[RefreshToken]:
    """Return the refresh tokens this integration issued to `user`."""
    return [t for t in user.refresh_tokens.values() if t.client_id == CLIENT_ID]


def client_name(tv_name: str | None) -> str:
    """Name shown for the token in HA, e.g. 'Ordiscale TV · Wohnzimmer'."""
    if not tv_name:
        return CLIENT_NAME_PREFIX
    return f"{CLIENT_NAME_PREFIX}{CLIENT_NAME_SEPARATOR}{tv_name}"


async def async_get_tv_user(hass: HomeAssistant, entry: ConfigEntry) -> User:
    """Return the configured TV user, or raise if it is unusable.

    The TV user must exist, be active and must never be an admin or owner.
    """
    user = await hass.auth.async_get_user(entry.data[CONF_USER_ID])
    if (
        user is None
        or not user.is_active
        or user.system_generated
        or user.is_admin
        or user.is_owner
    ):
        raise PairingError("user_unavailable")
    return user
