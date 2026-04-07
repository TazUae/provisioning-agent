import { z } from "zod";

/** Transitional: used only where a hostname must match Frappe/domain rules (fallback paths). */
export const DOMAIN_REGEX = /^(?=.{3,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;
export const USERNAME_REGEX = /^[a-z][a-z0-9_.-]{2,63}$/;

const DomainSchema = z.string().trim().min(1).toLowerCase().regex(DOMAIN_REGEX, "invalid domain format");
const UsernameSchema = z.string().trim().min(3).toLowerCase().regex(USERNAME_REGEX, "invalid username format");

const OPAQUE_SITE_MAX = 2048;

/**
 * Transitional: site identifiers are opaque to this agent. Stricter validation lives in
 * Control Plane or ERP Execution Service.
 */
export function normalizeOpaqueSiteString(input: string): string {
  const s = input.trim();
  if (s.length === 0) {
    throw new Error("site_name is required");
  }
  if (s.length > OPAQUE_SITE_MAX) {
    throw new Error(`site_name must be at most ${OPAQUE_SITE_MAX} characters`);
  }
  return s;
}

export function validateDomain(input: string): string {
  return DomainSchema.parse(input);
}

export function validateUsername(input: string): string {
  return UsernameSchema.parse(input);
}
