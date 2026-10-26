"""Shared fixtures for the Ordiscale TV tests."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.auth.models import User
from homeassistant.core import HomeAssistant

from custom_components.ordiscale_tv import DATA_KEY, OrdiscaleTVData
from custom_components.ordiscale_tv.const import (
    CONF_PAIRING_ENABLED,
    CONF_USER_CREATED,
    CONF_USER_ID,
    DOMAIN,
)
from pytest_homeassistant_custom_component.common import MockConfigEntry


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Allow loading custom_components/ordiscale_tv."""


@pytest.fixture
async def tv_user(hass: HomeAssistant, hass_admin_user: User) -> User:
    """The non-admin user the TVs get their tokens for.

    hass_admin_user exists first, so the TV user does not become the owner.
    """
    return await hass.auth.async_create_user(
        "Ordiscale TV", group_ids=[GROUP_ID_USER], local_only=True
    )


@pytest.fixture
async def setup_integration(hass: HomeAssistant, tv_user: User) -> MockConfigEntry:
    """Set up the integration with pairing enabled."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Ordiscale TV",
        data={CONF_USER_ID: tv_user.id, CONF_USER_CREATED: True},
        options={CONF_PAIRING_ENABLED: True},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


class FakeClock:
    """Monotonic clock that tests can move forward."""

    def __init__(self) -> None:
        """Start at an arbitrary point in time."""
        self.now = 1000.0

    def __call__(self) -> float:
        """Return the current fake time."""
        return self.now


@pytest.fixture
def runtime(hass: HomeAssistant, setup_integration: MockConfigEntry) -> OrdiscaleTVData:
    """Runtime data of the loaded integration."""
    return hass.data[DATA_KEY]


@pytest.fixture
def clock(runtime: OrdiscaleTVData) -> FakeClock:
    """Replace the clock of the pairing manager."""
    fake = FakeClock()
    runtime.manager._now = fake  # noqa: SLF001
    return fake


@pytest.fixture
def code_of(runtime: OrdiscaleTVData) -> Callable[[str], str]:
    """Look up the code a TV would display (the test plays the person)."""

    def _code(pairing_id: str) -> str:
        pairing = runtime.manager.get(pairing_id)
        assert pairing is not None
        return pairing.user_code

    return _code
