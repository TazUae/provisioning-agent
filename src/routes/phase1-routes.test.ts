import test from "node:test";
import assert from "node:assert/strict";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";

process.env.PROVISIONING_API_TOKEN ??= "test-provisioning-token-phase1-routes";
process.env.ERP_REMOTE_BASE_URL ??= "http://127.0.0.1:18080";
process.env.ERP_REMOTE_TOKEN ??= "test-remote-token-phase1-routes";

test("GET /health returns stable success contract", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "x" }),
    provisionSite: async () => ({
      ok: true,
      data: { site_name: "acme", steps: [] },
    }),
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as { success: boolean; data: { status: string } };
  assert.equal(body.success, true);
  assert.equal(body.data.status, "ok");
  await app.close();
});

test("POST /sites/read-db-name returns db_name on success", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "_tenant_db" }),
    provisionSite: async () => ({
      ok: true,
      data: { site_name: "acme", steps: [] },
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
    provisionSite: async () => ({
      ok: true,
      data: { site_name: "acme", steps: [] },
    }),
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
    provisionSite: async () => ({
      ok: true,
      data: { site_name: "acme", steps: [] },
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

test("POST /provision returns success contract", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "x" }),
    provisionSite: async () => ({
      ok: true,
      data: {
        site_name: "acme",
        steps: [
          { action: "createSite", durationMs: 10 },
          { action: "installErp", durationMs: 20 },
        ],
        db_name: "_tenant_acme",
      },
    }),
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({
    method: "POST",
    url: "/provision",
    headers: {
      authorization: `Bearer ${process.env.PROVISIONING_API_TOKEN}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({ site_name: "acme" }),
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as {
    success: boolean;
    data: { site_name: string; steps: Array<{ action: string; durationMs: number }>; db_name?: string };
  };
  assert.equal(body.success, true);
  assert.equal(body.data.site_name, "acme");
  assert.equal(body.data.db_name, "_tenant_acme");
  assert.equal(body.data.steps.length, 2);
  await app.close();
});

test("POST /sites/create maps camelCase to provision contract and returns success", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "x" }),
    provisionSite: async (body) => {
      assert.equal(body.site_name, "acme");
      assert.equal(body.domain, "acme.example.com");
      assert.equal(body.api_username, "cp_acme");
      return {
        ok: true,
        data: {
          site_name: "acme",
          steps: [{ action: "createSite", durationMs: 10 }],
          db_name: "_tenant_acme",
        },
      };
    },
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({
    method: "POST",
    url: "/sites/create",
    headers: {
      authorization: `Bearer ${process.env.PROVISIONING_API_TOKEN}`,
      "content-type": "application/json",
    },
    payload: JSON.stringify({
      siteName: "acme",
      domain: "acme.example.com",
      apiUsername: "cp_acme",
    }),
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as {
    success: boolean;
    data: { site_name: string; db_name?: string };
  };
  assert.equal(body.success, true);
  assert.equal(body.data.site_name, "acme");
  assert.equal(body.data.db_name, "_tenant_acme");
  await app.close();
});

test("POST /provision without Bearer returns AUTH_ERROR", async () => {
  const mock: ErpExecutionReadDbPort = {
    readDbName: async () => ({ ok: true, dbName: "x" }),
    provisionSite: async () => ({
      ok: true,
      data: { site_name: "acme", steps: [] },
    }),
  };
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: mock });
  const res = await app.inject({
    method: "POST",
    url: "/provision",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ site_name: "acme" }),
  });
  assert.equal(res.statusCode, 401);
  const body = JSON.parse(res.body) as { success: boolean; error: { code: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, "AUTH_ERROR");
  await app.close();
});
