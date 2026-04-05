"""Resolve MariaDB database name for a Frappe site from `site_config.json` via Frappe APIs only."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any


def resolve_db_name_with(
    site_name: str,
    *,
    get_site_config: Callable[..., dict[str, Any]],
) -> tuple[str | None, str | None]:
    """
    Returns (db_name, error_code).
    error_code is SITE_NOT_FOUND, INTERNAL_ERROR, or None on success.
    """
    try:
        config = get_site_config(site=site_name)
    except Exception:
        return None, "SITE_NOT_FOUND"

    if not isinstance(config, dict):
        return None, "INTERNAL_ERROR"

    db_name = config.get("db_name")
    if not isinstance(db_name, str):
        return None, "SITE_NOT_FOUND"

    db_name = db_name.strip()
    if not db_name:
        return None, "SITE_NOT_FOUND"

    return db_name, None
