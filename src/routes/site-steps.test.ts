import test from "node:test";
import assert from "node:assert/strict";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";
import type {
  CreateSiteForwardBody,
  ForwardedResponse,
  SetupCompleteForwardBody,
  SetupCompanyForwardBody,
  SetupDomainsForwardBody,
  SetupFiscalYearForwardBody,
  SetupFitdeskForwardBody,
  SetupGlobalDefaultsForwardBody,
  SetupLocaleForwardBody,
  SetupRegionalForwardBody,
  SetupRolesForwardBody,
  SiteOnlyForwardBody,
  SmokeTestForwardBody,
  SiteStepsForwarderPort,
} from "../clients/site-steps-forwarder-port.js";

// These tests must see the same PROVISIONING_API_TOKEN the real env loader
// sees; set before importing ../config/env.ts transitively.
process.env.PROVISIONING_API_TOKEN =
  process.env.PROVISIONING_API_TOKEN ?? "test-token-min-16-chars-long-value";
process.env.ERP_REMOTE_BASE_URL = process.env.ERP_REMOTE_BASE_URL ?? "http://erp-execution:8790";
process.env.ERP_REMOTE_TOKEN = process.env.ERP_REMOTE_TOKEN ?? "test-remote-token";

const AUTH_HEADER = `Bearer ${process.env.PROVISIONING_API_TOKEN}`;

type Call =
  | { kind: "createSite"; body: CreateSiteForwardBody; requestId?: string }
  | { kind: "installErp"; body: SiteOnlyForwardBody; requestId?: string }
  | { kind: "enableScheduler"; body: SiteOnlyForwardBody; requestId?: string }
  | { kind: "setupLocale"; body: SetupLocaleForwardBody; requestId?: string }
  | { kind: "setupCompany"; body: SetupCompanyForwardBody; requestId?: string }
  | { kind: "setupComplete"; body: SetupCompleteForwardBody; requestId?: string }
  | { kind: "setupFiscalYear"; body: SetupFiscalYearForwardBody; requestId?: string }
  | { kind: "setupGlobalDefaults"; body: SetupGlobalDefaultsForwardBody; requestId?: string }
  | { kind: "setupRegional"; body: SetupRegionalForwardBody; requestId?: string }
  | { kind: "setupDomains"; body: SetupDomainsForwardBody; requestId?: string }
  | { kind: "setupRoles"; body: SetupRolesForwardBody; requestId?: string }
  | { kind: "addDomain"; body: SiteOnlyForwardBody; requestId?: string }
  | { kind: "createApiUser"; body: SiteOnlyForwardBody; requestId?: string }
  | { kind: "smokeTest"; body: SmokeTestForwardBody; requestId?: string }
  | { kind: "setupFitdesk"; body: SetupFitdeskForwardBody; requestId?: string }
  | { kind: "siteStatus"; site: string; requestId?: string };

function fakeForwarder(
  response: ForwardedResponse
): { forwarder: SiteStepsForwarderPort; calls: Call[] } {
  const calls: Call[] = [];
  const forwarder: SiteStepsForwarderPort = {
    createSite: async (body, opts) => {
      calls.push({ kind: "createSite", body, requestId: opts?.requestId });
      return response;
    },
    installErp: async (body, opts) => {
      calls.push({ kind: "installErp", body, requestId: opts?.requestId });
      return response;
    },
    enableScheduler: async (body, opts) => {
      calls.push({ kind: "enableScheduler", body, requestId: opts?.requestId });
      return response;
    },
    setupLocale: async (body, opts) => {
      calls.push({ kind: "setupLocale", body, requestId: opts?.requestId });
      return response;
    },
    setupCompany: async (body, opts) => {
      calls.push({ kind: "setupCompany", body, requestId: opts?.requestId });
      return response;
    },
    setupComplete: async (body, opts) => {
      calls.push({ kind: "setupComplete", body, requestId: opts?.requestId });
      return response;
    },
    setupFiscalYear: async (body, opts) => {
      calls.push({ kind: "setupFiscalYear", body, requestId: opts?.requestId });
      return response;
    },
    setupGlobalDefaults: async (body, opts) => {
      calls.push({ kind: "setupGlobalDefaults", body, requestId: opts?.requestId });
      return response;
    },
    setupRegional: async (body, opts) => {
      calls.push({ kind: "setupRegional", body, requestId: opts?.requestId });
      return response;
    },
    setupDomains: async (body, opts) => {
      calls.push({ kind: "setupDomains", body, requestId: opts?.requestId });
      return response;
    },
    setupRoles: async (body, opts) => {
      calls.push({ kind: "setupRoles", body, requestId: opts?.requestId });
      return response;
    },
    addDomain: async (body, opts) => {
      calls.push({ kind: "addDomain", body, requestId: opts?.requestId });
      return response;
    },
    createApiUser: async (body, opts) => {
      calls.push({ kind: "createApiUser", body, requestId: opts?.requestId });
      return response;
    },
    smokeTest: async (body, opts) => {
      calls.push({ kind: "smokeTest", body, requestId: opts?.requestId });
      return response;
    },
    setupFitdesk: async (body, opts) => {
      calls.push({ kind: "setupFitdesk", body, requestId: opts?.requestId });
      return response;
    },
    siteStatus: async (site, opts) => {
      calls.push({ kind: "siteStatus", site, requestId: opts?.requestId });
      return response;
    },
  };
  return { forwarder, calls };
}

const stubReadDbClient: ErpExecutionReadDbPort = {
  readDbName: async () => ({ ok: true, dbName: "x" }),
  provisionSite: async () => ({ ok: true, data: { site_name: "x", steps: [] } }),
};

function successEnvelope(data: object): ForwardedResponse {
  return {
    status: 200,
    body: { ok: true, data, timestamp: "2026-04-10T00:00:00.000Z" },
  };
}

function failureEnvelope(
  status: number,
  code: string,
  message: string,
  retryable = false
): ForwardedResponse {
  return {
    status,
    body: {
      ok: false,
      error: { code, message, retryable },
      timestamp: "2026-04-10T00:00:00.000Z",
    },
  };
}

// --- auth ----------------------------------------------------------------

test("POST /sites/install-erp requires Bearer token", async () => {
  const { forwarder } = fakeForwarder(successEnvelope({ action: "installErp" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/install-erp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ site: "acme" }),
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("POST /sites/install-erp rejects wrong bearer token", async () => {
  const { forwarder } = fakeForwarder(successEnvelope({ action: "installErp" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/install-erp",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token-not-valid-at-all-16",
      },
      payload: JSON.stringify({ site: "acme" }),
    });
    assert.equal(res.statusCode, 401);
  } finally {
    await app.close();
  }
});

// --- install-erp ---------------------------------------------------------

test("POST /sites/install-erp forwards Phase 2 envelope verbatim", async () => {
  const upstream = successEnvelope({
    action: "installErp",
    site: "acme.example",
    outcome: "applied",
  });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/install-erp",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme.example" }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "installErp");
    if (calls[0]?.kind === "installErp") {
      assert.equal(calls[0].body.site, "acme.example");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/install-erp relays upstream failure status and body", async () => {
  const upstream = failureEnvelope(503, "INFRA_UNAVAILABLE", "bench-agent unreachable", true);
  const { forwarder } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/install-erp",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme.example" }),
    });
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.json(), upstream.body);
  } finally {
    await app.close();
  }
});

test("POST /sites/install-erp returns 422 when site is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "installErp" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/install-erp",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({}),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(body.error.retryable, false);
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- enable-scheduler ----------------------------------------------------

test("POST /sites/enable-scheduler forwards to execution-service", async () => {
  const upstream = successEnvelope({ action: "enableScheduler", site: "acme.example", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/enable-scheduler",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme.example" }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls[0]?.kind, "enableScheduler");
  } finally {
    await app.close();
  }
});

// --- add-domain ----------------------------------------------------------

test("POST /sites/add-domain forwards site payload", async () => {
  const upstream = successEnvelope({ action: "addDomain", site: "acme.erp.example.com", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/add-domain",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme.erp.example.com" }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls[0]?.kind, "addDomain");
    if (calls[0]?.kind === "addDomain") {
      assert.equal(calls[0].body.site, "acme.erp.example.com");
    }
  } finally {
    await app.close();
  }
});

// --- create-api-user -----------------------------------------------------

test("POST /sites/create-api-user forwards and returns credentials envelope verbatim", async () => {
  const upstream = successEnvelope({
    action: "createApiUser",
    site: "acme.erp.example.com",
    outcome: "applied",
    apiKey: "KEY",
    apiSecret: "SECRET",
    user: "cp_acme@axis.local",
  });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/create-api-user",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme.erp.example.com" }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls[0]?.kind, "createApiUser");
  } finally {
    await app.close();
  }
});

// --- GET /sites/:site/status ---------------------------------------------

test("GET /sites/:site/status forwards and returns upstream body verbatim", async () => {
  const upstream = successEnvelope({
    action: "siteStatus",
    site: "acme.example",
    outcome: "applied",
    exists: true,
    apps: ["frappe", "erpnext", "provisioning_api"],
  });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/sites/acme.example/status",
      headers: { authorization: AUTH_HEADER },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls[0]?.kind, "siteStatus");
    if (calls[0]?.kind === "siteStatus") {
      assert.equal(calls[0].site, "acme.example");
    }
  } finally {
    await app.close();
  }
});

test("GET /sites/:site/status requires auth", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "siteStatus" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/sites/acme.example/status",
    });
    assert.equal(res.statusCode, 401);
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

test("GET /sites/:site/status relays upstream 504 timeout body", async () => {
  const upstream = failureEnvelope(504, "ERP_TIMEOUT", "bench timed out", true);
  const { forwarder } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/sites/acme.example/status",
      headers: { authorization: AUTH_HEADER },
    });
    assert.equal(res.statusCode, 504);
    assert.deepEqual(res.json(), upstream.body);
  } finally {
    await app.close();
  }
});

// --- create-site ---------------------------------------------------------

test("POST /sites/create forwards Phase 2 envelope verbatim including adminPassword", async () => {
  const upstream = successEnvelope({ action: "createSite", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/create",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({
        siteName: "acme",
        domain: "acme.example.com",
        apiUsername: "cp_acme",
        adminPassword: "random-generated-64hex",
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "createSite");
    if (calls[0]?.kind === "createSite") {
      assert.equal(calls[0].body.siteName, "acme");
      assert.equal(calls[0].body.adminPassword, "random-generated-64hex");
    }
  } finally {
    await app.close();
  }
});

// --- setup-locale --------------------------------------------------------

test("POST /sites/setup-locale forwards locale payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupLocale", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-locale",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({
        site: "acme",
        country: "AE",
        defaultCurrency: "AED",
        timezone: "Asia/Dubai",
        language: "en",
        dateFormat: "dd-mm-yyyy",
        currencyPrecision: 2,
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls[0]?.kind, "setupLocale");
    if (calls[0]?.kind === "setupLocale") {
      assert.equal(calls[0].body.site, "acme");
      assert.equal(calls[0].body.country, "AE");
      assert.equal(calls[0].body.defaultCurrency, "AED");
      assert.equal(calls[0].body.timezone, "Asia/Dubai");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-locale returns 422 when country is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupLocale" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-locale",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme", defaultCurrency: "AED", timezone: "Asia/Dubai" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- setup-company -------------------------------------------------------

test("POST /sites/setup-company forwards company payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupCompany", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-company",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({
        site: "acme",
        companyName: "Acme Fitness LLC",
        companyAbbr: "AF",
        country: "AE",
        defaultCurrency: "AED",
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "setupCompany");
    if (calls[0]?.kind === "setupCompany") {
      assert.equal(calls[0].body.site, "acme");
      assert.equal(calls[0].body.companyName, "Acme Fitness LLC");
      assert.equal(calls[0].body.companyAbbr, "AF");
      assert.equal(calls[0].body.country, "AE");
      assert.equal(calls[0].body.defaultCurrency, "AED");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-company returns 422 when companyName is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupCompany" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-company",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme", companyAbbr: "AF", country: "AE", defaultCurrency: "AED" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- setup-fiscal-year ---------------------------------------------------

test("POST /sites/setup-fiscal-year forwards fiscal year payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupFiscalYear", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-fiscal-year",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({
        site: "acme",
        companyName: "Acme Fitness LLC",
        fiscalYearStartMonth: 1,
        companyAbbr: "AF",
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "setupFiscalYear");
    if (calls[0]?.kind === "setupFiscalYear") {
      assert.equal(calls[0].body.site, "acme");
      assert.equal(calls[0].body.companyName, "Acme Fitness LLC");
      assert.equal(calls[0].body.fiscalYearStartMonth, 1);
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-fiscal-year returns 422 when companyName is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupFiscalYear" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-fiscal-year",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- setup-global-defaults -----------------------------------------------

test("POST /sites/setup-global-defaults forwards global defaults payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupGlobalDefaults", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-global-defaults",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({
        site: "acme",
        companyName: "Acme Fitness LLC",
        defaultCurrency: "AED",
        fiscalYearName: "2026",
        country: "AE",
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "setupGlobalDefaults");
    if (calls[0]?.kind === "setupGlobalDefaults") {
      assert.equal(calls[0].body.site, "acme");
      assert.equal(calls[0].body.companyName, "Acme Fitness LLC");
      assert.equal(calls[0].body.defaultCurrency, "AED");
      assert.equal(calls[0].body.fiscalYearName, "2026");
      assert.equal(calls[0].body.country, "AE");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-global-defaults returns 422 when fiscalYearName is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupGlobalDefaults" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-global-defaults",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme", companyName: "Acme Fitness LLC", defaultCurrency: "AED", country: "AE" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- setup-complete ------------------------------------------------------

test("POST /sites/setup-complete forwards payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupComplete", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-complete",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme", companyName: "Acme Fitness LLC" }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "setupComplete");
    if (calls[0]?.kind === "setupComplete") {
      assert.equal(calls[0].body.site, "acme");
      assert.equal(calls[0].body.companyName, "Acme Fitness LLC");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-complete returns 422 when companyName is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupComplete" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-complete",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- setup-regional ------------------------------------------------------

test("POST /sites/setup-regional forwards regional payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupRegional", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-regional",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({
        site: "acme",
        country: "AE",
        companyName: "Acme Fitness LLC",
        companyAbbr: "AF",
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "setupRegional");
    if (calls[0]?.kind === "setupRegional") {
      assert.equal(calls[0].body.site, "acme");
      assert.equal(calls[0].body.country, "AE");
      assert.equal(calls[0].body.companyName, "Acme Fitness LLC");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-regional returns 422 when companyName is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupRegional" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-regional",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme", country: "AE" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- setup-domains -------------------------------------------------------

test("POST /sites/setup-domains forwards domains payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupDomains", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-domains",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme", companyName: "Acme Fitness LLC" }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "setupDomains");
    if (calls[0]?.kind === "setupDomains") {
      assert.equal(calls[0].body.site, "acme");
      assert.equal(calls[0].body.companyName, "Acme Fitness LLC");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-domains returns 422 when companyName is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupDomains" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-domains",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

// --- setup-roles ---------------------------------------------------------

test("POST /sites/setup-roles forwards site payload verbatim", async () => {
  const upstream = successEnvelope({ action: "setupRoles", site: "acme", outcome: "applied" });
  const { forwarder, calls } = fakeForwarder(upstream);
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-roles",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ site: "acme" }),
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), upstream.body);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.kind, "setupRoles");
    if (calls[0]?.kind === "setupRoles") {
      assert.equal(calls[0].body.site, "acme");
    }
  } finally {
    await app.close();
  }
});

test("POST /sites/setup-roles returns 422 when site is missing", async () => {
  const { forwarder, calls } = fakeForwarder(successEnvelope({ action: "setupRoles" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/setup-roles",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({}),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string; retryable: boolean } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
    assert.equal(calls.length, 0);
  } finally {
    await app.close();
  }
});

test("POST /sites/create returns 422 when adminPassword is missing", async () => {
  const { forwarder } = fakeForwarder(successEnvelope({ action: "createSite" }));
  const { buildApp } = await import("../app.js");
  const app = await buildApp({ erpExecutionClient: stubReadDbClient, siteStepsForwarder: forwarder });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/sites/create",
      headers: { "content-type": "application/json", authorization: AUTH_HEADER },
      payload: JSON.stringify({ siteName: "acme", domain: "acme.example.com", apiUsername: "cp_acme" }),
    });
    assert.equal(res.statusCode, 422);
    const body = res.json() as { ok: boolean; error: { code: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "ERP_VALIDATION_FAILED");
  } finally {
    await app.close();
  }
});
