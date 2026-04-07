# Provisioning agent — transitional architecture

## Current state (Phase 1)

- The agent authenticates **Control Plane** (`PROVISIONING_API_TOKEN`), validates minimal HTTP input, and calls **erp-execution-service** over HTTP (`ERP_REMOTE_*`).
- **Provisioning** still runs **temporary multi-step orchestration** in-process (`src/modules/provisioning/orchestrator.ts`): ordered lifecycle calls (`createSite` → … → `createApiUser`). Domain and API username may be supplied by the client or derived with **fallback rules** until Control Plane sends a full payload.
- The TypeScript client (`ErpExecutionServiceClient`) is the **only** execution path; bench/Docker/local backends were removed from this repository.

## Target state (thin bridge)

- **Single responsibility:** authenticate, forward, map errors, enforce timeouts.
- **ERP Execution** owns workflow: ideally `POST /v1/erp/provision` (or equivalent) replaces the agent-side loop.
- **Control Plane** owns retries, idempotency, and long-running orchestration policy.

## Do not remove orchestration prematurely

The in-agent orchestration exists **until** ERP Execution exposes a stable single-call provision API and Control Plane is updated. Deleting the orchestrator without that migration **breaks provisioning**.

## Migration steps (order matters)

1. Implement **`POST /v1/erp/provision`** (or named equivalent) on erp-execution-service; keep lifecycle actions for backward compatibility if needed.
2. Extend Control Plane to send **full provision payload** (`site_name`, `domain`, `api_username`, …) and to call the new endpoint (or keep the agent as a forwarder only).
3. Replace **`executeProvision`** in `ErpExecutionServiceClient` with a single HTTP call; delete `orchestrator.ts` when traffic is cut over.
4. Tighten **`site_name`** validation upstream and reduce agent validation to pure pass-through.

## Related code

- Orchestration: `src/modules/provisioning/orchestrator.ts`
- Execution client + future swap point: `src/clients/erp-execution-service-client.ts` (`executeProvision`)
- Public contract: `src/contracts/control-plane-api.ts`
