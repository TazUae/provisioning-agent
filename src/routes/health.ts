import type { FastifyInstance } from "fastify";
import { sendPublicSuccessHealth } from "../lib/public-api-response.js";

/**
 * Liveness probe: returns only `{ success, data: { status } }` — no secrets or dependency details.
 *
 * TODO: Restrict access or move behind internal network (load balancer / mesh policy).
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_req, reply) => {
    sendPublicSuccessHealth(reply);
  });
}
