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
} from "./site-steps-forwarder-port.js";

type FetchLike = typeof fetch;

export type SiteStepsForwarderConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  /** Test seam; production uses global fetch. */
  fetchImpl?: FetchLike;
};

/**
 * Verbatim HTTP forwarder for Phase 2 site-step endpoints on
 * erp-execution-service. Reads the response body as text, tries to JSON-parse
 * it, and returns `{status, body}` — no decoding or re-shaping. Callers
 * (provisioning-agent routes) must forward this back to their own client with
 * the same status code so the envelope reaches the control-plane unchanged.
 *
 * Timeouts and network errors are surfaced as synthetic 5xx envelopes so the
 * control-plane can decode them through the same Phase 2 contract rather than
 * having to special-case network faults.
 */
export class SiteStepsForwarder implements SiteStepsForwarderPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(config: SiteStepsForwarderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  createSite(body: CreateSiteForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/create", body, opts);
  }

  installErp(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/install-erp", body, opts);
  }

  installFitdesk(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/install-fitdesk", body, opts);
  }

  enableScheduler(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/enable-scheduler", body, opts);
  }

  setupLocale(body: SetupLocaleForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-locale", body, opts);
  }

  setupCompany(body: SetupCompanyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-company", body, opts);
  }

  setupComplete(body: SetupCompleteForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-complete", body, opts);
  }

  setupFiscalYear(body: SetupFiscalYearForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-fiscal-year", body, opts);
  }

  setupGlobalDefaults(body: SetupGlobalDefaultsForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-global-defaults", body, opts);
  }

  setupDomains(body: SetupDomainsForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-domains", body, opts);
  }

  setupRegional(body: SetupRegionalForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-regional", body, opts);
  }

  setupRoles(body: SetupRolesForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-roles", body, opts);
  }

  addDomain(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/add-domain", body, opts);
  }

  createApiUser(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/create-api-user", body, opts);
  }

  smokeTest(body: SmokeTestForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/smoke-test", body, opts);
  }

  setupFitdesk(body: SetupFitdeskForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.post("/sites/setup-fitdesk", body, opts);
  }

  siteStatus(site: string, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    const path = `/sites/${encodeURIComponent(site)}/status`;
    return this.request("GET", path, undefined, opts);
  }

  private post(path: string, body: unknown, opts?: { requestId?: string }): Promise<ForwardedResponse> {
    return this.request("POST", path, body, opts);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    opts?: { requestId?: string }
  ): Promise<ForwardedResponse> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...(opts?.requestId ? { "x-request-id": opts.requestId } : {}),
    };

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: method === "POST" && body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      return { status: response.status, body: tryParseJson(text) };
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        return {
          status: 504,
          body: phase2Failure(
            "ERP_TIMEOUT",
            `Upstream erp-execution-service timed out after ${this.timeoutMs}ms`,
            true
          ),
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 503,
        body: phase2Failure("INFRA_UNAVAILABLE", `Upstream erp-execution-service unreachable: ${message}`, true),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function tryParseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

function phase2Failure(code: string, message: string, retryable: boolean) {
  return {
    ok: false,
    error: { code, message, retryable },
    timestamp: new Date().toISOString(),
  };
}
