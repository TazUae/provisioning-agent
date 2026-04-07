import type { FastifyInstance } from "fastify";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";
import { ProvisionRequestSchema } from "../contracts/control-plane-api.js";
import { requireBearerToken } from "../lib/auth.js";
import {
  httpStatusForPublicError,
  sendPublicError,
  sendPublicSuccessProvision,
} from "../lib/public-api-response.js";

export async function registerProvisionRoute(
  app: FastifyInstance,
  client: ErpExecutionReadDbPort
): Promise<void> {
  app.post(
    "/provision",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = ProvisionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const message = first?.message ?? "Invalid request body";
        sendPublicError(reply, "VALIDATION_ERROR", message, 400);
        return;
      }

      const result = await client.provisionSite(parsed.data, { requestId: req.id });

      if (!result.ok) {
        sendPublicError(reply, result.code, result.message, httpStatusForPublicError(result.code));
        return;
      }

      sendPublicSuccessProvision(reply, result.data);
    }
  );
}
