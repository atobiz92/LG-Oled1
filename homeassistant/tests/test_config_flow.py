"""Config flow, options flow and removal."""

from __future__ import annotations

from homeassistant import config_entries
from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.auth.models import User
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.ordiscale_tv import client_name, tv_tokens
from custom_components.ordiscale_tv.const import (
    CLIENT_ID,
    CONF_PAIRING_ENABLED,
    CONF_REVOKE,
    CONF_USER_CREATED,
    CONF_USER_ID,
    DOMAIN,
    NEW_USER,
)
from pytest_homeassistant_custom_component.common import MockConfigEntry, MockUser


def _option_values(result) -> list[str]:
    selector = result["data_schema"].schema[CONF_USER_ID]
    return [o["value"] for o in selector.config["options"]]


async def test_create_new_user(hass: HomeAssistant, hass_admin_user: User) -> None:
    """Default choice creates a non-admin, local-only user."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    assert hass_admin_user.id not in _option_values(result)

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USER_ID: NEW_USER}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"][CONF_USER_CREATED] is True
    assert result["options"] == {CONF_PAIRING_ENABLED: True}

    user = await hass.auth.async_get_user(result["data"][CONF_USER_ID])
    assert user.name == "Ordiscale TV"
    assert not user.is_admin
    assert not user.is_owner
    assert user.local_only
    assert [g.id for g in user.groups] == [GROUP_ID_USER]
    await hass.async_block_till_done()


async def test_use_existing_user(hass: HomeAssistant, hass_admin_user: User) -> None:
    """An existing non-admin user can be chosen; admins cannot."""
    existing = MockUser(name="Fernseher").add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert existing.id in _option_values(result)

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USER_ID: existing.id}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_USER_ID: existing.id, CONF_USER_CREATED: False}
    await hass.async_block_till_done()


async def test_admin_user_rejected(hass: HomeAssistant, hass_admin_user: User) -> None:
    """Submitting an admin id anyway (crafted request) is refused."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    # The selector validates the value already; bypass it like a crafted call.
    flow = hass.config_entries.flow._progress[result["flow_id"]]  # noqa: SLF001
    result = await flow.async_step_user({CONF_USER_ID: hass_admin_user.id})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_user"}


async def test_single_instance(
    hass: HomeAssistant, setup_integration: MockConfigEntry
) -> None:
    """Only one entry is allowed."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "single_instance_allowed"


async def test_options_toggle_and_revoke(
    hass: HomeAssistant, setup_integration: MockConfigEntry, tv_user: User
) -> None:
    """Options switch pairing off and revoke selected TVs."""
    living = await hass.auth.async_create_refresh_token(
        tv_user, client_id=CLIENT_ID, client_name=client_name("Wohnzimmer")
    )
    kitchen = await hass.auth.async_create_refresh_token(
        tv_user, client_id=CLIENT_ID, client_name=client_name("Küche")
    )
    other = await hass.auth.async_create_refresh_token(
        tv_user, client_id="https://example.com/other/"
    )

    result = await hass.config_entries.options.async_init(setup_integration.entry_id)
    assert result["type"] is FlowResultType.FORM
    assert result["description_placeholders"] == {"count": "2"}

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {CONF_PAIRING_ENABLED: False, CONF_REVOKE: [living.id]},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert setup_integration.options == {CONF_PAIRING_ENABLED: False}
    assert hass.auth.async_get_refresh_token(living.id) is None
    assert hass.auth.async_get_refresh_token(kitchen.id) is not None
    # Tokens of other clients are never touched by this integration.
    assert hass.auth.async_get_refresh_token(other.id) is not None


async def test_remove_entry_deletes_created_user(
    hass: HomeAssistant, setup_integration: MockConfigEntry, tv_user: User
) -> None:
    """Removing the integration deletes the user it created (and its tokens)."""
    await hass.auth.async_create_refresh_token(tv_user, client_id=CLIENT_ID)
    assert await hass.config_entries.async_remove(setup_integration.entry_id)
    await hass.async_block_till_done()
    assert await hass.auth.async_get_user(tv_user.id) is None


async def test_remove_entry_keeps_existing_user(
    hass: HomeAssistant, hass_admin_user: User
) -> None:
    """A chosen existing user stays; only the TV tokens are revoked."""
    user = MockUser(name="Fernseher").add_to_hass(hass)
    tv = await hass.auth.async_create_refresh_token(user, client_id=CLIENT_ID)
    other = await hass.auth.async_create_refresh_token(
        user, client_id="https://example.com/other/"
    )
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_USER_ID: user.id, CONF_USER_CREATED: False},
        options={CONF_PAIRING_ENABLED: True},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()

    assert await hass.auth.async_get_user(user.id) is not None
    assert hass.auth.async_get_refresh_token(tv.id) is None
    assert hass.auth.async_get_refresh_token(other.id) is not None
    assert tv_tokens(user) == []
