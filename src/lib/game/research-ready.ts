import { RESEARCH_NODES, researchCost } from "@ski/config";
import { nodeStatus, researchEnabled } from "@ski/shared";
import { useGame } from "./store";

/**
 * Whether research is waiting on the players: nothing in progress, and
 * something they could start. Drives the dot on the
 * phone's research button, which is otherwise easy to forget.
 */
export function useResearchReady(): boolean {
  const research = useGame((s) => s.research);
  const match = useGame((s) => s.match);
  if (!researchEnabled({ match }) || research?.active) return false;
  // Points flow into whatever is running, so idle research is always worth a dot.
  return RESEARCH_NODES.some((n) => nodeStatus({ research }, n.id) === "available");
}

/**
 * For the advisor: whether research is running, and the node to suggest when
 * it is not — one that unlocks something new first, the cheapest of those.
 */
export function researchHint(state: Parameters<typeof nodeStatus>[0] & { match: Parameters<typeof researchEnabled>[0]["match"] }) {
  if (!researchEnabled({ match: state.match })) return undefined;
  const busy = !!state.research?.active;
  const open = RESEARCH_NODES.filter((n) => nodeStatus(state, n.id) === "available");
  const pick = [...open].sort(
    (a, b) => Number(!(b.effect.unlocks?.length)) - Number(!(a.effect.unlocks?.length)) || researchCost(a) - researchCost(b),
  )[0];
  return { busy, next: pick ? { id: pick.id, name: pick.name } : null };
}
