import type { FastifyInstance } from "fastify";
import { sendPublicSuccessHealth } from "../lib/public-api-response.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_req, reply) => {
    sendPublicSuccessHealth(reply);
  });
}
