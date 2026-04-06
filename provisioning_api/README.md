# provisioning_api (Frappe app)

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for bench layout, `modules.txt`, `pip install -e`, and migrate troubleshooting.

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

Internal provisioning RPCs are **guest-callable at the Frappe layer** (`@frappe.whitelist(allow_guest=True, …)`): callers use `POST /api/method/...` **without** a logged-in Desk user or API key session. **No logged-in Frappe user is required** for this internal flow. Every method calls **`verify_token()`** in `provisioning_api.auth`, which validates **`X-Provisioning-Token`** against **`provisioning_api_token`** in `common_site_config.json` (constant-time compare via `check_provisioning_token_header` in `access.py`). There is **no** reliance on Frappe session auth. These endpoints are **not** public; they remain protected by that shared secret.

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

**Implemented:** read-only lookup of the MariaDB database name for a site.

`site_name` is the **Frappe site name** (typically the multitenant hostname / site key), for example `erp.example.com` or `tenant1.erp.example.com`. The app resolves ``<bench>/sites/<site_name>/site_config.json`` using **`frappe.local.sites_path`**, reads JSON only (no shell, no `bench` commands), and returns the **`db_name`** field. **`db_password`** is never read into the response. No writes are performed.

**Request:** `POST` JSON body

```json
{
  "site_name": "erp.example.com"
}
```

**Success response** (typically nested under Frappe’s `message` key):

```json
{
  "success": true,
  "data": {
    "site_name": "erp.example.com",
    "db_name": "_xxxxxxxxxxxxxxxx"
  }
}
```

**Errors** use **`frappe.throw`** (no custom `{ ok: false, error: {…} }` envelope). Typical cases: missing/invalid token (`PermissionError`), validation (`ValidationError`), missing site/config/db_name (`ValidationError` with appropriate HTTP status set where applicable).

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

**Success response:**

```json
{
  "success": true,
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
    "success": true,
    "data": { "site_name": "...", "api_username": "...", "user": "...", "api_key": "...", "api_secret": "..." }
  }
}
```

Use API authentication as documented in Frappe (e.g. `Authorization: token <api_key>:<api_secret>`).

## Errors

Failures are returned via **`frappe.throw`** (Frappe’s standard exception response), not a custom `{ ok: false, error: { code } }` JSON body. Typical cases:

| Situation | HTTP (typical) | Notes |
|-----------|----------------|--------|
| Missing/invalid `X-Provisioning-Token` | 403 / 401 | `PermissionError` from `verify_token()` |
| Token not configured on server | 500 / 503 | `Provisioning API token is not configured` |
| Invalid `site_name` / `api_username` / site mismatch | 400 | `ValidationError` |
| Site directory missing (`read_site_db_name`) | 404 | `ValidationError` (“Site not found: …”) |
| Missing `site_config.json` or `db_name` | 500 | `ValidationError` with message describing the problem |
| `create_api_user` user/key errors | 400 / 500 | `ValidationError` with service message |
| Stub methods | 501 | `ValidationError` (“… not implemented yet”) |

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

Expect `message.success === true` and `message.data` as documented.

## Tests (no Frappe runtime)

From the repository root (tests add the app root to `sys.path` themselves):

```bash
python -m unittest discover -s provisioning_api/tests -p "test_*.py" -v
```

On Windows, if `python` is not on `PATH`, use `py -3` instead of `python`.

## Assumptions and limitations

- **Site name validation** accepts lowercase **hostname / FQDN** site names (DNS labels: letters, digits, interior hyphens; dots between labels), length 3–253, as used for Frappe DNS-based multitenant sites—not arbitrary free text.
- **`api_username`** matches `provisioning-agent` username rules (lowercase after trim, 3–64 chars, `[a-z][a-z0-9_.-]{2,63}`).
- **DB resolution** (`read_site_db_name`) reads ``<sites_path>/<site_name>/site_config.json`` on disk (`frappe.local.sites_path` must be set in the request context).
- **Provisioning tokens** are compared with a constant-time digest check (SHA-256) so configured and submitted token lengths do not need to match.
- **`create_api_user`** only affects the **current site’s** database; `site_name` must match the active request site.
- **Website User** + token auth is minimal; if your integration requires extra roles for specific ERPNext endpoints, grant them deliberately in Desk (outside this automated path).
