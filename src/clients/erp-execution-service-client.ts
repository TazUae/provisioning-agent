import type {
  ErpExecutionReadDbPort,
  ProvisionSiteRequestBody,
  ProvisionSiteResult,
  ReadDbNameResult,
} from "./erp-execution-read-db-port.js";
import type { PublicErrorCode } from "../contracts/control-plane-api.js";
import {
  RemoteExecutionEnvelopeSchema,
  type RemoteExecutionEnvelope,
} from "../providers/erpnext/remote-contract.js";
import { extractDbNameFromMetadata } from "../lib/erp-metadata-db-name.js";
import { executeCreateSiteFromProvision } from "../modules/provisioning/orchestrator.js";
import { normalizeOpaqueSiteString } from "../providers/erpnext/validation.js";

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
        return { code: "UPSTREAM_HTTP_ERROR", message: message || safeUpstreamMessage };
      }
      return { code: "UPSTREAM_HTTP_ERROR", message: message || safeUpstreamMessage };
  }
}

type ExecutionEnvelopeOk = {
  ok: true;
  value: { durationMs: number; metadata?: Record<string, string | number | boolean> };
};

type ExecutionEnvelopeErr = {
  ok: false;
  code: PublicErrorCode;
  message: string;
  details?: unknown;
};

/**
 * HTTP client for erp-execution-service (`POST /sites/create`, `POST /sites/read-db-name`).
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
    let site: string;
    try {
      site = normalizeOpaqueSiteString(siteName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, code: "VALIDATION_ERROR", message: message || "Invalid site input" };
    }
    const body = { siteName: site };
    const result = await this.postExecutionEnvelope("/sites/read-db-name", body);
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

  async provisionSite(body: ProvisionSiteRequestBody, opts?: { requestId?: string }): Promise<ProvisionSiteResult> {
    return this.executeProvision(body, opts);
  }

  private async executeProvision(
    body: ProvisionSiteRequestBody,
    opts?: { requestId?: string }
  ): Promise<ProvisionSiteResult> {
    return executeCreateSiteFromProvision({
      siteName: body.site_name,
      domain: body.domain,
      apiUsername: body.api_username,
      requestId: opts?.requestId,
      erpBaseDomain: this.erpBaseDomain,
      apiUsernamePrefix: this.apiUsernamePrefix,
      postCreateSite: (createBody, requestId) => this.postCreateSite(createBody, requestId),
    });
  }

  private async postCreateSite(
    body: { siteName: string; domain: string; apiUsername: string },
    requestId?: string
  ): Promise<ProvisionSiteResult> {
    console.log("CREATE SITE PAYLOAD:", body);
    const result = await this.postExecutionEnvelope("/sites/create", body, requestId);
    if (!result.ok) {
      return result;
    }

    const dbName = extractDbNameFromMetadata(result.value.metadata);
    return {
      ok: true,
      data: {
        site_name: body.siteName,
        steps: [{ action: "createSite", durationMs: result.value.durationMs }],
        ...(dbName ? { db_name: dbName } : {}),
      },
    };
  }

  private async postExecutionEnvelope(
    path: string,
    body: Record<string, unknown>,
    requestId?: string
  ): Promise<ExecutionEnvelopeOk | ExecutionEnvelopeErr> {
    const pathNormalized = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${pathNormalized}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
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
          details: envelope.error,
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
