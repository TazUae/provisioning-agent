"""
Whitelisted provisioning methods.

Implemented: read_site_db_name, create_api_user
Stubbed: create_site, install_erp, enable_scheduler, add_domain

Every RPC uses ``@frappe.whitelist(methods=["POST"], allow_guest=True)`` and calls
``verify_token()`` first (``X-Provisioning-Token``); no Frappe session auth.

Success responses: ``{"success": True, "data": ...}``. Errors use ``frappe.throw`` only.
"""

from __future__ import annotations

import frappe
from frappe.exceptions import ValidationError

from provisioning_api.access import get_request_id
from provisioning_api.api_user_email import build_api_user_email
from provisioning_api.api_user_service import create_api_user_credentials
from provisioning_api.api_username_validation import ApiUsernameValidationError, validate_api_username
from provisioning_api.auth import verify_token
from provisioning_api.request_site import site_matches_request
from provisioning_api.site_validation import SiteValidationError, validate_site_name
from provisioning_api.utils.site_db import resolve_db_name_from_filesystem


def _log() -> object:
    return frappe.logger("provisioning_api.api.provisioning")


def _ok(data: dict) -> dict:
    return {"success": True, "data": data}


def _validate_site_matches_request(safe_site: str) -> tuple[bool, str | None]:
    current = frappe.get_site_name()
    if not site_matches_request(safe_site, current):
        return False, current
    return True, None


@frappe.whitelist(methods=["POST"], allow_guest=True)
def read_site_db_name(site_name: str | None = None) -> dict:
    """
    Return ``db_name`` from ``<sites_path>/<site_name>/site_config.json`` (read-only).

    ``sites_path`` is ``frappe.local.sites_path`` (never a hardcoded bench path).
    """
    verify_token()

    method = "read_site_db_name"
    req_id = get_request_id()
    log = _log()

    if site_name is None:
        site_name = frappe.form_dict.get("site_name")

    try:
        safe_site = validate_site_name(site_name)
    except SiteValidationError as e:
        frappe.throw(str(e), ValidationError)

    sites_path = getattr(frappe.local, "sites_path", None)
    if not sites_path:
        frappe.throw("Sites path is not available in this request context", ValidationError)

    db_name, err = resolve_db_name_from_filesystem(sites_path, safe_site)

    if err == "SITE_NOT_FOUND":
        frappe.local.response["http_status_code"] = 404
        frappe.throw(f"Site not found: {safe_site}", ValidationError)

    if err == "SITE_CONFIG_MISSING":
        frappe.local.response["http_status_code"] = 500
        frappe.throw("site_config.json is missing for this site", ValidationError)

    if err == "DB_NAME_MISSING":
        frappe.local.response["http_status_code"] = 500
        frappe.throw("db_name is missing or empty in site_config.json", ValidationError)

    if err == "INTERNAL_ERROR" or not db_name:
        frappe.local.response["http_status_code"] = 500
        frappe.throw("Could not read site configuration", ValidationError)

    log.info(
        "%s success request_id=%s site_name=%s outcome=ok",
        method,
        req_id or "-",
        safe_site,
    )
    return _ok({"site_name": safe_site, "db_name": db_name})


@frappe.whitelist(methods=["POST"], allow_guest=True)
def create_site(site_name: str | None = None) -> dict:
    verify_token()
    frappe.local.response["http_status_code"] = 501
    frappe.throw("create_site is not implemented yet", ValidationError)


@frappe.whitelist(methods=["POST"], allow_guest=True)
def install_erp(site_name: str | None = None) -> dict:
    verify_token()
    frappe.local.response["http_status_code"] = 501
    frappe.throw("install_erp is not implemented yet", ValidationError)


@frappe.whitelist(methods=["POST"], allow_guest=True)
def enable_scheduler(site_name: str | None = None) -> dict:
    verify_token()
    frappe.local.response["http_status_code"] = 501
    frappe.throw("enable_scheduler is not implemented yet", ValidationError)


@frappe.whitelist(methods=["POST"], allow_guest=True)
def add_domain(site_name: str | None = None, domain: str | None = None) -> dict:
    verify_token()
    frappe.local.response["http_status_code"] = 501
    frappe.throw("add_domain is not implemented yet", ValidationError)


@frappe.whitelist(methods=["POST"], allow_guest=True)
def create_api_user(site_name: str | None = None, api_username: str | None = None) -> dict:
    verify_token()

    method = "create_api_user"
    req_id = get_request_id()
    log = _log()

    if site_name is None:
        site_name = frappe.form_dict.get("site_name")
    if api_username is None:
        api_username = frappe.form_dict.get("api_username")

    try:
        safe_site = validate_site_name(site_name)
        safe_api = validate_api_username(api_username)
    except SiteValidationError as e:
        frappe.throw(str(e), ValidationError)
    except ApiUsernameValidationError as e:
        frappe.throw(str(e), ValidationError)

    ok, cur = _validate_site_matches_request(safe_site)
    if not ok:
        log.warning(
            "%s site_mismatch request_id=%s site_name=%s api_username=%s current_site=%s outcome=failure",
            method,
            req_id or "-",
            safe_site,
            safe_api,
            cur or "-",
        )
        frappe.throw("site_name must match the site handling this request", ValidationError)

    email = build_api_user_email(safe_api, safe_site)

    result = create_api_user_credentials(
        safe_site_name=safe_site,
        safe_api_username=safe_api,
        email=email,
    )

    if not result.get("ok"):
        err = result.get("error") or {}
        message = err.get("message", "Unexpected error")
        code = err.get("code", "INTERNAL_ERROR")
        if code == "USER_CREATION_FAILED":
            frappe.local.response["http_status_code"] = 400
        elif code == "API_KEY_GENERATION_FAILED":
            frappe.local.response["http_status_code"] = 500
        else:
            frappe.local.response["http_status_code"] = 500
        log.warning(
            "%s failed request_id=%s site_name=%s api_username=%s outcome=failure code=%s",
            method,
            req_id or "-",
            safe_site,
            safe_api,
            code,
        )
        frappe.throw(message, ValidationError)

    data = result["data"]
    has_secret = data.get("api_secret") is not None
    log.info(
        "%s success request_id=%s site_name=%s api_username=%s outcome=ok secret_issued=%s",
        method,
        req_id or "-",
        safe_site,
        safe_api,
        str(has_secret),
    )
    return _ok(data)
