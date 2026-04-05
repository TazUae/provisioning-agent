import { env } from "../../config/env.js";
import { DockerExecBackend } from "./docker-exec-backend.js";
import { RemoteErpBackend } from "./remote-erp-backend.js";
import type { ErpExecutionBackend } from "./erp-execution-backend.js";

/**
 * Selects the ERP execution backend from `ERP_EXECUTION_BACKEND`.
 * In production, the default is `remote` when unset; in development/test, `docker` when unset.
 * See `src/config/env.ts` and README for required variables per mode.
 */
export function createErpExecutionBackend(
  backendName: "docker" | "remote" = env.ERP_EXECUTION_BACKEND
): ErpExecutionBackend {
  if (backendName === "remote") {
    return new RemoteErpBackend();
  }
  return new DockerExecBackend();
}
