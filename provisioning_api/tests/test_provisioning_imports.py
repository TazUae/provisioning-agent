"""Packaging invariants: modules.txt must not duplicate the app name (Frappe migrate imports ``app.<line>``)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_APP_ROOT = str(Path(__file__).resolve().parents[1])


class TestProvisioningPackageLayout(unittest.TestCase):
    def test_modules_txt_first_module_is_api_not_app_name(self) -> None:
        """``bench migrate`` calls ``get_module(f\"{app}.{module}\")`` for each line in modules.txt."""
        modules_file = Path(_APP_ROOT) / "provisioning_api" / "modules.txt"
        self.assertTrue(modules_file.is_file(), "modules.txt must exist under the app package")
        lines = [ln.strip() for ln in modules_file.read_text(encoding="utf-8").splitlines() if ln.strip()]
        self.assertIn("api", lines, "Frappe module folder for RPCs must be listed (import provisioning_api.api)")
        self.assertNotIn(
            "provisioning_api",
            lines,
            "Do not list the app name as a module line; that forces import provisioning_api.provisioning_api",
        )

    def test_top_level_package_importable(self) -> None:
        sys.path.insert(0, _APP_ROOT)
        import provisioning_api as pkg  # noqa: E402

        self.assertTrue(hasattr(pkg, "__version__"))

    def test_api_subpackage_importable_without_loading_provisioning(self) -> None:
        """``api`` is a real package (``__init__.py``) so ``provisioning_api.api`` resolves."""
        sys.path.insert(0, _APP_ROOT)
        import provisioning_api.api as api_pkg  # noqa: E402

        self.assertTrue(hasattr(api_pkg, "__file__"))


if __name__ == "__main__":
    unittest.main()
