# ERP execution integration

## Current state

`provisioning-agent` talks to **erp-execution-service** over HTTP using **`ERP_REMOTE_BASE_URL`**, **`ERP_REMOTE_TOKEN`**, and **`ERP_REMOTE_TIMEOUT_MS`**.

- **Site provisioning:** `POST ${ERP_REMOTE_BASE_URL}/sites/create` with `Content-Type: application/json` and `Authorization: Bearer <ERP_REMOTE_TOKEN>`. Request body is flat: `{ "siteName", "domain", "apiUsername" }`.
- **Read DB name (if supported by the executor):** `POST ${ERP_REMOTE_BASE_URL}/sites/read-db-name` with flat `{ "siteName" }` (see `ErpExecutionServiceClient.readDbName`).

The Phase 1 gateway is `ErpExecutionServiceClient` in `src/clients/erp-execution-service-client.ts`. Success and failure responses are parsed using the envelope types in `src/providers/erpnext/remote-contract.ts`.

## Error model

Executor failures use a structured envelope; the agent maps them to public `PublicErrorCode` values for Control Plane. Raw upstream details are not exposed beyond safe fields.
