# ERP-side execution interface (provisioning)

## Site create

**Endpoint:** `POST /sites/create` on **erp-execution-service** (full URL: `POST ${ERP_REMOTE_BASE_URL}/sites/create`, e.g. `http://erp-execution-service:8790/sites/create`).

**Headers**

- `Authorization: Bearer <ERP_REMOTE_TOKEN>`
- `Content-Type: application/json`

**Body (flat JSON only)**

```json
{
  "siteName": "<string>",
  "domain": "<string>",
  "apiUsername": "<string>"
}
```

**Response**

Structured success/failure envelope as implemented in `src/providers/erpnext/remote-contract.ts` and consumed by `ErpExecutionServiceClient`.

## Auth

Missing or invalid auth must fail without executing site creation.
