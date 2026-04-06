# ERP execution backend

## Current state

`provisioning-agent` executes ERP lifecycle actions through the typed `ErpExecutionBackend` interface:

- `createSite`
- `installErp`
- `enableScheduler`
- `addDomain`
- `createApiUser`
- `healthCheck`

Backend selection is controlled by `ERP_EXECUTION_BACKEND` (see `src/config/env.ts`):

- **`remote`** — **production** target: `RemoteErpBackend` calls the ERP-side **`erp-execution-service`** (`POST /v1/erp/lifecycle`, typed contract in `remote-contract.ts`). Prefer **`ERP_EXECUTION_BASE_URL`** and **`ERP_EXECUTION_TOKEN`** (or legacy `ERP_REMOTE_BASE_URL` / `ERP_REMOTE_TOKEN`) and optional **`ERP_EXECUTION_TIMEOUT_MS`** (or `ERP_REMOTE_TIMEOUT_MS`). The Phase 1 HTTP gateway (`ErpExecutionServiceClient`) uses the same lifecycle endpoint for `readSiteDbName`. In `NODE_ENV=production`, if `ERP_EXECUTION_BACKEND` is unset, the backend defaults to **`remote`**.
- **`docker`** — dev/test bridge: `DockerExecBackend` — **temporary** compatibility only; needs Docker CLI on the host. In `development`/`test`, if unset, defaults to **`docker`**. In `NODE_ENV=production`, docker requires `ERP_DOCKER_ALLOW_IN_PRODUCTION=true`.

## Important constraints

- `DockerExecBackend` is a **temporary bridge backend**, not the final production architecture.
- No arbitrary shell execution.
- No `bash -c`.
- No user-controlled command interpolation.
- No generic bench passthrough.
- No generic Docker control exposed upstream.

All commands are argv-based (`spawn(..., { shell: false })`) with strict timeout and error mapping.

## Error model

Execution failures are mapped to structured safe codes:

- `INFRA_UNAVAILABLE`
- `ERP_COMMAND_FAILED`
- `ERP_TIMEOUT`
- `ERP_VALIDATION_FAILED`
- `ERP_PARTIAL_SUCCESS`
- `SITE_ALREADY_EXISTS`
- `SITE_NOT_FOUND`

Upper/public layers receive only safe fields:

- `code`
- `message`
- `retryable`
- optional non-sensitive `details`

Raw command stdout/stderr stay internal.

## Migration path: docker -> remote

1. Keep current Control Plane orchestration and route contract unchanged.
2. Keep queue/worker/state-machine flow unchanged.
3. Deploy **`erp-execution-service`** on the ERP side (see [`docs/erp-side-execution-service.md`](../../docs/erp-side-execution-service.md)).
4. `RemoteErpBackend` in this repo already targets that contract; set `ERP_REMOTE_BASE_URL` / `ERP_REMOTE_TOKEN` / `ERP_REMOTE_TIMEOUT_MS`.
5. Set `ERP_EXECUTION_BACKEND=remote` in production (or rely on production default `remote` when unset); non-production defaults to `docker` when unset.
6. Remove `DockerExecBackend` only after successful rollout and validation.
