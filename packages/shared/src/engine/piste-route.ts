import { FLOW } from "../../../config/src/economy.ts";
import type { ItemId } from "../../../config/src/ids.ts";
import { PISTE_GRADES, type PisteGrade } from "../../../config/src/terrain.ts";
import { HEX_DIRS, hexDistance, hexToWorld, type Axial } from "../hex.ts";
import { MAX_PISTE_HEXES } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import { gradeForSlope } from "./level.ts";
import { validateGround } from "./validate.ts";

/** What the player asked the route to be. "any" takes the shortest legal line. */
export type RouteTarget = PisteGrade | "any";

/**
 * Search weights. Not balancing — they only shape which legal line the
 * suggestion picks, never what a run costs or carries.
 */
const STEEPER_PENALTY = 6;
const GENTLER_PENALTY = 0.7;
const CLIMB_PENALTY = 0.6;
/** Tried in turn: the later ones trade grade for length when a line is too long. */
const STEP_WEIGHTS = [1, 3, 12] as const;

const gradeIndex = (g: PisteGrade) => PISTE_GRADES.findIndex((b) => b.grade === g);

/**
 * The grade of every segment of a line, by the same rule `measurePiste` uses:
 * a segment takes the grade of its steeper end. Null where the ground is too
 * steep for any piste.
 */
export function segmentGrades(
  hexes: readonly Axial[],
  slopeAt: (hex: Axial) => number,
): (PisteGrade | null)[] {
  const out: (PisteGrade | null)[] = [];
  for (let i = 1; i < hexes.length; i++) {
    out.push(gradeForSlope(Math.max(slopeAt(hexes[i - 1]!), slopeAt(hexes[i]!))));
  }
  return out;
}

const keyOf = (q: number, r: number) => (q + 256) * 1024 + (r + 256);

/** A tiny binary min-heap of node keys ordered by priority. */
class Heap {
  private keys: number[] = [];
  private prio: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, p: number) {
    const k = this.keys;
    const pr = this.prio;
    let i = k.length;
    k.push(key);
    pr.push(p);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (pr[up]! <= p) break;
      k[i] = k[up]!;
      pr[i] = pr[up]!;
      i = up;
    }
    k[i] = key;
    pr[i] = p;
  }
  pop(): number {
    const k = this.keys;
    const pr = this.prio;
    const top = k[0]!;
    const lastK = k.pop()!;
    const lastP = pr.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && pr[r]! < pr[l]! ? r : l;
        if (pr[c]! >= lastP) break;
        k[i] = k[c]!;
        pr[i] = pr[c]!;
        i = c;
      }
      k[i] = lastK;
      pr[i] = lastP;
    }
    return top;
  }
}

export interface RouteOptions {
  /** Hex keys ("q,r") the route must not cross, except at its two ends. */
  avoid?: ReadonlySet<string>;
  /** Which kind of run; only "piste" is graded. */
  itemId?: ItemId;
  /**
   * Most hexes the route may have, start and end included. Defaults to
   * MAX_PISTE_HEXES; less when the route extends a run already drawn.
   */
  maxHexes?: number;
}

/**
 * Suggest a run from `start` down to `end`.
 *
 * A* over hex neighbours, obeying exactly what `validatePistePath` will check
 * on submit — every hex buildable for a piste, one hex per step, no step
 * climbing more than the rise tolerance, at most MAX_PISTE_HEXES — so any line
 * it returns is one the server accepts. Segments steeper than the target grade
 * are expensive, gentler ones mildly so; the shortest legal line wins among
 * equals. Null when no legal line exists, or the end is not below the start.
 */
export function routePiste(
  dem: Dem,
  start: Axial,
  end: Axial,
  target: RouteTarget,
  options: RouteOptions = {},
): Axial[] | null {
  const itemId = options.itemId ?? "piste";
  const maxSteps = Math.min(MAX_PISTE_HEXES, options.maxHexes ?? MAX_PISTE_HEXES) - 1;
  const span = hexDistance(start, end);
  if (span === 0 || span > maxSteps) return null;

  const elevCache = new Map<number, number>();
  const slopeCache = new Map<number, number>();
  const okCache = new Map<number, boolean>();
  const elev = (q: number, r: number, k: number) => {
    let e = elevCache.get(k);
    if (e === undefined) {
      const { x, z } = hexToWorld(q, r);
      e = dem.sample(x, z);
      elevCache.set(k, e);
    }
    return e;
  };
  const slope = (q: number, r: number, k: number) => {
    let s = slopeCache.get(k);
    if (s === undefined) {
      const { x, z } = hexToWorld(q, r);
      s = dem.slope(x, z);
      slopeCache.set(k, s);
    }
    return s;
  };
  const startKey = keyOf(start.q, start.r);
  const endKey = keyOf(end.q, end.r);
  const ok = (q: number, r: number, k: number) => {
    let v = okCache.get(k);
    if (v === undefined) {
      v = validateGround(dem, q, r, itemId).ok;
      if (v && options.avoid && k !== startKey && k !== endKey && options.avoid.has(`${q},${r}`)) v = false;
      okCache.set(k, v);
    }
    return v;
  };
  if (!ok(start.q, start.r, startKey) || !ok(end.q, end.r, endKey)) return null;
  if (elev(end.q, end.r, endKey) >= elev(start.q, start.r, startKey)) return null;

  const graded = itemId === "piste" && target !== "any";
  const want = graded ? gradeIndex(target) : 0;

  for (const stepWeight of STEP_WEIGHTS) {
    const g = new Map<number, number>();
    const steps = new Map<number, number>();
    const parent = new Map<number, number>();
    const coords = new Map<number, Axial>();
    const closed = new Set<number>();
    const heap = new Heap();
    g.set(startKey, 0);
    steps.set(startKey, 0);
    coords.set(startKey, start);
    heap.push(startKey, span * stepWeight);
    let found = false;
    while (heap.size > 0) {
      const k = heap.pop();
      if (closed.has(k)) continue;
      closed.add(k);
      if (k === endKey) {
        found = true;
        break;
      }
      const cur = coords.get(k)!;
      const gk = g.get(k)!;
      const sk = steps.get(k)!;
      if (sk >= maxSteps) continue;
      const ek = elev(cur.q, cur.r, k);
      const sl = slope(cur.q, cur.r, k);
      for (const d of HEX_DIRS) {
        const nq = cur.q + d.q;
        const nr = cur.r + d.r;
        const nk = keyOf(nq, nr);
        if (closed.has(nk)) continue;
        const next = { q: nq, r: nr };
        // Any line through here would be too long to submit.
        if (sk + 1 + hexDistance(next, end) > maxSteps) continue;
        if (!ok(nq, nr, nk)) continue;
        const rise = elev(nq, nr, nk) - ek;
        if (rise > FLOW.pisteRiseTolerance) continue;
        let cost = stepWeight;
        if (rise > 0) cost += (rise / FLOW.pisteRiseTolerance) * CLIMB_PENALTY;
        if (graded) {
          const grade = gradeForSlope(Math.max(sl, slope(nq, nr, nk)));
          if (!grade) continue;
          const gi = gradeIndex(grade);
          if (gi > want) cost += (gi - want) * STEEPER_PENALTY;
          else if (gi < want) cost += (want - gi) * GENTLER_PENALTY;
        }
        const ng = gk + cost;
        const prev = g.get(nk);
        if (prev !== undefined && prev <= ng) continue;
        g.set(nk, ng);
        steps.set(nk, sk + 1);
        parent.set(nk, k);
        coords.set(nk, next);
        heap.push(nk, ng + hexDistance(next, end) * stepWeight);
      }
    }
    if (!found) continue;
    const path: Axial[] = [];
    for (let k: number | undefined = endKey; k !== undefined; k = parent.get(k)) {
      path.push(coords.get(k)!);
      if (k === startKey) break;
    }
    path.reverse();
    if (path.length <= maxSteps + 1) return path;
  }
  return null;
}
