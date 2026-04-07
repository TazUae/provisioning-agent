import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOpaqueSiteString, validateDomain, validateUsername } from "./validation.js";

test("normalizeOpaqueSiteString accepts trimmed non-empty strings", () => {
  assert.equal(normalizeOpaqueSiteString("  acme  "), "acme");
  assert.equal(normalizeOpaqueSiteString("tenant.example.com"), "tenant.example.com");
});

test("normalizeOpaqueSiteString rejects empty", () => {
  assert.throws(() => normalizeOpaqueSiteString("   "), /required/i);
});

test("validateDomain accepts valid FQDN", () => {
  assert.equal(validateDomain("acme.erp.local"), "acme.erp.local");
});

test("validateDomain rejects invalid domain", () => {
  assert.throws(() => validateDomain("acme"), /invalid domain format/i);
});

test("validateUsername enforces safe pattern", () => {
  assert.equal(validateUsername("cp_acme"), "cp_acme");
  assert.throws(() => validateUsername("1bad"), /invalid username format/i);
});
