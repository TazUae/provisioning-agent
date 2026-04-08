import { z } from "zod";

export const RemoteExecutionSuccessDataSchema = z.object({
  durationMs: z.number().nonnegative(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type RemoteExecutionSuccessData = z.infer<typeof RemoteExecutionSuccessDataSchema>;

export const RemoteExecutionFailureCodeSchema = z.enum([
  "INFRA_UNAVAILABLE",
  "ERP_COMMAND_FAILED",
  "ERP_TIMEOUT",
  "ERP_VALIDATION_FAILED",
  "ERP_PARTIAL_SUCCESS",
  "SITE_ALREADY_EXISTS",
  "SITE_NOT_FOUND",
]);
export type RemoteExecutionFailureCode = z.infer<typeof RemoteExecutionFailureCodeSchema>;

export const RemoteExecutionFailureSchema = z.object({
  code: RemoteExecutionFailureCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.string().optional(),
});
export type RemoteExecutionFailure = z.infer<typeof RemoteExecutionFailureSchema>;

export const RemoteExecutionSuccessEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: RemoteExecutionSuccessDataSchema,
  timestamp: z.string().min(1).optional(),
});
export type RemoteExecutionSuccessEnvelope = z.infer<typeof RemoteExecutionSuccessEnvelopeSchema>;

export const RemoteExecutionFailureEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: RemoteExecutionFailureSchema,
  timestamp: z.string().min(1).optional(),
});
export type RemoteExecutionFailureEnvelope = z.infer<typeof RemoteExecutionFailureEnvelopeSchema>;

export const RemoteExecutionEnvelopeSchema = z.union([
  RemoteExecutionSuccessEnvelopeSchema,
  RemoteExecutionFailureEnvelopeSchema,
]);
export type RemoteExecutionEnvelope = z.infer<typeof RemoteExecutionEnvelopeSchema>;

export function isExecutionFailureCode(code: string): code is RemoteExecutionFailureCode {
  return RemoteExecutionFailureCodeSchema.safeParse(code).success;
}
