import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";
import {
  ProvisionRequestSchema,
  type ProvisionRequest,
} from "../contracts/control-plane-api.js";
import { isExecutionServiceFailure } from "../clients/erp-execution-service-client.js";
import { requireBearerToken } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { sendPublicError, sendPublicSuccessProvision } from "../lib/public-api-response.js";

async function runProvisionRequest(
  client: ErpExecutionReadDbPort,
  req: FastifyRequest,
  reply: FastifyReply,
  body: ProvisionRequest
): Promise<void> {
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
    if (isExecutionServiceFailure(error)) {
      logger.error(
        {
          message: error.message,
          step: error.step,
          raw: error.raw ?? null,
        },
        "ERP create site FAILED"
      );
      return reply.code(500).send({
        success: false,
        status: error.status,
        step: error.step,
        error: error.message,
        details: error.raw ?? null,
      });
    }
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
          body:
            req.body && typeof req.body === "object"
              ? {
                  site_name: (req.body as Record<string, unknown>).site_name,
                  domain: (req.body as Record<string, unknown>).domain,
                  api_username: (req.body as Record<string, unknown>).api_username,
                }
              : null,
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

      await runProvisionRequest(client, req, reply, parsed.data);
    }
  );
}
