import type {
  ErpExecutionReadDbPort,
  ProvisionSiteResult,
  ReadDbNameResult,
} from "./erp-execution-read-db-port.js";
import type { PublicErrorCode } from "../contracts/control-plane-api.js";
import {
  RemoteExecutionEnvelopeSchema,
  type RemoteExecutionEnvelope,
} from "../providers/erpnext/remote-contract.js";
import { validateDomain, validateSite, validateUsername } from "../providers/erpnext/validation.js";
import { extractDbNameFromMetadata } from "../lib/erp-metadata-db-name.js";

export type ErpExecutionServiceClientConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  /** Defaults match `ERP_BASE_DOMAIN` / `ERP_API_USERNAME_PREFIX` in `env.ts`. */
  erpBaseDomain?: string;
  apiUsernamePrefix?: string;
};

export type { ReadDbNameResult } from "./erp-execution-read-db-port.js";

const safeUpstreamMessage = "The ERP execution service returned an error";

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  const rec = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  return rec?.["name"] === "AbortError";
}

function isTimeoutMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted");
}

function parseJsonBody(text: string): unknown {
  if (text.length === 0) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function mapFailureToSiteNotFound(envelope: RemoteExecutionEnvelope): boolean {
  if (envelope.ok) {
    return false;
  }
  return envelope.error.code === "SITE_NOT_FOUND";
}

type LifecycleSuccess = {
  durationMs: number;
  metadata?: Record<string, string | number | boolean>;
};

type LifecyclePostResult =
  | { ok: true; value: LifecycleSuccess }
  | { ok: false; code: PublicErrorCode; message: string };

function mapUpstreamFailure(
  envelope: Extract<RemoteExecutionEnvelope, { ok: false }>,
  responseStatus: number
): { code: PublicErrorCode; message: string } {
  const { code, message } = envelope.error;
  switch (code) {
    case "SITE_NOT_FOUND":
      return { code: "SITE_NOT_FOUND", message };
    case "ERP_VALIDATION_FAILED":
      return { code: "VALIDATION_ERROR", message };
    case "ERP_TIMEOUT":
      return { code: "UPSTREAM_TIMEOUT", message };
    default:
      if (responseStatus >= 400 && responseStatus < 500) {
        return { code: "UPSTREAM_HTTP_ERROR", message: safeUpstreamMessage };
      }
      return { code: "UPSTREAM_HTTP_ERROR", message: safeUpstreamMessage };
  }
}

/**
 * HTTP client for erp-execution-service (`POST /v1/erp/lifecycle`).
 */
export class ErpExecutionServiceClient implements ErpExecutionReadDbPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly erpBaseDomain: string;
  private readonly apiUsernamePrefix: string;

  constructor(config: ErpExecutionServiceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.erpBaseDomain = config.erpBaseDomain ?? "erp.zaidan-group.com";
    this.apiUsernamePrefix = config.apiUsernamePrefix ?? "cp";
  }

  async readDbName(siteName: string): Promise<ReadDbNameResult> {
    const result = await this.postLifecycle("readSiteDbName", { site: siteName });
    if (!result.ok) {
      return result;
    }

    const dbName = extractDbNameFromMetadata(result.value.metadata);

    if (!dbName) {
      return {
        ok: false,
        code: "INVALID_UPSTREAM_RESPONSE",
        message: "Upstream success response did not include db_name metadata",
      };
    }

    return { ok: true, dbName };
  }

  async provisionSite(siteName: string, opts?: { requestId?: string }): Promise<ProvisionSiteResult> {
    let safeSite: string;
    let derivedDomain: string;
    let derivedApiUsername: string;
    try {
      safeSite = validateSite(siteName);
      derivedDomain = validateDomain(`${safeSite}.${this.erpBaseDomain}`);
      derivedApiUsername = validateUsername(`${this.apiUsernamePrefix}_${safeSite}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: message || "Invalid site input",
      };
    }

    const requestId = opts?.requestId;
    const steps: Array<{ action: string; durationMs: number }> = [];
    let dbName: string | undefined;

    const ordered: Array<{ action: string; payload: Record<string, string> }> = [
      { action: "createSite", payload: { site: safeSite } },
      { action: "installErp", payload: { site: safeSite } },
      { action: "enableScheduler", payload: { site: safeSite } },
      { action: "addDomain", payload: { site: safeSite, domain: derivedDomain } },
      { action: "createApiUser", payload: { site: safeSite, apiUsername: derivedApiUsername } },
    ];

    for (const { action, payload } of ordered) {
      const r = await this.postLifecycle(action, payload, requestId);
      if (!r.ok) {
        return r;
      }
      steps.push({ action, durationMs: r.value.durationMs });
      if (action === "createSite") {
        const extracted = extractDbNameFromMetadata(r.value.metadata);
        if (extracted) {
          dbName = extracted;
        }
      }
    }

    return {
      ok: true,
      data: {
        site_name: safeSite,
        steps,
        ...(dbName ? { db_name: dbName } : {}),
      },
    };
  }

  private async postLifecycle(
    action: string,
    payload: Record<string, unknown>,
    requestId?: string
  ): Promise<LifecyclePostResult> {
    const url = new URL("/v1/erp/lifecycle", this.baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const body: Record<string, unknown> = { action, payload };
    if (requestId) {
      body.requestId = requestId;
    }

    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          code: "AUTH_ERROR",
          message: "Could not authenticate to the ERP execution service",
        };
      }

      if (response.status === 404) {
        const parsed404 = parseJsonBody(text);
        if (parsed404 !== null) {
          const envelope = RemoteExecutionEnvelopeSchema.safeParse(parsed404);
          if (envelope.success && !envelope.data.ok && mapFailureToSiteNotFound(envelope.data)) {
            return {
              ok: false,
              code: "SITE_NOT_FOUND",
              message: envelope.data.error.message || "Site not found",
            };
          }
        }
        return {
          ok: false,
          code: "SITE_NOT_FOUND",
          message: "Site not found",
        };
      }

      const parsedBody = parseJsonBody(text);
      if (parsedBody === null) {
        if (response.status < 200 || response.status >= 300) {
          return {
            ok: false,
            code: "UPSTREAM_HTTP_ERROR",
            message: safeUpstreamMessage,
          };
        }
        return {
          ok: false,
          code: "INVALID_UPSTREAM_RESPONSE",
          message: "Upstream response was not valid JSON",
        };
      }

      const envelopeParsed = RemoteExecutionEnvelopeSchema.safeParse(parsedBody);
      if (!envelopeParsed.success) {
        return {
          ok: false,
          code: "INVALID_UPSTREAM_RESPONSE",
          message: "Upstream response did not match the expected contract",
        };
      }

      const envelope = envelopeParsed.data;

      if (!envelope.ok) {
        return {
          ok: false,
          ...mapUpstreamFailure(envelope, response.status),
        };
      }

      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          code: "UPSTREAM_HTTP_ERROR",
          message: safeUpstreamMessage,
        };
      }

      return {
        ok: true,
        value: {
          durationMs: envelope.data.durationMs,
          metadata: envelope.data.metadata,
        },
      };
    } catch (error) {
      if (isAbortError(error)) {
        return {
          ok: false,
          code: "UPSTREAM_TIMEOUT",
          message: "The ERP execution service did not respond in time",
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      if (isTimeoutMessage(message)) {
        return {
          ok: false,
          code: "UPSTREAM_TIMEOUT",
          message: "The ERP execution service did not respond in time",
        };
      }
      return {
        ok: false,
        code: "UPSTREAM_HTTP_ERROR",
        message: safeUpstreamMessage,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
