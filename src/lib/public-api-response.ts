import type { FastifyReply } from "fastify";
import type {
  ApiFailureResponse,
  ApiSuccessHealth,
  ApiSuccessProvision,
  ApiSuccessReadDbName,
  PublicErrorCode,
} from "../contracts/control-plane-api.js";

export function httpStatusForPublicError(code: PublicErrorCode): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 400;
    case "SITE_NOT_FOUND":
      return 404;
    case "UPSTREAM_TIMEOUT":
      return 504;
    case "AUTH_ERROR":
    case "UPSTREAM_HTTP_ERROR":
    case "INVALID_UPSTREAM_RESPONSE":
      return 502;
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}

export function sendPublicSuccessReadDbName(reply: FastifyReply, dbName: string): void {
  const body: ApiSuccessReadDbName = {
    success: true,
    data: { db_name: dbName },
  };
  void reply.code(200).send(body);
}

export function sendPublicSuccessHealth(reply: FastifyReply): void {
  const body: ApiSuccessHealth = {
    success: true,
    data: { status: "ok" },
  };
  void reply.code(200).send(body);
}

export function sendPublicSuccessProvision(
  reply: FastifyReply,
  data: ApiSuccessProvision["data"]
): void {
  const body: ApiSuccessProvision = {
    success: true,
    data,
  };
  void reply.code(200).send(body);
}

export function sendPublicError(
  reply: FastifyReply,
  code: PublicErrorCode,
  message: string,
  httpStatus?: number
): void {
  const status = httpStatus ?? httpStatusForPublicError(code);
  const body: ApiFailureResponse = {
    success: false,
    error: { code, message },
  };
  void reply.code(status).send(body);
}
