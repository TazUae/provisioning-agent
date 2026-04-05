"""Unit tests for API user email derivation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from provisioning_api.api_user_email import build_api_user_email  # noqa: E402


class TestApiUserEmail(unittest.TestCase):
    def test_site_with_dot(self) -> None:
        self.assertEqual(
            build_api_user_email("apiuser", "erp.company.com"),
            "apiuser@erp.company.com",
        )

    def test_site_without_dot(self) -> None:
        self.assertEqual(
            build_api_user_email("apiuser", "abc-site"),
            "apiuser@abc-site.local",
        )


if __name__ == "__main__":
    unittest.main()
