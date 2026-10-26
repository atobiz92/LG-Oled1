"""Pairing API: start, poll, approve, deny, limits, CORS and logging."""

from __future__ import annotations

from collections.abc import Callable
from http import HTTPStatus
import logging
import re

import pytest

from homeassistant.auth.const import GROUP_ID_ADMIN
from homeassistant.auth.models import User
from homeassistant.core import HomeAssistant

from custom_components.ordiscale_tv import OrdiscaleTVData
from custom_components.ordiscale_tv.const import (
    CLIENT_ID,
    CODE_ALPHABET,
    CONF_PAIRING_ENABLED,
    DOMAIN,
    URL_POLL,
    URL_START,
)
from custom_components.ordiscale_tv.pairing import RateLimiter
from pytest_homeassistant_custom_component.common import MockConfigEntry, MockUser

from .conftest import FakeClock

TV_ORIGIN = "file://"


async def _start(client, name: str | None = "Wohnzimmer"):
    body = {"name": name} if name is not None else {}
    resp = await client.post(URL_START, json=body)
    return resp, await resp.json()


async def _poll(client, start: dict):
    resp = await client.post(
        URL_POLL,
        json={"pairing_id": start["pairing_id"], "poll_secret": start["poll_secret"]},
    )
    return resp, await resp.json()


async def _approve(ws, pairing_id: str, code: str) -> dict:
    await ws.send_json_auto_id(
        {"type": "ordiscale_tv/approve", "pairing_id": pairing_id, "code": code}
    )
    return await ws.receive_json()


@pytest.mark.usefixtures("setup_integration")
async def test_start_returns_contract(hass_client_no_auth) -> None:
    """Start answers with ids, a code from the alphabet and limits."""
    client = await hass_client_no_auth()
    resp, data = await _start(client)
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Cache-Control"] == "no-store"
    assert set(data) == {
        "pairing_id",
        "poll_secret",
        "user_code",
        "approve_url",
        "expires_in",
        "interval",
    }
    # token_urlsafe(24) = 32 chars (192 bit), token_urlsafe(32) = 43 chars (256 bit)
    assert re.fullmatch(r"[A-Za-z0-9_-]{32}", data["pairing_id"])
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", data["poll_secret"])
    assert len(data["user_code"]) == 6
    assert all(ch in CODE_ALPHABET for ch in data["user_code"])
    assert data["approve_url"] == f"/ordiscale-tv-pair/{data['pairing_id']}"
    assert data["user_code"] not in data["approve_url"]
    assert data["expires_in"] == 300
    assert data["interval"] == 2


async def test_full_flow_tokens_delivered_once(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    tv_user: User,
    runtime: OrdiscaleTVData,
    code_of: Callable[[str], str],
) -> None:
    """Pending, approve with lowercase code, tokens once, then gone."""
    client = await hass_client_no_auth()
    _, start = await _start(client)

    resp, data = await _poll(client, start)
    assert resp.status == HTTPStatus.OK
    assert data == {"status": "pending"}

    ws = await hass_ws_client(hass)
    code = code_of(start["pairing_id"])
    result = await _approve(ws, start["pairing_id"], f" {code[:3].lower()}-{code[3:]} ")
    assert result["success"], result
    assert result["result"]["status"] == "approved"
    assert result["result"]["name"] == "Wohnzimmer"

    resp, data = await _poll(client, start)
    assert resp.status == HTTPStatus.OK
    assert data["status"] == "approved"
    assert data["client_id"] == CLIENT_ID
    assert data["token_type"] == "Bearer"
    assert data["expires_in"] == 1800

    refresh = hass.auth.async_get_refresh_token_by_token(data["refresh_token"])
    assert refresh is not None
    assert refresh.user.id == tv_user.id
    assert not refresh.user.is_admin
    assert refresh.client_id == CLIENT_ID
    assert refresh.client_name == "Ordiscale TV · Wohnzimmer"
    assert hass.auth.async_validate_access_token(data["access_token"]) is refresh

    # Delivered exactly once.
    resp, data2 = await _poll(client, start)
    assert resp.status == HTTPStatus.GONE
    assert data2 == {"status": "expired"}

    # The refresh token works with the regular, CORS-enabled /auth/token.
    resp = await client.post(
        "/auth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": CLIENT_ID,
            "refresh_token": data["refresh_token"],
        },
        headers={"Origin": TV_ORIGIN},
    )
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Access-Control-Allow-Origin"] == TV_ORIGIN
    assert "access_token" in await resp.json()


async def test_name_optional(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    code_of: Callable[[str], str],
) -> None:
    """Without name the token is called 'Ordiscale TV'; odd names are cleaned."""
    client = await hass_client_no_auth()
    _, start = await _start(client, name=None)
    ws = await hass_ws_client(hass)
    assert (await _approve(ws, start["pairing_id"], code_of(start["pairing_id"])))[
        "success"
    ]
    _, data = await _poll(client, start)
    token = hass.auth.async_get_refresh_token_by_token(data["refresh_token"])
    assert token.client_name == "Ordiscale TV"

    _, start = await _start(client, name="  Küche\n\t" + "x" * 80)
    pairing_name = (
        await _approve(ws, start["pairing_id"], code_of(start["pairing_id"]))
    )["result"]["name"]
    assert pairing_name.startswith("Küche x")
    assert len(pairing_name) == 40


async def test_wrong_code_three_times_denies(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    code_of: Callable[[str], str],
) -> None:
    """Three wrong codes block the pairing; the right code no longer helps."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    pid = start["pairing_id"]
    right = code_of(pid)
    wrong = "222222" if right != "222222" else "333333"
    ws = await hass_ws_client(hass)

    # Malformed input (contains O and 0) does not count as an attempt.
    result = await _approve(ws, pid, "O0O0O0")
    assert result["error"]["code"] == "invalid_format"
    assert result["error"]["translation_placeholders"] == {"attempts_left": "3"}

    for left in ("2", "1"):
        result = await _approve(ws, pid, wrong)
        assert result["error"]["code"] == "invalid_code"
        assert result["error"]["translation_placeholders"] == {"attempts_left": left}
    result = await _approve(ws, pid, wrong)
    assert result["error"]["code"] == "denied"

    result = await _approve(ws, pid, right)
    assert result["error"]["code"] == "denied"
    resp, data = await _poll(client, start)
    assert resp.status == HTTPStatus.OK
    assert data == {"status": "denied"}


@pytest.mark.usefixtures("setup_integration")
async def test_deny(hass: HomeAssistant, hass_client_no_auth, hass_ws_client) -> None:
    """An admin can deny without the code."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ordiscale_tv/deny", "pairing_id": start["pairing_id"]}
    )
    result = await ws.receive_json()
    assert result["success"]
    _, data = await _poll(client, start)
    assert data == {"status": "denied"}


@pytest.mark.usefixtures("setup_integration")
async def test_info_never_contains_code(
    hass: HomeAssistant, hass_client_no_auth, hass_ws_client
) -> None:
    """The approval page learns name and status, not the code."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    ws = await hass_ws_client(hass)
    await ws.send_json_auto_id(
        {"type": "ordiscale_tv/info", "pairing_id": start["pairing_id"]}
    )
    result = await ws.receive_json()
    assert result["success"]
    assert result["result"] == {
        "name": "Wohnzimmer",
        "status": "pending",
        "expires_in": 300,
        "attempts_left": 3,
    }
    assert start["user_code"] not in str(result)


async def test_expiry(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    clock: FakeClock,
    code_of: Callable[[str], str],
) -> None:
    """After 300 s the pairing is gone for TV and admin alike."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    code = code_of(start["pairing_id"])
    clock.now += 299
    resp, data = await _poll(client, start)
    assert data == {"status": "pending"}
    clock.now += 2
    resp, data = await _poll(client, start)
    assert resp.status == HTTPStatus.GONE
    assert data == {"status": "expired"}
    ws = await hass_ws_client(hass)
    result = await _approve(ws, start["pairing_id"], code)
    assert result["error"]["code"] == "not_found"


async def test_late_approval_has_grace(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    clock: FakeClock,
    code_of: Callable[[str], str],
) -> None:
    """Approved one second before expiry: the TV still has 30 s to fetch."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    clock.now += 299
    ws = await hass_ws_client(hass)
    assert (await _approve(ws, start["pairing_id"], code_of(start["pairing_id"])))[
        "success"
    ]
    clock.now += 20
    _, data = await _poll(client, start)
    assert data["status"] == "approved"


async def test_wrong_poll_secret(hass_client_no_auth, setup_integration) -> None:
    """A wrong secret looks exactly like an unknown pairing."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    resp, data = await _poll(client, {**start, "poll_secret": "x" * 43})
    assert resp.status == HTTPStatus.GONE
    assert data == {"status": "expired"}
    resp = await client.post(URL_POLL, json={"pairing_id": start["pairing_id"]})
    assert resp.status == HTTPStatus.BAD_REQUEST


async def test_non_admin_cannot_approve(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    code_of: Callable[[str], str],
) -> None:
    """Only admins may approve, deny or read pairings."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    user = MockUser(name="Bewohner").add_to_hass(hass)
    assert not user.is_admin
    refresh = await hass.auth.async_create_refresh_token(user, "https://example.com/")
    ws = await hass_ws_client(hass, hass.auth.async_create_access_token(refresh))

    result = await _approve(ws, start["pairing_id"], code_of(start["pairing_id"]))
    assert result["error"]["code"] == "unauthorized"
    for command in ("ordiscale_tv/deny", "ordiscale_tv/info"):
        await ws.send_json_auto_id({"type": command, "pairing_id": start["pairing_id"]})
        assert (await ws.receive_json())["error"]["code"] == "unauthorized"
    _, data = await _poll(client, start)
    assert data == {"status": "pending"}


async def test_tv_user_promoted_to_admin_is_refused(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    tv_user: User,
    code_of: Callable[[str], str],
) -> None:
    """If someone makes the TV user an admin, no TV gets a token."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    await hass.auth.async_update_user(tv_user, group_ids=[GROUP_ID_ADMIN])
    ws = await hass_ws_client(hass)
    result = await _approve(ws, start["pairing_id"], code_of(start["pairing_id"]))
    assert result["error"]["code"] == "user_unavailable"


async def test_tv_user_lost_between_approval_and_poll(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    tv_user: User,
    code_of: Callable[[str], str],
) -> None:
    """Approved, then the TV user becomes admin before the TV collects: 409, no token, no 500."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    ws = await hass_ws_client(hass)
    result = await _approve(ws, start["pairing_id"], code_of(start["pairing_id"]))
    assert result["success"], result
    await hass.auth.async_update_user(tv_user, group_ids=[GROUP_ID_ADMIN])
    resp, data = await _poll(client, start)
    assert resp.status == HTTPStatus.CONFLICT
    assert data == {"error": "user_unavailable", "status": "denied"}


async def test_body_in_fragments(hass_client_no_auth, setup_integration) -> None:
    """A small JSON body that arrives in several pieces is read whole."""
    client = await hass_client_no_auth()

    async def pieces():
        yield b'{"name":'
        yield b' "Wohnzimmer"}'

    resp = await client.post(URL_START, data=pieces(), headers={"Content-Type": "application/json"})
    assert resp.status == HTTPStatus.OK
    assert "pairing_id" in await resp.json()


async def test_open_pairing_limits(
    hass_client_no_auth, runtime: OrdiscaleTVData
) -> None:
    """At most 2 open pairings per address and 5 in total."""
    client = await hass_client_no_auth()
    for _ in range(2):
        resp, _ = await _start(client)
        assert resp.status == HTTPStatus.OK
    resp, data = await _start(client)
    assert resp.status == HTTPStatus.TOO_MANY_REQUESTS
    assert data == {"error": "too_many_pairings"}

    for i in range(3):
        runtime.manager.start(None, f"192.168.1.{i}")
    with pytest.raises(Exception, match="too_many_pairings"):
        runtime.manager.start(None, "192.168.1.99")


async def test_start_rate_limit(
    hass_client_no_auth, runtime: OrdiscaleTVData
) -> None:
    """Five starts per ten minutes and address, then 429 with retry_after."""
    client = await hass_client_no_auth()
    for _ in range(5):
        resp, data = await _start(client)
        assert resp.status == HTTPStatus.OK
        runtime.manager.deny(data["pairing_id"])  # free the slot
    resp, data = await _start(client)
    assert resp.status == HTTPStatus.TOO_MANY_REQUESTS
    assert data["error"] == "rate_limited"
    assert 1 <= data["retry_after"] <= 601


async def test_poll_rate_limit(hass_client_no_auth, runtime: OrdiscaleTVData) -> None:
    """Polling faster than allowed gives 429."""
    runtime.poll_limiter = RateLimiter(3, 60)
    client = await hass_client_no_auth()
    _, start = await _start(client)
    for _ in range(3):
        resp, _ = await _poll(client, start)
        assert resp.status == HTTPStatus.OK
    resp, data = await _poll(client, start)
    assert resp.status == HTTPStatus.TOO_MANY_REQUESTS
    assert data["error"] == "rate_limited"


def test_rate_limiter_window() -> None:
    """The window slides and addresses are counted separately."""
    clock = FakeClock()
    limiter = RateLimiter(2, 10, now=clock)
    assert limiter.allow("a") and limiter.allow("a")
    assert not limiter.allow("a")
    assert limiter.allow("b")
    clock.now += 10.1
    assert limiter.allow("a")


def test_rate_limiter_memory_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    """With too many addresses the oldest one is forgotten, never all blocked."""
    monkeypatch.setattr(
        "custom_components.ordiscale_tv.pairing.MAX_TRACKED_ADDRESSES", 3
    )
    clock = FakeClock()
    limiter = RateLimiter(1, 100, now=clock)
    for addr in ("a", "b", "c"):
        clock.now += 1
        assert limiter.allow(addr)
    clock.now += 1
    assert limiter.allow("d")
    assert len(limiter._hits) == 3  # noqa: SLF001
    assert "a" not in limiter._hits  # noqa: SLF001


@pytest.mark.usefixtures("setup_integration")
async def test_cors_preflight_and_headers(hass_client_no_auth) -> None:
    """Both open endpoints answer the preflight and send CORS headers."""
    client = await hass_client_no_auth()
    for url in (URL_START, URL_POLL):
        resp = await client.options(
            url,
            headers={
                "Origin": TV_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert resp.status == HTTPStatus.OK
        # aiohttp-cors echoes the origin for the "*" rule.
        assert resp.headers["Access-Control-Allow-Origin"] == TV_ORIGIN
        assert "POST" in resp.headers["Access-Control-Allow-Methods"]
        assert "CONTENT-TYPE" in resp.headers["Access-Control-Allow-Headers"].upper()
        assert "Access-Control-Allow-Credentials" not in resp.headers

    resp = await client.post(URL_START, json={}, headers={"Origin": TV_ORIGIN})
    assert resp.status == HTTPStatus.OK
    assert resp.headers["Access-Control-Allow-Origin"] == TV_ORIGIN
    resp = await client.post(URL_START, json={}, headers={"Origin": "null"})
    assert resp.headers["Access-Control-Allow-Origin"] == "null"


@pytest.mark.usefixtures("setup_integration")
async def test_bad_bodies(hass_client_no_auth) -> None:
    """Oversized or non-object bodies are rejected; text/plain JSON works."""
    client = await hass_client_no_auth()
    resp = await client.post(URL_START, data="x" * 2000)
    assert resp.status == HTTPStatus.BAD_REQUEST
    resp = await client.post(URL_START, data="[1]")
    assert resp.status == HTTPStatus.BAD_REQUEST
    resp = await client.post(
        URL_START, data='{"name":"Flur"}', headers={"Content-Type": "text/plain"}
    )
    assert resp.status == HTTPStatus.OK


async def test_pairing_disabled(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    setup_integration: MockConfigEntry,
    code_of: Callable[[str], str],
) -> None:
    """Switching pairing off drops open pairings and blocks new ones."""
    client = await hass_client_no_auth()
    _, start = await _start(client)
    hass.config_entries.async_update_entry(
        setup_integration, options={CONF_PAIRING_ENABLED: False}
    )
    await hass.async_block_till_done()

    resp, data = await _start(client)
    assert resp.status == HTTPStatus.SERVICE_UNAVAILABLE
    assert data == {"error": "pairing_disabled"}
    resp, data = await _poll(client, start)
    assert data == {"status": "expired"}
    ws = await hass_ws_client(hass)
    result = await _approve(ws, start["pairing_id"], "ABCDEF")
    assert result["error"]["code"] == "pairing_disabled"


async def test_unloaded_entry_disables_endpoints(
    hass: HomeAssistant, hass_client_no_auth, setup_integration: MockConfigEntry
) -> None:
    """Routes stay registered but answer 503 while the entry is unloaded."""
    assert await hass.config_entries.async_unload(setup_integration.entry_id)
    client = await hass_client_no_auth()
    resp, data = await _start(client)
    assert resp.status == HTTPStatus.SERVICE_UNAVAILABLE
    assert "ordiscale-tv-pair" not in hass.data.get("frontend_panels", {})


async def test_no_secrets_in_log(
    hass: HomeAssistant,
    hass_client_no_auth,
    hass_ws_client,
    caplog: pytest.LogCaptureFixture,
    code_of: Callable[[str], str],
) -> None:
    """Codes, secrets, tokens and full pairing ids never reach the log."""
    caplog.set_level(logging.DEBUG, logger=f"custom_components.{DOMAIN}")
    client = await hass_client_no_auth()
    _, start = await _start(client)
    code = code_of(start["pairing_id"])
    ws = await hass_ws_client(hass)
    await _approve(ws, start["pairing_id"], "222223" if code != "222223" else "222224")
    await _approve(ws, start["pairing_id"], code)
    _, data = await _poll(client, start)

    # Only this integration's records: HA's own websocket_api debug log echoes
    # incoming messages (including the typed code), see README.
    log = "\n".join(
        r.getMessage()
        for r in caplog.records
        if r.name.startswith(f"custom_components.{DOMAIN}")
    )
    assert f"{start['pairing_id'][:6]}…" in log
    for secret in (
        start["pairing_id"],
        start["poll_secret"],
        code,
        data["refresh_token"],
        data["access_token"],
    ):
        assert secret not in log
