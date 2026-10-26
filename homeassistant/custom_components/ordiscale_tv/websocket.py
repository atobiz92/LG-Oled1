"""Authenticated WebSocket commands for the approval page (admins only).

Whoever approves a TV hands out access to Home Assistant, so every command
requires an admin user (websocket_api.require_admin).
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import DATA_KEY, OrdiscaleTVData, async_get_tv_user
from .const import DOMAIN, MAX_ATTEMPTS
from .pairing import Pairing, PairingError

PAIRING_ID = vol.All(str, vol.Length(min=1, max=128))


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    """Register the commands of the approval page."""
    websocket_api.async_register_command(hass, ws_info)
    websocket_api.async_register_command(hass, ws_approve)
    websocket_api.async_register_command(hass, ws_deny)


def _runtime(hass: HomeAssistant) -> OrdiscaleTVData | None:
    runtime = hass.data[DATA_KEY]
    return runtime if runtime.pairing_enabled else None


def _send_error(
    connection: websocket_api.ActiveConnection, msg_id: int, err: PairingError
) -> None:
    connection.send_error(
        msg_id,
        err.code,
        err.code,
        translation_key=err.code,
        translation_domain=DOMAIN,
        translation_placeholders={k: str(v) for k, v in err.details.items()},
    )


def _describe(runtime: OrdiscaleTVData, pairing: Pairing) -> dict[str, Any]:
    return {
        "name": pairing.name,
        "status": pairing.status,
        "expires_in": runtime.manager.expires_in(pairing),
        "attempts_left": MAX_ATTEMPTS - pairing.attempts,
    }


@websocket_api.websocket_command(
    {vol.Required("type"): "ordiscale_tv/info", vol.Required("pairing_id"): PAIRING_ID}
)
@websocket_api.require_admin
@callback
def ws_info(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return name, status and remaining time of a pairing (never the code)."""
    if (runtime := _runtime(hass)) is None:
        _send_error(connection, msg["id"], PairingError("pairing_disabled"))
        return
    if (pairing := runtime.manager.get(msg["pairing_id"])) is None:
        _send_error(connection, msg["id"], PairingError("not_found"))
        return
    connection.send_result(msg["id"], _describe(runtime, pairing))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "ordiscale_tv/approve",
        vol.Required("pairing_id"): PAIRING_ID,
        vol.Required("code"): vol.All(str, vol.Length(max=32)),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_approve(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Approve a pairing if the code from the TV is correct."""
    if (runtime := _runtime(hass)) is None:
        _send_error(connection, msg["id"], PairingError("pairing_disabled"))
        return
    assert runtime.entry is not None
    try:
        # Refuse before checking the code if the TV user became unusable
        # (deleted, deactivated or promoted to admin).
        await async_get_tv_user(hass, runtime.entry)
        pairing = runtime.manager.approve(
            msg["pairing_id"], msg["code"], connection.user.id
        )
    except PairingError as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], _describe(runtime, pairing))


@websocket_api.websocket_command(
    {vol.Required("type"): "ordiscale_tv/deny", vol.Required("pairing_id"): PAIRING_ID}
)
@websocket_api.require_admin
@callback
def ws_deny(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Deny a pairing."""
    if (runtime := _runtime(hass)) is None:
        _send_error(connection, msg["id"], PairingError("pairing_disabled"))
        return
    try:
        pairing = runtime.manager.deny(msg["pairing_id"])
    except PairingError as err:
        _send_error(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], _describe(runtime, pairing))
