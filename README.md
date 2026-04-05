# provisioning-agent

Internal-only provisioning service for ERP host actions.

## Purpose

- Exposes a narrow HTTP API for approved provisioning actions.
- Uses token auth (`Authorization: Bearer <PROVISIONING_API_TOKEN>`).
- Executes only allowlisted ERP operations through the typed **`ErpExecutionBackend`** interface (`src/providers/erpnext/erp-execution-backend.ts`).
- **Production** uses **`ERP_EXECUTION_BACKEND=remote`**: `RemoteErpBackend` calls the ERP-side lifecycle HTTP API (`POST /v1/erp/lifecycle`, contract in `remote-contract.ts`) and fails fast if required remote config is missing.
- **`docker`** is an explicit **dev/test** bridge (`DockerExecBackend`): strict `docker exec` argv only. It requires Docker CLI and a socket on the **host** — the default container image does **not** include Docker; do not assume this mode works inside the slim image.
- No arbitrary shell execution, no `bash -c`, no generic bench passthrough, no generic Docker control.

## Execution backends

| Mode | When to use | Requirements |
|------|----------------|--------------|
| **`remote`** | **Production** (default in production when `ERP_EXECUTION_BACKEND` is unset) | `ERP_REMOTE_BASE_URL`, `ERP_REMOTE_TOKEN`; optional `ERP_REMOTE_TIMEOUT_MS` |
| **`docker`** | Local/dev or hosts with Docker CLI + socket | `ERP_CONTAINER_NAME`, bench-related vars; in **`NODE_ENV=production`** also `ERP_DOCKER_ALLOW_IN_PRODUCTION=true` |

**Defaults:**

- **`NODE_ENV=production`**: if `ERP_EXECUTION_BACKEND` is unset, the backend is **`remote`** (not docker).
- **`development` / `test`**: if unset, the backend is **`docker`** for local workflows.

Set `ERP_EXECUTION_BACKEND` explicitly in every deployment to avoid ambiguity.

## Endpoints

- `GET /health` — liveness: process up; does not call the ERP backend.
- `GET /health/ready` — readiness: if `ERP_HEALTH_CHECK_DOWNSTREAM=true`, probes the configured ERP execution backend (`healthCheck`); otherwise returns ready without a downstream call (see below).
- `POST /sites/create`
- `POST /sites/install-erp`
- `POST /sites/enable-scheduler`
- `POST /sites/add-domain`
- `POST /sites/create-api-user`

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:
   - `npm install`
3. Run in development:
   - `npm run dev`
4. Build:
   - `npm run build`
5. Start built service:
   - `npm start`

## Deployment (Dokploy / production)

### Production checklist

- `NODE_ENV=production`
- **`ERP_EXECUTION_BACKEND=remote`** (recommended explicit; if omitted, production still defaults to `remote`)
- **`ERP_REMOTE_BASE_URL`** — base URL of the ERP-side executor (HTTPS or internal HTTP)
- **`ERP_REMOTE_TOKEN`** — bearer token shared with the executor
- **`PROVISIONING_API_TOKEN`**, **`ERP_ADMIN_PASSWORD`**, and other app secrets as below

### Container

- Build context: `provisioning-agent`
- Dockerfile: `provisioning-agent/Dockerfile`
- Internal port: `8080`
- **No Docker CLI** in the image; the service is a stateless orchestration/gateway. Production ERP work runs **remotely** via `remote` mode.
- **erp-utils** is copied and built as a local package (see Dockerfile).
- Liveness: `GET /health`
- Optional readiness with downstream probe: `GET /health/ready` with `ERP_HEALTH_CHECK_DOWNSTREAM=true`

### Internal-Only Posture

- Do not publish this service on a public domain by default.
- Attach the container only to internal/private networks in Dokploy.
- Allow inbound traffic only from trusted internal services (for example, the Control Plane API).
- Recommended Dokploy setup: no public ingress/domain, internal service name `provisioning-agent`, and shared private network with Control Plane.

### Required environment variables (production)

Always:

- `NODE_ENV=production`
- `PORT=8080` (or your platform default)
- `PROVISIONING_API_TOKEN=<long-random-internal-token>`
- `ERP_ADMIN_PASSWORD=<erp-admin-password>`
- `ERP_BENCH_PATH=/home/frappe/frappe-bench` (contract/metadata; remote mode does not run bench locally)
- `ERP_BASE_DOMAIN=<internal-base-domain>`
- `ERP_API_USERNAME_PREFIX=cp`
- `ERP_COMMAND_TIMEOUT_MS=120000`

**Remote backend (production):**

- `ERP_EXECUTION_BACKEND=remote` (recommended explicit)
- `ERP_REMOTE_BASE_URL=<executor-base-url>`
- `ERP_REMOTE_TOKEN=<shared-bearer-token>`
- `ERP_REMOTE_TIMEOUT_MS` — optional (default `15000`)

**Docker backend (non-production or exceptional production host):**

- `ERP_EXECUTION_BACKEND=docker`
- `ERP_CONTAINER_NAME=<erp-backend-container>`
- If `NODE_ENV=production`: **`ERP_DOCKER_ALLOW_IN_PRODUCTION=true`** (acknowledges docker mode on a host that actually has Docker CLI/socket access)

### Networking assumptions

- `provisioning-agent` and `control-plane-api` are on the same internal Docker network.
- The service name `provisioning-agent` is resolvable via internal DNS on that network.
- Control Plane calls the agent through an internal URL, not a public endpoint.
- In **remote** mode, `ERP_REMOTE_BASE_URL` must reach the ERP-side executor on the private network.

### Example Control Plane URL

- `http://provisioning-agent:8080`
- Control Plane should set `PROVISIONING_API_URL=http://provisioning-agent:8080` in deployment configuration.

### Health expectations

- **Liveness (orchestrator up):** `GET /health` — HTTP `200`, `ok: true`, `data.status: "ok"`.
- **Readiness (optional downstream):** configure `ERP_HEALTH_CHECK_DOWNSTREAM=true` and use `GET /health/ready`. On success, HTTP `200` with `data.downstream.probed: true` and timing metadata. On downstream failure, HTTP `503` with the standard error envelope. If `ERP_HEALTH_CHECK_DOWNSTREAM` is unset/false, `GET /health/ready` returns `200` with `data.downstream.probed: false` (no network call to the ERP backend).

## Notes

- This service is designed for internal network deployment only.
- No generic command execution endpoint is provided; **no arbitrary command execution** — only typed backend methods (`createSite`, `installErp`, etc.), never raw bench or shell passthrough.
- Response envelopes are contract-aligned for Control Plane integration.
- ERP execution is allowlisted per action; the docker backend uses `spawn` with argv only (no shell).
- Further detail: `docs/erp-execution-backend.md`.
