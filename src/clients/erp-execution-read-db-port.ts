import type { PublicErrorCode } from "../contracts/control-plane-api.js";

export type ReadDbNameResult =
  | { ok: true; dbName: string }
  | { ok: false; code: PublicErrorCode; message: string };

export type ProvisionSiteSuccessData = {
  site_name: string;
  steps: Array<{ action: string; durationMs: number }>;
  /** Present when `createSite` returned `dbName` in executor metadata. */
  db_name?: string;
};

export type ProvisionSiteResult =
  | { ok: true; data: ProvisionSiteSuccessData }
  | { ok: false; code: PublicErrorCode; message: string };

/** Minimal dependency for ERP execution HTTP routes (test doubles implement this). */
export type ErpExecutionReadDbPort = {
  readDbName(siteName: string): Promise<ReadDbNameResult>;
  provisionSite(siteName: string, opts?: { requestId?: string }): Promise<ProvisionSiteResult>;
};
