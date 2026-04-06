import type { FastifyInstance } from "fastify";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";
import { ReadDbNameRequestSchema } from "../contracts/control-plane-api.js";
import { requireBearerToken } from "../lib/auth.js";
import {
  httpStatusForPublicError,
  sendPublicError,
  sendPublicSuccessReadDbName,
} from "../lib/public-api-response.js";

export async function registerReadDbNameRoute(
  app: FastifyInstance,
  client: ErpExecutionReadDbPort
): Promise<void> {
  app.post(
    "/sites/read-db-name",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = ReadDbNameRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const message = first?.message ?? "Invalid request body";
        sendPublicError(reply, "VALIDATION_ERROR", message, 400);
        return;
      }

      const siteName = parsed.data.site_name;
      const result = await client.readDbName(siteName);

      if (!result.ok) {
        sendPublicError(reply, result.code, result.message, httpStatusForPublicError(result.code));
        return;
      }

      sendPublicSuccessReadDbName(reply, result.dbName);
    }
  );
}
