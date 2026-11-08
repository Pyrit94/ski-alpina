import { useMemo, useState } from "react";
import { getDem, itemUnlocked, siteContext, siteFactors } from "@ski/shared";
import { computeNeeds } from "./needs";
import { useResortLinks } from "./links";
import { nextStep, type NextStep } from "./next-step";
import { researchHint } from "./research-ready";
import { useGame } from "./store";

/** Tips dismissed this session, by id: one stays away until the situation changes. */
const dismissed = new Set<string>();

/**
 * The advisor's single most useful next move (see next-step.ts), or null
 * when there is none or it was put away this session.
 */
export function useNextStep(): { step: NextStep | null; dismiss: () => void } {
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const buildings = useGame((s) => s.buildings);
  const stats = useGame((s) => s.stats);
  const flow = useGame((s) => s.flow);
  const coins = useGame((s) => s.coins);
  const links = useResortLinks();
  const [, setTick] = useState(0);

  const step = useMemo(
    () =>
      nextStep({
        lifts,
        pistes,
        buildings,
        stats,
        flow,
        links,
        coins,
        unlocked: (id) => itemUnlocked(useGame.getState(), id),
        research: researchHint(useGame.getState()),
        needs: computeNeeds({
          stats,
          buildings,
          coins,
          unlocked: (id) => itemUnlocked(useGame.getState(), id),
          site: siteFactors(siteContext({ lifts, pistes, buildings }, getDem())),
        }),
      }),
    [lifts, pistes, buildings, stats, flow, links, coins],
  );
  const shown = step && !dismissed.has(step.id) ? step : null;
  return {
    step: shown,
    dismiss: () => {
      if (!shown) return;
      dismissed.add(shown.id);
      setTick((n) => n + 1);
    },
  };
}
