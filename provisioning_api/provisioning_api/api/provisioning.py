"""
Whitelisted provisioning methods.

Implemented: read_site_db_name
Stubbed: create_site, install_erp, enable_scheduler, add_domain, create_api_user
"""

from __future__ import annotations

import frappe
from frappe.utils import get_site_config

from provisioning_api.access import check_provisioning_bearer, get_request_id
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


@frappe.whitelist(methods=["POST"], allow_guest=True)
def read_site_db_name(site_name: str | None = None) -> dict:
    """
    Return the MariaDB database name for a bench site from site_config (via Frappe get_site_config).

    POST JSON: { "site_name": "..." }
    Auth: Bearer token matching common_site_config `provisioning_api_token`.
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

    ok_auth, auth_code = check_provisioning_bearer()
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
            else "Invalid or missing bearer token"
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
    return _not_implemented("create_api_user")
