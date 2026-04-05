"""Verify provisioning RPC methods are guest-whitelisted; token auth is tested in test_access."""

from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock

_APP_ROOT = str(Path(__file__).resolve().parents[1])


def _install_frappe_whitelist_mock() -> None:
    """Minimal frappe stub so @frappe.whitelist records kwargs (no bench)."""

    def whitelist(**kwargs):
        def decorator(f):
            f.__frappe_whitelist__ = kwargs
            return f

        return decorator

    # Real module objects so ``from frappe.utils import get_site_config`` works.
    frappe_mod = types.ModuleType("frappe")
    frappe_mod.__path__ = []  # treat as package so ``frappe.exceptions`` can load
    frappe_mod.whitelist = whitelist
    frappe_mod.logger = MagicMock(return_value=MagicMock())
    frappe_mod.local = MagicMock()
    frappe_mod.local.response = {}
    frappe_mod.form_dict = {}
    frappe_mod.get_site_name = MagicMock(return_value="test-site")
    frappe_mod.get_request_header = MagicMock(return_value="")
    frappe_mod.throw = MagicMock(side_effect=RuntimeError("throw"))
    sys.modules["frappe"] = frappe_mod

    exc_mod = types.ModuleType("frappe.exceptions")

    class ValidationError(Exception):
        pass

    class PermissionError(Exception):
        pass

    exc_mod.ValidationError = ValidationError
    exc_mod.PermissionError = PermissionError
    sys.modules["frappe.exceptions"] = exc_mod

    utils_mod = types.ModuleType("frappe.utils")
    utils_mod.get_site_config = MagicMock()
    sys.modules["frappe.utils"] = utils_mod


class TestProvisioningWhitelist(unittest.TestCase):
    """Frappe must allow Guest to hit /api/method/...; access is enforced via X-Provisioning-Token."""

    @classmethod
    def setUpClass(cls) -> None:
        sys.path.insert(0, _APP_ROOT)
        _install_frappe_whitelist_mock()
        if "provisioning_api.api.provisioning" in sys.modules:
            del sys.modules["provisioning_api.api.provisioning"]
        import provisioning_api.api.provisioning as prov  # noqa: E402

        cls.prov = prov

    _RPC_NAMES = (
        "read_site_db_name",
        "create_site",
        "install_erp",
        "enable_scheduler",
        "add_domain",
        "create_api_user",
    )

    def test_each_method_whitelist_allows_guest_and_post(self) -> None:
        for name in self._RPC_NAMES:
            fn = getattr(self.prov, name)
            kw = getattr(fn, "__frappe_whitelist__", None)
            self.assertIsNotNone(kw, f"{name} must use @frappe.whitelist(...)")
            self.assertTrue(
                kw.get("allow_guest"),
                f"{name} must use allow_guest=True for token-based Guest calls",
            )
            self.assertEqual(kw.get("methods"), ["POST"])


if __name__ == "__main__":
    unittest.main()
