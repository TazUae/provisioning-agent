import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireBearerToken } from "../lib/auth.js";
import { logger } from "../lib/logger.js";
import type {
  SiteStepsForwarderPort,
  ForwardedResponse,
  SetupCompleteForwardBody,
  SetupCompanyForwardBody,
  SetupDomainsForwardBody,
  SetupFiscalYearForwardBody,
  SetupFitdeskForwardBody,
  SetupGlobalDefaultsForwardBody,
  SetupLocaleForwardBody,
  SetupRegionalForwardBody,
  SetupRolesForwardBody,
  SmokeTestForwardBody,
} from "../clients/site-steps-forwarder-port.js";

/**
 * Phase 2 site-step forwarding routes. Each handler validates auth and the
 * minimal request payload, forwards to the corresponding erp-execution-service
 * endpoint, and relays the response body verbatim so the Phase 2 envelope
 * (`{ok, data|error, timestamp}`) the execution-service returned reaches the
 * control-plane unchanged.
 *
 * These routes deliberately do NOT re-shape the response into the
 * `{success, data|error}` envelope used by `/provision` and `/sites/create`
 * — those predate Phase 2 and will be removed when the provisioning-agent is
 * collapsed into the control-plane.
 */

const RequestContextSchema = z
  .object({
    requestId: z.string().min(1).optional(),
    tenantId: z.string().min(1).optional(),
  })
  .optional();

const SiteOperationBodySchema = z.object({
  site: z.string().trim().min(1),
  context: RequestContextSchema,
});

const CreateSiteBodySchema = z.object({
  siteName: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  apiUsername: z.string().trim().min(1),
  adminPassword: z.string().min(1),
});

const SetupLocaleBodySchema = z.object({
  site: z.string().trim().min(1),
  country: z.string().trim().min(2).max(2),
  defaultCurrency: z.string().trim().min(3).max(3),
  timezone: z.string().trim().min(1),
  language: z.string().trim().min(1).default("en"),
  dateFormat: z.string().trim().min(1).default("dd-mm-yyyy"),
  currencyPrecision: z.number().int().min(0).max(9).default(2),
  context: RequestContextSchema,
});

const SetupCompanyBodySchema = z.object({
  site: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  companyAbbr: z.string().trim().min(1).max(10),
  country: z.string().trim().min(2).max(2),
  defaultCurrency: z.string().trim().min(3).max(3),
  companyType: z.string().trim().min(1).default("Company"),
  domain: z.string().trim().min(1).default("Services"),
  context: RequestContextSchema,
});

const SetupCompleteBodySchema = z.object({
  site: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  context: RequestContextSchema,
});

const SetupFiscalYearBodySchema = z.object({
  site: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  companyAbbr: z.string().trim().default(""),
  context: RequestContextSchema,
});

const SetupGlobalDefaultsBodySchema = z.object({
  site: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  defaultCurrency: z.string().trim().min(3).max(3),
  fiscalYearName: z.string().trim().min(1),
  country: z.string().trim().min(2).max(2),
  context: RequestContextSchema,
});

const SetupDomainsBodySchema = z.object({
  site: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  context: RequestContextSchema,
});

const SetupRegionalBodySchema = z.object({
  site: z.string().trim().min(1),
  country: z.string().trim().min(2).max(2),
  companyName: z.string().trim().min(1),
  companyAbbr: z.string().trim().default(""),
  context: RequestContextSchema,
});

const SetupRolesBodySchema = z.object({
  site: z.string().trim().min(1),
  context: RequestContextSchema,
});

const SmokeTestBodySchema = z.object({
  site: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  apiSecret: z.string().trim().min(1),
  context: RequestContextSchema,
});

const SetupFitdeskBodySchema = z.object({
  site: z.string().trim().min(1),
  companyName: z.string().trim().min(1),
  companyAbbr: z.string().trim().default(""),
  controlPlaneWebhookUrl: z.string().url().optional(),
  controlPlaneWebhookSecret: z.string().min(1).optional(),
  context: RequestContextSchema,
});

const SiteStatusParamsSchema = z.object({
  site: z.string().trim().min(1),
});

export async function registerSiteStepsRoutes(
  app: FastifyInstance,
  forwarder: SiteStepsForwarderPort
): Promise<void> {
  app.post(
    "/sites/create",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = CreateSiteBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const forwarded = await forwarder.createSite(parsed.data, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/install-erp",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SiteOperationBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const forwarded = await forwarder.installErp(parsed.data, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/enable-scheduler",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SiteOperationBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const forwarded = await forwarder.enableScheduler(parsed.data, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-locale",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupLocaleBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, country, defaultCurrency, timezone, language, dateFormat, currencyPrecision, context } = parsed.data;
      const body: SetupLocaleForwardBody = {
        site,
        country,
        defaultCurrency,
        timezone,
        language,
        dateFormat,
        currencyPrecision,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupLocale(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-company",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupCompanyBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, companyName, companyAbbr, country, defaultCurrency, companyType, domain, context } = parsed.data;
      const body: SetupCompanyForwardBody = {
        site,
        companyName,
        companyAbbr,
        country,
        defaultCurrency,
        companyType,
        domain,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupCompany(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-complete",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupCompleteBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, companyName, context } = parsed.data;
      const body: SetupCompleteForwardBody = {
        site,
        companyName,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupComplete(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-fiscal-year",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupFiscalYearBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, companyName, fiscalYearStartMonth, companyAbbr, context } = parsed.data;
      const body: SetupFiscalYearForwardBody = {
        site,
        companyName,
        fiscalYearStartMonth,
        companyAbbr,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupFiscalYear(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-global-defaults",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupGlobalDefaultsBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, companyName, defaultCurrency, fiscalYearName, country, context } = parsed.data;
      const body: SetupGlobalDefaultsForwardBody = {
        site,
        companyName,
        defaultCurrency,
        fiscalYearName,
        country,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupGlobalDefaults(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-domains",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupDomainsBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, companyName, context } = parsed.data;
      const body: SetupDomainsForwardBody = {
        site,
        companyName,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupDomains(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-regional",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupRegionalBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, country, companyName, companyAbbr, context } = parsed.data;
      const body: SetupRegionalForwardBody = {
        site,
        country,
        companyName,
        companyAbbr,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupRegional(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-roles",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupRolesBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, context } = parsed.data;
      const body: SetupRolesForwardBody = {
        site,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupRoles(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/add-domain",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SiteOperationBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const forwarded = await forwarder.addDomain(parsed.data, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/create-api-user",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SiteOperationBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const forwarded = await forwarder.createApiUser(parsed.data, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/smoke-test",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SmokeTestBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, companyName, apiKey, apiSecret, context } = parsed.data;
      const body: SmokeTestForwardBody = {
        site,
        companyName,
        apiKey,
        apiSecret,
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.smokeTest(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.post(
    "/sites/setup-fitdesk",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SetupFitdeskBodySchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const { site, companyName, companyAbbr, controlPlaneWebhookUrl, controlPlaneWebhookSecret, context } = parsed.data;
      const body: SetupFitdeskForwardBody = {
        site,
        companyName,
        companyAbbr,
        ...(controlPlaneWebhookUrl ? { controlPlaneWebhookUrl } : {}),
        ...(controlPlaneWebhookSecret ? { controlPlaneWebhookSecret } : {}),
        ...(context ? { context } : {}),
      };
      const forwarded = await forwarder.setupFitdesk(body, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );

  app.get<{ Params: { site: string } }>(
    "/sites/:site/status",
    { preHandler: [requireBearerToken] },
    async (req, reply) => {
      const parsed = SiteStatusParamsSchema.safeParse(req.params);
      if (!parsed.success) return sendValidationError(reply, parsed.error);
      const forwarded = await forwarder.siteStatus(parsed.data.site, { requestId: req.id });
      sendForwarded(reply, forwarded);
    }
  );
}

/**
 * Exported so `app.ts` (or a follow-up) can migrate `/sites/create` onto the
 * same verbatim-forwarder path. Not registered here to keep this change
 * narrowly scoped to the 5 new routes that currently 404.
 */
export { CreateSiteBodySchema };

function sendForwarded(reply: FastifyReply, forwarded: ForwardedResponse): void {
  const status = forwarded.status || 502;
  const body = forwarded.body ?? {
    ok: false,
    error: {
      code: "ERP_PARTIAL_SUCCESS",
      message: "Upstream erp-execution-service returned an empty response body",
      retryable: false,
    },
    timestamp: new Date().toISOString(),
  };
  if (status >= 500) {
    logger.warn({ status, body }, "Upstream erp-execution-service returned failure");
  }
  void reply.status(status).send(body);
}

function sendValidationError(reply: FastifyReply, error: z.ZodError): void {
  const message =
    error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; ") || "Invalid request body";
  void reply.status(422).send({
    ok: false,
    error: {
      code: "ERP_VALIDATION_FAILED",
      message,
      retryable: false,
    },
    timestamp: new Date().toISOString(),
  });
}
