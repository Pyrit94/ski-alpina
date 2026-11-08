import type { ItemId } from "@/lib/game/types";

/**
 * Height of the cable at a lift station, and how far the up- and down-lines
 * sit apart there. The station model puts its bullwheel exactly here and the
 * scene hangs the rope from the same numbers, so the rope runs round the
 * wheel instead of ending in mid-air. Kept out of models.tsx: exporting plain
 * values from a file of components breaks Fast Refresh.
 */
export const STATION_CABLE_Y = 1.6;

export function cableGap(kind: ItemId): number {
  return kind === "tbar" ? 0.24 : 0.38;
}

/**
 * Which way a station faces: its open side (+z in the model) toward the
 * other end of its lift.
 */
export function stationYaw(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
