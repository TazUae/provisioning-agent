# Provisioning agent — architecture

## Phase 1

- The agent authenticates **Control Plane** (`PROVISIONING_API_TOKEN`), validates HTTP input, and calls **erp-execution-service** over HTTP (`ERP_REMOTE_*`).
- **Provisioning** is a single forward: **`POST ${ERP_REMOTE_BASE_URL}/sites/create`** with flat JSON `{ siteName, domain, apiUsername }`. Workflow and ERP/Frappe work live in the executor.
- The TypeScript client (`ErpExecutionServiceClient`) is the **only** execution path in this repository.

## Responsibilities

- **provisioning-agent:** auth, input validation, pass-through to the executor URL, error mapping, timeouts.
- **erp-execution-service:** create-site workflow and ERP execution.
- **Control Plane:** retries, idempotency, and orchestration policy upstream of this service.

## Related code

- Execution client: `src/clients/erp-execution-service-client.ts`
- Public contract: `src/contracts/control-plane-api.ts`
