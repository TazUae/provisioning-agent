import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  PROVISIONING_API_TOKEN: z.string().min(16),
  ERP_REMOTE_BASE_URL: z.string().trim().url(),
  ERP_REMOTE_TOKEN: z.string().trim().min(1),
  ERP_REMOTE_TIMEOUT_MS: z.coerce.number().int().min(1).max(1_800_000).default(15000),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment configuration: ${issues.join(", ")}`);
}

const raw = parsed.data;

const ERP_REMOTE_BASE_URL = raw.ERP_REMOTE_BASE_URL.trim();
const ERP_REMOTE_TOKEN = raw.ERP_REMOTE_TOKEN.trim();

export const env = {
  ...raw,
  ERP_REMOTE_BASE_URL,
  ERP_REMOTE_TOKEN,
};

/**
 * Connection to erp-execution-service (HTTP). Required to run the provisioning-agent HTTP server (Phase 1+).
 */
export function getErpExecutionConnection(): { baseUrl: string; token: string; timeoutMs: number } {
  return {
    baseUrl: raw.ERP_REMOTE_BASE_URL,
    token: raw.ERP_REMOTE_TOKEN,
    timeoutMs: raw.ERP_REMOTE_TIMEOUT_MS,
  };
}
