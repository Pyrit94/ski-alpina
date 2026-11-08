import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { neighboursOn } from "@ski/shared";
import { focusLift } from "./assist";
import { deviceStorage, loadSeen, markSeen, nextHint, type DiscoverHint, type HintAction } from "./discover";
import type { AssistFacts } from "./helper-status";
import { showNeighbour } from "./neighbours";
import { useGame } from "./store";

/** How long a hint stays up when nobody answers it. */
const HINT_MS = 30_000;

/** The hint on screen, and what this device has already shown (null: not read yet). */
const useHints = create<{ active: DiscoverHint | null; seen: Set<string> | null }>(() => ({ active: null, seen: null }));

/** Do what a hint's «Zeigen» offers: open the card (and look there), or the build menu. */
export function runHintAction(action: HintAction) {
  const g = useGame.getState();
  if (action.kind === "build") {
    g.setCategory(action.category);
    g.openHelper(null);
    g.setSheet("build");
    return;
  }
  const open = action.open;
  if (open.id === "neighbour") {
    const n = neighboursOn(g).find((x) => x.id === open.neighbourId);
    if (n) return showNeighbour(n);
  }
  g.openHelper(open);
  if (action.focus === "lift" && open.id === "midstation") focusLift(open.liftId);
}

/**
 * The discovery hint to show now, at most one. A hint counts as seen the
 * moment it appears (per device, see discover.ts); it stays until answered,
 * put away or timed out, steps aside while something is selected or being
 * built, and is dropped once a card or sheet opens — that is where the eye is.
 * `urgent`: the advisor has something broken to fix; no new hint meanwhile.
 */
export function useDiscoverHint(facts: AssistFacts, urgent: boolean): { hint: DiscoverHint | null; dismiss: () => void; act: () => void } {
  const phase = useGame((s) => s.phase);
  const selectedId = useGame((s) => s.selectedId);
  const cardOpen = useGame((s) => s.helper !== null || s.sheet !== "none");
  const active = useHints((s) => s.active);
  const seen = useHints((s) => s.seen);
  const aside = phase !== "idle" || !!selectedId;

  // Read on the client only: the server render has no storage.
  useEffect(() => {
    if (!useHints.getState().seen) useHints.setState({ seen: loadSeen(deviceStorage()) });
  }, []);
  useEffect(() => {
    if (cardOpen) useHints.setState({ active: null });
  }, [cardOpen]);

  const candidate = useMemo(
    () => (!seen || active ? null : nextHint(facts, seen, { busy: cardOpen || aside, urgent })),
    [facts, seen, active, cardOpen, aside, urgent],
  );
  useEffect(() => {
    if (!candidate) return;
    const { seen: was } = useHints.getState();
    useHints.setState({ active: candidate, seen: markSeen(deviceStorage(), was ?? new Set(), candidate.id) });
  }, [candidate]);

  const visible = active && !aside && !cardOpen ? active : null;
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => useHints.setState({ active: null }), HINT_MS);
    return () => clearTimeout(t);
  }, [visible]);

  return {
    hint: visible,
    dismiss: () => useHints.setState({ active: null }),
    act: () => {
      const h = useHints.getState().active;
      if (!h) return;
      useHints.setState({ active: null });
      runHintAction(h.action);
    },
  };
}
