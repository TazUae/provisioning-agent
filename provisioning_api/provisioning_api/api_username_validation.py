"""api_username validation aligned with provisioning-agent `validateUsername` (3–64 chars, lowercase)."""

from __future__ import annotations

import re

USERNAME_PATTERN = re.compile(r"^[a-z][a-z0-9_.-]{2,63}$")
MIN_LEN = 3
MAX_LEN = 64


class ApiUsernameValidationError(ValueError):
    """Raised when `api_username` fails format/length checks."""


def validate_api_username(api_username: str | None) -> str:
    if api_username is None or not isinstance(api_username, str):
        raise ApiUsernameValidationError("api_username is required")
    u = api_username.strip().lower()
    if len(u) < MIN_LEN or len(u) > MAX_LEN:
        raise ApiUsernameValidationError(
            "api_username length must be between 3 and 64 characters"
        )
    if not USERNAME_PATTERN.match(u):
        raise ApiUsernameValidationError(
            "api_username must start with a letter and contain only lowercase letters, digits, "
            "underscore, dot, or hyphen"
        )
    return u
