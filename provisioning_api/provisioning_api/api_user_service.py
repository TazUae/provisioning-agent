"""
Create or reuse a Website User with API keys using Frappe document APIs.

Idempotency (documented in README):
- If the User already exists and already has an `api_key`, we do **not** rotate secrets.
  We return `api_key` and `api_secret: null` because the secret is stored as a Password
  field and cannot be read back.
- If the User exists but has no `api_key`, we generate key + secret (same pattern as
  `frappe.core.doctype.user.user.generate_keys`).
- New users get the **Website User** role only (least privilege for token-based API access).
"""

from __future__ import annotations

from typing import Any

PROVISIONING_ROLE = "Website User"


def _ensure_website_user_role(user_doc: Any) -> None:
    roles = {r.role for r in (user_doc.roles or [])}
    if PROVISIONING_ROLE not in roles:
        user_doc.append("roles", {"role": PROVISIONING_ROLE})
        user_doc.flags.ignore_permissions = True
        user_doc.save(ignore_permissions=True)
    user_doc.reload()


def create_api_user_credentials(
    *,
    safe_site_name: str,
    safe_api_username: str,
    email: str,
) -> dict[str, Any]:
    """
    Returns a result dict:
      { "ok": True, "data": { ... } }
    or
      { "ok": False, "error": { "code": str, "message": str } }
    """
    import frappe

    log = frappe.logger("provisioning_api.api_user_service")

    user_doc: Any

    try:
        if frappe.db.exists("User", email):
            user_doc = frappe.get_doc("User", email)
            if getattr(user_doc, "user_type", None) and user_doc.user_type != "Website User":
                return {
                    "ok": False,
                    "error": {
                        "code": "USER_CREATION_FAILED",
                        "message": "A user with this email already exists with a different user type",
                    },
                }
            _ensure_website_user_role(user_doc)
        else:
            user_doc = frappe.get_doc(
                {
                    "doctype": "User",
                    "email": email,
                    "first_name": (safe_api_username[:140] if safe_api_username else "API"),
                    "send_welcome_email": 0,
                    "enabled": 1,
                    "user_type": "Website User",
                    "language": "en",
                }
            )
            user_doc.append("roles", {"role": PROVISIONING_ROLE})
            user_doc.new_password = frappe.generate_hash(length=40)
            user_doc.flags.ignore_password_policy = True
            user_doc.insert(ignore_permissions=True)
            log.info("api_user_inserted email=%s", email)
    except Exception as e:
        log.error("api_user_insert_failed email=%s error=%s", email, type(e).__name__)
        return {
            "ok": False,
            "error": {
                "code": "USER_CREATION_FAILED",
                "message": "Could not create or load User",
            },
        }

    if not user_doc.enabled:
        return {
            "ok": False,
            "error": {
                "code": "USER_CREATION_FAILED",
                "message": "User exists but is disabled",
            },
        }

    # Idempotent path: key already issued — secret cannot be retrieved from Password field.
    if user_doc.get("api_key"):
        return {
            "ok": True,
            "data": {
                "site_name": safe_site_name,
                "api_username": safe_api_username,
                "user": user_doc.name,
                "api_key": user_doc.api_key,
                "api_secret": None,
            },
        }

    api_secret_plain = frappe.generate_hash(length=15)
    try:
        if not user_doc.get("api_key"):
            user_doc.api_key = frappe.generate_hash(length=15)
        user_doc.api_secret = api_secret_plain
        user_doc.flags.ignore_permissions = True
        user_doc.save(ignore_permissions=True)
    except Exception as e:
        log.error("api_key_save_failed email=%s error=%s", email, type(e).__name__)
        return {
            "ok": False,
            "error": {
                "code": "API_KEY_GENERATION_FAILED",
                "message": "Could not generate API credentials",
            },
        }

    return {
        "ok": True,
        "data": {
            "site_name": safe_site_name,
            "api_username": safe_api_username,
            "user": user_doc.name,
            "api_key": user_doc.api_key,
            "api_secret": api_secret_plain,
        },
    }
