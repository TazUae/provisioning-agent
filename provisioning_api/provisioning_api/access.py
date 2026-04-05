"""Provisioning token check against `common_site_config.json` (no secrets logged)."""

from __future__ import annotations

import hashlib
import hmac

import frappe

from provisioning_api.config import PROVISIONING_TOKEN_KEY

# Canonical header for the internal provisioning secret (not OAuth / not Authorization: Bearer).
PROVISIONING_TOKEN_HEADER = "X-Provisioning-Token"


def get_request_id() -> str:
    return (
        frappe.get_request_header("X-Request-Id")
        or frappe.get_request_header("x-request-id")
        or frappe.get_request_header("X-Request-ID")
        or ""
    )


def _constant_time_compare(expected: str, received: str) -> bool:
    """Constant-time compare without requiring equal token lengths."""
    he = hashlib.sha256(expected.encode("utf-8")).digest()
    hr = hashlib.sha256(received.encode("utf-8")).digest()
    return hmac.compare_digest(he, hr)


def _read_provisioning_token_raw() -> str:
    """Read raw token from X-Provisioning-Token (try common casings)."""
    for name in (PROVISIONING_TOKEN_HEADER, "x-provisioning-token"):
        raw = frappe.get_request_header(name, "") or ""
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return ""


def check_provisioning_token_header() -> tuple[bool, str | None]:
    """
    Validates ``X-Provisioning-Token`` against ``provisioning_api_token`` from common site config.

    Does **not** use ``Authorization: Bearer`` (Frappe treats that as OAuth before app code runs).

    Returns (ok, error_code) where error_code is AUTH_ERROR or INTERNAL_ERROR.
    """
    config = frappe.get_common_site_config()
    expected = (config or {}).get(PROVISIONING_TOKEN_KEY)
    if not expected or not isinstance(expected, str):
        return False, "INTERNAL_ERROR"

    token = _read_provisioning_token_raw()
    if not token:
        return False, "AUTH_ERROR"

    if not _constant_time_compare(expected, token):
        return False, "AUTH_ERROR"

    return True, None


def require_provisioning_access() -> tuple[bool, str | None]:
    """
    Authorize internal provisioning RPCs using **only** ``X-Provisioning-Token``.

    Does **not** require a Frappe web session, API key/secret, or a logged-in
    non-Guest user. This function does **not** call ``require_api_auth`` or any
    other Frappe helper that enforces logged-in user / API-token auth.

    Returns the same ``(ok, error_code)`` as :func:`check_provisioning_token_header`.
    """
    return check_provisioning_token_header()
