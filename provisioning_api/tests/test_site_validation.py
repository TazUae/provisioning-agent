"""Unit tests for site name validation (no Frappe runtime)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from provisioning_api.site_validation import SiteValidationError, parse_site_name, validate_site_name


class TestSiteValidation(unittest.TestCase):
    def test_valid_slug_style(self) -> None:
        self.assertEqual(validate_site_name("  abc-site  "), "abc-site")

    def test_valid_fqdn_examples(self) -> None:
        for s in (
            "erp.zaidan-group.com",
            "trainer1.erp.zaidan-group.com",
            "abc-123.example.com",
            "tenant-01.erp.local",
        ):
            with self.subTest(site=s):
                self.assertEqual(validate_site_name(s), s)

    def test_parse_site_name_alias(self) -> None:
        self.assertEqual(parse_site_name("erp.zaidan-group.com"), "erp.zaidan-group.com")

    def test_invalid_empty(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("")
        with self.assertRaises(SiteValidationError):
            validate_site_name("   ")

    def test_invalid_uppercase(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("ERP.zaidan-group.com")

    def test_invalid_too_short(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("ab")

    def test_invalid_underscore_in_label(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("bad_name.example.com")

    def test_invalid_double_dot(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("bad..example.com")

    def test_invalid_leading_hyphen_in_label(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("-bad.example.com")

    def test_invalid_trailing_hyphen_in_label(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("bad-.example.com")

    def test_invalid_path_traversal(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("../evil")

    def test_invalid_shell_injection_like(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("evil;rm -rf /")

    def test_invalid_chars_slug(self) -> None:
        with self.assertRaises(SiteValidationError):
            validate_site_name("abc_site")


if __name__ == "__main__":
    unittest.main()
