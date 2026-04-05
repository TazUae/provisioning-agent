"""Build a stable User email for provisioning API users from site_name + api_username."""

from __future__ import annotations


def build_api_user_email(api_username: str, site_name: str) -> str:
    """
    Derive a unique, valid-looking email for the User doc `name`/`email`.

    `site_name` and `api_username` must already be validated.
    Uses `<api_username>@<domain>` where domain is `site_name` if it contains a dot,
    otherwise `<site_name>.local` so short site slugs still form a valid domain part.
    """
    if "." in site_name:
        domain = site_name
    else:
        domain = f"{site_name}.local"
    return f"{api_username}@{domain}"
