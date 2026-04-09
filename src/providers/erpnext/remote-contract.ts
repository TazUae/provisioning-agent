import { z } from "zod";

export const RemoteExecutionSuccessDataSchema = z.object({
  durationMs: z.number().nonnegative(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type RemoteExecutionSuccessData = z.infer<typeof RemoteExecutionSuccessDataSchema>;

export const RemoteExecutionFailureSchema = z.object({
  code: z.string(),
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.unknown().optional(),
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
