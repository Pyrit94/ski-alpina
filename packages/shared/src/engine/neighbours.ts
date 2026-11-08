import { ECONOMY, FLOW, NEIGHBOURS, SEASON } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { NEIGHBOUR_NAMES, REGION_BY_ID } from "../../../config/src/regions.ts";
import { TERRAIN } from "../../../config/src/terrain.ts";
import type { PisteGrade } from "../../../config/src/terrain.ts";
import type { ItemId } from "../../../config/src/ids.ts";
import { hexDistance, hexesInRange, hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { Neighbour, NeighbourMode, NeighbourState, PlacedPiste, ResortState } from "../types.ts";
import { routeToAny } from "./piste-route.ts";
import { scorePiste } from "./piste-score.ts";
import { seasonDemandShare } from "./season.ts";
import { surveyPiste, validateGround } from "./validate.ts";

/**
 * Neighbour ski areas the game runs: a valley station a few kilometres from
 * the players' village, lifts up the slope above it, a run down beside each.
 * They grow slowly from what their guests leave there. In «Gemütlich» they
 * share the region's guests with the players (see `neighbourCut`) and never
 * build on, or next to, anything the players have.
 *
 * Everything is worked out from the ground, without chance, so a map gets
 * the same neighbours every time.
 */

const key = (h: Axial) => `${h.q},${h.r}`;
const elevAt = (dem: Dem, h: Axial) => {
  const { x, z } = hexToWorld(h.q, h.r);
  return dem.sample(x, z);
};

/** Days since the start of the first season, for spacing a neighbour's builds. */
export function absDay(state: Pick<ResortState, "season" | "day">): number {
  return (state.season - 1) * SEASON.daysPerYear + state.day;
}

/** Whether an id belongs to a neighbour, and to which. */
export function neighbourOf(id: string): string | null {
  const m = /^(nb\d+):/.exec(id);
  return m ? m[1]! : id.match(/^nb\d+$/) ? id : null;
}

export const neighboursOn = (state: Pick<ResortState, "neighbours">) =>
  state.neighbours?.mode === "gemuetlich" ? state.neighbours.list : [];

/** Every hex a neighbour's stations and runs cover. Cached per neighbour list. */
const covered = new WeakMap<readonly Neighbour[], Map<string, Neighbour>>();
export function neighbourHexes(state: Pick<ResortState, "neighbours">): Map<string, Neighbour> {
  const list = neighboursOn(state);
  let map = covered.get(list);
  if (!map) {
    map = new Map();
    for (const n of list) {
      for (const b of n.buildings) map.set(key(b), n);
      for (const p of n.pistes) for (const h of p.hexes) map.set(key(h), n);
    }
    covered.set(list, map);
  }
  return map;
}

/** Hexes the players use, widened by NEIGHBOURS.clearance: no neighbour builds there. */
function playersFootprint(state: ResortState, dem: Dem): Set<string> {
  const out = new Set<string>();
  const claim = (h: Axial, r: number) => {
    for (const x of hexesInRange(h, r)) out.add(key(x));
  };
  const c = NEIGHBOURS.clearance;
  for (const b of state.buildings) claim(b, c);
  for (const l of state.lifts) {
    claim(l.a, c);
    claim(l.b, c);
    if (l.mid) claim(l.mid, c);
  }
  for (const p of state.pistes) for (const h of p.hexes) claim(h, c);
  // The village and the room around it for the players to grow into.
  claim(dem.region.villageHex, FLOW.villageRunRadius + 3);
  return out;
}

/**
 * Valley stations for neighbours: low ground with a real mountain above it,
 * far enough from the village and from each other.
 */
export function neighbourSites(state: ResortState, dem: Dem, count: number = NEIGHBOURS.count): Axial[] {
  const village = dem.region.villageHex;
  const villageElev = elevAt(dem, village);
  const taken = playersFootprint(state, dem);
  const span = Math.ceil(dem.world / (Math.sqrt(3) * 2.85)) + 2;
  // The ground each candidate stands on, worked out once for every rule.
  const ground: { hex: Axial; elev: number; drop: number; relief: number }[] = [];
  for (const hex of hexesInRange(village, span)) {
    if (hexDistance(hex, village) < NEIGHBOURS.minDistance) continue;
    if (taken.has(key(hex))) continue;
    if (!validateGround(dem, hex.q, hex.r, "chair").ok) continue;
    const elev = elevAt(dem, hex);
    const drop = elev - Math.min(...hexesInRange(hex, 2).map((h) => elevAt(dem, h)));
    let top = elev;
    for (const h of hexesInRange(hex, NEIGHBOURS.reliefRadius)) {
      const { x, z } = hexToWorld(h.q, h.r);
      if (Math.abs(x) > 92 || Math.abs(z) > 92) continue;
      top = Math.max(top, dem.sample(x, z));
    }
    if (top - elev < NEIGHBOURS.minRelief) continue;
    ground.push({ hex, elev, drop, relief: top - elev });
  }
  const out: Axial[] = [];
  for (const rule of NEIGHBOURS.siteRules) {
    const fits = ground
      .filter((g) => g.elev <= villageElev + rule.maxAboveVillage && g.drop <= rule.floorDrop)
      .map((g) => ({ hex: g.hex, score: g.relief - 0.6 * Math.max(0, g.elev - villageElev) }))
      .sort((a, b) => b.score - a.score || a.hex.q - b.hex.q || a.hex.r - b.hex.r);
    for (const c of fits) {
      if (out.length >= count) break;
      if (out.some((o) => hexDistance(o, c.hex) < NEIGHBOURS.apart)) continue;
      out.push(c.hex);
    }
    if (out.length >= count) break;
  }
  return out;
}

const metresBetween = (a: Axial, b: Axial) => {
  const p = hexToWorld(a.q, a.r);
  const q = hexToWorld(b.q, b.r);
  return Math.hypot(p.x - q.x, p.z - q.z) * TERRAIN.metresPerWorldUnit;
};

/** The grades a neighbour's runs come in, in turn, so its area has a mix. */
const GRADES: PisteGrade[] = ["blue", "red", "black"];

/**
 * One more lift for a neighbour, with a run down beside it — or the same
 * neighbour when the ground has no room left. Lifts start at its valley
 * station or at the top of one it has, and go as high as the ground allows.
 */
export function growNeighbour(state: ResortState, dem: Dem, n: Neighbour, now: number): Neighbour {
  const itemId: ItemId = n.lifts.length >= 3 ? "gondola" : "chair";
  const item = BY_ID[itemId];
  const taken = playersFootprint(state, dem);
  // Others' ground too: another neighbour's runs are as off-limits as the players'.
  for (const other of neighboursOn(state)) {
    if (other.id === n.id) continue;
    for (const p of other.pistes) for (const h of p.hexes) for (const x of hexesInRange(h, 1)) taken.add(key(x));
    for (const b of other.buildings) for (const x of hexesInRange(b, 2)) taken.add(key(x));
  }
  const own = new Set<string>();
  for (const b of n.buildings) own.add(key(b));
  const free = (h: Axial) => !taken.has(key(h)) && !own.has(key(h));
  const ground = (h: Axial) => validateGround(dem, h.q, h.r, itemId).ok;

  const tops = n.lifts.map((l) => (elevAt(dem, l.a) > elevAt(dem, l.b) ? l.a : l.b));
  const anchors = [...hexesInRange(n.base, 2), ...tops.flatMap((t) => hexesInRange(t, 1))].filter(
    (h) => free(h) && ground(h),
  );
  const [minSpan, maxSpan] = NEIGHBOURS.liftSpan;
  const ends = n.lifts.flatMap((l) => [l.a, l.b]);
  const options: { a: Axial; b: Axial; score: number }[] = [];
  for (const a of anchors) {
    const ea = elevAt(dem, a);
    for (const b of hexesInRange(a, maxSpan)) {
      const d = hexDistance(a, b);
      if (d < minSpan) continue;
      const rise = elevAt(dem, b) - ea;
      if (rise < NEIGHBOURS.minRise) continue;
      if (rise / metresBetween(a, b) > item.maxSlope) continue;
      if (!free(b) || !ground(b)) continue;
      // Spread out: a new top not on top of another one.
      if (ends.some((e) => hexDistance(e, b) < 4)) continue;
      options.push({ a, b, score: rise - 12 * d });
    }
  }
  options.sort((x, y) => y.score - x.score || x.b.q - y.b.q || x.b.r - y.b.r);

  // Where a run may end: the valley station, the foot of a lift, another run.
  const goals = [
    ...hexesInRange(n.base, 2),
    ...n.lifts.flatMap((l) => hexesInRange(elevAt(dem, l.a) <= elevAt(dem, l.b) ? l.a : l.b, 1)),
    ...n.pistes.flatMap((p) => p.hexes),
  ].filter((h) => !taken.has(key(h)));
  const grade = GRADES[n.pistes.length % GRADES.length]!;
  for (const o of options.slice(0, 16)) {
    const run =
      routeToAny(dem, o.b, goals, grade) ?? routeToAny(dem, o.b, goals, "blue") ?? routeToAny(dem, o.b, goals, "any");
    if (!run || run.length < 3) continue;
    if (run.some((h) => taken.has(key(h)) || !validateGround(dem, h.q, h.r, "piste").ok)) continue;
    const survey = surveyPiste(dem, "piste", run);
    if (!survey) continue;
    const k = n.lifts.length + 1;
    const station = (id: string, h: Axial) => ({
      id,
      itemId,
      q: h.q,
      r: h.r,
      level: 1,
      builtAt: now,
      readyAt: now,
      upgrades: { speed: 0, cabins: 0, capacity: 0 },
    });
    const sa = `${n.id}:s${k}a`;
    const sb = `${n.id}:s${k}b`;
    const piste: PlacedPiste = {
      id: `${n.id}:p${n.pistes.length + 1}`,
      itemId: "piste",
      difficulty: survey.grade,
      hexes: run,
      builtAt: now,
      readyAt: now,
      score: scorePiste(run, dem).points,
    };
    return {
      ...n,
      lifts: [
        ...n.lifts,
        {
          id: `${n.id}:l${k}`,
          itemId,
          a: o.a,
          b: o.b,
          stationA: sa,
          stationB: sb,
          level: 1,
          builtAt: now,
          readyAt: now,
          upgrades: { speed: 0, cabins: 0, capacity: 0 },
        },
      ],
      buildings: [...n.buildings, station(sa, o.a), station(sb, o.b)],
      pistes: [...n.pistes, piste],
      lastBuilt: absDay(state),
    };
  }
  return n;
}

/** The neighbours a map gets, each with its first lifts. */
export function spawnNeighbours(state: ResortState, dem: Dem, now: number): Neighbour[] {
  const names = REGION_BY_ID[state.region ?? ""]?.neighbours ?? NEIGHBOUR_NAMES;
  const list: Neighbour[] = [];
  // More places than needed: on some ground a site has no lift line that works.
  for (const base of neighbourSites(state, dem, NEIGHBOURS.count * 3)) {
    if (list.length >= NEIGHBOURS.count) break;
    const i = list.length;
    let n: Neighbour = {
      id: `nb${i + 1}`,
      name: names[i] ?? NEIGHBOUR_NAMES[i] ?? `Nachbar ${i + 1}`,
      base,
      coins: NEIGHBOURS.startCoins,
      lifts: [],
      pistes: [],
      buildings: [],
      lastBuilt: absDay(state),
      guestsYesterday: 0,
    };
    for (let k = 0; k < NEIGHBOURS.startLifts; k++) {
      const scope = { ...state, neighbours: { mode: "gemuetlich" as const, list: [...list, n] } };
      const next = growNeighbour(scope, dem, n, now);
      if (next === n) break;
      n = next;
    }
    if (n.lifts.length > 0) list.push(n);
  }
  return list;
}

/** Switch the neighbours on or off. Switching on again keeps those already there. */
export function setNeighbourMode(state: ResortState, dem: Dem, mode: NeighbourMode, now: number): ResortState {
  if (mode === "off") return { ...state, neighbours: { mode, list: state.neighbours?.list ?? [] } };
  const kept = state.neighbours?.list ?? [];
  const list = kept.length > 0 ? kept : spawnNeighbours({ ...state, neighbours: undefined }, dem, now);
  return { ...state, neighbours: { mode, list } };
}

/** Km of run a neighbour has, weighted like the players' (see ECONOMY.gradeDraw). */
export function neighbourKm(n: Neighbour): number {
  return n.pistes.reduce(
    (sum, p) => sum + Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment * (ECONOMY.gradeDraw[p.difficulty] ?? 1),
    0,
  );
}

/**
 * The share of the region's guests the neighbours take from the players,
 * 0 … NEIGHBOURS.maxCut: their slopes against yours. A bigger area of your
 * own keeps more guests at home.
 */
export function neighbourCut(state: Pick<ResortState, "neighbours">, playerKm: number): number {
  const theirs = neighboursOn(state).reduce((sum, n) => sum + neighbourKm(n), 0);
  if (theirs <= 0) return 0;
  return NEIGHBOURS.maxCut * (theirs / (theirs + Math.max(0, playerKm)));
}

/**
 * A finished day for the neighbours: their guests pay, and one that has saved
 * enough, and waited long enough since its last lift, builds the next.
 */
export function neighboursDayEnded(state: ResortState, dem: Dem, now: number): NeighbourState | undefined {
  const ns = state.neighbours;
  if (!ns || ns.mode === "off" || ns.list.length === 0) return ns;
  const season = seasonDemandShare(state.day);
  let list = ns.list;
  for (const n of ns.list) {
    const guests = Math.round(neighbourKm(n) * NEIGHBOURS.guestsPerKmDay * season);
    let next: Neighbour = { ...n, guestsYesterday: guests, coins: n.coins + guests * NEIGHBOURS.marginPerGuest };
    const price = BY_ID[next.lifts.length >= 3 ? "gondola" : "chair"].cost * 1.5;
    if (
      next.lifts.length < NEIGHBOURS.maxLifts &&
      next.coins >= price &&
      absDay(state) - next.lastBuilt >= NEIGHBOURS.growEveryDays
    ) {
      const grown = growNeighbour({ ...state, neighbours: { ...ns, list } }, dem, next, now);
      // Paid either way: a neighbour that found no room tries again later.
      next = grown === next ? { ...next, lastBuilt: absDay(state) } : { ...grown, coins: grown.coins - price };
    }
    list = list.map((x) => (x.id === n.id ? next : x));
  }
  return { ...ns, list };
}
