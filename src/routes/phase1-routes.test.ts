import test from "node:test";
import assert from "node:assert/strict";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";

process.env.PROVISIONING_API_TOKEN ??= "test-provisioning-token-phase1-routes";
process.env.ERP_ADMIN_PASSWORD ??= "test-admin-password";

test("GET /health returns stable success contract", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "x" }),
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { success: boolean; data: { status: string; service: string } };
  assert.equal(body.success, true);
  assert.equal(body.data.status, "ok");
  assert.equal(body.data.service, "provisioning-agent");
  await app.close();
});

test("POST /sites/read-db-name returns db_name on success", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "_tenant_db" }),
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({
    method: "POST",
    url: "/sites/read-db-name",
    headers: {
      authorization: `Bearer ${process.env.PROVISIONING_API_TOKEN}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ site_name: "acme.example.com" }),
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { success: boolean; data: { db_name: string } };
  assert.equal(body.success, true);
  assert.equal(body.data.db_name, "_tenant_db");
  await app.close();
});

test("POST /sites/read-db-name without Bearer returns AUTH_ERROR", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "x" }),
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({
    method: "POST",
    url: "/sites/read-db-name",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ site_name: "acme.example.com" }),
  });
  assert.equal(res.statusCode, 401);
  const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, "AUTH_ERROR");
  await app.close();
});

test("POST /sites/read-db-name maps SITE_NOT_FOUND from client", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({
      ok: false,
      code: "SITE_NOT_FOUND",
      message: "missing",
    }),
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({
    method: "POST",
    url: "/sites/read-db-name",
    headers: {
      authorization: `Bearer ${process.env.PROVISIONING_API_TOKEN}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ site_name: "nope.example.com" }),
  });
  assert.equal(res.statusCode, 404);
  const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, "SITE_NOT_FOUND");
  await app.close();
});
