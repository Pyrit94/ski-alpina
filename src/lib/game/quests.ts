import { emptyResort } from "@ski/shared";
import type { Quest } from "./types";

/**
 * The starting quest list, taken from the shared config rather than restated.
 *
 * This file used to carry its own copy of all ten goals plus its own progress
 * sync keyed on quest id. Both had already drifted from `packages/config`,
 * which is the single definition the authoritative sim actually runs on — the
 * copy here knew nothing of the standing contracts or their tiers.
 */
export function makeQuests(): Quest[] {
  return emptyResort().quests;
}
