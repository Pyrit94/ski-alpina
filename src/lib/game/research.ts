import { useMemo } from "react";
import { buildCost, discounted, itemUnlocked } from "@ski/shared";
import type { ItemId } from "@ski/config";
import { useGame } from "./store";

/**
 * What building costs and allows for this resort, research included.
 *
 * The same rules the server validates with (`buildCost`, `itemUnlocked`), so a
 * price shown in a menu is the price charged and an item research has opened
 * is not shown as locked.
 */
export function useBuildTerms() {
  const xp = useGame((s) => s.xp);
  const research = useGame((s) => s.research);
  const match = useGame((s) => s.match);
  return useMemo(() => {
    const state = { xp, research, match };
    return {
      locked: (id: ItemId) => !itemUnlocked(state, id),
      cost: (id: ItemId) => buildCost(state, id),
      discount: (chf: number) => discounted(state, chf),
    };
  }, [xp, research, match]);
}
