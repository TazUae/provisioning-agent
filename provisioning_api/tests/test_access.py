"""Auth helper tests with stub `frappe` in sys.modules (no bench)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

if "frappe" not in sys.modules:
    sys.modules["frappe"] = MagicMock()

import provisioning_api.access as access  # noqa: E402


class TestProvisioningBearer(unittest.TestCase):
    def setUp(self) -> None:
        self.frappe = sys.modules["frappe"]
        self.frappe.reset_mock()

    def _make_header_fn(self, authorization: str | None):
        def gh(name: str, default: str = "") -> str:
            if name == "Authorization":
                return authorization if authorization is not None else default
            return default

        return gh

    def test_valid_token(self) -> None:
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "expected-token"}
        self.frappe.get_request_header = self._make_header_fn("Bearer expected-token")

        ok, code = access.check_provisioning_bearer()
        self.assertTrue(ok)
        self.assertIsNone(code)

    def test_missing_header(self) -> None:
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "expected-token"}
        self.frappe.get_request_header = self._make_header_fn(None)

        ok, code = access.check_provisioning_bearer()
        self.assertFalse(ok)
        self.assertEqual(code, "AUTH_ERROR")

    def test_wrong_token(self) -> None:
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "expected-token"}
        self.frappe.get_request_header = self._make_header_fn("Bearer other")

        ok, code = access.check_provisioning_bearer()
        self.assertFalse(ok)
        self.assertEqual(code, "AUTH_ERROR")

    def test_token_not_configured(self) -> None:
        self.frappe.get_common_site_config.return_value = {}
        self.frappe.get_request_header = self._make_header_fn("Bearer x")

        ok, code = access.check_provisioning_bearer()
        self.assertFalse(ok)
        self.assertEqual(code, "INTERNAL_ERROR")


if __name__ == "__main__":
    unittest.main()
