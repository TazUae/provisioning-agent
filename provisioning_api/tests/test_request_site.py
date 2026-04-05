"""Unit tests for site vs request matching."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from provisioning_api.request_site import site_matches_request  # noqa: E402


class TestRequestSite(unittest.TestCase):
    def test_matches(self) -> None:
        self.assertTrue(site_matches_request("mysite", "mysite"))

    def test_mismatch(self) -> None:
        self.assertFalse(site_matches_request("site-a", "site-b"))


if __name__ == "__main__":
    unittest.main()
