"""Unit tests for filesystem db_name resolution (tmp dirs, no Frappe runtime)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from provisioning_api.site_db import resolve_db_name_from_filesystem


class TestResolveDbNameFromFilesystem(unittest.TestCase):
    def test_success_reads_db_name(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site = root / "erp.example.com"
            site.mkdir(parents=True)
            (site / "site_config.json").write_text(
                json.dumps({"db_name": "_some_db", "db_password": "secret"}),
                encoding="utf-8",
            )

            db, err = resolve_db_name_from_filesystem(root, "erp.example.com")
            self.assertIsNone(err)
            self.assertEqual(db, "_some_db")

    def test_missing_site_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            db, err = resolve_db_name_from_filesystem(root, "missing.example.com")
            self.assertIsNone(db)
            self.assertEqual(err, "SITE_NOT_FOUND")

    def test_missing_site_config_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site = root / "erp.example.com"
            site.mkdir(parents=True)

            db, err = resolve_db_name_from_filesystem(root, "erp.example.com")
            self.assertIsNone(db)
            self.assertEqual(err, "SITE_CONFIG_MISSING")

    def test_missing_db_name_in_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site = root / "erp.example.com"
            site.mkdir(parents=True)
            (site / "site_config.json").write_text(
                json.dumps({"db_password": "x"}),
                encoding="utf-8",
            )

            db, err = resolve_db_name_from_filesystem(root, "erp.example.com")
            self.assertIsNone(db)
            self.assertEqual(err, "DB_NAME_MISSING")

    def test_empty_db_name_in_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site = root / "erp.example.com"
            site.mkdir(parents=True)
            (site / "site_config.json").write_text(
                json.dumps({"db_name": "   "}),
                encoding="utf-8",
            )

            db, err = resolve_db_name_from_filesystem(root, "erp.example.com")
            self.assertIsNone(db)
            self.assertEqual(err, "DB_NAME_MISSING")

    def test_invalid_json_returns_internal_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            site = root / "erp.example.com"
            site.mkdir(parents=True)
            (site / "site_config.json").write_text("{not json", encoding="utf-8")

            db, err = resolve_db_name_from_filesystem(root, "erp.example.com")
            self.assertIsNone(db)
            self.assertEqual(err, "INTERNAL_ERROR")


if __name__ == "__main__":
    unittest.main()
