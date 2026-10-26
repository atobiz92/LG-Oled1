"""Panel registration and static script."""

from __future__ import annotations

from http import HTTPStatus

import pytest

from homeassistant.components.frontend import DATA_PANELS
from homeassistant.core import HomeAssistant

from custom_components.ordiscale_tv.const import PANEL_ELEMENT, PANEL_URL_PATH


@pytest.mark.usefixtures("setup_integration")
async def test_panel_hidden_and_script_served(
    hass: HomeAssistant, hass_client_no_auth
) -> None:
    """The approval page is registered without sidebar entry; its JS loads."""
    panel = hass.data[DATA_PANELS][PANEL_URL_PATH].to_response()
    assert panel["component_name"] == "custom"
    assert panel["title"] is None  # the frontend shows no sidebar entry then
    assert panel["require_admin"] is False
    custom = panel["config"]["_panel_custom"]
    assert custom["name"] == PANEL_ELEMENT
    assert custom["embed_iframe"] is False
    module_url = custom["module_url"]

    client = await hass_client_no_auth()
    resp = await client.get(module_url)
    assert resp.status == HTTPStatus.OK
    assert f'customElements.define("{PANEL_ELEMENT}"' in await resp.text()
