import { FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { sendPublicError } from "./public-api-response.js";

export async function requireBearerToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    sendPublicError(reply, "AUTH_ERROR", "Missing Bearer token", 401);
    return;
  }

  const token = auth.slice("Bearer ".length).trim();
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(env.PROVISIONING_API_TOKEN);
  const valid =
    tokenBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(tokenBuffer, expectedBuffer);

  if (!token || !valid) {
    sendPublicError(reply, "AUTH_ERROR", "Invalid provisioning token", 401);
    return;
  }
}
