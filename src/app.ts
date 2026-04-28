import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import type { ErpExecutionReadDbPort } from "./clients/erp-execution-read-db-port.js";
import { ErpExecutionServiceClient } from "./clients/erp-execution-service-client.js";
import type { SiteStepsForwarderPort } from "./clients/site-steps-forwarder-port.js";
import { SiteStepsForwarder } from "./clients/site-steps-forwarder.js";
import { getErpExecutionConnection } from "./config/env.js";
import { logger, loggerConfig } from "./lib/logger.js";
import { isExecutionServiceFailure } from "./clients/erp-execution-service-client.js";
import { sendPublicError } from "./lib/public-api-response.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerProvisionRoute } from "./routes/provision.js";
import { registerReadDbNameRoute } from "./routes/read-db-name.js";
import { registerSiteStepsRoutes } from "./routes/site-steps.js";

export type BuildAppOptions = {
  /** Injected for tests; production uses `getErpExecutionConnection()`. */
  erpExecutionClient?: ErpExecutionReadDbPort;
  /** Injected for tests; production builds a `SiteStepsForwarder` from env. */
  siteStepsForwarder?: SiteStepsForwarderPort;
  /** Controls legacy Phase-1 route registration (`/provision`, legacy `/sites/create`). */
  enableProvisionRoutes?: boolean;
  /** Controls Phase-2 site-step forwarding route registration. */
  enableSiteStepRoutes?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const enableProvisionRoutes = options.enableProvisionRoutes !== false;
  const enableSiteStepRoutes = options.enableSiteStepRoutes === true;
  const client =
    options.erpExecutionClient ??
    new ErpExecutionServiceClient({
      ...getErpExecutionConnection(),
    });
  const siteStepsForwarder =
    options.siteStepsForwarder ?? new SiteStepsForwarder(getErpExecutionConnection());

  const app = Fastify({
    logger: loggerConfig,
    disableRequestLogging: true,
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  });

  app.setErrorHandler((error, _req, reply) => {
    if (isExecutionServiceFailure(error)) {
      logger.error(
        { message: error.message, step: error.step, raw: error.raw ?? null },
        "Execution service failure"
      );
      void reply.code(500).send({
        success: false,
        status: error.status,
        step: error.step,
        error: error.message,
        details: error.raw ?? null,
      });
      return;
    }
    logger.error({ error }, "Unhandled error");
    sendPublicError(
      reply,
      "INTERNAL_ERROR",
      "An unexpected error occurred while processing the request"
    );
  });

  await registerHealthRoutes(app);
  await registerReadDbNameRoute(app, client);
  if (enableProvisionRoutes) {
    await registerProvisionRoute(app, client);
  }
  if (enableSiteStepRoutes) {
    await registerSiteStepsRoutes(app, siteStepsForwarder);
  }

  return app;
}
