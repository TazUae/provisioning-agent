import axios from "axios";
import { z } from "zod";
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
import {
  normalizeOpaqueSiteString,
  validateDomain,
  validateUsername,
} from "../providers/erpnext/validation.js";

export type ErpExecutionServiceClientConfig = {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  /** @internal For tests: override POST /sites/create. Defaults to axios.post. */
  postSitesCreateImpl?: PostSitesCreateImpl;
};

export type PostSitesCreateImpl = (
  url: string,
  payload: Record<string, unknown>,
  options: { timeout: number; headers: Record<string, string> }
) => Promise<{ data: unknown }>;

export type ExecutionServiceFailure = {
  status: "failure";
  step: string;
  message: string;
  raw?: unknown;
};

export function isExecutionServiceFailure(err: unknown): err is ExecutionServiceFailure {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const o = err as Record<string, unknown>;
  return (
    o.status === "failure" &&
    typeof o.step === "string" &&
    typeof o.message === "string"
  );
}

export type { ReadDbNameResult } from "./erp-execution-read-db-port.js";

const safeUpstreamMessage = "The ERP execution service returned an error";

const slugSchema = z.object({
  slug: z.string().min(3),
});

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

/** stderr / message from execution service error payloads (HTTP or envelope). */
export function extractExecFailureMessage(execError: unknown): string {
  if (execError == null || typeof execError !== "object") {
    return "Unknown ERP error";
  }
  const root = execError as Record<string, unknown>;
  const err = root.error;
  if (err && typeof err === "object") {
    const er = err as Record<string, unknown>;
    const details = er.details;
    if (typeof details === "string") {
      return details;
    }
    if (details && typeof details === "object") {
      const stderr = (details as Record<string, unknown>).stderr;
      if (typeof stderr === "string") {
        return stderr;
      }
    }
    const msg = er.message;
    if (typeof msg === "string" && msg.length > 0) {
      return msg;
    }
  }
  return "Unknown ERP error";
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
 * HTTP client for erp-execution-service.
 * Site creation: `POST ${ERP_REMOTE_BASE_URL}/sites/create` (e.g. `http://erp-execution-service:8790/sites/create`).
 */
export class ErpExecutionServiceClient implements ErpExecutionReadDbPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly postSitesCreateImpl: PostSitesCreateImpl;

  constructor(config: ErpExecutionServiceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.postSitesCreateImpl =
      config.postSitesCreateImpl ??
      ((url, payload, options) => axios.post(url, payload, options));
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
      return { ok: false, code: result.code, message: result.message };
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
    let siteName: string;
    let domain: string;
    let apiUsername: string;
    try {
      siteName = normalizeOpaqueSiteString(body.site_name);
      domain = validateDomain(body.domain.trim());
      apiUsername = validateUsername(body.api_username.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: message || "Invalid provision input",
      };
    }

    try {
      slugSchema.parse({ slug: siteName });
    } catch (error) {
      const message =
        error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid slug" : String(error);
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        message: message || "Invalid provision input",
      };
    }

    const payload = { siteName, domain, apiUsername };
    const url = `${this.baseUrl}/sites/create`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      ...(opts?.requestId ? { "x-request-id": opts.requestId } : {}),
    };

    let data: unknown;
    try {
      console.log("➡️ CALLING EXECUTION SERVICE", { url, payload });

      const response = await this.postSitesCreateImpl(url, payload, {
        timeout: this.timeoutMs,
        headers,
      });

      console.log("⬅️ EXECUTION RESPONSE:", response.data);

      data = response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown }; message?: string };
      if (err.response) {
        const execError = err.response.data;
        console.error("❌ EXECUTION ERROR:", JSON.stringify(execError, null, 2));
        throw {
          status: "failure",
          step: "site_created",
          message: extractExecFailureMessage(execError),
          raw: execError,
        } satisfies ExecutionServiceFailure;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ NETWORK ERROR:", msg);
      throw {
        status: "failure",
        step: "site_created",
        message: `Execution service unreachable: ${msg}`,
      } satisfies ExecutionServiceFailure;
    }

    if (data !== null && typeof data === "object" && "ok" in data && (data as { ok: unknown }).ok === false) {
      const execError = data;
      console.error("❌ EXECUTION ERROR:", JSON.stringify(execError, null, 2));
      throw {
        status: "failure",
        step: "site_created",
        message: extractExecFailureMessage(execError),
        raw: execError,
      } satisfies ExecutionServiceFailure;
    }

    const envelopeParsed = RemoteExecutionEnvelopeSchema.safeParse(data);
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
        ...mapUpstreamFailure(envelope, 200),
        details: envelope.error,
      };
    }

    const dbName = extractDbNameFromMetadata(envelope.data.metadata);
    return {
      ok: true,
      data: {
        site_name: siteName,
        steps: [{ action: "createSite", durationMs: envelope.data.durationMs }],
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
