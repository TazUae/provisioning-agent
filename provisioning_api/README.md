# provisioning_api (Frappe app)

Internal ERP-side Frappe app that exposes a **narrow, allowlisted** HTTP API for provisioning automation. Callers use Frappe’s standard endpoint:

`POST /api/method/<dotted.path>`

This app is intended to run **inside the ERP bench** (same host/filesystem as sites). Downstream services (for example `provisioning-agent` / `erp-execution-service`) must **not** depend on bench paths or `site_config.json`; they call into this layer instead.

## Installation

From your bench directory:

```bash
bench get-app /path/to/provisioning-agent/provisioning_api
bench --site <admin-site> install-app provisioning_api
```

(`<admin-site>` is any site you use for maintenance—often the default site that serves the desk.)

## Configuration

Set a shared secret in **`sites/common_site_config.json`** (bench root):

```json
{
  "provisioning_api_token": "<long-random-secret>"
}
```

Restart bench / gunicorn after changing common site config.

### Authentication (required)

Clients must send the same value as `provisioning_api_token` in this **custom header**:

`X-Provisioning-Token: <same value as provisioning_api_token>`

**Do not** send this secret as `Authorization: Bearer …`. Frappe interprets `Authorization: Bearer` as **OAuth** bearer handling before this app’s code runs, which leads to **`401 AuthenticationError`** before `provisioning_api` can validate the internal token.

Internal provisioning RPCs are **guest-callable at the Frappe layer** (`@frappe.whitelist(allow_guest=True, …)`): callers use `POST /api/method/...` **without** a logged-in Desk user or API key session. **No logged-in Frappe user is required** for this internal flow. Actual protection is **`require_provisioning_access()`**, which validates **`X-Provisioning-Token`** against **`provisioning_api_token`** in `common_site_config.json` only (no `require_api_auth` / session checks). These endpoints are **not** public; they remain protected by that shared secret.

Optional tracing header (logged, not required):

`X-Request-Id: <correlation-id>`

## Implemented methods

| Dotted path | Status |
|-------------|--------|
| `provisioning_api.api.provisioning.read_site_db_name` | **Implemented** |
| `provisioning_api.api.provisioning.create_api_user` | **Implemented** |
| `provisioning_api.api.provisioning.create_site` | Stub (`NOT_IMPLEMENTED`, HTTP 501) |
| `provisioning_api.api.provisioning.install_erp` | Stub |
| `provisioning_api.api.provisioning.enable_scheduler` | Stub |
| `provisioning_api.api.provisioning.add_domain` | Stub |

### `read_site_db_name`

`site_name` is the **Frappe site name** (typically the multitenant hostname / site key), for example `erp.example.com` or `tenant1.erp.example.com`. Resolves the MariaDB database name by reading that site’s configuration via **`frappe.utils.get_site_config`** (Frappe’s normal `site_config.json` resolution). No `bench` CLI, no shell, and no fake success responses.

**Request:** `POST` JSON body

```json
{
  "site_name": "erp.example.com"
}
```

**Success envelope** (returned as Frappe `message`; see below):

```json
{
  "ok": true,
  "data": {
    "site_name": "erp.example.com",
    "db_name": "_xxxxxxxxxxxxxxxx"
  }
}
```

### `create_api_user`

Creates or reuses a **Website User** with REST API credentials (`api_key` / `api_secret`) for **the site that is handling the HTTP request**. The caller must send `site_name` equal to **`frappe.get_site_name()`** for that request (same site as the Host / site context). Operations use normal Frappe `User` document APIs and the same key assignment pattern as Frappe’s `generate_keys` (no bench, no shell).

**Role model (least privilege):**

- New users are created with **`user_type` = `Website User`** and **only** the **`Website User`** role (standard Frappe role). No System Manager, Administrator, or broad desk roles are granted by this method.
- If a User with the same derived email already exists with **another** `user_type`, the call fails with `USER_CREATION_FAILED` (email collision).
- If an existing Website User is missing the `Website User` role, it is appended before key handling.

**Derived email (User `name` / `email`):**

- `api_username@<site_domain>` where `<site_domain>` is `site_name` if it contains a dot, otherwise `<site_name>.local` (e.g. `apiuser@abc-site.local`).

**Idempotency / secrets:**

- **First time** (new user, or existing user **without** `api_key`): generates `api_key` and `api_secret`; **returns both** (plain `api_secret` only at issuance—same rule as Frappe UI “Generate Keys”).
- **Subsequent calls** when `api_key` **already exists**: **does not rotate** keys. Returns **`api_key`** and **`api_secret`: `null`** because the secret is stored as a **Password** field and cannot be read back from the database. Callers must store the secret from the first successful `issued` response.

**Request:** `POST` JSON body

```json
{
  "site_name": "erp.example.com",
  "api_username": "integration_user"
}
```

**Success envelope:**

```json
{
  "ok": true,
  "data": {
    "site_name": "erp.example.com",
    "api_username": "integration_user",
    "user": "integration_user@erp.example.com",
    "api_key": "xxxxxxxxxxxxxxx",
    "api_secret": "xxxxxxxxxxxxxxx"
  }
}
```

When credentials were **already** issued earlier, `api_secret` is JSON **`null`** (see idempotency above).

**Frappe HTTP wrapper:** the JSON above is typically nested under `message` in the HTTP response body, for example:

```json
{
  "message": {
    "ok": true,
    "data": { "site_name": "...", "api_username": "...", "user": "...", "api_key": "...", "api_secret": "..." }
  }
}
```

Use API authentication as documented in Frappe (e.g. `Authorization: token <api_key>:<api_secret>`).

## Failure codes (`error.code`)

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | `site_name` / `api_username` invalid, or `site_name` does not match the site handling the request |
| `AUTH_ERROR` | 401 | Missing/invalid `X-Provisioning-Token` (or wrong value vs `provisioning_api_token`) |
| `INTERNAL_ERROR` | 500 / 503 | Misconfiguration (e.g. `provisioning_api_token` not set) or invalid site config shape |
| `SITE_NOT_FOUND` | 404 | (`read_site_db_name`) Site cannot be resolved or `db_name` absent |
| `USER_CREATION_FAILED` | 400 | User insert/load failed, disabled user, wrong `user_type` for existing email, etc. |
| `API_KEY_GENERATION_FAILED` | 500 | Saving API credentials failed |
| `NOT_IMPLEMENTED` | 501 | Stub methods only |

**Error envelope:**

```json
{
  "ok": false,
  "error": {
    "code": "USER_CREATION_FAILED",
    "message": "Could not create or load User"
  }
}
```

## Logging

Structured log lines include method name, `site_name`, `api_username` (for `create_api_user`), optional request id, and success/failure. **`api_secret`**, **`X-Provisioning-Token`**, and **`Authorization`** values are **not** logged.

## Manual verification (example)

Replace host, site, token, and usernames. The request must go to the **same** site as `site_name`.

```bash
curl -sS -X POST "https://<your-erp-host>/api/method/provisioning_api.api.provisioning.create_api_user" \
  -H "X-Provisioning-Token: <provisioning_api_token>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: manual-test-1" \
  -d "{\"site_name\":\"<same-as-site>\",\"api_username\":\"integration_user\"}"
```

`read_site_db_name` example:

```bash
curl -sS -X POST "https://<your-erp-host>/api/method/provisioning_api.api.provisioning.read_site_db_name" \
  -H "X-Provisioning-Token: <provisioning_api_token>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: manual-test-1" \
  -d "{\"site_name\":\"<valid-site-name>\"}"
```

Expect `message.ok === true` and `message.data` as documented.

## Tests (no Frappe runtime)

From the repository root (tests add the app root to `sys.path` themselves):

```bash
python -m unittest discover -s provisioning_api/tests -p "test_*.py" -v
```

On Windows, if `python` is not on `PATH`, use `py -3` instead of `python`.

## Assumptions and limitations

- **Site name validation** accepts lowercase **hostname / FQDN** site names (DNS labels: letters, digits, interior hyphens; dots between labels), length 3–253, as used for Frappe DNS-based multitenant sites—not arbitrary free text.
- **`api_username`** matches `provisioning-agent` username rules (lowercase after trim, 3–64 chars, `[a-z][a-z0-9_.-]{2,63}`).
- **DB resolution** (`read_site_db_name`) relies on Frappe’s `get_site_config(site=...)` inside a normal request context (`frappe.local.sites_path` must be correct).
- **Provisioning tokens** are compared with a constant-time digest check (SHA-256) so configured and submitted token lengths do not need to match.
- **`create_api_user`** only affects the **current site’s** database; `site_name` must match the active request site.
- **Website User** + token auth is minimal; if your integration requires extra roles for specific ERPNext endpoints, grant them deliberately in Desk (outside this automated path).
