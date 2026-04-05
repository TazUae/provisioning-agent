import { z } from "zod";
import { env } from "../config/env.js";
import { HealthResponseDataSchema, SuccessEnvelope } from "../contracts/provisioning.js";
import { mapUnknownToAgentError, sendFailure } from "../lib/errors.js";
import type { ErpExecutionBackend } from "../providers/erpnext/erp-execution-backend.js";

const ReadyHealthDataSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string().min(1),
  version: z.string().min(1).optional(),
  downstream: z.object({
    probed: z.boolean(),
    backend: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
  }),
});

export type RegisterHealthRoutesOptions = {
  erpBackend: ErpExecutionBackend;
};

export async function registerHealthRoutes(app: any, opts: RegisterHealthRoutesOptions): Promise<void> {
  app.get("/health", async () => {
    const data = HealthResponseDataSchema.parse({
      status: "ok",
      service: "provisioning-agent",
      version: "1.0.0",
    });

    const response: SuccessEnvelope<typeof data> = {
      ok: true,
      data,
      timestamp: new Date().toISOString(),
    };
    return response;
  });

  app.get("/health/ready", async (_req: unknown, reply: any) => {
    if (!env.ERP_HEALTH_CHECK_DOWNSTREAM) {
      const data = ReadyHealthDataSchema.parse({
        status: "ok",
        service: "provisioning-agent",
        version: "1.0.0",
        downstream: { probed: false },
      });
      const response: SuccessEnvelope<typeof data> = {
        ok: true,
        data,
        timestamp: new Date().toISOString(),
      };
      return response;
    }

    try {
      const result = await opts.erpBackend.healthCheck({ deep: false });
      const data = ReadyHealthDataSchema.parse({
        status: "ok",
        service: "provisioning-agent",
        version: "1.0.0",
        downstream: {
          probed: true,
          backend: opts.erpBackend.constructor.name,
          durationMs: result.durationMs,
        },
      });
      const response: SuccessEnvelope<typeof data> = {
        ok: true,
        data,
        timestamp: new Date().toISOString(),
      };
      return response;
    } catch (error) {
      const typed = mapUnknownToAgentError(error);
      sendFailure(reply, typed);
    }
  });
}
