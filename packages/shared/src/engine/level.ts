import { LEVEL } from "../../../config/src/economy.ts";
import type { CatalogItem } from "../../../config/src/items.ts";
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

export function pisteDifficulty(id: string): "blue" | "red" | "black" | "park" | "road" {
  if (id === "piste-red") return "red";
  if (id === "piste-black") return "black";
  if (id === "snowpark") return "park";
  if (id === "road") return "road";
  return "blue";
}
