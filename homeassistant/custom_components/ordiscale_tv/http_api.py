"""Open HTTP endpoints used by the TV (no Home Assistant login).

`cors_allowed = True` makes Home Assistant answer CORS with origin `*` and
handle the OPTIONS preflight (homeassistant/helpers/http.py, KEY_ALLOW_ALL_CORS).
That is safe here because neither endpoint uses cookies or a session.
"""

from __future__ import annotations

from http import HTTPStatus
import json
from typing import Any

from aiohttp import web

from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.core import HomeAssistant, callback

from . import DATA_KEY, OrdiscaleTVData, async_get_tv_user, client_name
from .const import (
    CLIENT_ID,
    MAX_BODY_BYTES,
    PANEL_URL_PATH,
    POLL_INTERVAL,
    URL_POLL,
    URL_START,
)
from .pairing import PairingError, PairingStatus, sanitize_name

NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


@callback
def async_register_views(hass: HomeAssistant) -> None:
    """Register the start and poll endpoints."""
    hass.http.register_view(PairStartView())
    hass.http.register_view(PairPollView())


def _error(code: str, http_status: HTTPStatus, **extra: Any) -> web.Response:
    # The HTTP status has its own name: callers may put a JSON field called "status" in extra.
    return web.json_response({"error": code, **extra}, status=http_status, headers=NO_STORE)


async def _read_json(request: web.Request) -> dict[str, Any] | None:
    """Read a small JSON object; any content type is accepted.

    Accepting text/plain lets the TV avoid a CORS preflight if it wants to.
    Returns {} for an empty body and None for anything that is not an object.
    """
    if request.content_length is not None and request.content_length > MAX_BODY_BYTES:
        return None
    # read(n) returns what has arrived so far, so read until EOF (or past the limit).
    body = b""
    while True:
        chunk = await request.content.read(MAX_BODY_BYTES + 1 - len(body))
        if not chunk:
            break
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            return None
    if not body.strip():
        return {}
    try:
        data = json.loads(body)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


class PairStartView(HomeAssistantView):
    """POST /api/ordiscale_tv/pair/start: create a pairing request."""

    url = URL_START
    name = "api:ordiscale_tv:pair_start"
    requires_auth = False
    cors_allowed = True

    async def post(self, request: web.Request) -> web.Response:
        """Create a pairing and return its ids, code and limits."""
        runtime = _runtime(request)
        if not runtime.pairing_enabled:
            return _error("pairing_disabled", HTTPStatus.SERVICE_UNAVAILABLE)
        remote = request.remote
        if not runtime.start_limiter.allow(remote):
            return _error(
                "rate_limited",
                HTTPStatus.TOO_MANY_REQUESTS,
                retry_after=runtime.start_limiter.retry_after(remote),
            )
        body = await _read_json(request)
        if body is None:
            return _error("invalid_request", HTTPStatus.BAD_REQUEST)
        try:
            pairing = runtime.manager.start(sanitize_name(body.get("name")), remote)
        except PairingError as err:
            return _error(err.code, HTTPStatus.TOO_MANY_REQUESTS)
        return web.json_response(
            {
                "pairing_id": pairing.pairing_id,
                "poll_secret": pairing.poll_secret,
                "user_code": pairing.user_code,
                "approve_url": f"/{PANEL_URL_PATH}/{pairing.pairing_id}",
                "expires_in": runtime.manager.expires_in(pairing),
                "interval": POLL_INTERVAL,
            },
            headers=NO_STORE,
        )


class PairPollView(HomeAssistantView):
    """POST /api/ordiscale_tv/pair/poll: ask for the result of a pairing."""

    url = URL_POLL
    name = "api:ordiscale_tv:pair_poll"
    requires_auth = False
    cors_allowed = True

    async def post(self, request: web.Request) -> web.Response:
        """Return pending/approved/denied/expired; tokens exactly once."""
        runtime = _runtime(request)
        remote = request.remote
        if not runtime.poll_limiter.allow(remote):
            return _error(
                "rate_limited",
                HTTPStatus.TOO_MANY_REQUESTS,
                retry_after=runtime.poll_limiter.retry_after(remote),
            )
        body = await _read_json(request)
        pairing_id = body.get("pairing_id") if body else None
        poll_secret = body.get("poll_secret") if body else None
        if not isinstance(pairing_id, str) or not isinstance(poll_secret, str):
            return _error("invalid_request", HTTPStatus.BAD_REQUEST)
        if not runtime.pairing_enabled:
            # Switched off or unloaded: open pairings were dropped.
            return _status(PairingStatus.EXPIRED)

        pairing = runtime.manager.check_secret(pairing_id, poll_secret)
        if pairing is None:
            # Unknown, expired, already delivered or wrong secret: same answer.
            return _status(PairingStatus.EXPIRED)
        if pairing.status is not PairingStatus.APPROVED:
            return _status(pairing.status)

        # Remove before awaiting anything, so a parallel poll gets nothing.
        if runtime.manager.take_approved(pairing) is None:
            return _status(PairingStatus.EXPIRED)
        hass = request.app[KEY_HASS]
        assert runtime.entry is not None
        try:
            user = await async_get_tv_user(hass, runtime.entry)
        except PairingError as err:
            return _error(err.code, HTTPStatus.CONFLICT, status="denied")
        refresh_token = await hass.auth.async_create_refresh_token(
            user, client_id=CLIENT_ID, client_name=client_name(pairing.name)
        )
        access_token = hass.auth.async_create_access_token(refresh_token, remote)
        return web.json_response(
            {
                "status": PairingStatus.APPROVED,
                "client_id": CLIENT_ID,
                "refresh_token": refresh_token.token,
                "access_token": access_token,
                "token_type": "Bearer",
                "expires_in": int(
                    refresh_token.access_token_expiration.total_seconds()
                ),
            },
            headers=NO_STORE,
        )


def _status(status: PairingStatus) -> web.Response:
    http_status = HTTPStatus.GONE if status is PairingStatus.EXPIRED else HTTPStatus.OK
    return web.json_response({"status": status}, status=http_status, headers=NO_STORE)


def _runtime(request: web.Request) -> OrdiscaleTVData:
    return request.app[KEY_HASS].data[DATA_KEY]
