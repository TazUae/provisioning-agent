"""Read MariaDB ``db_name`` for a Frappe site from ``site_config.json`` (filesystem only, no shell)."""

from __future__ import annotations

import json
from pathlib import Path

# Avoid reading arbitrarily large JSON.
_MAX_SITE_CONFIG_BYTES = 1_048_576


def resolve_db_name_from_filesystem(
    sites_path: str | Path,
    site_name: str,
) -> tuple[str | None, str | None]:
    """
    Read ``db_name`` from ``<sites_path>/<site_name>/site_config.json``.

    ``site_name`` must already pass hostname validation (no path traversal). Only
    the ``db_name`` field is used; ``db_password`` and other secrets are never returned.

    Returns ``(db_name, error_code)`` where ``error_code`` is ``None`` on success, else one of:
    ``SITE_NOT_FOUND``, ``SITE_CONFIG_MISSING``, ``DB_NAME_MISSING``, ``INTERNAL_ERROR``.
    """
    try:
        base = Path(sites_path).resolve()
    except OSError:
        return None, "INTERNAL_ERROR"

    try:
        site_dir = (base / site_name).resolve()
    except OSError:
        return None, "INTERNAL_ERROR"

    try:
        site_dir.relative_to(base)
    except ValueError:
        return None, "INTERNAL_ERROR"

    if not site_dir.is_dir():
        return None, "SITE_NOT_FOUND"

    config_path = site_dir / "site_config.json"
    if not config_path.is_file():
        return None, "SITE_CONFIG_MISSING"

    try:
        size = config_path.stat().st_size
    except OSError:
        return None, "INTERNAL_ERROR"

    if size > _MAX_SITE_CONFIG_BYTES:
        return None, "INTERNAL_ERROR"

    try:
        raw = config_path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None, "INTERNAL_ERROR"

    if not isinstance(data, dict):
        return None, "INTERNAL_ERROR"

    db_name = data.get("db_name")
    if not isinstance(db_name, str):
        return None, "DB_NAME_MISSING"

    db_name = db_name.strip()
    if not db_name:
        return None, "DB_NAME_MISSING"

    return db_name, None
