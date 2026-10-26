"""Constants for the Ordiscale TV pairing integration."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "ordiscale_tv"
VERSION: Final = "0.1.0"

# Config entry data and options
CONF_USER_ID: Final = "user_id"
CONF_USER_CREATED: Final = "user_created"
CONF_PAIRING_ENABLED: Final = "pairing_enabled"
CONF_REVOKE: Final = "revoke"
DEFAULT_PAIRING_ENABLED: Final = True

# Choice in the config flow that creates a new user instead of reusing one
NEW_USER: Final = "__new__"
TV_USER_NAME: Final = "Ordiscale TV"

# OAuth client identification of the TV. HA only checks that this is a URL,
# it is never fetched (we do not use /auth/authorize). All tokens of this
# integration carry it, which is how the options flow finds them.
CLIENT_ID: Final = "https://ordiscale.de/tv-launcher/"
CLIENT_NAME_PREFIX: Final = "Ordiscale TV"
CLIENT_NAME_SEPARATOR: Final = " · "
MAX_NAME_LENGTH: Final = 40

# Pairing
CODE_ALPHABET: Final = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH: Final = 6
PAIRING_TTL: Final = 300  # seconds
POLL_INTERVAL: Final = 2  # seconds, recommendation for the TV
MAX_PENDING: Final = 5  # open pairings in total
MAX_PENDING_PER_IP: Final = 2  # open pairings per source address
MAX_ATTEMPTS: Final = 3  # wrong codes until the pairing is denied
APPROVED_GRACE: Final = 30  # seconds the TV still has to fetch the token
MAX_BODY_BYTES: Final = 1024

# Rate limits per source address: (requests, window in seconds)
START_RATE_LIMIT: Final = (5, 600)
POLL_RATE_LIMIT: Final = (60, 60)
MAX_TRACKED_ADDRESSES: Final = 1024

# HTTP
URL_START: Final = "/api/ordiscale_tv/pair/start"
URL_POLL: Final = "/api/ordiscale_tv/pair/poll"

# Frontend (approval page)
PANEL_URL_PATH: Final = "ordiscale-tv-pair"
PANEL_ELEMENT: Final = "ordiscale-tv-pair-panel"
STATIC_URL: Final = "/ordiscale_tv_static"
PANEL_JS: Final = "ordiscale-tv-pair-panel.js"
