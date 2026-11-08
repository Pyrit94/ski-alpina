import { neighboursOn } from "@ski/shared";
import { useStableGame } from "./use-stable-game";

/**
 * What stands on the map: the players' own lifts, runs and stations, and the
 * neighbour areas' (see NEIGHBOURS). The scene draws both alike; a pick on a
 * neighbour's opens its card instead of an info panel (see `selectEntity`).
 */
export const useWorldLifts = () => useStableGame((s) => [...s.lifts, ...neighboursOn(s).flatMap((n) => n.lifts)]);
export const useWorldPistes = () => useStableGame((s) => [...s.pistes, ...neighboursOn(s).flatMap((n) => n.pistes)]);
export const useWorldBuildings = () =>
  useStableGame((s) => [...s.buildings, ...neighboursOn(s).flatMap((n) => n.buildings)]);
