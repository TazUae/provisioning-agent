import type { ProvisionSiteResult } from "../../clients/erp-execution-read-db-port.js";
import type { PublicErrorCode } from "../../contracts/control-plane-api.js";
import { extractDbNameFromMetadata } from "../../lib/erp-metadata-db-name.js";
import { validateDomain, validateSite, validateUsername } from "../../providers/erpnext/validation.js";

export type LifecyclePostResult =
  | { ok: true; value: { durationMs: number; metadata?: Record<string, string | number | boolean> } }
  | { ok: false; code: PublicErrorCode; message: string };

export type OrchestrateProvisionInput = {
  siteName: string;
  /** When provided (non-empty), forwarded instead of deriving from `erpBaseDomain`. */
  domain?: string;
  /** When provided (non-empty), forwarded instead of prefix-based derivation. */
  apiUsername?: string;
  requestId?: string;
  erpBaseDomain: string;
  apiUsernamePrefix: string;
  postLifecycle: (
    action: string,
    payload: Record<string, unknown>,
    requestId?: string
  ) => Promise<LifecyclePostResult>;
};

/**
 * **TEMPORARY:** Multi-step provisioning orchestration until migration to
 * `POST /v1/erp/provision` on ERP Execution Service. All lifecycle ordering and derived
 * fields here are transitional; do not extend with new business rules—push them upstream.
 */
export async function orchestrateProvision(input: OrchestrateProvisionInput): Promise<ProvisionSiteResult> {
  let safeSite: string;
  let derivedDomain: string;
  let derivedApiUsername: string;
  try {
    safeSite = validateSite(input.siteName);
    const domainFromPayload = input.domain?.trim();
    if (domainFromPayload) {
      // ⚠️ Remove fallback logic once Control Plane provides full payload
      derivedDomain = validateDomain(domainFromPayload);
    } else {
      // ⚠️ TEMPORARY — move to ERP Execution Service (tenant domain policy).
      derivedDomain = validateDomain(`${safeSite}.${input.erpBaseDomain}`);
    }
    const apiUserFromPayload = input.apiUsername?.trim();
    if (apiUserFromPayload) {
      // ⚠️ Remove fallback logic once Control Plane provides full payload
      derivedApiUsername = validateUsername(apiUserFromPayload);
    } else {
      // ⚠️ TEMPORARY — move to ERP Execution Service (API user naming policy).
      derivedApiUsername = validateUsername(`${input.apiUsernamePrefix}_${safeSite}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: message || "Invalid site input",
    };
  }

  const requestId = input.requestId;
  const steps: Array<{ action: string; durationMs: number }> = [];
  let dbName: string | undefined;

  // ⚠️ TEMPORARY — move to ERP Execution Service (workflow / saga owned upstream).
  const ordered: Array<{ action: string; payload: Record<string, string> }> = [
    { action: "createSite", payload: { site: safeSite } },
    { action: "installErp", payload: { site: safeSite } },
    { action: "enableScheduler", payload: { site: safeSite } },
    { action: "addDomain", payload: { site: safeSite, domain: derivedDomain } },
    { action: "createApiUser", payload: { site: safeSite, apiUsername: derivedApiUsername } },
  ];

  for (const { action, payload } of ordered) {
    const r = await input.postLifecycle(action, payload, requestId);
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
