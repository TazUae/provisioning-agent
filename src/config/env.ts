import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  PROVISIONING_API_TOKEN: z.string().min(16),
  /** Used by Docker backend bridge (`ERP_EXECUTION_BACKEND=docker`). Dev/test only. */
  ERP_CONTAINER_NAME: z.string().min(1).default("axiserp-erpnext-pnzjyk-backend-1"),
  ERP_ADMIN_PASSWORD: z.string().min(8),
  ERP_BENCH_PATH: z.string().min(1).default("/home/frappe/frappe-bench"),
  ERP_BENCH_EXECUTABLE: z.string().min(1).default("bench"),
  ERP_BASE_DOMAIN: z.string().min(1).default("erp.zaidan-group.com"),
  ERP_API_USERNAME_PREFIX: z.string().min(1).default("cp"),
  ERP_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(120_000),
  /**
   * When unset: `development` / `test` default to `docker`; `production` defaults to `remote`.
   * Set explicitly to avoid surprises (recommended in all environments).
   */
  ERP_EXECUTION_BACKEND: z.enum(["docker", "remote"]).optional(),
  /** Preferred base URL for erp-execution-service (falls back to `ERP_REMOTE_BASE_URL`). */
  ERP_EXECUTION_BASE_URL: z.string().trim().optional(),
  /** Bearer token for erp-execution-service (falls back to `ERP_REMOTE_TOKEN`). */
  ERP_EXECUTION_TOKEN: z.string().trim().optional(),
  /** Timeout for HTTP calls to erp-execution-service (falls back to `ERP_REMOTE_TIMEOUT_MS`). */
  ERP_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).optional(),
  ERP_REMOTE_BASE_URL: z.string().trim().optional(),
  ERP_REMOTE_TOKEN: z.string().trim().optional(),
  ERP_REMOTE_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(15000),
  /**
   * Must be `true` to use `ERP_EXECUTION_BACKEND=docker` when `NODE_ENV=production`.
   * Docker mode expects a host with Docker CLI and socket access — not the default container image.
   */
  ERP_DOCKER_ALLOW_IN_PRODUCTION: z.enum(["true", "false"]).optional(),
  /**
   * When `true`, `GET /health/ready` probes the configured ERP execution backend (downstream readiness).
   */
  ERP_HEALTH_CHECK_DOWNSTREAM: z.enum(["true", "false"]).default("false"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration: ${issues.join(", ")}`);
}

const raw = parsed.data;

function resolveExecutionBackend(): "docker" | "remote" {
  if (raw.ERP_EXECUTION_BACKEND !== undefined) {
    return raw.ERP_EXECUTION_BACKEND;
  }
  return raw.NODE_ENV === "production" ? "remote" : "docker";
}

const ERP_EXECUTION_BACKEND = resolveExecutionBackend();

function assertRemoteConfig(): { ERP_REMOTE_BASE_URL: string; ERP_REMOTE_TOKEN: string } {
  const urlRaw = (raw.ERP_EXECUTION_BASE_URL ?? raw.ERP_REMOTE_BASE_URL ?? "").trim();
  const tokenRaw = (raw.ERP_EXECUTION_TOKEN ?? raw.ERP_REMOTE_TOKEN ?? "").trim();
  const urlParse = z.string().url().safeParse(urlRaw);
  if (!urlParse.success || !tokenRaw || tokenRaw.length < 1) {
    const missing: string[] = [];
    if (!urlParse.success) {
      missing.push("ERP_EXECUTION_BASE_URL or ERP_REMOTE_BASE_URL (valid URL)");
    }
    if (!tokenRaw || tokenRaw.length < 1) {
      missing.push("ERP_EXECUTION_TOKEN or ERP_REMOTE_TOKEN");
    }
    throw new Error(
      `Invalid environment configuration: ERP_EXECUTION_BACKEND=remote requires ${missing.join(" and ")}`
    );
  }
  return { ERP_REMOTE_BASE_URL: urlParse.data, ERP_REMOTE_TOKEN: tokenRaw };
}

function assertDockerProductionAllowed(): void {
  if (raw.NODE_ENV !== "production" || ERP_EXECUTION_BACKEND !== "docker") {
    return;
  }
  if (raw.ERP_DOCKER_ALLOW_IN_PRODUCTION !== "true") {
    throw new Error(
      "Invalid environment configuration: ERP_EXECUTION_BACKEND=docker is not allowed in production " +
        "without ERP_DOCKER_ALLOW_IN_PRODUCTION=true (docker mode is for dev/test or special hosts with Docker CLI/socket)"
    );
  }
}

let ERP_REMOTE_BASE_URL: string | undefined;
let ERP_REMOTE_TOKEN: string | undefined;

const resolvedExecutionTimeoutMs = raw.ERP_EXECUTION_TIMEOUT_MS ?? raw.ERP_REMOTE_TIMEOUT_MS;

if (ERP_EXECUTION_BACKEND === "remote") {
  const remote = assertRemoteConfig();
  ERP_REMOTE_BASE_URL = remote.ERP_REMOTE_BASE_URL;
  ERP_REMOTE_TOKEN = remote.ERP_REMOTE_TOKEN;
} else {
  assertDockerProductionAllowed();
  ERP_REMOTE_BASE_URL = raw.ERP_EXECUTION_BASE_URL?.trim() || raw.ERP_REMOTE_BASE_URL?.trim() || undefined;
  ERP_REMOTE_TOKEN = raw.ERP_EXECUTION_TOKEN?.trim() || raw.ERP_REMOTE_TOKEN?.trim() || undefined;
}

export const env = {
  ...raw,
  ERP_EXECUTION_BACKEND,
  ERP_REMOTE_BASE_URL,
  ERP_REMOTE_TOKEN,
  ERP_EXECUTION_TIMEOUT_MS: resolvedExecutionTimeoutMs,
  ERP_HEALTH_CHECK_DOWNSTREAM: raw.ERP_HEALTH_CHECK_DOWNSTREAM === "true",
};

/**
 * Connection to erp-execution-service (HTTP). Required to run the provisioning-agent HTTP server (Phase 1+).
 * Prefer `ERP_EXECUTION_BASE_URL` / `ERP_EXECUTION_TOKEN`; `ERP_REMOTE_*` remains supported.
 */
export function getErpExecutionConnection(): { baseUrl: string; token: string; timeoutMs: number } {
  const baseUrl = (raw.ERP_EXECUTION_BASE_URL ?? raw.ERP_REMOTE_BASE_URL ?? "").trim();
  const token = (raw.ERP_EXECUTION_TOKEN ?? raw.ERP_REMOTE_TOKEN ?? "").trim();
  const urlParse = z.string().url().safeParse(baseUrl);
  if (!urlParse.success || token.length < 1) {
    throw new Error(
      "Invalid environment configuration: set ERP_EXECUTION_BASE_URL and ERP_EXECUTION_TOKEN " +
        "(or ERP_REMOTE_BASE_URL and ERP_REMOTE_TOKEN for compatibility)"
    );
  }
  return { baseUrl: urlParse.data, token, timeoutMs: resolvedExecutionTimeoutMs };
}
