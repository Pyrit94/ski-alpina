// Explicit extension so the node test runner can load this directly.
import { smoothPath, type PathPoint } from "./piste-mesh.ts";

/** What the road needs from a map: its grid and its village. */
export interface RoadGround {
  n: number;
  world: number;
  elev: Float32Array;
  region: { id: string; village: { x: number; z: number } };
}

/** Metres per world unit, for grades (see TERRAIN.metresPerWorldUnit). */
const MPU = 92;

/**
 * The road into the valley: from the lowest point where the valley leaves the
 * map to the village, along the valley floor.
 *
 * Dijkstra over the DEM grid, eight neighbours, where a step costs its length
 * times a penalty that grows with the square of its grade — a road takes the
 * long way round rather than climb, which is what puts it on the valley floor
 * and makes it wind like a real one. The classic valley's edge is a raised
 * rim, so its road starts just inside it.
 */
export function valleyRoad(g: RoadGround): PathPoint[] {
  const { n, world, elev } = g;
  const cell = world / (n - 1);
  const idx = (ix: number, iz: number) => iz * n + ix;
  const toWorld = (i: number) => ({ x: ((i % n) / (n - 1) - 0.5) * world, z: (Math.floor(i / n) / (n - 1) - 0.5) * world });

  // The ring of cells a road can enter by.
  const ring = g.region.id === "classic" ? Math.round((n - 1) * 0.12) : 1;
  const entries: number[] = [];
  for (let k = ring; k < n - ring; k++) {
    entries.push(idx(k, ring), idx(k, n - 1 - ring), idx(ring, k), idx(n - 1 - ring, k));
  }
  const vx = Math.round((g.region.village.x / world + 0.5) * (n - 1));
  const vz = Math.round((g.region.village.z / world + 0.5) * (n - 1));
  const village = idx(Math.max(0, Math.min(n - 1, vx)), Math.max(0, Math.min(n - 1, vz)));
  const dist = new Float64Array(n * n).fill(Infinity);
  const prev = new Int32Array(n * n).fill(-1);
  const done = new Uint8Array(n * n);
  // A binary heap of [cost, index].
  const heap: number[] = [];
  const push = (cost: number, i: number) => {
    heap.push(cost, i);
    let c = heap.length / 2 - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p * 2]! <= heap[c * 2]!) break;
      for (const o of [0, 1]) [heap[p * 2 + o], heap[c * 2 + o]] = [heap[c * 2 + o]!, heap[p * 2 + o]!];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[1]!;
    const lastI = heap.pop()!;
    const lastC = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = lastC;
      heap[1] = lastI;
      let c = 0;
      const size = heap.length / 2;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < size && heap[l * 2]! < heap[m * 2]!) m = l;
        if (r < size && heap[r * 2]! < heap[m * 2]!) m = r;
        if (m === c) break;
        for (const o of [0, 1]) [heap[m * 2 + o], heap[c * 2 + o]] = [heap[c * 2 + o]!, heap[m * 2 + o]!];
        c = m;
      }
    }
    return top;
  };

  dist[village] = 0;
  push(0, village);
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const;
  while (heap.length > 0) {
    const i = pop();
    if (done[i]) continue;
    done[i] = 1;
    const ix = i % n;
    const iz = Math.floor(i / n);
    for (const [dx, dz] of steps) {
      const jx = ix + dx;
      const jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
      const j = idx(jx, jz);
      if (done[j]) continue;
      const len = Math.hypot(dx, dz) * cell;
      const grade = Math.abs(elev[j]! - elev[i]!) / (len * MPU);
      // Gentle grades cost a little; past about 12 % they cost so much that a
      // detour along the slope wins — which is how a road climbs a valley step.
      const steep = Math.max(0, grade - 0.12);
      const cost = len * (1 + 300 * grade * grade + 40000 * steep * steep);
      if (dist[i]! + cost < dist[j]!) {
        dist[j] = dist[i]! + cost;
        prev[j] = i;
        push(dist[j]!, j);
      }
    }
  }
  // Where the valley leaves the map: of the entries lower than the village,
  // the one the cheapest road reaches — downstream along the valley floor,
  // not over a pass into the next valley. Only if nothing is lower (a village
  // in a closed basin) the cheapest entry at all.
  const below = entries.filter((e) => elev[e]! < elev[village]! && Number.isFinite(dist[e]!));
  const pool = below.length > 0 ? below : entries.filter((e) => Number.isFinite(dist[e]!));
  if (pool.length === 0) return [];
  // Lowest of the cheap ones: among entries within 25 % of the cheapest road,
  // the deepest point — the valley's own exit.
  const cheapest = Math.min(...pool.map((e) => dist[e]!));
  const start = pool.filter((e) => dist[e]! <= cheapest * 1.25).reduce((a, b) => (elev[b]! < elev[a]! ? b : a));
  const cells: number[] = [];
  for (let i = start; i >= 0; i = prev[i]!) {
    cells.push(i);
    if (i === village) break;
  }
  // Every other cell, then smoothed: grid steps would read as a staircase.
  const coarse = cells.filter((_, k) => k % 2 === 0 || k === cells.length - 1).map(toWorld);
  return smoothPath(coarse, 3);
}

/** Total length of a path, in world units. */
export function pathLength(path: readonly PathPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
  return total;
}

/** The point `d` world units along a path, and the direction of travel there. */
export function alongPath(path: readonly PathPoint[], d: number): { x: number; z: number; angle: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= seg || i === path.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, angle: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    left -= seg;
  }
  const last = path[path.length - 1] ?? { x: 0, z: 0 };
  return { x: last.x, z: last.z, angle: 0 };
}

const roads = new WeakMap<Float32Array, PathPoint[]>();
/** `valleyRoad`, computed once per map. */
export function cachedValleyRoad(g: RoadGround): PathPoint[] {
  let road = roads.get(g.elev);
  if (!road) {
    road = valleyRoad(g);
    roads.set(g.elev, road);
  }
  return road;
}
