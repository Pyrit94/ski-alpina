import { PISTE_SCORE } from "../../../config/src/economy.ts";
import { hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PlacedPiste } from "../types.ts";
import { gradeForSlope } from "./level.ts";

/**
 * How good a run is to ski, in points (see PISTE_SCORE).
 *
 * - **Gefälle**: metres from top to bottom.
 * - **Länge**: how far it goes.
 * - **Schwünge**: how often the line swings from left to right, read off the
 *   line smoothed the way it is drawn, so the hex zigzag does not count but a
 *   real curve does.
 * - **Abwechslung**: how often the pitch changes — a steep pitch, a flatter
 *   stretch, steep again — and how many grades the run passes through.
 */
export interface PisteScore {
  points: number;
  /** 1 … 5. */
  stars: number;
  parts: { drop: number; length: number; turns: number; variety: number };
  /** Raw figures for the panel. */
  dropMetres: number;
  swings: number;
  pitchChanges: number;
}

/** Hex centres relaxed towards their neighbours: the line a skier would take. */
export function relaxLine(points: readonly { x: number; z: number }[], passes = 2): { x: number; z: number }[] {
  let line = points.map((p) => ({ x: p.x, z: p.z }));
  for (let k = 0; k < passes; k++) {
    line = line.map((p, i) => {
      if (i === 0 || i === line.length - 1) return p;
      const a = line[i - 1]!;
      const b = line[i + 1]!;
      return { x: p.x * 0.5 + (a.x + b.x) * 0.25, z: p.z * 0.5 + (a.z + b.z) * 0.25 };
    });
  }
  return line;
}

/** Swings: changes between turning left and turning right, each past the swing angle. */
export function countSwings(line: readonly { x: number; z: number }[]): number {
  let swings = 0;
  let turned = 0;
  let side = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const c = line[i + 1]!;
    const h1 = Math.atan2(b.z - a.z, b.x - a.x);
    const h2 = Math.atan2(c.z - b.z, c.x - b.x);
    let d = h2 - h1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 1e-3) continue;
    const s = Math.sign(d);
    if (s === side || side === 0) {
      turned += Math.abs(d);
      side = s;
    } else {
      if (turned >= PISTE_SCORE.swingAngle) swings++;
      side = s;
      turned = Math.abs(d);
    }
  }
  if (turned >= PISTE_SCORE.swingAngle) swings++;
  // A single bend is one swing; a left-right S is two.
  return swings;
}

export function scorePiste(hexes: readonly Axial[], dem: Dem): PisteScore {
  const centres = hexes.map((h) => hexToWorld(h.q, h.r));
  const elev = centres.map((c) => dem.sample(c.x, c.z));
  const dropMetres = Math.max(0, Math.round((elev[0] ?? 0) - (elev[elev.length - 1] ?? 0)));
  const swings = countSwings(relaxLine(centres));
  // Pitch along the run, per segment, banded so noise is not a change.
  const pitches = centres.slice(1).map((c, i) => {
    const s = Math.max(dem.slope(centres[i]!.x, centres[i]!.z), dem.slope(c.x, c.z));
    return gradeForSlope(s) ?? "black";
  });
  let pitchChanges = 0;
  for (let i = 1; i < pitches.length; i++) if (pitches[i] !== pitches[i - 1]) pitchChanges++;
  const grades = new Set(pitches).size;

  const w = PISTE_SCORE.weights;
  const share = (v: number, full: number) => Math.max(0, Math.min(1, v / full));
  const parts = {
    drop: Math.round(w.drop * share(dropMetres, PISTE_SCORE.fullDrop)),
    length: Math.round(w.length * share(hexes.length - 1, PISTE_SCORE.fullLength)),
    turns: Math.round(w.turns * share(swings, PISTE_SCORE.fullTurns)),
    variety: Math.round(w.variety * (0.5 * share(pitchChanges, PISTE_SCORE.fullChanges) + 0.5 * share(grades - 1, 2))),
  };
  const points = Math.min(100, parts.drop + parts.length + parts.turns + parts.variety);
  return { points, stars: starsFor(points), parts, dropMetres, swings, pitchChanges };
}

export function starsFor(points: number): number {
  return Math.max(1, Math.min(5, 1 + Math.floor(points / 20)));
}

/** A run's stored points; runs from before the rating count as unrated (0). */
export function pistePoints(p: Pick<PlacedPiste, "score" | "difficulty">): number {
  return p.difficulty === "road" ? 0 : (p.score ?? 0);
}
