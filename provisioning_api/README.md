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

Clients must send:

`Authorization: Bearer <same value as provisioning_api_token>`

Optional tracing header (logged, not required):

`X-Request-Id: <correlation-id>`

## Implemented methods

| Dotted path | Status |
|-------------|--------|
| `provisioning_api.api.provisioning.read_site_db_name` | **Implemented** |
| `provisioning_api.api.provisioning.create_site` | Stub (`NOT_IMPLEMENTED`, HTTP 501) |
| `provisioning_api.api.provisioning.install_erp` | Stub |
| `provisioning_api.api.provisioning.enable_scheduler` | Stub |
| `provisioning_api.api.provisioning.add_domain` | Stub |
| `provisioning_api.api.provisioning.create_api_user` | Stub |

### `read_site_db_name`

Resolves the MariaDB database name for a site by reading that site’s configuration via **`frappe.utils.get_site_config`** (Frappe’s normal `site_config.json` resolution). No `bench` CLI, no shell, and no fake success responses.

**Request:** `POST` JSON body

```json
{
  "site_name": "my-site"
}
```

**Success envelope** (returned as Frappe `message`; see below):

```json
{
  "ok": true,
  "data": {
    "site_name": "my-site",
    "db_name": "_xxxxxxxxxxxxxxxx"
  }
}
```

**Frappe HTTP wrapper:** the JSON above is typically nested under `message` in the HTTP response body, for example:

```json
{
  "message": {
    "ok": true,
    "data": { "site_name": "my-site", "db_name": "_xxxxxxxxxxxxxxxx" }
  }
}
```

## Failure codes (`error.code`)

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | `site_name` missing or invalid (3–50 chars, `a-z`, `0-9`, `-`) |
| `AUTH_ERROR` | 401 | Missing/invalid `Authorization: Bearer` |
| `INTERNAL_ERROR` | 500 / 503 | Misconfiguration (e.g. `provisioning_api_token` not set) or invalid site config shape |
| `SITE_NOT_FOUND` | 404 | Site cannot be resolved or `db_name` absent in config |
| `NOT_IMPLEMENTED` | 501 | Stub methods only |

**Error envelope:**

```json
{
  "ok": false,
  "error": {
    "code": "SITE_NOT_FOUND",
    "message": "Site could not be resolved or has no db_name"
  }
}
```

## Logging

Structured log lines include method name, `site_name`, optional request id, and success/failure. Secrets and bearer tokens are **not** logged.

## Manual verification (example)

Replace host, site, and token. Use a real site name that exists on the bench.

```bash
curl -sS -X POST "https://<your-erp-host>/api/method/provisioning_api.api.provisioning.read_site_db_name" \
  -H "Authorization: Bearer <provisioning_api_token>" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: manual-test-1" \
  -d "{\"site_name\":\"<valid-site-name>\"}"
```

Expect `message.ok === true` and `message.data.db_name` matching the site’s `db_name` in `sites/<site>/site_config.json`.

## Tests (no Frappe runtime)

From the repository root (tests add the app root to `sys.path` themselves):

```bash
python -m unittest discover -s provisioning_api/tests -p "test_*.py" -v
```

On Windows, if `python` is not on `PATH`, use `py -3` instead of `python`.

## Assumptions and limitations

- **Site name validation** matches `provisioning-agent` rules (lowercase alphanumeric + hyphen, length 3–50).
- **DB resolution** relies on Frappe’s `get_site_config(site=...)` inside a normal request context (`frappe.local.sites_path` must be correct). If that context is wrong, resolution may fail with `INTERNAL_ERROR` or `SITE_NOT_FOUND`.
- **Bearer tokens** are compared with a constant-time digest check (SHA-256) so client and configured token lengths do not need to match.
