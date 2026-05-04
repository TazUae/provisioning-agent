import type { FastifyInstance } from "fastify";

/**
 * Liveness probe. Returns the control-plane envelope format:
 *   { ok: true, data: { status, service }, timestamp }
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_req, reply) => {
    void reply.code(200).send({
      ok: true,
      data: { status: "ok", service: "provisioning-agent" },
      timestamp: new Date().toISOString(),
    });
  });
}
