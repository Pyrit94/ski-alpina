import { useMemo } from "react";
import { neighboursOn, type Neighbour } from "@ski/shared";
import { useGame } from "@/lib/game/store";

/**
 * What stands on the map: the players' own lifts, runs and stations, and the
 * neighbour areas' (see NEIGHBOURS). The scene draws both alike; a pick on a
 * neighbour's opens its card instead of an info panel (see `selectEntity`).
 *
 * Each list is read as the store holds it — snapshots keep unchanged fields'
 * objects (see `stabilize` in store.ts) — and only combined when one of the
 * two parts changed, so nothing is rebuilt on a tick that moved nothing.
 */
function useWorld<T>(own: T[], pick: (n: Neighbour) => T[]): T[] {
  const neighbours = useGame((s) => s.neighbours);
  return useMemo(() => {
    const list = neighboursOn({ neighbours });
    return list.length === 0 ? own : [...own, ...list.flatMap(pick)];
    // `pick` is a fixed accessor per hook below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, neighbours]);
}

export const useWorldLifts = () => useWorld(useGame((s) => s.lifts), (n) => n.lifts);
export const useWorldPistes = () => useWorld(useGame((s) => s.pistes), (n) => n.pistes);
export const useWorldBuildings = () => useWorld(useGame((s) => s.buildings), (n) => n.buildings);
