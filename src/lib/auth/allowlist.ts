/**
 * Who is allowed in at all.
 *
 * A two-person game on a public URL needs an allowlist, not merely a login:
 * "sign in with Google" otherwise means *anyone with a Google account*. The
 * roster is deployment configuration (`ALLOWED_EMAILS`), never code, so adding
 * or removing a player is an environment change and not a release.
 *
 * Pure and dependency-free on purpose: it is enforced in three places — user
 * creation, session resolution and the websocket upgrade — and all three have
 * to agree exactly.
 */

/** Gmail treats these as the same mailbox, so the allowlist must too. */
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Reduce an address to the mailbox it actually reaches.
 *
 * Lowercased, and for Gmail also stripped of dots and any `+tag`, because
 * `m.uessle+ski@gmail.com` and `muessle@gmail.com` are one inbox. Treating
 * them as different would let a listed person be locked out by a harmless
 * typo, and — worse — invite the belief that a variant is a separate identity.
 */
export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return `${local}@${domain}`;
  const withoutTag = local.split("+", 1)[0] ?? "";
  return `${withoutTag.replaceAll(".", "")}@gmail.com`;
}

/** Parse `ALLOWED_EMAILS`: comma, semicolon or whitespace separated. */
export function parseAllowedEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    if (!part.includes("@")) continue;
    seen.add(normalizeEmail(part));
  }
  return [...seen];
}

/**
 * Whether this address may play.
 *
 * An empty roster allows nobody. That is the fail-closed direction: a
 * deployment that forgot the variable must lock everyone out and be noticed,
 * not quietly admit the whole internet.
 */
export function isEmailAllowed(
  email: string | null | undefined,
  allowed: readonly string[],
): boolean {
  if (allowed.length === 0) return false;
  if (!email) return false;
  return allowed.includes(normalizeEmail(email));
}

export interface RosterGate {
  /** Whether the roster decides access at all. */
  enforced: boolean;
  allowed: string[];
}

/**
 * Whether the roster gates this deployment, and who is on it.
 *
 * A deployment with a real database gates unconditionally: it has a public URL
 * and durable state, so forgetting `ALLOWED_EMAILS` has to lock the door and
 * be noticed on the first sign-in — not leave the resort open to every Google
 * account in the world. The throwaway preview, which has neither, does not
 * gate unless a roster was set explicitly.
 */
export function rosterGate(env: {
  ALLOWED_EMAILS?: string | undefined;
  DATABASE_URL?: string | undefined;
}): RosterGate {
  const allowed = parseAllowedEmails(env.ALLOWED_EMAILS);
  const configured = Boolean(env.ALLOWED_EMAILS?.trim());
  const deployed = Boolean(env.DATABASE_URL?.trim());
  return { enforced: configured || deployed, allowed };
}

/** Whether this address gets in under the given gate. */
export function rosterAdmits(gate: RosterGate, email: string | null | undefined): boolean {
  if (!gate.enforced) return true;
  return isEmailAllowed(email, gate.allowed);
}

/** A short, non-leaking reason to show someone who is not on the roster. */
export const NOT_ALLOWED_MESSAGE =
  "Dieses Konto ist fuer dieses Skigebiet nicht freigegeben.";
