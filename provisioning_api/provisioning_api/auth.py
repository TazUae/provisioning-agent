"""
Central provisioning auth: ``X-Provisioning-Token`` only (no Frappe session / desk login).

Expected secret is read from ``common_site_config.json`` via the same logic as
``check_provisioning_token_header`` (constant-time compare, no token logging).
"""

from __future__ import annotations

import frappe
from frappe.exceptions import PermissionError

from provisioning_api.access import check_provisioning_token_header


def verify_token() -> None:
    """
    Require a valid ``X-Provisioning-Token`` matching ``provisioning_api_token``.

    On failure, raises ``frappe.throw`` with ``PermissionError`` (never returns).
    """
    ok, code = check_provisioning_token_header()
    if ok:
        return
    if code == "INTERNAL_ERROR":
        frappe.throw("Provisioning API token is not configured", PermissionError)
    frappe.throw("Missing or invalid provisioning token", PermissionError)
