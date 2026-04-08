import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ErpExecutionReadDbPort } from "../clients/erp-execution-read-db-port.js";
import {
  ProvisionRequestSchema,
  type ProvisionRequest,
} from "../contracts/control-plane-api.js";
import { requireBearerToken } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import { sendPublicError, sendPublicSuccessProvision } from "../lib/public-api-response.js";

const SitesCreateCompatSchema = z.object({
  siteName: z.string().trim().min(1).max(2048),
  domain: z.string().trim().min(1),
  apiUsername: z.string().trim().min(1),
});

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

      await runProvisionRequest(client, req, reply, parsed.data);
    }
  );

  app.post(
    "/sites/create",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      logger.info({ body: req.body }, "Incoming /sites/create request");

      const parsed = SitesCreateCompatSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const message = first?.message ?? "Invalid request body";
        sendPublicError(reply, "VALIDATION_ERROR", message, 400);
        return;
      }

      const provisionCandidate = {
        site_name: parsed.data.siteName,
        domain: parsed.data.domain,
        api_username: parsed.data.apiUsername,
      };

      const provisionParsed = ProvisionRequestSchema.safeParse(provisionCandidate);
      if (!provisionParsed.success) {
        const first = provisionParsed.error.issues[0];
        const message = first?.message ?? "Invalid request body";
        sendPublicError(reply, "VALIDATION_ERROR", message, 400);
        return;
      }

      await runProvisionRequest(client, req, reply, provisionParsed.data);
    }
  );
}
