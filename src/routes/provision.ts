import type { FastifyInstance } from "fastify";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";
import { ProvisionRequestSchema } from "../contracts/control-plane-api.js";
import { requireBearerToken } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { sendPublicError, sendPublicSuccessProvision } from "../lib/public-api-response.js";

export async function registerProvisionRoute(
  app: FastifyInstance,
  client: ErpExecutionReadDbPort
): Promise<void> {
  app.post(
    "/provision",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      logger.info(
        {
          body: req.body,
          headers: req.headers,
        },
        "Incoming create site request"
      );

      const parsed = ProvisionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const message = first?.message ?? "Invalid request body";
        sendPublicError(reply, "VALIDATION_ERROR", message, 400);
        return;
      }

      const body = parsed.data;
      logger.info(
        {
          siteName: body.site_name,
          domain: body.domain,
          apiUsername: body.api_username,
        },
        "Calling ERP create site"
      );

      try {
        const result = await client.provisionSite(body, { requestId: req.id });

        if (!result.ok) {
          logger.error(
            {
              error: result.message,
              response: result.details ?? null,
            },
            "ERP create site FAILED"
          );
          return reply.code(500).send({
            success: false,
            error: result.message || "ERP execution failed",
            details: result.details ?? null,
          });
        }

        logger.info({ result }, "ERP create site SUCCESS");

        sendPublicSuccessProvision(reply, result.data);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(
          {
            error: err.message,
            stack: err.stack,
            response: (err as { response?: { data?: unknown } }).response?.data,
          },
          "ERP create site FAILED"
        );
        return reply.code(500).send({
          success: false,
          error: err.message || "ERP execution failed",
          details: (err as { response?: { data?: unknown } }).response?.data ?? null,
        });
      }
    }
  );
}
