"""Unit tests for site name validation (no Frappe runtime)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from provisioning_api.site_validation import SiteValidationError, validate_site_name


class TestSiteValidation(unittest.TestCase):
    def test_valid_site_name(self) -> None:
        self.assertEqual(validate_site_name("  abc-site  "), "abc-site")

    def test_invalid_empty(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("")

    def test_invalid_uppercase(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("AbC-site")

    def test_invalid_too_short(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("ab")

    def test_invalid_chars(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("abc_site")


if __name__ == "__main__":
    unittest.main()
