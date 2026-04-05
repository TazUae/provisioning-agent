"""Frappe site name validation: lowercase hostname / FQDN (DNS labels), not arbitrary text."""

from __future__ import annotations

import re

# One DNS hostname label: alphanumeric ends; hyphens allowed inside; max 63 (RFC 1035).
_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")

MIN_LEN = 3
# Max total length for a DNS name (RFC 1035 / common FQDN cap).
MAX_LEN = 253


class SiteValidationError(ValueError):
    """Raised when `site_name` fails format/length checks."""


def _labels_valid(s: str) -> bool:
    if ".." in s or s.startswith(".") or s.endswith("."):
        return False
    labels = s.split(".")
    if not labels:
        return False
    for label in labels:
        if not label or len(label) > 63:
            return False
        if not _LABEL.fullmatch(label):
            return False
    return True


def validate_site_name(site_name: str | None) -> str:
    """
    Validate ``site_name`` as the Frappe site identifier (typically the request hostname).

    Accepts lowercase FQDN-style names (e.g. ``erp.example.com``,
    ``tenant1.erp.example.com``) and single-label names (e.g. ``abc-site``) that obey
    DNS hostname rules: labels of letters, digits, interior hyphens; dots only as
    separators. Rejects uppercase, underscores, empty labels, shell/path metacharacters,
    and other non-hostname input.
    """
    if site_name is None or not isinstance(site_name, str):
        raise SiteValidationError("site_name is required")
    s = site_name.strip()
    if not s:
        raise SiteValidationError("site_name is required")
    if len(s) < MIN_LEN or len(s) > MAX_LEN:
        raise SiteValidationError(
            f"site_name length must be between {MIN_LEN} and {MAX_LEN} characters"
        )
    if any(c.isupper() for c in s):
        raise SiteValidationError(
            "site_name must be a valid lowercase hostname (FQDN-style); uppercase is not allowed"
        )
    if not _labels_valid(s):
        raise SiteValidationError(
            "site_name must be a valid hostname: lowercase letters, digits, hyphens within "
            "labels, dots between labels (no leading/trailing dots, no empty labels)"
        )
    return s


def parse_site_name(site_name: str | None) -> str:
    """Alias for :func:`validate_site_name` (valid Frappe site / hostname string)."""
    return validate_site_name(site_name)
