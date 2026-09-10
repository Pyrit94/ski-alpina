import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isEmailAllowed,
  normalizeEmail,
  parseAllowedEmails,
  rosterAdmits,
  rosterGate,
} from "./allowlist.ts";

test("an empty roster admits nobody", () => {
  // Fail closed: a deployment that forgot ALLOWED_EMAILS must lock everyone
  // out and be noticed, not quietly admit the whole internet.
  assert.equal(isEmailAllowed("michael@example.com", []), false);
  assert.equal(isEmailAllowed(null, []), false);
  assert.equal(isEmailAllowed("", parseAllowedEmails(undefined)), false);
  assert.equal(isEmailAllowed("anyone@gmail.com", parseAllowedEmails("")), false);
});

test("a listed address is admitted and an unlisted one is not", () => {
  const allowed = parseAllowedEmails("michael@example.com, johanna@example.com");
  assert.equal(isEmailAllowed("michael@example.com", allowed), true);
  assert.equal(isEmailAllowed("johanna@example.com", allowed), true);
  assert.equal(isEmailAllowed("someone.else@example.com", allowed), false);
});

test("no email means no access, whatever the roster says", () => {
  const allowed = parseAllowedEmails("michael@example.com");
  assert.equal(isEmailAllowed(null, allowed), false);
  assert.equal(isEmailAllowed(undefined, allowed), false);
  assert.equal(isEmailAllowed("", allowed), false);
});

test("case and surrounding space do not decide access", () => {
  const allowed = parseAllowedEmails("  Michael@Example.COM  ");
  assert.equal(isEmailAllowed("michael@example.com", allowed), true);
  assert.equal(isEmailAllowed("MICHAEL@EXAMPLE.COM", allowed), true);
});

test("gmail dots and plus tags are the same mailbox", () => {
  // One inbox, so one identity: otherwise a listed person is locked out by a
  // harmless typo, and a variant looks like a separate account.
  const allowed = parseAllowedEmails("muessle@gmail.com");
  assert.equal(isEmailAllowed("m.uessle@gmail.com", allowed), true);
  assert.equal(isEmailAllowed("mu.ess.le+ski@gmail.com", allowed), true);
  assert.equal(isEmailAllowed("muessle@googlemail.com", allowed), true);
  // A different mailbox is still different.
  assert.equal(isEmailAllowed("muessle2@gmail.com", allowed), false);
});

test("dots outside gmail are significant", () => {
  // Most providers do treat them as distinct addresses.
  const allowed = parseAllowedEmails("first.last@ventoo.ch");
  assert.equal(isEmailAllowed("first.last@ventoo.ch", allowed), true);
  assert.equal(isEmailAllowed("firstlast@ventoo.ch", allowed), false);
});

test("a plus tag outside gmail is significant", () => {
  const allowed = parseAllowedEmails("me@ventoo.ch");
  assert.equal(isEmailAllowed("me+ski@ventoo.ch", allowed), false);
});

test("the roster accepts commas, semicolons and newlines", () => {
  const allowed = parseAllowedEmails("a@x.com,b@x.com; c@x.com\n d@x.com");
  assert.deepEqual(allowed.sort(), ["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
});

test("junk entries are dropped rather than becoming a wildcard", () => {
  const allowed = parseAllowedEmails("not-an-email, *, , michael@example.com");
  assert.deepEqual(allowed, ["michael@example.com"]);
  assert.equal(isEmailAllowed("anyone@example.com", allowed), false);
  assert.equal(isEmailAllowed("*", allowed), false);
});

test("the roster is deduplicated across gmail spellings", () => {
  assert.deepEqual(parseAllowedEmails("M.Uessle@gmail.com, muessle+x@googlemail.com"), [
    "muessle@gmail.com",
  ]);
});

test("a deployment with a database gates even without a roster", () => {
  // The dangerous direction: a public URL plus a forgotten variable must not
  // mean "any Google account may play". It locks everyone out instead, which
  // gets noticed on the first sign-in.
  const gate = rosterGate({ DATABASE_URL: "postgres://x" });
  assert.equal(gate.enforced, true);
  assert.equal(rosterAdmits(gate, "anyone@gmail.com"), false);
  assert.equal(rosterAdmits(gate, "michael@example.com"), false);
});

test("a deployment with a roster admits exactly that roster", () => {
  const gate = rosterGate({
    DATABASE_URL: "postgres://x",
    ALLOWED_EMAILS: "michael@example.com, johanna@example.com",
  });
  assert.equal(rosterAdmits(gate, "michael@example.com"), true);
  assert.equal(rosterAdmits(gate, "johanna@example.com"), true);
  assert.equal(rosterAdmits(gate, "stranger@gmail.com"), false);
});

test("a roster set without a database still gates", () => {
  const gate = rosterGate({ ALLOWED_EMAILS: "michael@example.com" });
  assert.equal(gate.enforced, true);
  assert.equal(rosterAdmits(gate, "stranger@gmail.com"), false);
});

test("a throwaway preview with neither is left alone", () => {
  // No database, no public URL, no roster: gating here would only break the
  // existing preview sign-in for no security gain.
  const gate = rosterGate({});
  assert.equal(gate.enforced, false);
  assert.equal(rosterAdmits(gate, "anyone@gmail.com"), true);
  assert.equal(rosterAdmits(gate, null), true);
});

test("blank env values count as unset", () => {
  assert.equal(rosterGate({ ALLOWED_EMAILS: "   ", DATABASE_URL: "  " }).enforced, false);
});

test("normalizing leaves an address without an at-sign alone", () => {
  assert.equal(normalizeEmail("  NoAtSign "), "noatsign");
  assert.equal(normalizeEmail("@leading"), "@leading");
});
