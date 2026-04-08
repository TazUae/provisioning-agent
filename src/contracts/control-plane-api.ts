import { z } from "zod";

/** Typed error codes returned to Control Plane (stable contract). */
export const PublicErrorCodeSchema = z.enum([
  "AUTH_ERROR",
  "VALIDATION_ERROR",
  "SITE_NOT_FOUND",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_HTTP_ERROR",
  "INVALID_UPSTREAM_RESPONSE",
  "INTERNAL_ERROR",
]);

export type PublicErrorCode = z.infer<typeof PublicErrorCodeSchema>;

export const PublicErrorBodySchema = z.object({
  code: PublicErrorCodeSchema,
  message: z.string().min(1),
});

export type PublicErrorBody = z.infer<typeof PublicErrorBodySchema>;

export const ApiFailureResponseSchema = z.object({
  success: z.literal(false),
  error: PublicErrorBodySchema,
});

export type ApiFailureResponse = z.infer<typeof ApiFailureResponseSchema>;

export const ApiSuccessReadDbNameSchema = z.object({
  success: z.literal(true),
  data: z.object({
    db_name: z.string().min(1),
  }),
});

export type ApiSuccessReadDbName = z.infer<typeof ApiSuccessReadDbNameSchema>;

export const ApiSuccessHealthSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.literal("ok"),
  }),
});

export type ApiSuccessHealth = z.infer<typeof ApiSuccessHealthSchema>;

export const ApiSuccessProvisionSchema = z.object({
  success: z.literal(true),
  data: z.object({
    site_name: z.string().min(1),
    steps: z.array(
      z.object({
        action: z.string().min(1),
        durationMs: z.number().nonnegative(),
      })
    ),
    db_name: z.string().min(1).optional(),
  }),
});

export type ApiSuccessProvision = z.infer<typeof ApiSuccessProvisionSchema>;

/**
 * Transitional: non-empty opaque site key. Validation responsibility will move to Control Plane or ERP Execution.
 */
export const SiteNameSchema = z.string().trim().min(1).max(2048);

export const ReadDbNameRequestSchema = z.object({
  site_name: SiteNameSchema,
});

export type ReadDbNameRequest = z.infer<typeof ReadDbNameRequestSchema>;

/** Provision: executor expects site, domain, and API user — forwarded as-is to `POST /sites/create`. */
export const ProvisionRequestSchema = ReadDbNameRequestSchema.extend({
  domain: z.string().trim().min(1),
  api_username: z.string().trim().min(1),
});

export type ProvisionRequest = z.infer<typeof ProvisionRequestSchema>;
