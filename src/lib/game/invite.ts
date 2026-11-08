import { GameIdSchema } from "../../../packages/shared/src/protocol/intents.ts";

/**
 * «Komm in mein Gebiet»: a link straight into one game.
 *
 * `https://<host>/?spiel=<gameId>`. A query parameter on the start page
 * rather than a route of its own, so the sign-in round-trip and the start
 * screen stay exactly as they are: the link only says which game to open once
 * the start screen is reached. Who may play is still decided by the roster
 * and the game's kind on the server; the link grants nothing by itself.
 */
export const INVITE_PARAM = "spiel";

/** Where the id waits while sign-in leaves the page and comes back. */
const PENDING_KEY = "ski-alpina-invite";

/** The invitation link for a game, on this site. */
export function inviteUrl(origin: string, gameId: string): string {
  const url = new URL("/", origin);
  url.searchParams.set(INVITE_PARAM, gameId);
  return url.toString();
}

/** The game an address invites to, or null when there is none (or it is not a game id). */
export function parseInvite(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const id = url.searchParams.get(INVITE_PARAM)?.trim();
  if (!id) return null;
  return GameIdSchema.safeParse(id).success ? id : null;
}

/** The same address without the invitation, so a reload does not follow it again. */
export function withoutInvite(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(INVITE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The invitation this page was opened with, taken once.
 *
 * Read from the address and then removed from it (history.replaceState), so
 * the URL bar is clean; kept for this tab until the start screen uses it,
 * because signing in leaves the page and comes back without the parameter.
 */
export function takeInvite(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = parseInvite(window.location.href);
  if (fromUrl) {
    try {
      window.sessionStorage.setItem(PENDING_KEY, fromUrl);
    } catch {
      /* private mode: the link still works without sign-in in between */
    }
    window.history.replaceState(window.history.state, "", withoutInvite(window.location.href));
    return fromUrl;
  }
  try {
    const kept = window.sessionStorage.getItem(PENDING_KEY);
    return kept && GameIdSchema.safeParse(kept).success ? kept : null;
  } catch {
    return null;
  }
}

let taken: { id: string | null } | null = null;

/**
 * `takeInvite`, done once per page and then remembered: a stable value for
 * `useSyncExternalStore`, so the server's render (no invitation) and the
 * browser's agree.
 */
export function pageInvite(): string | null {
  taken ??= { id: takeInvite() };
  return taken.id;
}

/** The invitation has been followed (or turned out to lead nowhere). */
export function forgetInvite(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing kept */
  }
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Hand the link on: the phone's share sheet when there is one, the clipboard
 * otherwise. Must be called from the tap itself, or browsers refuse both.
 */
export async function shareInvite(url: string, resortName: string): Promise<ShareResult> {
  const text = `Komm in mein Skigebiet «${resortName}» und bau mit!`;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Ski Alpina", text, url });
      return "shared";
    } catch (err) {
      // Closing the share sheet is not an error worth a fallback.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
