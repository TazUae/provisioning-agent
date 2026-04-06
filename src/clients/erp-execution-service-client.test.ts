import test from "node:test";
import assert from "node:assert/strict";
import { ErpExecutionServiceClient } from "./erp-execution-service-client.js";

const baseConfig = {
  baseUrl: "http://127.0.0.1:18080",
  token: "downstream-token",
  timeoutMs: 5000,
};

test("readDbName returns db name on success envelope with metadata.db_name", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          durationMs: 10,
          metadata: { db_name: "_fe883896178c6f75" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("acme.example.com");
  assert.deepEqual(result, { ok: true, dbName: "_fe883896178c6f75" });
});

test("readDbName returns db name on success envelope with metadata.dbName (legacy)", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          durationMs: 10,
          metadata: { dbName: "_abc123" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("acme.example.com");
  assert.deepEqual(result, { ok: true, dbName: "_abc123" });
});

test("readDbName maps downstream 401 to AUTH_ERROR", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: false, error: { message: "nope" } }), { status: 401 });
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("acme");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "AUTH_ERROR");
    assert.match(result.message, /authenticate/i);
  }
});

test("readDbName maps SITE_NOT_FOUND from failure envelope", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "SITE_NOT_FOUND",
          message: "No such site",
          retryable: false,
        },
      }),
      { status: 404, headers: { "content-type": "application/json" } }
    );
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("missing.example.com");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "SITE_NOT_FOUND");
    assert.equal(result.message, "No such site");
  }
});

test("readDbName maps malformed success payload to INVALID_UPSTREAM_RESPONSE when metadata omits db keys", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          durationMs: 10,
          metadata: {},
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("acme");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "INVALID_UPSTREAM_RESPONSE");
    assert.match(result.message, /db_name metadata/i);
  }
});

test("readDbName maps AbortError to UPSTREAM_TIMEOUT", async () => {
  const fetchMock: typeof fetch = async () => {
    const err = new Error("The user aborted a request");
    err.name = "AbortError";
    throw err;
  };
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("acme");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "UPSTREAM_TIMEOUT");
  }
});

test("readDbName maps non-2xx without auth to UPSTREAM_HTTP_ERROR", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response("bad gateway", { status: 502, headers: { "content-type": "text/plain" } });
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("acme");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "UPSTREAM_HTTP_ERROR");
  }
});

test("readDbName maps invalid JSON body to INVALID_UPSTREAM_RESPONSE", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response("not-json{{{", { status: 200, headers: { "content-type": "application/json" } });
  const client = new ErpExecutionServiceClient({ ...baseConfig, fetchImpl: fetchMock });
  const result = await client.readDbName("acme");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "INVALID_UPSTREAM_RESPONSE");
  }
});

test("provisionSite runs lifecycle sequence and aggregates steps", async () => {
  let calls = 0;
  const fetchMock: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const durationMs = calls === 1 ? 100 : 10;
    const metadata =
      body.action === "createSite" ? { db_name: "_acme_db" } : body.action === "readSiteDbName" ? {} : {};
    return new Response(
      JSON.stringify({
        ok: true,
        data: { durationMs, metadata },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const client = new ErpExecutionServiceClient({
    ...baseConfig,
    fetchImpl: fetchMock,
    erpBaseDomain: "example.test",
    apiUsernamePrefix: "cp",
  });
  const result = await client.provisionSite("acme");
  assert.equal(calls, 5);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.site_name, "acme");
    assert.equal(result.data.db_name, "_acme_db");
    assert.equal(result.data.steps.length, 5);
    assert.equal(result.data.steps[0]?.action, "createSite");
    assert.equal(result.data.steps[4]?.action, "createApiUser");
  }
});

test("provisionSite includes db_name from createSite when metadata uses legacy dbName", async () => {
  const fetchMock: typeof fetch = async (_input, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const metadata =
      body.action === "createSite" ? { dbName: "_legacy_db" } : body.action === "readSiteDbName" ? {} : {};
    return new Response(
      JSON.stringify({
        ok: true,
        data: { durationMs: 10, metadata },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  const client = new ErpExecutionServiceClient({
    ...baseConfig,
    fetchImpl: fetchMock,
    erpBaseDomain: "example.test",
    apiUsernamePrefix: "cp",
  });
  const result = await client.provisionSite("legacy");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.db_name, "_legacy_db");
  }
});
