import { RESEARCH_NODES, researchCost } from "@ski/config";
import { nodeStatus, researchEnabled } from "@ski/shared";
import { useGame } from "./store";

/**
 * Whether research is waiting on the players: nothing in progress, and
 * enough points banked for something they could start. Drives the dot on the
 * phone's research button, which is otherwise easy to forget.
 */
export function useResearchReady(): boolean {
  const research = useGame((s) => s.research);
  const match = useGame((s) => s.match);
  if (!researchEnabled({ match }) || research?.active) return false;
  const points = research?.points ?? 0;
  return RESEARCH_NODES.some((n) => nodeStatus({ research }, n.id) === "available" && points >= researchCost(n));
}
