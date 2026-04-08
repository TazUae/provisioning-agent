import test from "node:test";
import assert from "node:assert/strict";
import { ErpExecutionServiceClient } from "./erp-execution-service-client.js";

const baseConfig = {
  baseUrl: "http://127.0.0.1:18080",
  token: "downstream-token",
  timeoutMs: 5000,
};

test("readDbName returns db name on success envelope with metadata.db_name", async () => {
  const fetchMock: typeof fetch = async (input, init) => {
    assert.match(String(input), /\/sites\/read-db-name$/);
    const posted = init?.body ? JSON.parse(String(init.body)) : {};
    assert.deepEqual(posted, { siteName: "acme.example.com" });
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          durationMs: 10,
          metadata: { db_name: "_fe883896178c6f75" },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
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

test("provisionSite POSTs flat JSON once to /sites/create and aggregates one step", async () => {
  let calls = 0;
  const fetchMock: typeof fetch = async (input, init) => {
    calls += 1;
    assert.match(String(input), /\/sites\/create$/);
    const posted = init?.body ? JSON.parse(String(init.body)) : {};
    assert.equal("payload" in posted, false);
    assert.deepEqual(posted, {
      siteName: "acme",
      domain: "acme.example.test",
      apiUsername: "cp_acme",
    });
    const hdrs = new Headers(init?.headers as HeadersInit);
    assert.equal(hdrs.get("content-type"), "application/json");
    assert.ok(hdrs.get("authorization")?.startsWith("Bearer "));
    return new Response(
      JSON.stringify({
        ok: true,
        data: { durationMs: 100, metadata: { db_name: "_acme_db" } },
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
  const result = await client.provisionSite({ site_name: "acme" });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.site_name, "acme");
    assert.equal(result.data.db_name, "_acme_db");
    assert.equal(result.data.steps.length, 1);
    assert.equal(result.data.steps[0]?.action, "createSite");
  }
});

test("provisionSite includes db_name from metadata when legacy dbName is used", async () => {
  const fetchMock: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: { durationMs: 10, metadata: { dbName: "_legacy_db" } },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  const client = new ErpExecutionServiceClient({
    ...baseConfig,
    fetchImpl: fetchMock,
    erpBaseDomain: "example.test",
    apiUsernamePrefix: "cp",
  });
  const result = await client.provisionSite({ site_name: "legacy" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.db_name, "_legacy_db");
  }
});
