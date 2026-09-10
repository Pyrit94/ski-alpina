import { rosterAdmits, rosterGate, NOT_ALLOWED_MESSAGE } from "@/lib/auth/allowlist";
import { auth, authConfigured } from "@/lib/auth/server";

/**
 * Who is on the other end of a websocket, decided by the server.
 *
 * The upgrade used to carry no identity at all: `join` took a display name and
 * a token the client invented, so on a public URL anyone who could load the
 * page could build in the resort — the authoritative-server rule protected the
 * rules of the game but not who was allowed to play it. The session cookie
 * rides the upgrade request like any other, so it is verified here, before a
 * socket is accepted.
 */
export interface SocketIdentity {
  /** The account. Stable, so a reconnect resumes instead of duplicating. */
  userId: string;
  name: string;
  email: string | null;
}

export type SocketAuth =
  | { ok: true; identity: SocketIdentity }
  /** Local development with auth off and no database: nobody to identify. */
  | { ok: true; identity: null }
  | { ok: false; status: number; reason: string };

/** A friendly display name from whatever the account actually gave us. */
export function displayName(name: string | null | undefined, email: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed.slice(0, 24);
  const local = email?.split("@", 1)[0]?.trim();
  if (local) return local.slice(0, 24);
  return "Gast";
}

/**
 * Verify an upgrade request's session.
 *
 * One rule, the same one `scripts/ws-server.mjs` applies in production: the
 * socket demands a signed-in, allow-listed account exactly when the roster is
 * enforced — that is, once `ALLOWED_EMAILS` or `DATABASE_URL` is set. A bare
 * `npm run dev` has neither and stays open, so local play needs no OAuth
 * round-trip; anything with a real database is closed.
 *
 * Keying on the roster rather than on `authConfigured` matters: the preview
 * client id makes auth look configured even on a laptop, which would have
 * locked development out of its own game.
 */
export async function authenticateUpgrade(cookieHeader: string | undefined): Promise<SocketAuth> {
  const gate = rosterGate(process.env);
  if (!gate.enforced) return { ok: true, identity: null };

  if (!authConfigured) {
    // The door is locked and no key exists. Fail closed and say why.
    console.error(
      "[ski] the roster is enforced but no sign-in is configured — set GOOGLE_CLIENT_ID " +
        "and GOOGLE_CLIENT_SECRET, or nobody can play.",
    );
    return { ok: false, status: 500, reason: "Anmeldung ist nicht eingerichtet" };
  }

  const headers = new Headers();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers });
  } catch {
    return { ok: false, status: 401, reason: "Sitzung konnte nicht geprueft werden" };
  }
  if (!session?.user) return { ok: false, status: 401, reason: "Nicht angemeldet" };

  if (!rosterAdmits(gate, session.user.email)) {
    console.warn(
      `[ski] refused socket for ${session.user.email ?? "an account with no email"}: not on ALLOWED_EMAILS`,
    );
    return { ok: false, status: 403, reason: NOT_ALLOWED_MESSAGE };
  }

  return {
    ok: true,
    identity: {
      userId: session.user.id,
      name: displayName(session.user.name, session.user.email ?? null),
      email: session.user.email ?? null,
    },
  };
}
