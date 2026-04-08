# provisioning-agent

Stable provisioning interface between **Control Plane** and **erp-execution-service** (ERP/Frappe work stays in the executor).

## Architecture (Phase 1)

```
Control Plane → provisioning-agent → erp-execution-service → ERP / Frappe
```

This service authenticates callers, validates inputs, forwards **`POST /sites/create`** on **erp-execution-service** with flat JSON (`siteName`, `domain`, `apiUsername`), and maps responses to a stable JSON contract. The agent does not run bench, Docker, or Frappe.

## Phase 1 endpoints

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/health` | No |
| `POST` | `/sites/read-db-name` | `Authorization: Bearer <PROVISIONING_API_TOKEN>` |
| `POST` | `/provision` | `Authorization: Bearer <PROVISIONING_API_TOKEN>` |
| `POST` | `/sites/create` | `Authorization: Bearer <PROVISIONING_API_TOKEN>` |

### Response shape (Control Plane contract)

**Success**

```json
{ "success": true, "data": { ... } }
```

**Failure**

```json
{ "success": false, "error": { "code": "<typed_code>", "message": "<safe_message>" } }
```

`POST /sites/read-db-name` success payload:

```json
{ "success": true, "data": { "db_name": "<string>" } }
```

Typed error codes include: `AUTH_ERROR`, `VALIDATION_ERROR`, `SITE_NOT_FOUND`, `UPSTREAM_TIMEOUT`, `UPSTREAM_HTTP_ERROR`, `INVALID_UPSTREAM_RESPONSE`, `INTERNAL_ERROR`.

### Request body (`POST /sites/read-db-name`)

```json
{ "site_name": "<site-slug-or-fqdn>" }
```

`site_name` is an opaque non-empty string (max 2048 chars); stricter rules are enforced upstream.

### Request body (`POST /provision` and `POST /sites/create`)

`POST /provision` (snake_case):

```json
{
  "site_name": "<string>",
  "domain": "<fqdn>",
  "api_username": "<string>"
}
```

`POST /sites/create` (camelCase, equivalent after validation):

```json
{
  "siteName": "<string>",
  "domain": "<fqdn>",
  "apiUsername": "<string>"
}
```

The agent forwards these fields to the executor as **`POST ${ERP_REMOTE_BASE_URL}/sites/create`** with body `{ "siteName", "domain", "apiUsername" }`.

## Environment variables

The full key set is listed in **`.env.example`** (placeholders only). In production, set real values in **Dokploy** (see **Deployment**). Do not treat a committed `.env` file as authoritative for production.

### Required to run the server

| Variable | Purpose |
|----------|---------|
| `PROVISIONING_API_TOKEN` | Bearer token Control Plane uses (minimum 16 characters). |
| `ERP_REMOTE_BASE_URL` | Base URL of **erp-execution-service** (e.g. `http://erp-execution-service:8790`). |
| `ERP_REMOTE_TOKEN` | Bearer token provisioning-agent uses to call the executor. |

### Optional (defaults in `src/config/env.ts`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | Listen port. |
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. |
| `ERP_REMOTE_TIMEOUT_MS` | `15000` | HTTP timeout for executor calls. |

Phase 1 HTTP routes use only the **erp-execution-service** client (`ERP_REMOTE_*`). Site creation is delegated with `POST ${ERP_REMOTE_BASE_URL}/sites/create` (flat JSON: `siteName`, `domain`, `apiUsername`).

## Local development

Use **`.env.example` as the template only**: copy it to `.env` (gitignored), then edit values for your machine. You can also set variables in your shell (for example `export PROVISIONING_API_TOKEN=...`). Do not commit `.env` or real secrets.

1. `npm install`
2. `npm run dev`

Build and run compiled:

- `npm run build`
- `npm start`

To verify your local `.env` keys match the template (names only, not values):

```bash
bash scripts/check-env-keys.sh
```

## Deployment

**Dokploy is the single source of truth for production runtime configuration.** Define every variable the app needs in **Dokploy → Environment** for this service. Production containers must not depend on a committed or stale `.env` file in the repo.

- **`.env.example`** in this repository is the **schema / template** (safe placeholders only). It documents required keys; it is not loaded in production by Dokploy.
- **`.env`** is **local development only** (gitignored). Copy from `.env.example` when working on your laptop; it is not the production source of truth.
- **`docker-compose.dokploy.yml`** maps each variable explicitly with `environment:` and `${VAR}` so values come from the Dokploy (host) environment at deploy time—not from `env_file:`.
- **After you change environment variables in Dokploy**, **redeploy** the service so running containers receive the updates.

For non-Dokploy installs (for example systemd on a VM), create an environment file **on the server only** (restricted permissions, ops-owned) and reference it from the unit; do not copy production secrets from this repository.

## Docker Compose

**Local (`docker-compose.yml`):** uses `env_file: .env` so a developer can keep secrets in a local `.env`. The external **`erp-execution`** network must already exist on the host (for example created by the erp-execution-service stack). See comments at the top of `docker-compose.yml`.

**Production / Dokploy:** use `docker-compose.yml` together with `docker-compose.dokploy.yml` (see Dokploy project settings). Set variables in Dokploy; Compose will interpolate `${VAR}` in the override from the process environment (and from a project `.env` file if present on the build host **only** for substitution—not as the in-container secret source when using the Dokploy override).

Example local build:

```bash
docker compose -f docker-compose.yml -f docker-compose.dokploy.yml up -d --build
```

- **Service name:** `provisioning-agent`.
- **Internal port:** `8080` by default (`PORT`).
- **Healthcheck:** `GET /health` (see `Dockerfile` and `docker-compose.yml`).

## Smoke tests

**Health (no auth):**

```bash
curl -sS "http://127.0.0.1:8080/health"
```

**Read DB name (replace token and site):**

```bash
curl -sS -X POST "http://127.0.0.1:8080/sites/read-db-name" \
  -H "Authorization: Bearer ${PROVISIONING_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"site_name\":\"your-site.example.com\"}"
```

## Further reading

- Architecture: `docs/architecture.md`
- Executor integration notes: `docs/erp-execution-backend.md`
- Upstream response envelope parsing: `src/providers/erpnext/remote-contract.ts`
