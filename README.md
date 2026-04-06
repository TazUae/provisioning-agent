# provisioning-agent

Stable provisioning interface between **Control Plane** and **erp-execution-service** (ERP/Frappe work stays in the executor).

## Architecture (Phase 1)

```
Control Plane → provisioning-agent → erp-execution-service → ERP / Frappe
```

This service is an **orchestration and normalization** layer only: it authenticates callers, validates inputs, calls the executor over HTTP, and maps responses to a stable JSON contract. It does not run bench, Docker, or Frappe directly in production.

## Phase 1 endpoints

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/health` | No |
| `POST` | `/sites/read-db-name` | `Authorization: Bearer <PROVISIONING_API_TOKEN>` |

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

`site_name` must be a valid Frappe-style site slug (`^[a-z0-9-]+$`, length 3–50) or a lowercase FQDN.

## Environment variables

### Required to run the server

| Variable | Purpose |
|----------|---------|
| `PROVISIONING_API_TOKEN` | Bearer token Control Plane uses (minimum 16 characters). |
| `ERP_ADMIN_PASSWORD` | Retained for compatibility with shared config and future phases (≥ 8 characters). |
| `ERP_EXECUTION_BASE_URL` | Base URL of **erp-execution-service** (e.g. `http://erp-execution-service:8081`). |
| `ERP_EXECUTION_TOKEN` | Bearer token provisioning-agent uses to call the executor. |

**Compatibility:** you may instead set `ERP_REMOTE_BASE_URL` and `ERP_REMOTE_TOKEN` (same values as before); `ERP_EXECUTION_*` is preferred.

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | Listen port. |
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. |
| `ERP_EXECUTION_TIMEOUT_MS` | `15000` (or `ERP_REMOTE_TIMEOUT_MS`) | HTTP timeout for executor calls. |

Other variables (`ERP_BENCH_PATH`, `ERP_BASE_DOMAIN`, `ERP_EXECUTION_BACKEND`, etc.) remain in `.env.example` for tooling and future phases; Phase 1 runtime paths use **only** the HTTP executor client above.

## Local development

1. Copy `.env.example` to `.env` and set `PROVISIONING_API_TOKEN`, `ERP_ADMIN_PASSWORD`, `ERP_EXECUTION_BASE_URL`, and `ERP_EXECUTION_TOKEN` (point `ERP_EXECUTION_BASE_URL` at a running erp-execution-service).
2. `npm install`
3. `npm run dev`

Build and run compiled:

- `npm run build`
- `npm start`

## Docker Compose

The stack expects a **pre-created** Docker network named `control-plane` so the agent resolves alongside Control Plane:

```bash
docker network create control-plane
export PROVISIONING_API_TOKEN=...
export ERP_ADMIN_PASSWORD=...
export ERP_EXECUTION_BASE_URL=http://erp-execution-service:8081
export ERP_EXECUTION_TOKEN=...
docker compose up -d --build
```

- **Service name / DNS:** `provisioning-agent` (see `container_name` and `hostname` in `docker-compose.yml`).
- **Internal port:** `8080`.
- **Healthcheck:** `GET /health` (see `Dockerfile` and `docker-compose.yml`).

## Deployment notes

- Run behind the private network only; do not expose to the public internet without additional controls.
- Control Plane should call `http://provisioning-agent:8080` (or your internal equivalent) on the shared `control-plane` network.
- Set strong, unique values for `PROVISIONING_API_TOKEN` (Control Plane) and `ERP_EXECUTION_TOKEN` (executor); rotate independently.
- Ensure `ERP_EXECUTION_BASE_URL` is reachable from the provisioning-agent container (same Docker network or routed internal URL).

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

- Executor HTTP contract (lifecycle): `docs/erp-execution-backend.md`
- `POST /v1/erp/lifecycle` payload: `src/providers/erpnext/remote-contract.ts`
