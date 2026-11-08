import { BUILDING_LEVELS, BY_ID, ECONOMY, PISTE_LEVELS } from "@ski/config";

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * What one more level of this building adds, in words for the button.
 * Mirrors the factors in packages/shared/src/engine/state.ts.
 */
export function levelGain(itemId: string): string {
  const item = BY_ID[itemId as keyof typeof BY_ID];
  if (!item) return "";
  const cap = BUILDING_LEVELS.capacityPerLevel;
  const bonus = BUILDING_LEVELS.bonusPerLevel;
  const parts: string[] = [];
  if (itemId === "parking") parts.push(`+${Math.round(ECONOMY.parkingArrivalsPerHour * cap)} Ankünfte/h`);
  if (itemId === "bus") parts.push(`+${Math.round(ECONOMY.busArrivalsPerHour * cap)} Ankünfte/h`);
  if (item.beds) parts.push(`+${Math.round(item.beds * BUILDING_LEVELS.bedsPerLevel)} Betten`);
  if (item.seatsPerHour) parts.push(`+${Math.round(item.seatsPerHour * cap)} Plätze/h`);
  if (item.retailPerHour) parts.push(`+${Math.round(item.retailPerHour * cap)} Kunden/h`);
  if (itemId === "ticket") parts.push(`+${pct(ECONOMY.ticketOfficeIncomeBonus * bonus)} Ticketumsatz`);
  if (itemId === "snowmaker") parts.push("tiefere Schneegrenze, besserer Schnee");
  if (itemId === "groomer") parts.push("kürzere Wartezeiten");
  if (itemId === "skischool") parts.push(`blaue Pisten +${pct(ECONOMY.schoolBonus * bonus)}`);
  if (itemId === "clinic") parts.push(`schwarze Pisten +${pct(ECONOMY.clinicBlackBonus * bonus)}`);
  if (itemId === "lights") parts.push("längere Abende");
  if (item.upkeepCut) parts.push(`Bahn-Unterhalt −${pct(item.upkeepCut * BUILDING_LEVELS.cutPerLevel)}`);
  if (item.satisfactionBonus && parts.length < 2) parts.push(`+${(item.satisfactionBonus * bonus).toFixed(1)} Zufriedenheit`);
  if (item.summerDraw) parts.push("mehr Sommergäste");
  return parts.slice(0, 2).join(", ");
}

/** Name of a building level: its own word if it has one, else "Stufe n". */
export function buildingLevelLabel(itemId: string, level: number): string {
  return BUILDING_LEVELS.labels[itemId]?.[level - 1] ?? `Stufe ${level}`;
}

/** Name of a run level and what it brings. */
export function pisteLevelLabel(level: number): { label: string; gain: string } {
  return { label: PISTE_LEVELS.labels[level - 1] ?? `Stufe ${level}`, gain: PISTE_LEVELS.effects[level - 1] ?? "" };
}
