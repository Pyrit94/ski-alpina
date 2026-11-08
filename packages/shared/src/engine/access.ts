import { ACCESS } from "../../../config/src/economy.ts";
import { hexDistance, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { ResortState } from "../types.ts";

/** What a building needs next to it: a road, a run, either, or nothing. */
export type AccessNeed = "road" | "piste" | "either" | null;

export function accessNeed(itemId: string): AccessNeed {
  if (ACCESS.road.includes(itemId)) return "road";
  if (ACCESS.piste.includes(itemId)) return "piste";
  if (ACCESS.either.includes(itemId)) return "either";
  return null;
}

type Layout = Pick<ResortState, "pistes" | "lifts">;

/** On a road: near a built road, or in the village streets. */
export function onRoad(state: Layout, dem: Dem, hex: Axial): boolean {
  if (hexDistance(hex, dem.region.villageHex) <= ACCESS.villageStreets) return true;
  for (const p of state.pistes) {
    if (p.difficulty !== "road") continue;
    for (const h of p.hexes) if (hexDistance(h, hex) <= ACCESS.roadReach) return true;
  }
  return false;
}

/** Beside a run or a lift station. */
export function onPiste(state: Layout, hex: Axial): boolean {
  for (const l of state.lifts) {
    if (hexDistance(l.a, hex) <= ACCESS.pisteReach || hexDistance(l.b, hex) <= ACCESS.pisteReach) return true;
    if (l.mid && hexDistance(l.mid, hex) <= ACCESS.pisteReach) return true;
  }
  for (const p of state.pistes) {
    if (p.difficulty === "road") continue;
    for (const h of p.hexes) if (hexDistance(h, hex) <= ACCESS.pisteReach) return true;
  }
  return false;
}

/** Whether `itemId` may stand on `hex`, and if not, what it needs. */
export function accessAt(state: Layout, dem: Dem, itemId: string, hex: Axial): { ok: true } | { ok: false; reason: string } {
  const need = accessNeed(itemId);
  if (!need) return { ok: true };
  if (need === "road") {
    return onRoad(state, dem, hex) ? { ok: true } : { ok: false, reason: "Nur an einer Strasse oder im Dorf – zuerst eine Strasse bauen" };
  }
  if (need === "piste") {
    return onPiste(state, hex) ? { ok: true } : { ok: false, reason: "Berggebäude stehen an einer Piste oder Bahnstation" };
  }
  return onRoad(state, dem, hex) || onPiste(state, hex)
    ? { ok: true }
    : { ok: false, reason: "An einer Strasse, im Dorf oder an einer Piste bauen" };
}

