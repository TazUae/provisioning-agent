/**
 * Thin proxy port for Phase 2 site-step endpoints on erp-execution-service.
 *
 * Every method forwards a request verbatim and returns the raw `{status, body}`
 * the execution-service replied with. The provisioning-agent routes relay
 * that response unchanged so the control-plane sees the Phase 2 envelope
 * (`{ok, data/error, timestamp}`) produced by the execution-service.
 *
 * This sits alongside the existing `ErpExecutionReadDbPort` rather than
 * extending it because the read-db port returns decoded results; this port
 * deliberately does not decode anything.
 */

export type ForwardedResponse = {
  status: number;
  body: unknown;
};

export type SiteOnlyForwardBody = {
  site: string;
  context?: { requestId?: string; tenantId?: string };
};

export type CreateSiteForwardBody = {
  siteName: string;
  domain: string;
  apiUsername: string;
  adminPassword: string;
};

export type SetupCompanyForwardBody = {
  site: string;
  companyName: string;
  companyAbbr: string;
  country: string;
  defaultCurrency: string;
  companyType?: string;
  domain?: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupLocaleForwardBody = {
  site: string;
  country: string;
  defaultCurrency: string;
  timezone: string;
  language: string;
  dateFormat: string;
  currencyPrecision: number;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupCompleteForwardBody = {
  site: string;
  companyName: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupFiscalYearForwardBody = {
  site: string;
  companyName: string;
  fiscalYearStartMonth?: number;
  companyAbbr?: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupGlobalDefaultsForwardBody = {
  site: string;
  companyName: string;
  defaultCurrency: string;
  fiscalYearName: string;
  country: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupDomainsForwardBody = {
  site: string;
  companyName: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupRolesForwardBody = {
  site: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupRegionalForwardBody = {
  site: string;
  country: string;
  companyName: string;
  companyAbbr?: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SmokeTestForwardBody = {
  site: string;
  companyName: string;
  apiKey: string;
  apiSecret: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SetupFitdeskForwardBody = {
  site: string;
  companyName: string;
  companyAbbr: string;
  controlPlaneWebhookUrl?: string;
  controlPlaneWebhookSecret?: string;
  context?: { requestId?: string; tenantId?: string };
};

export type SiteStepsForwarderPort = {
  createSite(body: CreateSiteForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  installErp(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  installFitdesk(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  enableScheduler(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupLocale(body: SetupLocaleForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupCompany(body: SetupCompanyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupComplete(body: SetupCompleteForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupFiscalYear(body: SetupFiscalYearForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupGlobalDefaults(body: SetupGlobalDefaultsForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupDomains(body: SetupDomainsForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupRegional(body: SetupRegionalForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupRoles(body: SetupRolesForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  addDomain(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  createApiUser(body: SiteOnlyForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  smokeTest(body: SmokeTestForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  setupFitdesk(body: SetupFitdeskForwardBody, opts?: { requestId?: string }): Promise<ForwardedResponse>;
  siteStatus(site: string, opts?: { requestId?: string }): Promise<ForwardedResponse>;
};
