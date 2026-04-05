"""Unit tests for api_username validation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from provisioning_api.api_username_validation import (  # noqa: E402
    ApiUsernameValidationError,
    validate_api_username,
)


class TestApiUsernameValidation(unittest.TestCase):
    def test_valid(self) -> None:
        self.assertEqual(validate_api_username("  Api_User  "), "api_user")

    def test_invalid_empty(self) -> None:
        with self.assertRaises(ApiUsernameValidationError):
            validate_api_username("")

    def test_invalid_starts_with_digit(self) -> None:
        with self.assertRaises(ApiUsernameValidationError):
            validate_api_username("1ab")

    def test_invalid_too_short(self) -> None:
        with self.assertRaises(ApiUsernameValidationError):
            validate_api_username("ab")

    def test_uppercase_normalized(self) -> None:
        self.assertEqual(validate_api_username("ApiUser"), "apiuser")

    def test_invalid_at_sign(self) -> None:
        with self.assertRaises(ApiUsernameValidationError):
            validate_api_username("bad@user")


if __name__ == "__main__":
    unittest.main()
