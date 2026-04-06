import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import type { ErpExecutionReadDbPort } from "./clients/erp-execution-read-db-port.js";
import { ErpExecutionServiceClient } from "./clients/erp-execution-service-client.js";
import { env, getErpExecutionConnection } from "./config/env.js";
import { logger, loggerConfig } from "./lib/logger.js";
import { sendPublicError } from "./lib/public-api-response.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProvisionRoute } from "./routes/provision.js";
import { registerReadDbNameRoute } from "./routes/read-db-name.js";

export type BuildAppOptions = {
  /** Injected for tests; production uses `getErpExecutionConnection()`. */
  erpExecutionClient?: ErpExecutionReadDbPort;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const client =
    options.erpExecutionClient ??
    new ErpExecutionServiceClient({
      ...getErpExecutionConnection(),
      erpBaseDomain: env.ERP_BASE_DOMAIN,
      apiUsernamePrefix: env.ERP_API_USERNAME_PREFIX,
    });

  const app = Fastify({
    logger: loggerConfig,
    disableRequestLogging: true,
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  });

  app.setErrorHandler((error, _req, reply) => {
    logger.error({ error }, "Unhandled error");
    sendPublicError(
      reply,
      "INTERNAL_ERROR",
      "An unexpected error occurred while processing the request"
    );
  });

  await registerHealthRoutes(app);
  await registerReadDbNameRoute(app, client);
  await registerProvisionRoute(app, client);

  return app;
}
