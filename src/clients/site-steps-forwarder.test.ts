import test from "node:test";
import assert from "node:assert/strict";
import { SiteStepsForwarder } from "./site-steps-forwarder.js";

process.env.PROVISIONING_API_TOKEN =
  process.env.PROVISIONING_API_TOKEN ?? "test-token-min-16-chars-long-value";
process.env.ERP_REMOTE_BASE_URL = process.env.ERP_REMOTE_BASE_URL ?? "http://erp-execution:8790";
process.env.ERP_REMOTE_TOKEN = process.env.ERP_REMOTE_TOKEN ?? "test-remote-token";

type FetchArgs = { url: string; init: RequestInit };

function captureFetch(
  respond: (args: FetchArgs) => Promise<Response> | Response
): { fetchImpl: typeof fetch; calls: FetchArgs[] } {
  const calls: FetchArgs[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
    const args = { url, init: init ?? {} };
    calls.push(args);
    return await respond(args);
  };
  return { fetchImpl, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("installErp posts to /sites/install-erp with Bearer token and JSON body", async () => {
  const { fetchImpl, calls } = captureFetch(() =>
    jsonResponse(200, {
      ok: true,
      data: { action: "installErp", site: "acme", outcome: "applied" },
      timestamp: "2026-04-10T00:00:00.000Z",
    })
  );
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790",
    token: "remote-token",
    timeoutMs: 1000,
    fetchImpl,
  });
  const res = await forwarder.installErp({ site: "acme" }, { requestId: "req-1" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    ok: true,
    data: { action: "installErp", site: "acme", outcome: "applied" },
    timestamp: "2026-04-10T00:00:00.000Z",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://erp-execution:8790/sites/install-erp");
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer remote-token");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["x-request-id"], "req-1");
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.body, JSON.stringify({ site: "acme" }));
});

test("installFitdesk posts to /sites/install-fitdesk with Bearer token and JSON body", async () => {
  const { fetchImpl, calls } = captureFetch(() =>
    jsonResponse(200, {
      ok: true,
      data: { action: "installFitdesk", site: "acme", outcome: "applied" },
      timestamp: "2026-04-10T00:00:00.000Z",
    })
  );
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790",
    token: "remote-token",
    timeoutMs: 1000,
    fetchImpl,
  });
  const res = await forwarder.installFitdesk({ site: "acme" }, { requestId: "req-1" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    ok: true,
    data: { action: "installFitdesk", site: "acme", outcome: "applied" },
    timestamp: "2026-04-10T00:00:00.000Z",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://erp-execution:8790/sites/install-fitdesk");
  const headers = calls[0]?.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer remote-token");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["x-request-id"], "req-1");
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.body, JSON.stringify({ site: "acme" }));
});

test("siteStatus GETs /sites/:site/status with no body and URL-encodes the site", async () => {
  const { fetchImpl, calls } = captureFetch(() =>
    jsonResponse(200, {
      ok: true,
      data: { action: "siteStatus", site: "acme.example", outcome: "applied", exists: true, apps: [] },
      timestamp: "2026-04-10T00:00:00.000Z",
    })
  );
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790/",
    token: "t",
    timeoutMs: 1000,
    fetchImpl,
  });
  const res = await forwarder.siteStatus("acme.example");
  assert.equal(res.status, 200);
  assert.equal(calls[0]?.url, "http://erp-execution:8790/sites/acme.example/status");
  assert.equal(calls[0]?.init.method, "GET");
  assert.equal(calls[0]?.init.body, undefined);
});

test("siteStatus URL-encodes special characters in the site segment", async () => {
  const { fetchImpl, calls } = captureFetch(() => jsonResponse(200, { ok: true, data: {}, timestamp: "t" }));
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790",
    token: "t",
    timeoutMs: 1000,
    fetchImpl,
  });
  await forwarder.siteStatus("weird site/with spaces");
  assert.equal(calls[0]?.url, "http://erp-execution:8790/sites/weird%20site%2Fwith%20spaces/status");
});

test("upstream 503 envelope passes through with status and body intact", async () => {
  const upstreamBody = {
    ok: false,
    error: { code: "INFRA_UNAVAILABLE", message: "bench-agent unreachable", retryable: true },
    timestamp: "2026-04-10T00:00:00.000Z",
  };
  const { fetchImpl } = captureFetch(() => jsonResponse(503, upstreamBody));
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790",
    token: "t",
    timeoutMs: 1000,
    fetchImpl,
  });
  const res = await forwarder.enableScheduler({ site: "acme" });
  assert.equal(res.status, 503);
  assert.deepEqual(res.body, upstreamBody);
});

test("network error is translated to a synthetic 503 INFRA_UNAVAILABLE envelope", async () => {
  const { fetchImpl } = captureFetch(async () => {
    throw new Error("ECONNREFUSED 127.0.0.1:8790");
  });
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790",
    token: "t",
    timeoutMs: 1000,
    fetchImpl,
  });
  const res = await forwarder.addDomain({ site: "acme" });
  assert.equal(res.status, 503);
  const body = res.body as {
    ok: boolean;
    error: { code: string; retryable: boolean; message: string };
  };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "INFRA_UNAVAILABLE");
  assert.equal(body.error.retryable, true);
  assert.match(body.error.message, /ECONNREFUSED/);
});

test("timeout is translated to a synthetic 504 ERP_TIMEOUT envelope", async () => {
  const fetchImpl: typeof fetch = async (_input, init) => {
    // Wait for the abort signal to fire.
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const onAbort = () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790",
    token: "t",
    timeoutMs: 25,
    fetchImpl,
  });
  const res = await forwarder.createApiUser({ site: "acme" });
  assert.equal(res.status, 504);
  const body = res.body as {
    ok: boolean;
    error: { code: string; retryable: boolean; message: string };
  };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "ERP_TIMEOUT");
  assert.equal(body.error.retryable, true);
  assert.match(body.error.message, /25ms/);
});

test("non-JSON upstream body is wrapped into a {raw} object", async () => {
  const { fetchImpl } = captureFetch(
    () =>
      new Response("not json at all", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
  );
  const forwarder = new SiteStepsForwarder({
    baseUrl: "http://erp-execution:8790",
    token: "t",
    timeoutMs: 1000,
    fetchImpl,
  });
  const res = await forwarder.installErp({ site: "acme" });
  assert.equal(res.status, 200);
  const body = res.body as { raw: string };
  assert.equal(body.raw, "not json at all");
});
