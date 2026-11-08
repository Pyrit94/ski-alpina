import { SITE } from "../../../config/src/economy.ts";
import type { ItemId } from "../../../config/src/ids.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexDistance, hexesInRange, hexKey, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PlacedBuilding, ResortState } from "../types.ts";
import { siteContext, siteFactorOf, siteFixed, siteKind, siteNeighbours, villageMovable, type SiteKind } from "./site.ts";
import { capacityFactor, moveCost } from "./state.ts";
import { validateGround } from "./validate.ts";

/**
 * The village optimiser: proposes where the buildings that serve guests
 * should stand, so each one gets the best location factor it can (see SITE).
 *
 * Only a proposal. It moves restaurants, shops, hotels and the noisy service
 * buildings; car parks and bus stations stay, because guests arrive there and
 * the lifts are laid out around them. A move has to be worth it: it must lift
 * the resort's location value by a noticeable share, and there is a cap on
 * how many buildings one proposal moves.
 */
export interface VillageMove {
  id: string;
  itemId: ItemId;
  from: Axial;
  to: Axial;
}

export interface VillagePlan {
  moves: VillageMove[];
  /** List price of all moves, before research discounts. */
  cost: number;
  /** Value-weighted mean location factor, now and after the moves. */
  before: number;
  after: number;
}

/** What a building's location is worth, for weighing one move against another. */
function weightOf(b: PlacedBuilding): number {
  if (!siteKind(b.itemId)) return 0;
  return (BY_ID[b.itemId]?.cost ?? 0) * capacityFactor(b);
}

type Layout = Pick<ResortState, "lifts" | "pistes" | "buildings">;

export function planVillage(state: Layout, dem: Dem): VillagePlan {
  const ctx = siteContext(state, dem);
  const movable = state.buildings.filter((b) => villageMovable(b.itemId));
  const fixedHexes = new Set<string>();
  for (const b of state.buildings) if (!villageMovable(b.itemId)) fixedHexes.add(hexKey(b.q, b.r));
  for (const l of state.lifts) {
    fixedHexes.add(hexKey(l.a.q, l.a.r));
    fixedHexes.add(hexKey(l.b.q, l.b.r));
  }
  // Runs and roads stay clear: nobody builds a hotel on the piste.
  const onRun = new Set<string>();
  for (const p of state.pistes) for (const h of p.hexes) onRun.add(hexKey(h.q, h.r));

  // Candidate places: around the village and the valley stations.
  const seen = new Set<string>();
  const places: Axial[] = [];
  const add = (h: Axial) => {
    const k = hexKey(h.q, h.r);
    if (seen.has(k) || fixedHexes.has(k) || onRun.has(k)) return;
    seen.add(k);
    places.push(h);
  };
  for (const h of hexesInRange(ctx.village, SITE.villageRadius)) add(h);
  for (const s of ctx.starts.slice(1)) for (const h of hexesInRange(s, SITE.stationRadius)) add(h);
  places.sort((a, b) => a.q - b.q || a.r - b.r);

  const groundOk = new Map<string, boolean>();
  const fits = (itemId: string, h: Axial) => {
    const k = `${itemId}@${h.q},${h.r}`;
    let ok = groundOk.get(k);
    if (ok === undefined) {
      ok = validateGround(dem, h.q, h.r, itemId as ItemId).ok;
      groundOk.set(k, ok);
    }
    return ok;
  };

  const fixedCache = new Map<string, ReturnType<typeof siteFixed>>();
  const fixedOf = (kind: SiteKind, h: Axial) => {
    const k = `${kind}@${h.q},${h.r}`;
    let v = fixedCache.get(k);
    if (!v) {
      v = siteFixed(ctx, kind, h);
      fixedCache.set(k, v);
    }
    return v;
  };

  // The layout under trial: every building, movable ones at their trial spot.
  const pos = new Map<string, Axial>(movable.map((b) => [b.id, { q: b.q, r: b.r }]));
  const trial = state.buildings.map((b) => ({ ...b }));
  const index = new Map(trial.map((b, i) => [b.id, i]));
  const place = (id: string, h: Axial) => {
    pos.set(id, h);
    const t = trial[index.get(id)!]!;
    t.q = h.q;
    t.r = h.r;
  };
  const weights = new Map(state.buildings.map((b) => [b.id, weightOf(b)]));
  const totalWeight = [...weights.values()].reduce((n, w) => n + w, 0);
  const valuable = state.buildings.filter((b) => (weights.get(b.id) ?? 0) > 0);

  const factorOf = (b: PlacedBuilding) => {
    const kind = siteKind(b.itemId)!;
    return siteFactorOf([...fixedOf(kind, b), ...siteNeighbours(kind, b, trial, b.id)]);
  };
  // Only buildings near a changed spot can change their factor.
  const scoreAround = (spots: readonly Axial[]) => {
    let n = 0;
    for (const b of valuable) {
      const t = trial[index.get(b.id)!]!;
      if (!spots.some((s) => hexDistance(s, t) <= SITE.spaReach) && !spots.some((s) => s.q === t.q && s.r === t.r)) continue;
      n += (weights.get(b.id) ?? 0) * factorOf(t);
    }
    return n;
  };
  const scoreAll = () => valuable.reduce((n, b) => n + (weights.get(b.id) ?? 0) * factorOf(trial[index.get(b.id)!]!), 0);

  const before = totalWeight > 0 ? scoreAll() / totalWeight : 1;
  const meanWeight = valuable.length ? totalWeight / valuable.length : 0;
  const threshold = SITE.minGain * meanWeight;
  const original = new Map(movable.map((b) => [b.id, { q: b.q, r: b.r }]));
  const movedCount = () => movable.filter((b) => {
    const p = pos.get(b.id)!;
    const o = original.get(b.id)!;
    return p.q !== o.q || p.r !== o.r;
  }).length;

  // Most valuable first: they get the best spots.
  const order = [...movable].sort((a, b) => (weights.get(b.id) ?? 0) - (weights.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const b of order) {
      const from = pos.get(b.id)!;
      let best: { to: Axial; other?: string; gain: number } | null = null;
      for (const to of places) {
        if (to.q === from.q && to.r === from.r) continue;
        if (!fits(b.itemId, to)) continue;
        const other = movable.find((o) => o.id !== b.id && pos.get(o.id)!.q === to.q && pos.get(o.id)!.r === to.r);
        if (other && !fits(other.itemId, from)) continue;
        const spots = [from, to];
        const was = scoreAround(spots);
        place(b.id, to);
        if (other) place(other.id, from);
        const gain = scoreAround(spots) - was;
        place(b.id, from);
        if (other) place(other.id, to);
        if (gain > threshold && (!best || gain > best.gain)) best = { to, other: other?.id, gain };
      }
      if (!best) continue;
      place(b.id, best.to);
      if (best.other) place(best.other, from);
      if (movedCount() > SITE.maxMoves) {
        place(b.id, from);
        if (best.other) place(best.other, best.to);
        continue;
      }
      improved = true;
    }
    if (!improved) break;
  }

  const moves: VillageMove[] = [];
  for (const b of movable) {
    const to = pos.get(b.id)!;
    if (to.q === b.q && to.r === b.r) continue;
    moves.push({ id: b.id, itemId: b.itemId, from: { q: b.q, r: b.r }, to });
  }
  const after = totalWeight > 0 ? scoreAll() / totalWeight : 1;
  return {
    moves,
    cost: moves.reduce((n, m) => n + moveCost(state as ResortState, m.itemId), 0),
    before: Math.round(before * 1000) / 1000,
    after: Math.round(after * 1000) / 1000,
  };
}
