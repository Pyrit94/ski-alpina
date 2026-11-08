import { useMemo } from "react";
import { BY_ID, RESEARCH_BY_ID } from "@ski/config";
import {
  capacityFactor,
  getDem,
  hexToWorld,
  midStationSpots,
  neighbourCutOf,
  neighbourEstimate,
  neighboursOn,
  pistePoints,
  siteContext,
  siteFactors,
  siteKind,
  type PlacedLift,
  type ResortState,
} from "@ski/shared";
import { useStableGame } from "@/components/game/canvas/use-stable-game";
import { LOW_RUN_POINTS, type AssistFacts } from "./helper-status";
import { useResortLinks } from "./links";
import { useGame } from "./store";
import { useMyMoney } from "./team";

/** Glide to a lift, so its line and anything dashed along it are in view. */
export function focusLift(liftId: string) {
  const g = useGame.getState();
  const l = g.lifts.find((x) => x.id === liftId);
  if (!l) return;
  const a = hexToWorld(l.a.q, l.a.r);
  const b = hexToWorld(l.b.q, l.b.r);
  g.focusOn((a.x + b.x) / 2, (a.z + b.z) / 2);
}

/** Lift names that tell two chairlifts apart: «Sessellift 2». */
export function liftNames(lifts: readonly PlacedLift[]): Map<string, string> {
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const l of lifts) total.set(l.itemId, (total.get(l.itemId) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const l of lifts) {
    const n = (seen.get(l.itemId) ?? 0) + 1;
    seen.set(l.itemId, n);
    const name = BY_ID[l.itemId].name;
    out.set(l.id, l.name ?? ((total.get(l.itemId) ?? 0) > 1 ? `${name} ${n}` : name));
  }
  return out;
}

/**
 * What the «Assistent» and the discovery hints read off the resort. Kept
 * stable across ticks that change nothing: money counts in thousands, the
 * neighbours' share in whole percent.
 */
export function useAssistFacts(): AssistFacts {
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const done = useStableGame((s) => s.research?.done ?? []);
  const neighbours = useStableGame((s) => neighboursOn(s));
  const mode = useGame((s) => s.neighbours?.mode ?? "off");
  const cutPct = useGame((s) => Math.round((s.stats.neighbourCut ?? 0) * 1000));
  const mix = useGame((s) => s.pisteMix);
  const moneyK = Math.floor(useMyMoney().mine / 1000);
  const links = useResortLinks();

  const layout = useMemo(() => {
    const state = { ...useGame.getState(), lifts, pistes, buildings } as unknown as ResortState;
    const dem = getDem();
    const names = liftNames(lifts);

    // The village's businesses, weighted as «Dorf ordnen» weighs them.
    const factors = siteFactors(siteContext({ lifts, pistes, buildings }, dem));
    let weight = 0;
    let sum = 0;
    for (const b of buildings) {
      if (!siteKind(b.itemId)) continue;
      const w = (BY_ID[b.itemId]?.cost ?? 0) * capacityFactor(b);
      weight += w;
      sum += w * (factors.get(b.id) ?? 1);
    }

    const runs = pistes.filter((p) => p.itemId === "piste" && p.difficulty !== "road");
    const low = runs.filter((p) => p.score !== undefined && pistePoints(p) < LOW_RUN_POINTS).sort((a, b) => pistePoints(a) - pistePoints(b));
    const weakest = low[0];
    const runIndex = weakest ? runs.indexOf(weakest) + 1 : 0;

    const mid = lifts.find((l) => !l.mid && midStationSpots(state, dem, l.id).length > 0);
    return {
      runs: runs.length,
      lowRuns: low.length,
      lowRun: weakest ? { id: weakest.id, name: weakest.name || `Piste ${runIndex}`, points: pistePoints(weakest) } : null,
      villageAverage: weight > 0 ? sum / weight : null,
      midCandidate: mid ? { liftId: mid.id, name: names.get(mid.id) ?? BY_ID[mid.itemId].name } : null,
    };
  }, [lifts, pistes, buildings]);

  return useMemo(() => {
    const cut = cutPct / 1000;
    const view = { neighbours: { mode, list: neighbours } } as Pick<ResortState, "neighbours">;
    let top: AssistFacts["topNeighbour"] = null;
    for (const n of neighbours) {
      const share = neighbourCutOf(view, cut, n);
      if (share > 0 && (!top || share > top.share)) top = { id: n.id, name: n.name, share };
    }
    const money = moneyK * 1000;
    const forSale = neighbours.find((n) => money >= neighbourEstimate(n));

    let unlock: AssistFacts["researchUnlock"] = null;
    for (let i = done.length - 1; i >= 0 && !unlock; i--) {
      const node = RESEARCH_BY_ID[done[i]!];
      const itemId = node?.effect.unlocks?.[0];
      if (node && itemId) unlock = { nodeId: node.id, itemId, itemName: BY_ID[itemId].name, category: BY_ID[itemId].category };
    }

    return {
      lifts: lifts.length,
      liftsWithoutDescent: lifts.filter((l) => links.get(l.id) === "no-descent").length,
      ...layout,
      neighboursOn: neighbours.length > 0,
      topNeighbour: top,
      allPacts: neighbours.length > 0 && neighbours.every((n) => n.pact),
      buyable: forSale ? { id: forSale.id, name: forSale.name, estimate: neighbourEstimate(forSale) } : null,
      researchUnlock: unlock,
      mix,
    };
  }, [lifts, links, layout, neighbours, mode, cutPct, moneyK, done, mix]);
}
