"""Bearer token check against `common_site_config.json` (no secrets logged)."""

from __future__ import annotations

import hashlib
import hmac

import frappe


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


def check_provisioning_bearer() -> tuple[bool, str | None]:
    """
    Validates `Authorization: Bearer <token>` against
    `provisioning_api_token` from common site config.

    Returns (ok, error_code) where error_code is AUTH_ERROR or INTERNAL_ERROR.
    """
    config = frappe.get_common_site_config()
    expected = (config or {}).get("provisioning_api_token")
    if not expected or not isinstance(expected, str):
        return False, "INTERNAL_ERROR"

    auth = frappe.get_request_header("Authorization", "") or ""
    if not isinstance(auth, str) or not auth.startswith("Bearer "):
        return False, "AUTH_ERROR"

    token = auth[7:].strip()
    if not token:
        return False, "AUTH_ERROR"

    if not _constant_time_compare(expected, token):
        return False, "AUTH_ERROR"

    return True, None
