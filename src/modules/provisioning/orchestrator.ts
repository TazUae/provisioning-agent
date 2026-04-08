import type { ProvisionSiteResult } from "../../clients/erp-execution-read-db-port.js";
import type { PublicErrorCode } from "../../contracts/control-plane-api.js";
import { logger } from "../../lib/logger.js";
import {
  DOMAIN_REGEX,
  normalizeOpaqueSiteString,
  validateDomain,
  validateUsername,
} from "../../providers/erpnext/validation.js";

function resolveDerivedDomainForProvision(safeSite: string, erpBaseDomain: string): string {
  if (DOMAIN_REGEX.test(safeSite)) {
    return validateDomain(safeSite);
  }
  return validateDomain(`${safeSite}.${erpBaseDomain}`);
}

export type ResolveCreateSiteFieldsInput = {
  siteName: string;
  /** When provided (non-empty), forwarded instead of deriving from `erpBaseDomain`. */
  domain?: string;
  /** When provided (non-empty), forwarded instead of prefix-based derivation. */
  apiUsername?: string;
  requestId?: string;
  erpBaseDomain: string;
  apiUsernamePrefix: string;
};

export type ResolvedCreateSiteFields =
  | { ok: true; siteName: string; domain: string; apiUsername: string }
  | { ok: false; code: PublicErrorCode; message: string };

/**
 * Resolves `siteName`, `domain`, and `apiUsername` for a single executor call to
 * `POST /sites/create`. Ordering and side effects beyond this live in erp-execution-service.
 */
export function resolveCreateSiteFields(input: ResolveCreateSiteFieldsInput): ResolvedCreateSiteFields {
  try {
    const safeSite = normalizeOpaqueSiteString(input.siteName);
    const domainFromPayload = input.domain?.trim();
    const domain = domainFromPayload
      ? validateDomain(domainFromPayload)
      : resolveDerivedDomainForProvision(safeSite, input.erpBaseDomain);
    const apiUserFromPayload = input.apiUsername?.trim();
    const apiUsername = apiUserFromPayload
      ? validateUsername(apiUserFromPayload)
      : validateUsername(`${input.apiUsernamePrefix}_${safeSite}`);

    return { ok: true, siteName: safeSite, domain, apiUsername };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: message || "Invalid site input",
    };
  }
}

export type ExecuteCreateSiteFromProvisionInput = ResolveCreateSiteFieldsInput & {
  postCreateSite: (
    body: { siteName: string; domain: string; apiUsername: string },
    requestId?: string
  ) => Promise<ProvisionSiteResult>;
};

/**
 * Orchestrates provision: resolve fields, delegate a single POST to erp-execution-service.
 */
export async function executeCreateSiteFromProvision(
  input: ExecuteCreateSiteFromProvisionInput
): Promise<ProvisionSiteResult> {
  const resolved = resolveCreateSiteFields(input);
  if (!resolved.ok) {
    return resolved;
  }

  const requestId = input.requestId;
  const correlation = requestId ? { requestId } : {};
  logger.info(correlation, "[Agent] Calling ERP execution POST /sites/create");

  const { siteName, domain, apiUsername } = resolved;
  return await input.postCreateSite({ siteName, domain, apiUsername }, requestId);
}
