import { useRef } from "react";
import { useGame } from "@/lib/game/store";
import { keepIfSame } from "./stable";

type GameState = ReturnType<typeof useGame.getState>;

/**
 * `useGame(select)`, but stable across snapshots that change nothing.
 *
 * The component still hears about the store change, but receives the same
 * reference back, so React bails out of the re-render and every memo keyed on
 * the value survives.
 */
export function useStableGame<T>(select: (s: GameState) => T): T {
  const cache = useRef<{ value: T; sig: string } | null>(null);
  return useGame((s) => {
    const next = keepIfSame(cache.current, select(s));
    cache.current = next;
    return next.value;
  });
}
