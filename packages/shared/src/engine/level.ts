import { LEVEL } from "../../../config/src/economy.ts";
import type { ItemId } from "../../../config/src/ids.ts";
import { BY_ID, type CatalogItem } from "../../../config/src/items.ts";
import { PISTE_GRADES, type PisteGrade } from "../../../config/src/terrain.ts";
import type { Axial } from "../hex.ts";
import type { Upgrades } from "../types.ts";

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(LEVEL.base * Math.pow(level - 1, LEVEL.exponent));
}

export function levelFromXp(xp: number): number {
  let lvl = 1;
  while (xp >= xpForLevel(lvl + 1) && lvl < LEVEL.max) lvl += 1;
  return lvl;
}

export function liftThroughput(item: CatalogItem, upgrades: Upgrades): number {
  const base = item.capacity ?? 400;
  return Math.round(
    base * (1 + upgrades.capacity * 0.18 + upgrades.cabins * 0.12 + upgrades.speed * 0.08),
  );
}

/**
 * The grade of one piece of ground, or null when it is too steep to hold snow
 * a piste could be cut into.
 */
export function gradeForSlope(slope: number): PisteGrade | null {
  for (const band of PISTE_GRADES) {
    if (slope <= band.maxSlope) return band.grade;
  }
  return null;
}

export const GRADE_LABEL: Record<PisteGrade, string> = {
  blue: "Blaue",
  red: "Rote",
  black: "Schwarze",
};

export function gradeBand(grade: PisteGrade): (typeof PISTE_GRADES)[number] {
  return PISTE_GRADES.find((b) => b.grade === grade) ?? PISTE_GRADES[0]!;
}

/**
 * How a whole run is rated, and what it costs.
 *
 * A run takes the grade of its hardest pitch, the way real piste maps do — one
 * steep drop makes the whole thing a black, however gentle the rest is. Cost
 * is summed per segment instead, so a mostly-gentle run with one hard section
 * is priced for what it actually took to cut.
 */
export function measurePiste(
  hexes: readonly Axial[],
  slopeAt: (hex: Axial) => number,
  baseCost: number,
): { grade: PisteGrade; cost: number; upkeep: number } | null {
  const segments = Math.max(1, hexes.length - 1);
  let hardest = 0;
  let cost = 0;
  let upkeep = 0;
  for (let i = 0; i < segments; i++) {
    // Grade a segment by its steeper end: that is the pitch a skier meets.
    const a = slopeAt(hexes[i]!);
    const b = slopeAt(hexes[Math.min(i + 1, hexes.length - 1)]!);
    const slope = Math.max(a, b);
    const grade = gradeForSlope(slope);
    if (!grade) return null;
    const band = gradeBand(grade);
    cost += baseCost * band.costFactor;
    upkeep += band.upkeepPerSegment;
    hardest = Math.max(hardest, PISTE_GRADES.findIndex((x) => x.grade === grade));
  }
  return {
    grade: PISTE_GRADES[hardest]!.grade,
    cost: Math.round(cost),
    upkeep: Math.round(upkeep),
  };
}

/** People per hour a built run carries, from the grade its ground gave it. */
export function pisteCapacity(piste: { itemId: string; difficulty: string }): number {
  if (piste.difficulty === "blue" || piste.difficulty === "red" || piste.difficulty === "black") {
    return gradeBand(piste.difficulty).capacity;
  }
  return BY_ID[piste.itemId as ItemId]?.capacity ?? 0;
}

/** What a built run costs to hold open for a day. */
export function pisteUpkeep(piste: { itemId: string; difficulty: string; hexes: unknown[] }): number {
  const segments = Math.max(1, piste.hexes.length - 1);
  if (piste.difficulty === "blue" || piste.difficulty === "red" || piste.difficulty === "black") {
    return gradeBand(piste.difficulty).upkeepPerSegment * segments;
  }
  return (BY_ID[piste.itemId as ItemId]?.upkeep ?? 0) * segments;
}

export function pisteDifficulty(id: string): "blue" | "red" | "black" | "park" | "road" {
  if (id === "snowpark") return "park";
  if (id === "road") return "road";
  // A plain piste is graded from the ground at placement; this is only the
  // value it carries until `measurePiste` replaces it.
  return "blue";
}
