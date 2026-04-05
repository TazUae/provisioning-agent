"""Site name validation aligned with provisioning-agent `validateSite` (3–50 chars, lowercase alphanumeric + hyphen)."""

from __future__ import annotations

import re

SITE_PATTERN = re.compile(r"^[a-z0-9-]+$")
MIN_LEN = 3
MAX_LEN = 50


class SiteValidationError(ValueError):
    """Raised when `site_name` fails format/length checks."""


def validate_site_name(site_name: str | None) -> str:
    if site_name is None or not isinstance(site_name, str):
        raise SiteValidationError("site_name is required")
    s = site_name.strip()
    if len(s) < MIN_LEN or len(s) > MAX_LEN:
        raise SiteValidationError("site_name length must be between 3 and 50 characters")
    if not SITE_PATTERN.match(s):
        raise SiteValidationError("site_name must contain only lowercase letters, digits, and hyphens")
    return s
