import type { ErpExecutionReadDbPort, ReadDbNameResult } from "./erp-execution-read-db-port.js";
import {
  RemoteExecutionEnvelopeSchema,
  type RemoteExecutionEnvelope,
} from "../providers/erpnext/remote-contract.js";

export type ErpExecutionServiceClientConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
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

/**
 * HTTP client for erp-execution-service (`POST /v1/erp/lifecycle`).
 * Phase 1: `readDbName` only; other actions stay in the typed backend for later phases.
 */
export class ErpExecutionServiceClient implements ErpExecutionReadDbPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ErpExecutionServiceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async readDbName(siteName: string): Promise<ReadDbNameResult> {
    const url = new URL("/v1/erp/lifecycle", this.baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          action: "readSiteDbName",
          payload: { site: siteName },
        }),
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
        if (envelope.error.code === "SITE_NOT_FOUND") {
          return {
            ok: false,
            code: "SITE_NOT_FOUND",
            message: envelope.error.message,
          };
        }
        if (response.status >= 400 && response.status < 500) {
          return {
            ok: false,
            code: "UPSTREAM_HTTP_ERROR",
            message: safeUpstreamMessage,
          };
        }
        return {
          ok: false,
          code: "UPSTREAM_HTTP_ERROR",
          message: safeUpstreamMessage,
        };
      }

      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          code: "UPSTREAM_HTTP_ERROR",
          message: safeUpstreamMessage,
        };
      }

      const meta = envelope.data.metadata;
      const rawDb = meta?.dbName;
      const dbName =
        typeof rawDb === "string"
          ? rawDb.trim()
          : typeof rawDb === "number" || typeof rawDb === "boolean"
            ? String(rawDb).trim()
            : "";

      if (!dbName) {
        return {
          ok: false,
          code: "INVALID_UPSTREAM_RESPONSE",
          message: "Upstream success response did not include db_name metadata",
        };
      }

      return { ok: true, dbName };
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
