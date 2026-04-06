import type { PublicErrorCode } from "../contracts/control-plane-api.js";

export type ReadDbNameResult =
  | { ok: true; dbName: string }
  | { ok: false; code: PublicErrorCode; message: string };

/** Minimal dependency for `POST /sites/read-db-name` (test doubles implement this). */
export type ErpExecutionReadDbPort = {
  readDbName(siteName: string): Promise<ReadDbNameResult>;
};
