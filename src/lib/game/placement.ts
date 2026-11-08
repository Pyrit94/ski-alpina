import { useMemo } from "react";
import { FLOW, SITE, isLift, isPiste, type ItemId } from "@ski/config";
import {
  getDem,
  hexDistance,
  hexesInRange,
  hexKey,
  hexToWorld,
  siteAt,
  siteContext,
  siteImpact,
  siteKind,
  validateHex,
  type SiteContext,
  type SiteImpact,
  type SiteReport,
} from "@ski/shared";
import { useStableGame } from "@/components/game/canvas/use-stable-game";
import { useGame } from "./store";

type GameState = ReturnType<typeof useGame.getState>;
type Axial = { q: number; r: number };

/** Places worth looking at for a building: around the village, the valley stations and, for food, along the runs. */
function candidates(ctx: SiteContext, itemId: ItemId): Axial[] {
  const seen = new Set<string>();
  const out: Axial[] = [];
  const add = (h: Axial) => {
    const k = hexKey(h.q, h.r);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(h);
  };
  for (const h of hexesInRange(ctx.village, SITE.villageRadius)) add(h);
  for (const s of ctx.starts.slice(1)) for (const h of hexesInRange(s, SITE.stationRadius)) add(h);
  if (siteKind(itemId) === "food") for (const r of ctx.runHexes) for (const h of hexesInRange(r, 1)) add(h);
  return out;
}

/**
 * The best free spot for a building: the highest location factor, without
 * spoiling the neighbours, nearest the village when it is a tie. Car parks and
 * bus stations go next to a valley station, away from the hotels.
 */
export function bestSpot(state: GameState, itemId: ItemId): Axial | null {
  if (isLift(itemId) || isPiste(itemId)) return null;
  const dem = getDem();
  const ctx = siteContext(state, dem);
  const runs = new Set<string>();
  for (const p of state.pistes) for (const h of p.hexes) runs.add(hexKey(h.q, h.r));
  const kind = siteKind(itemId);
  const door = itemId === "parking" || itemId === "bus" || itemId === "train";
  let best: Axial | null = null;
  let bestScore = -Infinity;
  for (const h of candidates(ctx, itemId)) {
    if (runs.has(hexKey(h.q, h.r))) continue;
    if (!validateHex(state, dem, h.q, h.r, itemId).ok) continue;
    let score = kind ? siteAt(ctx, itemId, h).factor : 1;
    if (door) {
      const station = Math.min(...ctx.starts.map((s) => hexDistance(s, h)));
      score -= station <= FLOW.linkRadius ? 0 : 0.05 * station;
    }
    for (const i of siteImpact(ctx, itemId, h)) score += (i.after - i.before) * 0.6;
    score -= hexDistance(h, ctx.village) * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/** Pick a building to build and glide to its best spot, ghost already on it. */
export function buildAtBest(itemId: ItemId) {
  const g = useGame.getState();
  g.setBuildItem(itemId);
  const now = useGame.getState();
  if (now.buildItem !== itemId || now.phase !== "place") return;
  const spot = bestSpot(now, itemId);
  if (!spot) return;
  const w = hexToWorld(spot.q, spot.r);
  now.focusOn(w.x, w.z);
  now.hoverHex(spot.q, spot.r);
}

export interface SitePreview {
  report: SiteReport | null;
  impacts: SiteImpact[];
}

/** What the building under the cursor would get from its spot, and do to its neighbours. */
export function useSitePreview(): SitePreview {
  const buildItem = useGame((s) => s.buildItem);
  const phase = useGame((s) => s.phase);
  const movingId = useGame((s) => s.movingId);
  const hover = useGame((s) => s.hover);
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const ctx = useMemo(
    () =>
      siteContext(
        { lifts, pistes, buildings: movingId ? buildings.filter((b) => b.id !== movingId) : buildings },
        getDem(),
      ),
    [lifts, pistes, buildings, movingId],
  );
  return useMemo(() => {
    if (!buildItem || phase !== "place" || !hover || !hover.valid) return { report: null, impacts: [] };
    const report = siteKind(buildItem) ? siteAt(ctx, buildItem, hover) : null;
    return { report, impacts: siteImpact(ctx, buildItem, hover) };
  }, [ctx, buildItem, phase, hover]);
}

/** «108 %»: a factor as the players read it. */
export const pct = (f: number) => `${Math.round(f * 100)} %`;

/** Text colour class for a location factor. */
export function siteTone(f: number): string {
  if (f >= 1.03) return "text-success";
  if (f <= 0.97) return "text-warn";
  return "text-navy";
}
