import { getDem } from "@ski/shared";

/**
 * A gameplay height as the real one, for showing to the players.
 *
 * Every map is shifted so its village sits at the same gameplay height (see
 * config/regions.ts); the numbers the players read should be the mountain's.
 */
export function realMetres(gameMetres: number): number {
  return Math.round(gameMetres - getDem().region.offset);
}
