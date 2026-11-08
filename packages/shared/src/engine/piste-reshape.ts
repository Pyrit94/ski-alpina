import { FLOW, PISTE_SCORE } from "../../../config/src/economy.ts";
import type { PisteGrade } from "../../../config/src/terrain.ts";
import { hexDistance, type Axial } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import type { IntentResult, PlacedPiste, ResortState } from "../types.ts";
import { swingLines } from "./auto-pistes.ts";
import { routePiste } from "./piste-route.ts";
import { scorePiste } from "./piste-score.ts";
import { discounted } from "./research.ts";
import { surveyPiste, validatePistePath } from "./validate.ts";

/**
 * A better line for a run already built: same start, same end, more swings,
 * more variety — the run as a skier would rather have it. The old grooming
 * counts half against the new line's price (PISTE_SCORE.reshapeCredit).
 */
export interface Reshape {
  pisteId: string;
  hexes: Axial[];
  before: number;
  after: number;
  cost: number;
}

type Reshaping = Extract<Intent, { type: "reshape_piste" }>;

export function reshapeCost(state: ResortState, dem: Dem, piste: PlacedPiste, hexes: readonly Axial[]): number | null {
  const next = surveyPiste(dem, "piste", hexes, piste.width);
  if (!next) return null;
  const old = surveyPiste(dem, "piste", piste.hexes, piste.width);
  return discounted(state, Math.max(0, Math.round(next.cost - (old?.cost ?? 0) * PISTE_SCORE.reshapeCredit)));
}

/** The best reshaping on offer for one run, or null when nothing is clearly better. */
export function bestReshape(state: ResortState, dem: Dem, pisteId: string): Reshape | null {
  const piste = state.pistes.find((p) => p.id === pisteId);
  if (!piste || piste.itemId !== "piste" || piste.hexes.length < 4) return null;
  const start = piste.hexes[0]!;
  const end = piste.hexes[piste.hexes.length - 1]!;
  const before = scorePiste(piste.hexes, dem).points;
  const without = { ...state, pistes: state.pistes.filter((p) => p.id !== pisteId) };
  const grades: PisteGrade[] = piste.difficulty === "blue" || piste.difficulty === "red" || piste.difficulty === "black" ? [piste.difficulty] : ["blue"];
  const lines: Axial[][] = [];
  for (const g of [...grades, "blue", "red", "black"] as PisteGrade[]) {
    const plain = routePiste(dem, start, end, g);
    if (plain) lines.push(plain);
    lines.push(...swingLines(dem, start, [end], g, plain ?? piste.hexes));
  }
  let best: Reshape | null = null;
  for (const hexes of lines) {
    if (!validatePistePath(without, dem, "piste", hexes).ok) continue;
    const after = scorePiste(hexes, dem).points;
    if (after < before + PISTE_SCORE.reshapeMinGain) continue;
    const cost = reshapeCost(state, dem, piste, hexes);
    if (cost === null) continue;
    if (!best || after > best.after || (after === best.after && cost < best.cost)) best = { pisteId, hexes, before, after, cost };
  }
  return best;
}

/** Every run that a reshaping would clearly improve, best gain first. */
export function reshapeAll(state: ResortState, dem: Dem, limit = 8): Reshape[] {
  const out: Reshape[] = [];
  for (const p of state.pistes) {
    if (p.itemId !== "piste") continue;
    const r = bestReshape(state, dem, p.id);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.after - b.before - (a.after - a.before)).slice(0, limit);
}

export function validateReshape(state: ResortState, dem: Dem, intent: Reshaping, money: number): IntentResult {
  const piste = state.pistes.find((p) => p.id === intent.pisteId);
  if (!piste || piste.itemId !== "piste") return { ok: false, code: "invalid", reason: "Keine Piste" };
  const a = intent.hexes[0]!;
  const b = intent.hexes[intent.hexes.length - 1]!;
  // Same places at both ends, so every join it had, it keeps.
  if (hexDistance(a, piste.hexes[0]!) > FLOW.linkRadius || hexDistance(b, piste.hexes[piste.hexes.length - 1]!) > FLOW.linkRadius) {
    return { ok: false, code: "invalid", reason: "Start und Ziel bleiben, wo sie sind" };
  }
  const without = { ...state, pistes: state.pistes.filter((p) => p.id !== piste.id) };
  const path = validatePistePath(without, dem, "piste", intent.hexes);
  if (!path.ok) return path;
  const cost = reshapeCost(state, dem, piste, intent.hexes);
  if (cost === null) return { ok: false, code: "terrain", reason: "Zu steil für eine Piste" };
  if (money < cost) return { ok: false, code: "budget", reason: "Zu teuer" };
  return { ok: true };
}

export function applyReshape(state: ResortState, dem: Dem | undefined, intent: Reshaping) {
  const piste = state.pistes.find((p) => p.id === intent.pisteId)!;
  if (!dem) return { state, title: "Piste", body: "Kein Gelände geladen.", kind: "warn" as const };
  const survey = surveyPiste(dem, "piste", intent.hexes, piste.width);
  const cost = reshapeCost(state, dem, piste, intent.hexes) ?? 0;
  const before = piste.score ?? scorePiste(piste.hexes, dem).points;
  const after = scorePiste(intent.hexes, dem).points;
  return {
    state: {
      ...state,
      coins: state.coins - cost,
      pistes: state.pistes.map((p) =>
        p.id === piste.id ? { ...p, hexes: [...intent.hexes], difficulty: survey?.grade ?? p.difficulty, score: after } : p,
      ),
    },
    title: "Piste verbessert",
    body: `${piste.name ? `«${piste.name}»: ` : ""}${before} → ${after} Punkte`,
    kind: "ok" as const,
  };
}
