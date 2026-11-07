import { BY_ID, FLOW, isLift } from "@ski/config";
import type { ResortState } from "@ski/shared";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { spendable, walletMode } from "@ski/shared";
import { useGame } from "./store";

/**
 * The parts of the resort the rule panels read, as one object that only
 * changes when one of them does. A whole-store subscription would re-render
 * these panels on every pointer move.
 */
export function useResortView(): ResortState {
  const view = useGame(
    useShallow((s) => ({
      coins: s.coins,
      stars: s.stars,
      lifts: s.lifts,
      pistes: s.pistes,
      buildings: s.buildings,
      stats: s.stats,
      match: s.match,
      contributors: s.contributors,
    })),
  );
  return view as unknown as ResortState;
}

/** My money: the shared account, or my purse plus the total. */
export function useMyMoney(): { mine: number; total: number; separate: boolean } {
  const coins = useGame((s) => s.coins);
  const match = useGame((s) => s.match);
  const me = useGame((s) => s.playerId);
  return useMemo(() => {
    const view = { coins, match } as unknown as ResortState;
    const separate = walletMode(view);
    return { mine: spendable(view, me ?? undefined), total: coins, separate };
  }, [coins, match, me]);
}

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

