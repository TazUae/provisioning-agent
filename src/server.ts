import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { buildApp } from "./app.js";

try {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info({ port: env.PORT }, "Provisioning agent started");
} catch (error) {
  logger.error({ error }, "Provisioning agent startup failed");
  process.exit(1);
}
