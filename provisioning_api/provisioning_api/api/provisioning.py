"""
Whitelisted provisioning methods.

Implemented: read_site_db_name, create_api_user
Stubbed: create_site, install_erp, enable_scheduler, add_domain
"""

from __future__ import annotations

import frappe
from frappe.utils import get_site_config

from provisioning_api.access import check_provisioning_token_header, get_request_id
from provisioning_api.api_user_email import build_api_user_email
from provisioning_api.api_user_service import create_api_user_credentials
from provisioning_api.api_username_validation import ApiUsernameValidationError, validate_api_username
from provisioning_api.request_site import site_matches_request
from provisioning_api.site_db import resolve_db_name_with
from provisioning_api.site_validation import SiteValidationError, validate_site_name


def _log() -> object:
    return frappe.logger("provisioning_api.api.provisioning")


def _error_envelope(code: str, message: str) -> dict:
    return {"ok": False, "error": {"code": code, "message": message}}


def _success_envelope(data: dict) -> dict:
    return {"ok": True, "data": data}


def _set_http_status(status: int) -> None:
    frappe.local.response["http_status_code"] = status


def _not_implemented(method: str) -> dict:
    _set_http_status(501)
    return _error_envelope(
        "NOT_IMPLEMENTED",
        f"{method} is not implemented yet",
    )


def _validate_site_matches_request(safe_site: str) -> tuple[bool, str | None]:
    """Provisioning must target the site that is actually handling the HTTP request."""
    current = frappe.get_site_name()
    if not site_matches_request(safe_site, current):
        return False, current
    return True, None


@frappe.whitelist(methods=["POST"], allow_guest=True)
def read_site_db_name(site_name: str | None = None) -> dict:
    """
    Return the MariaDB database name for a bench site from site_config (via Frappe get_site_config).

    POST JSON: { "site_name": "..." }
    Auth: ``X-Provisioning-Token`` matching common_site_config ``provisioning_api_token`` (not ``Authorization: Bearer``).
    """
    method = "read_site_db_name"
    req_id = get_request_id()
    log = _log()

    if site_name is None:
        site_name = frappe.form_dict.get("site_name")

    try:
        safe_site = validate_site_name(site_name)
    except SiteValidationError as e:
        log.warning(
            "%s validation_failed request_id=%s outcome=failure code=VALIDATION_ERROR",
            method,
            req_id or "-",
        )
        _set_http_status(400)
        return _error_envelope("VALIDATION_ERROR", str(e))

    ok_auth, auth_code = check_provisioning_token_header()
    if not ok_auth:
        log.warning(
            "%s auth_failed request_id=%s site_name=%s outcome=failure code=%s",
            method,
            req_id or "-",
            safe_site,
            auth_code or "AUTH_ERROR",
        )
        status = 503 if auth_code == "INTERNAL_ERROR" else 401
        _set_http_status(status)
        msg = (
            "Provisioning API token is not configured"
            if auth_code == "INTERNAL_ERROR"
            else "Invalid or missing X-Provisioning-Token header"
        )
        return _error_envelope(auth_code or "AUTH_ERROR", msg)

    db_name, err = resolve_db_name_with(safe_site, get_site_config=get_site_config)

    if err == "SITE_NOT_FOUND" or not db_name:
        log.info(
            "%s site_not_found request_id=%s site_name=%s outcome=failure",
            method,
            req_id or "-",
            safe_site,
        )
        _set_http_status(404)
        return _error_envelope("SITE_NOT_FOUND", "Site could not be resolved or has no db_name")

    if err == "INTERNAL_ERROR":
        log.error(
            "%s internal_error request_id=%s site_name=%s outcome=failure",
            method,
            req_id or "-",
            safe_site,
        )
        _set_http_status(500)
        return _error_envelope("INTERNAL_ERROR", "Invalid site configuration")

    log.info(
        "%s success request_id=%s site_name=%s outcome=ok",
        method,
        req_id or "-",
        safe_site,
    )
    return _success_envelope({"site_name": safe_site, "db_name": db_name})


@frappe.whitelist(methods=["POST"], allow_guest=True)
def create_site(site_name: str | None = None) -> dict:
    return _not_implemented("create_site")


@frappe.whitelist(methods=["POST"], allow_guest=True)
def install_erp(site_name: str | None = None) -> dict:
    return _not_implemented("install_erp")


@frappe.whitelist(methods=["POST"], allow_guest=True)
def enable_scheduler(site_name: str | None = None) -> dict:
    return _not_implemented("enable_scheduler")


@frappe.whitelist(methods=["POST"], allow_guest=True)
def add_domain(site_name: str | None = None, domain: str | None = None) -> dict:
    return _not_implemented("add_domain")


@frappe.whitelist(methods=["POST"], allow_guest=True)
def create_api_user(site_name: str | None = None, api_username: str | None = None) -> dict:
    """
    Create or reuse a Website User with REST API credentials for this site.

    POST JSON: { "site_name": "...", "api_username": "..." }
    Auth: ``X-Provisioning-Token`` matching common_site_config ``provisioning_api_token`` (not ``Authorization: Bearer``).
    """
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
        log.warning(
            "%s validation_failed request_id=%s outcome=failure code=VALIDATION_ERROR",
            method,
            req_id or "-",
        )
        _set_http_status(400)
        return _error_envelope("VALIDATION_ERROR", str(e))
    except ApiUsernameValidationError as e:
        log.warning(
            "%s validation_failed request_id=%s outcome=failure code=VALIDATION_ERROR",
            method,
            req_id or "-",
        )
        _set_http_status(400)
        return _error_envelope("VALIDATION_ERROR", str(e))

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
        _set_http_status(400)
        return _error_envelope(
            "VALIDATION_ERROR",
            "site_name must match the site handling this request",
        )

    ok_auth, auth_code = check_provisioning_token_header()
    if not ok_auth:
        log.warning(
            "%s auth_failed request_id=%s site_name=%s api_username=%s outcome=failure code=%s",
            method,
            req_id or "-",
            safe_site,
            safe_api,
            auth_code or "AUTH_ERROR",
        )
        status = 503 if auth_code == "INTERNAL_ERROR" else 401
        _set_http_status(status)
        msg = (
            "Provisioning API token is not configured"
            if auth_code == "INTERNAL_ERROR"
            else "Invalid or missing X-Provisioning-Token header"
        )
        return _error_envelope(auth_code or "AUTH_ERROR", msg)

    email = build_api_user_email(safe_api, safe_site)

    result = create_api_user_credentials(
        safe_site_name=safe_site,
        safe_api_username=safe_api,
        email=email,
    )

    if not result.get("ok"):
        err = result.get("error") or {}
        code = err.get("code", "INTERNAL_ERROR")
        message = err.get("message", "Unexpected error")
        status_map = {
            "USER_CREATION_FAILED": 400,
            "API_KEY_GENERATION_FAILED": 500,
        }
        _set_http_status(status_map.get(code, 500))
        log.warning(
            "%s failed request_id=%s site_name=%s api_username=%s outcome=failure code=%s",
            method,
            req_id or "-",
            safe_site,
            safe_api,
            code,
        )
        return _error_envelope(code, message)

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
    return _success_envelope(data)
