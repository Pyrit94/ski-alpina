import { SITE } from "../../../config/src/economy.ts";
import { isLift, type ItemId } from "../../../config/src/ids.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexDistance, hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PlacedBuilding, ResortState } from "../types.ts";

/**
 * Where a building stands, and what that is worth.
 *
 * Every building that serves guests gets a location factor around 1 (see
 * SITE): a hut on the run does better than one in the woods, a hotel next to
 * the car park earns a little less a night. The factor is made of a fixed
 * part, read off runs, stations and the village, and a neighbour part, read
 * off the buildings around it. Keeping them apart lets the placement preview
 * and the village optimiser try many spots cheaply.
 */
export type SiteKind = "food" | "trade" | "beds";

export interface SiteEffect {
  label: string;
  delta: number;
}

export interface SiteReport {
  factor: number;
  effects: SiteEffect[];
}

/** What a placed building's surroundings are made of. */
export interface SiteContext {
  /** Each run and each lift as a set of hexes: its line, or its two stations. */
  features: Axial[][];
  /** Every run hex, roads excluded. */
  runHexes: Axial[];
  /** Valley stations and the village centre: where guests start their day. */
  starts: Axial[];
  village: Axial;
  buildings: readonly PlacedBuilding[];
}

const TRADE: readonly string[] = ["shop", "skischool", "ticket"];

export function siteKind(itemId: string): SiteKind | null {
  const item = BY_ID[itemId as ItemId];
  if (!item || isLift(itemId as ItemId)) return null;
  if ((item.beds ?? 0) > 0) return "beds";
  if ((item.seatsPerHour ?? 0) > 0) return "food";
  if (TRADE.includes(itemId)) return "trade";
  return null;
}

/** Whether a building affects its neighbours' factors (noise, quiet, spa, rivals). */
export function siteNeighbourly(itemId: string): boolean {
  return (
    (SITE.noisy as readonly string[]).includes(itemId) || itemId === "tree" || itemId === "spa" || siteKind(itemId) === "food"
  );
}

/** Service buildings worth moving only for their neighbours' sake. */
const SHIFTABLE: readonly string[] = ["workshop", "depot", "groomer", "spa"];

/** What the village optimiser may move: car parks, bus stations and lift stations stay. */
export function villageMovable(itemId: string): boolean {
  if (isLift(itemId as ItemId)) return false;
  return siteKind(itemId) !== null || SHIFTABLE.includes(itemId);
}

type Layout = Pick<ResortState, "lifts" | "pistes" | "buildings">;

/**
 * The surroundings, from the layout. With `now`, only what is finished
 * counts — the engine's view; without, what is planned counts too — the
 * preview's view.
 */
export function siteContext(state: Layout, dem: Dem, now?: number): SiteContext {
  const ready = <T extends { readyAt: number }>(x: T) => now === undefined || x.readyAt <= now;
  const lifts = state.lifts.filter(ready);
  const runs = state.pistes.filter((p) => ready(p) && p.difficulty !== "road");
  const elev = (h: Axial) => {
    const w = hexToWorld(h.q, h.r);
    return dem.sample(w.x, w.z);
  };
  const village = dem.region.villageHex;
  return {
    features: [...runs.map((p) => p.hexes), ...lifts.map((l) => [l.a, l.b])],
    runHexes: runs.flatMap((p) => p.hexes),
    starts: [village, ...lifts.map((l) => (elev(l.a) <= elev(l.b) ? l.a : l.b))],
    village,
    buildings: now === undefined ? state.buildings : state.buildings.filter(ready),
  };
}

const minDistance = (hex: Axial, list: readonly Axial[]) => {
  let best = Infinity;
  for (const h of list) {
    const d = hexDistance(hex, h);
    if (d < best) best = d;
    if (best === 0) break;
  }
  return best;
};

/** The part of the factor read off runs, stations and the village. */
export function siteFixed(ctx: SiteContext, kind: SiteKind, hex: Axial): SiteEffect[] {
  const out: SiteEffect[] = [];
  if (kind === "food") {
    let near = 0;
    let closest = Infinity;
    for (const f of ctx.features) {
      const d = minDistance(hex, f);
      if (d < closest) closest = d;
      if (d <= SITE.near) near++;
    }
    if (near >= SITE.junctionCount) out.push({ label: "Treffpunkt mehrerer Pisten", delta: SITE.foodOnRun + SITE.foodJunction });
    else if (near > 0) out.push({ label: "Direkt an der Piste", delta: SITE.foodOnRun });
    else if (closest > SITE.foodFar) out.push({ label: "Abseits der Pisten", delta: SITE.foodRemote });
  } else if (kind === "trade") {
    const d = minDistance(hex, ctx.starts);
    if (d <= SITE.tradeReach) out.push({ label: "Nahe Talstation oder Dorf", delta: SITE.tradeNear });
    else if (d > SITE.tradeFar) out.push({ label: "Weit weg vom Betrieb", delta: SITE.tradeRemote });
  } else {
    if (minDistance(hex, ctx.runHexes) <= SITE.skiInReach) out.push({ label: "Ski-in/Ski-out", delta: SITE.bedsSkiIn });
    if (hexDistance(hex, ctx.village) <= SITE.villageReach) out.push({ label: "Im Dorf", delta: SITE.bedsVillage });
  }
  return out;
}

/** The part of the factor read off the buildings around it. */
export function siteNeighbours(
  kind: SiteKind,
  hex: Axial,
  buildings: readonly Pick<PlacedBuilding, "id" | "itemId" | "q" | "r">[],
  selfId?: string,
): SiteEffect[] {
  const out: SiteEffect[] = [];
  if (kind === "food") {
    let rivals = 0;
    for (const b of buildings) {
      if (b.id === selfId || siteKind(b.itemId) !== "food") continue;
      if (hexDistance(hex, b) <= 1) rivals++;
    }
    rivals = Math.min(rivals, SITE.maxRivals);
    if (rivals > 0) out.push({ label: rivals > 1 ? `${rivals} Lokale nebenan` : "Lokal nebenan", delta: rivals * SITE.foodRival });
  } else if (kind === "beds") {
    let noise = 0;
    let quiet = 0;
    let spa = false;
    let loud = "";
    for (const b of buildings) {
      if (b.id === selfId) continue;
      const d = hexDistance(hex, b);
      if (d <= 1 && (SITE.noisy as readonly string[]).includes(b.itemId)) {
        noise++;
        loud ||= BY_ID[b.itemId as ItemId]?.name ?? "";
      } else if (d <= 1 && b.itemId === "tree") quiet++;
      else if (d <= SITE.spaReach && b.itemId === "spa") spa = true;
    }
    noise = Math.min(noise, SITE.maxNoise);
    quiet = Math.min(quiet, SITE.maxQuiet);
    if (noise > 0) out.push({ label: noise > 1 ? `Lärm von ${noise} Nachbarn` : `Lärm: ${loud}`, delta: noise * SITE.noise });
    if (quiet > 0) out.push({ label: "Ruhig zwischen Arven", delta: quiet * SITE.quiet });
    if (spa) out.push({ label: "Spa in der Nähe", delta: SITE.bedsSpa });
  }
  return out;
}

export function siteFactorOf(effects: readonly SiteEffect[]): number {
  const raw = 1 + effects.reduce((n, e) => n + e.delta, 0);
  return Math.round(Math.max(SITE.min, Math.min(SITE.max, raw)) * 1000) / 1000;
}

/** Location factor and its reasons for an item on a hex. 1 with no reasons for items it does not apply to. */
export function siteAt(ctx: SiteContext, itemId: string, hex: Axial, selfId?: string): SiteReport {
  const kind = siteKind(itemId);
  if (!kind) return { factor: 1, effects: [] };
  const effects = [...siteFixed(ctx, kind, hex), ...siteNeighbours(kind, hex, ctx.buildings, selfId)];
  return { factor: siteFactorOf(effects), effects };
}

/** Every placed building's factor, by id. Buildings it does not apply to are left out (1). */
export function siteFactors(ctx: SiteContext): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of ctx.buildings) {
    if (!siteKind(b.itemId)) continue;
    out.set(b.id, siteAt(ctx, b.itemId, b, b.id).factor);
  }
  return out;
}

export interface SiteImpact {
  id: string;
  itemId: string;
  q: number;
  r: number;
  before: number;
  after: number;
}

/**
 * What placing `itemId` on `hex` would do to the buildings around it: only
 * those whose factor changes, so the preview can mark them. `ignoreId` leaves
 * a building out of the layout (the one being moved).
 */
export function siteImpact(ctx: SiteContext, itemId: string, hex: Axial, ignoreId?: string): SiteImpact[] {
  if (!siteNeighbourly(itemId)) return [];
  const base = ignoreId ? ctx.buildings.filter((b) => b.id !== ignoreId) : ctx.buildings;
  const placed = [...base, { id: "__new", itemId, q: hex.q, r: hex.r } as PlacedBuilding];
  const out: SiteImpact[] = [];
  for (const b of base) {
    const kind = siteKind(b.itemId);
    if (!kind || hexDistance(b, hex) > SITE.spaReach) continue;
    const fixed = siteFixed(ctx, kind, b);
    const before = siteFactorOf([...fixed, ...siteNeighbours(kind, b, base, b.id)]);
    const after = siteFactorOf([...fixed, ...siteNeighbours(kind, b, placed, b.id)]);
    if (Math.abs(after - before) > 0.001) out.push({ id: b.id, itemId: b.itemId, q: b.q, r: b.r, before, after });
  }
  return out;
}
