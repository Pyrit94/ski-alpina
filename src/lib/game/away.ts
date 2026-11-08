// Explicit extensions so the node test runner can load this directly.
import { TEAMPLAY } from "../../../packages/config/src/economy.ts";
import type { ActivityEntry, Proposal, ResortState } from "../../../packages/shared/src/types.ts";

/**
 * «Während du weg warst»: what changed since this player was last here.
 *
 * Each device keeps a small mark per game and player — when, how much money,
 * how many guests so far — and refreshes it while playing. Coming back after
 * a while compares the valley with that mark and lists what the others did.
 */
export interface AwayMark {
  at: number;
  coins: number;
  visitors: number;
  season: number;
  day: number;
}

export interface AwaySummary {
  minutes: number;
  coins: number;
  visitors: number;
  days: number;
  news: ActivityEntry[];
  proposals: Proposal[];
}

type View = Pick<ResortState, "coins" | "stats" | "season" | "day" | "activity" | "proposals">;

export function markOf(state: View, at = Date.now()): AwayMark {
  return { at, coins: Math.round(state.coins), visitors: Math.round(state.stats.visitorsTotal), season: state.season, day: state.day };
}

export function summarize(mark: AwayMark | null, state: View, me: string, now = Date.now()): AwaySummary | null {
  if (!mark) return null;
  const minutes = Math.round((now - mark.at) / 60_000);
  if (minutes < TEAMPLAY.awayMinutes) return null;
  const news = (state.activity ?? []).filter((a) => a.at > mark.at && a.actor !== me && a.actor !== "").slice(0, 8);
  const proposals = (state.proposals ?? []).filter((p) => p.by !== me);
  const coins = Math.round(state.coins - mark.coins);
  const visitors = Math.max(0, Math.round(state.stats.visitorsTotal - mark.visitors));
  const days = state.season === mark.season ? Math.max(0, state.day - mark.day) : 0;
  if (news.length === 0 && proposals.length === 0 && Math.abs(coins) < 1 && visitors === 0) return null;
  return { minutes, coins, visitors, days, news, proposals };
}

const key = (room: string, player: string) => `ski-away:${room}:${player}`;

export function readMark(room: string, player: string): AwayMark | null {
  try {
    const raw = localStorage.getItem(key(room, player));
    return raw ? (JSON.parse(raw) as AwayMark) : null;
  } catch {
    return null;
  }
}

export function writeMark(room: string, player: string, mark: AwayMark): void {
  try {
    localStorage.setItem(key(room, player), JSON.stringify(mark));
  } catch {
    // Private mode or storage full: the summary is a convenience.
  }
}

/** «3 Std.», «2 Tagen»: how long someone was away. */
export function awayLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} Std.`;
  return `${Math.round(hours / 24)} Tagen`;
}
