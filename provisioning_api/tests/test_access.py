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


class TestProvisioningTokenHeader(unittest.TestCase):
    def setUp(self) -> None:
        self.frappe = sys.modules["frappe"]
        self.frappe.reset_mock()

    def _make_headers(self, headers: dict[str, str | None]):
        """Return get_request_header(name, default) that resolves from ``headers``."""

        def gh(name: str, default: str = "") -> str:
            if name in headers and headers[name] is not None:
                return headers[name] or default
            return default

        return gh

    def test_valid_x_provisioning_token_accepted(self) -> None:
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "expected-token"}
        self.frappe.get_request_header = self._make_headers(
            {"X-Provisioning-Token": "expected-token"}
        )

        ok, code = access.check_provisioning_token_header()
        self.assertTrue(ok)
        self.assertIsNone(code)

    def test_valid_lowercase_header_name(self) -> None:
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "secret-value"}
        self.frappe.get_request_header = self._make_headers(
            {"x-provisioning-token": "secret-value"}
        )

        ok, code = access.check_provisioning_token_header()
        self.assertTrue(ok)
        self.assertIsNone(code)

    def test_missing_header_rejected(self) -> None:
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "expected-token"}
        self.frappe.get_request_header = self._make_headers({})

        ok, code = access.check_provisioning_token_header()
        self.assertFalse(ok)
        self.assertEqual(code, "AUTH_ERROR")

    def test_wrong_token_rejected(self) -> None:
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "expected-token"}
        self.frappe.get_request_header = self._make_headers(
            {"X-Provisioning-Token": "other"}
        )

        ok, code = access.check_provisioning_token_header()
        self.assertFalse(ok)
        self.assertEqual(code, "AUTH_ERROR")

    def test_authorization_bearer_not_used_for_internal_auth(self) -> None:
        """OAuth-style Bearer must not satisfy provisioning (only X-Provisioning-Token does)."""
        self.frappe.get_common_site_config.return_value = {"provisioning_api_token": "expected-token"}
        self.frappe.get_request_header = self._make_headers(
            {
                "Authorization": "Bearer expected-token",
                "X-Provisioning-Token": None,
            }
        )

        ok, code = access.check_provisioning_token_header()
        self.assertFalse(ok)
        self.assertEqual(code, "AUTH_ERROR")

    def test_token_not_configured(self) -> None:
        self.frappe.get_common_site_config.return_value = {}
        self.frappe.get_request_header = self._make_headers({"X-Provisioning-Token": "x"})

        ok, code = access.check_provisioning_token_header()
        self.assertFalse(ok)
        self.assertEqual(code, "INTERNAL_ERROR")


class TestRequestId(unittest.TestCase):
    def setUp(self) -> None:
        self.frappe = sys.modules["frappe"]
        self.frappe.reset_mock()

    def test_get_request_id_reads_canonical_header(self) -> None:
        def gh(name: str, default: str = "") -> str:
            if name == "X-Request-Id":
                return "req-abc"
            return default

        self.frappe.get_request_header = gh
        self.assertEqual(access.get_request_id(), "req-abc")

    def test_get_request_id_falls_back_to_lowercase(self) -> None:
        def gh(name: str, default: str = "") -> str:
            if name == "x-request-id":
                return "req-low"
            return default

        self.frappe.get_request_header = gh
        self.assertEqual(access.get_request_id(), "req-low")


if __name__ == "__main__":
    unittest.main()
