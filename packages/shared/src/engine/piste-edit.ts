import { ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexToWorld } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import type { IntentResult, PisteWidth, PlacedPiste, ResortState } from "../types.ts";
import { gradeBand, measurePiste } from "./level.ts";
import { widthDef, widthOf } from "./piste-width.ts";

type EditPiste = Extract<Intent, { type: "edit_piste" }>;

/**
 * What cutting this run at `width` costs.
 *
 * Priced from the ground exactly like placing it, so widening a run costs what
 * building it wide in the first place would have. Without a DEM — or if the
 * ground no longer holds the run — the stored grade stands in for the survey.
 */
export function pistePriceAt(piste: PlacedPiste, width: PisteWidth, dem?: Dem): number {
  const item = BY_ID[piste.itemId];
  const segments = Math.max(1, piste.hexes.length - 1);
  if (piste.itemId !== "piste") return item.cost * segments;
  if (dem) {
    const survey = measurePiste(
      piste.hexes,
      (hex) => {
        const { x, z } = hexToWorld(hex.q, hex.r);
        return dem.slope(x, z);
      },
      item.cost,
      width,
    );
    if (survey) return survey.cost;
  }
  const grade = piste.difficulty === "red" || piste.difficulty === "black" ? piste.difficulty : "blue";
  return Math.round(item.cost * segments * gradeBand(grade).costFactor * widthDef(width).cost);
}

/**
 * What changing a run's width costs: positive is paid, negative comes back.
 *
 * Widening pays the full difference. Narrowing gives back only the demolition
 * share of it, the same as tearing that much of the run out would.
 */
export function widthChangePrice(piste: PlacedPiste, width: PisteWidth, dem?: Dem): number {
  const diff = pistePriceAt(piste, width, dem) - pistePriceAt(piste, widthOf(piste), dem);
  if (diff >= 0) return diff;
  return -Math.floor(-diff * ECONOMY.demolishRefund);
}

export function validateEditPiste(state: ResortState, dem: Dem, intent: EditPiste): IntentResult {
  const piste = state.pistes.find((p) => p.id === intent.pisteId);
  if (!piste) return { ok: false, code: "invalid", reason: "Piste fehlt" };
  const renaming = intent.name !== undefined && intent.name.trim() !== (piste.name ?? "");
  const widening = intent.width !== undefined && intent.width !== widthOf(piste);
  if (intent.width !== undefined && piste.itemId !== "piste") {
    return { ok: false, code: "invalid", reason: "Nur Pisten haben eine Breite" };
  }
  if (!renaming && !widening) return { ok: false, code: "invalid", reason: "Nichts zu ändern" };
  if (widening && intent.width !== undefined) {
    const price = widthChangePrice(piste, intent.width, dem);
    if (price > state.coins) return { ok: false, code: "budget", reason: "Zu teuer" };
  }
  return { ok: true };
}

export function applyEditPiste(
  state: ResortState,
  intent: EditPiste,
  dem?: Dem,
): { state: ResortState; title: string; body: string; kind: "ok" | "info" | "warn" } {
  const piste = state.pistes.find((p) => p.id === intent.pisteId);
  if (!piste) return { state, title: "Piste", body: "Diese Piste gibt es nicht mehr.", kind: "warn" };
  const width = intent.width !== undefined && intent.width !== widthOf(piste) ? intent.width : null;
  const price = width === null ? 0 : widthChangePrice(piste, width, dem);
  const name = intent.name === undefined ? piste.name : intent.name.trim() || undefined;

  const next: PlacedPiste = { ...piste };
  if (name) next.name = name;
  else delete next.name;
  if (width !== null) next.width = width;

  const label = name ? `«${name}»` : BY_ID[piste.itemId].name;
  const body =
    width === null
      ? `${label} heisst jetzt so.`
      : price >= 0
        ? `${label} ist jetzt ${widthDef(width).label.toLowerCase()}, ${price} CHF.`
        : `${label} ist jetzt ${widthDef(width).label.toLowerCase()}, ${-price} CHF zurück.`;
  return {
    state: {
      ...state,
      coins: state.coins - price,
      pistes: state.pistes.map((p) => (p.id === piste.id ? next : p)),
    },
    title: width === null ? "Piste umbenannt" : "Piste umgebaut",
    body,
    kind: width === null ? "info" : "ok",
  };
}
