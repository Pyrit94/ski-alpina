/**
 * The particles of a build moment, as plain functions of time so they can be
 * tested and the scene only copies numbers into one buffer (BuildBursts.tsx).
 *
 * Dust: a ring of powder snow kicked out where a building lands, pushed out
 * fast, slowed by the air, lifting a little and thinning out within a second.
 * Glints: a shimmer that runs down a new run once, like low sun catching
 * freshly groomed snow.
 */

/** Particles in one ring of dust. */
export const DUST_N = 26;
/** Seconds a ring of dust lasts. */
export const DUST_S = 0.95;
/** Seconds the shimmer takes to run the length of a piste. */
export const GLINT_RUN_S = 0.8;
/** Seconds one glint flashes. */
export const GLINT_S = 0.55;
/** Steps along one run that glint, at most. */
export const GLINT_N = 28;
/** Glints side by side at each step: the run is wider than one sparkle. */
export const GLINT_LANES = 3;
/** Particles the scene keeps a buffer for; what does not fit is skipped. */
export const POOL = 240;

export interface Particle {
  dx: number;
  dy: number;
  dz: number;
  /** World units across. */
  size: number;
  alpha: number;
}

/** A stable pseudo-random 0 … 1 for particle `i` of burst `seed`. */
export function jitter(i: number, seed: number): number {
  const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** Particle `i` of a ring of dust, `t` seconds after landing; null once it is gone. */
export function dustAt(i: number, t: number, seed: number): Particle | null {
  if (t < 0 || t > DUST_S) return null;
  const j = jitter(i, seed);
  const angle = (i / DUST_N) * Math.PI * 2 + (j - 0.5) * 0.45;
  const speed = 2.4 + j * 1.8;
  const k = 3.2;
  const dist = 0.9 + (speed * (1 - Math.exp(-k * t))) / k;
  const fade = (1 - t / DUST_S) ** 1.6;
  return {
    dx: Math.cos(angle) * dist,
    dy: 0.15 + (2.2 + j) * t * Math.exp(-2.5 * t),
    dz: Math.sin(angle) * dist,
    size: 0.55 + 1.2 * (1 - Math.exp(-3 * t)) + j * 0.3,
    alpha: 0.9 * fade * Math.min(1, t * 25),
  };
}

/**
 * Glint `i` of `n` steps along a run, `t` seconds after it was built: the
 * wave starts at the first hex and runs to the last; `lane` glints beside
 * each other flash a touch apart, so it sparkles rather than marches. Zero
 * alpha while it waits.
 */
export function glintAt(i: number, n: number, t: number, lane = 0): Particle | null {
  if (t < 0 || t > burstLength("glint")) return null;
  const phase = (n > 1 ? (i / (n - 1)) * GLINT_RUN_S : 0) + (jitter(i * GLINT_LANES + lane, 5) - 0.5) * 0.16;
  const local = t - Math.max(0, phase);
  if (local < 0 || local > GLINT_S) return { dx: 0, dy: 0, dz: 0, size: 0, alpha: 0 };
  const a = Math.sin((Math.PI * local) / GLINT_S);
  return { dx: 0, dy: 0.35, dz: 0, size: 0.9 + 1.7 * a, alpha: a };
}

/** Seconds a burst of this kind lasts, from its start. */
export function burstLength(kind: "dust" | "glint"): number {
  // The glints' own jitter may start the last one a little late.
  return kind === "dust" ? DUST_S : GLINT_RUN_S + GLINT_S + 0.1;
}

/**
 * `n` points spaced evenly along a polyline (x, z pairs): the glints sit on
 * the run at equal steps however its hexes are spaced.
 */
export function alongLine(points: { x: number; z: number }[], n: number): { x: number; z: number }[] {
  if (points.length === 0 || n <= 0) return [];
  if (points.length === 1 || n === 1) return [points[0]!];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
    seg.push(d);
    total += d;
  }
  const out: { x: number; z: number }[] = [];
  let k = 0;
  let walked = 0;
  for (let s = 0; s < n; s++) {
    const want = (s / (n - 1)) * total;
    while (k < seg.length - 1 && walked + seg[k]! < want) walked += seg[k++]!;
    const f = seg[k]! > 0 ? Math.min(1, (want - walked) / seg[k]!) : 0;
    const a = points[k]!;
    const b = points[k + 1]!;
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f });
  }
  return out;
}
