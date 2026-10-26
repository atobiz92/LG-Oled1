"""In-memory pairing state for Ordiscale TV.

Nothing here is ever written to disk: open pairings live only in memory and
vanish on restart. Codes, poll secrets and tokens are never logged; log lines
carry at most the first characters of the pairing id and the outcome.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
import hmac
import logging
import math
import secrets
import time

from .const import (
    APPROVED_GRACE,
    CODE_ALPHABET,
    CODE_LENGTH,
    MAX_ATTEMPTS,
    MAX_NAME_LENGTH,
    MAX_PENDING,
    MAX_PENDING_PER_IP,
    MAX_TRACKED_ADDRESSES,
    PAIRING_TTL,
)

_LOGGER = logging.getLogger(__name__)


class PairingStatus(StrEnum):
    """Status of a pairing as seen by the TV."""

    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"


class PairingError(Exception):
    """A pairing operation failed; `code` is the stable error code of the API."""

    def __init__(self, code: str, **details: int) -> None:
        """Store the error code and optional numeric details."""
        super().__init__(code)
        self.code = code
        self.details = details


@dataclass(slots=True)
class Pairing:
    """One open pairing request of a TV."""

    pairing_id: str
    poll_secret: str
    user_code: str
    name: str | None
    source: str | None
    expires_at: float
    attempts: int = 0
    status: PairingStatus = PairingStatus.PENDING
    approved_by: str | None = field(default=None)

    def short_id(self) -> str:
        """Return the shortened id that may appear in logs."""
        return self.pairing_id[:6] + "…"


def generate_user_code() -> str:
    """Return a fresh code of CODE_LENGTH characters from CODE_ALPHABET."""
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(raw: str) -> str | None:
    """Normalize a typed code; None if it cannot be a valid code.

    Case does not matter, spaces and hyphens are ignored. 0, O, 1 and I never
    appear in codes, so a code containing them is rejected as malformed
    (without counting as a wrong attempt) instead of guessing what was meant.
    """
    code = "".join(ch for ch in raw.upper() if ch not in " -\t")
    if len(code) != CODE_LENGTH or any(ch not in CODE_ALPHABET for ch in code):
        return None
    return code


def sanitize_name(raw: object) -> str | None:
    """Return a printable, shortened TV name or None."""
    if not isinstance(raw, str):
        return None
    # Control characters become spaces, runs of whitespace collapse.
    name = " ".join("".join(ch if ch.isprintable() else " " for ch in raw).split())
    return name[:MAX_NAME_LENGTH].rstrip() or None


class RateLimiter:
    """Sliding-window limit of requests per source address."""

    def __init__(
        self, limit: int, window: float, now: Callable[[], float] = time.monotonic
    ) -> None:
        """Allow `limit` requests per `window` seconds and address."""
        self._limit = limit
        self._window = window
        self._now = now
        self._hits: dict[str, deque[float]] = {}

    def allow(self, address: str | None) -> bool:
        """Record a request and tell whether it is within the limit."""
        key = address or "unknown"
        now = self._now()
        cutoff = now - self._window
        if key not in self._hits and len(self._hits) >= MAX_TRACKED_ADDRESSES:
            self._prune(cutoff)
            if len(self._hits) >= MAX_TRACKED_ADDRESSES:
                # Keep memory bounded: forget the address seen longest ago.
                del self._hits[min(self._hits, key=lambda k: self._hits[k][-1])]
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if len(hits) >= self._limit:
            return False
        hits.append(now)
        return True

    def retry_after(self, address: str | None) -> int:
        """Seconds until the next request of this address is allowed."""
        hits = self._hits.get(address or "unknown")
        if not hits:
            return 0
        return max(1, int(hits[0] + self._window - self._now()) + 1)

    def _prune(self, cutoff: float) -> None:
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= cutoff]:
            del self._hits[key]


class PairingManager:
    """Holds the open pairings; all methods run in the event loop."""

    def __init__(self, now: Callable[[], float] = time.monotonic) -> None:
        """Create an empty manager."""
        self._now = now
        self._pairings: dict[str, Pairing] = {}

    def clear(self) -> None:
        """Drop every open pairing (integration unloaded or pairing switched off)."""
        self._pairings.clear()

    def cleanup(self) -> None:
        """Remove expired pairings."""
        now = self._now()
        for pid in [p for p, v in self._pairings.items() if v.expires_at <= now]:
            _LOGGER.debug("Kopplung %s abgelaufen", self._pairings[pid].short_id())
            del self._pairings[pid]

    def start(self, name: str | None, source: str | None) -> Pairing:
        """Create a new pairing or raise PairingError("too_many_pairings")."""
        self.cleanup()
        pending = [
            p for p in self._pairings.values() if p.status is PairingStatus.PENDING
        ]
        if len(pending) >= MAX_PENDING or (
            sum(1 for p in pending if p.source == source) >= MAX_PENDING_PER_IP
        ):
            raise PairingError("too_many_pairings")
        pairing = Pairing(
            pairing_id=secrets.token_urlsafe(24),  # 192 bit
            poll_secret=secrets.token_urlsafe(32),  # 256 bit
            user_code=generate_user_code(),
            name=name,
            source=source,
            expires_at=self._now() + PAIRING_TTL,
        )
        self._pairings[pairing.pairing_id] = pairing
        _LOGGER.info("Kopplung %s gestartet", pairing.short_id())
        return pairing

    def get(self, pairing_id: str) -> Pairing | None:
        """Return a pairing that has not expired."""
        self.cleanup()
        return self._pairings.get(pairing_id)

    def expires_in(self, pairing: Pairing) -> int:
        """Remaining lifetime in whole seconds."""
        return max(0, math.ceil(pairing.expires_at - self._now()))

    def check_secret(self, pairing_id: str, poll_secret: str) -> Pairing | None:
        """Return the pairing if the poll secret matches (constant time)."""
        pairing = self.get(pairing_id)
        # Compare even if the pairing is unknown, so timing reveals nothing.
        expected = pairing.poll_secret if pairing else secrets.token_urlsafe(32)
        if not hmac.compare_digest(expected.encode(), poll_secret.encode()):
            return None
        return pairing

    def take_approved(self, pairing: Pairing) -> Pairing | None:
        """Remove an approved pairing so its tokens are handed out only once."""
        if self._pairings.get(pairing.pairing_id) is not pairing:
            return None
        if pairing.status is not PairingStatus.APPROVED:
            return None
        del self._pairings[pairing.pairing_id]
        return pairing

    def approve(self, pairing_id: str, raw_code: str, user_id: str) -> Pairing:
        """Check the code and approve, or raise PairingError."""
        pairing = self._pending(pairing_id)
        code = normalize_code(raw_code)
        if code is None:
            raise PairingError(
                "invalid_format", attempts_left=MAX_ATTEMPTS - pairing.attempts
            )
        if not hmac.compare_digest(code.encode(), pairing.user_code.encode()):
            pairing.attempts += 1
            if pairing.attempts >= MAX_ATTEMPTS:
                pairing.status = PairingStatus.DENIED
                _LOGGER.warning(
                    "Kopplung %s nach %d falschen Codes gesperrt",
                    pairing.short_id(),
                    MAX_ATTEMPTS,
                )
                raise PairingError("denied")
            _LOGGER.info("Kopplung %s: falscher Code", pairing.short_id())
            raise PairingError(
                "invalid_code", attempts_left=MAX_ATTEMPTS - pairing.attempts
            )
        pairing.status = PairingStatus.APPROVED
        pairing.approved_by = user_id
        # Give the TV time for at least a few more polls after a late approval.
        pairing.expires_at = max(pairing.expires_at, self._now() + APPROVED_GRACE)
        _LOGGER.info("Kopplung %s freigegeben", pairing.short_id())
        return pairing

    def deny(self, pairing_id: str) -> Pairing:
        """Deny an open pairing."""
        pairing = self._pending(pairing_id)
        pairing.status = PairingStatus.DENIED
        _LOGGER.info("Kopplung %s abgelehnt", pairing.short_id())
        return pairing

    def _pending(self, pairing_id: str) -> Pairing:
        pairing = self.get(pairing_id)
        if pairing is None:
            raise PairingError("not_found")
        if pairing.status is PairingStatus.DENIED:
            raise PairingError("denied")
        if pairing.status is not PairingStatus.PENDING:
            raise PairingError("not_pending")
        return pairing
