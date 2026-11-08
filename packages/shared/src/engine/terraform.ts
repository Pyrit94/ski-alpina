import { TERRAFORM } from "../../../config/src/economy.ts";
import { hexKey, hexToWorld } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import { withEdits } from "../terrain/edits.ts";
import type { IntentResult, ResortState } from "../types.ts";
import { discounted } from "./research.ts";
import { occupiedSet } from "./state.ts";

/**
 * «Gelände ebnen»: one hex of valley floor made level at its own height, so
 * a slope beside the village can carry a building. Low down, off the water,
 * not under anything built, and not where it is rock.
 */
export function validateLevel(state: ResortState, dem: Dem, q: number, r: number, money = Infinity): IntentResult {
  const edits = state.terrain ?? {};
  const key = hexKey(q, r);
  const { x, z } = hexToWorld(q, r);
  if (Math.abs(x) > 92 || Math.abs(z) > 92) return { ok: false, code: "terrain", reason: "Ausserhalb des Gebiets" };
  if (edits[key] !== undefined) return { ok: false, code: "invalid", reason: "Schon geebnet" };
  if (Object.keys(edits).length >= TERRAFORM.maxEdits) return { ok: false, code: "invalid", reason: "Genug geebnet für dieses Gebiet" };
  if (dem.isWater(x, z)) return { ok: false, code: "terrain", reason: "Auf dem See" };
  const v = dem.region.village;
  const above = dem.sample(x, z) - dem.sample(v.x, v.z);
  if (above > TERRAFORM.maxAboveVillageM) return { ok: false, code: "terrain", reason: "Nur im Talgrund – hier ist es zu hoch" };
  if (dem.slope(x, z) > TERRAFORM.maxSlope) return { ok: false, code: "slope", reason: "Zu steil zum Ebnen – das ist Fels" };
  if (occupiedSet(state).has(key) || state.pistes.some((p) => p.hexes.some((h) => h.q === q && h.r === r))) {
    return { ok: false, code: "collision", reason: "Belegt" };
  }
  if (money < discounted(state, TERRAFORM.costPerHex)) return { ok: false, code: "budget", reason: "Zu teuer" };
  return { ok: true };
}

export function applyLevel(state: ResortState, dem: Dem | undefined, intent: Extract<Intent, { type: "level_ground" }>) {
  const ground = dem ? withEdits(dem, state.terrain) : null;
  const { x, z } = hexToWorld(intent.q, intent.r);
  const level = ground ? Math.round(ground.sample(x, z)) : 0;
  return {
    state: {
      ...state,
      coins: state.coins - discounted(state, TERRAFORM.costPerHex),
      terrain: { ...(state.terrain ?? {}), [hexKey(intent.q, intent.r)]: level },
    },
    title: "Gelände geebnet",
    body: "Hier lässt sich jetzt bauen.",
    kind: "ok" as const,
  };
}
