"""Unit tests for DB name resolution helper (mocked get_site_config)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from provisioning_api.site_db import resolve_db_name_with


class TestSiteDb(unittest.TestCase):
    def test_site_found_returns_db_name(self) -> None:
        def fake(site: str | None = None, **_kwargs):
            self.assertEqual(site, "abc-site")
            return {"db_name": "_abc123"}

        db, err = resolve_db_name_with("abc-site", get_site_config=fake)
        self.assertIsNone(err)
        self.assertEqual(db, "_abc123")

    def test_site_missing_returns_site_not_found(self) -> None:
        def boom(**_kwargs):
            raise OSError("no such site")

        db, err = resolve_db_name_with("missing", get_site_config=boom)
        self.assertIsNone(db)
        self.assertEqual(err, "SITE_NOT_FOUND")

    def test_empty_db_name_returns_site_not_found(self) -> None:
        def fake(**_kwargs):
            return {"db_name": "   "}

        db, err = resolve_db_name_with("x", get_site_config=fake)
        self.assertIsNone(db)
        self.assertEqual(err, "SITE_NOT_FOUND")

    def test_non_dict_config_returns_internal_error(self) -> None:
        def fake(**_kwargs):
            return "bad"

        db, err = resolve_db_name_with("x", get_site_config=fake)
        self.assertIsNone(db)
        self.assertEqual(err, "INTERNAL_ERROR")


if __name__ == "__main__":
    unittest.main()
