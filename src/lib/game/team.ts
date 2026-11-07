import { BY_ID, FLOW, isLift } from "@ski/config";
import type { ResortState } from "@ski/shared";
import { useGame } from "./store";

/** Chat lines from others that this player has not seen yet. */
export function useUnreadChat(): number {
  const chat = useGame((s) => s.chat);
  const seen = useGame((s) => s.chatSeen);
  const me = useGame((s) => s.playerId);
  return chat.slice(seen).filter((c) => c.actor !== me).length;
}


/** What each player built over the match, for the end-of-match awards. */
export interface PlayerTally {
  id: string;
  name: string;
  lifts: number;
  pisteKm: number;
  hosting: number;
  builds: number;
  spent: number;
  decisions: number;
}

export function tallyPlayers(state: Pick<ResortState, "contributors" | "lifts" | "pistes" | "buildings" | "match">): PlayerTally[] {
  const t = new Map<string, PlayerTally>();
  const get = (id: string) => {
    let row = t.get(id);
    if (!row) {
      const c = state.contributors[id];
      row = { id, name: c?.name ?? "?", lifts: 0, pisteKm: 0, hosting: 0, builds: c?.builds ?? 0, spent: c?.coinsSpent ?? 0, decisions: 0 };
      t.set(id, row);
    }
    return row;
  };
  for (const id of Object.keys(state.contributors)) get(id);
  for (const l of state.lifts) if (l.builtBy) get(l.builtBy).lifts += 1;
  for (const p of state.pistes) {
    if (!p.builtBy || p.difficulty === "road") continue;
    get(p.builtBy).pisteKm += Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment;
  }
  for (const b of state.buildings) {
    if (!b.builtBy || isLift(b.itemId)) continue;
    const item = BY_ID[b.itemId];
    if (item?.beds || item?.seatsPerHour || item?.retailPerHour) get(b.builtBy).hosting += 1;
  }
  for (const r of state.match.history) if (r.eventBy) get(r.eventBy).decisions += 1;
  return [...t.values()].filter((r) => r.name !== "?");
}

