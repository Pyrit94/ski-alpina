import { BY_ID } from "../../../config/src/items.ts";
import { ECONOMY, FLOW, UPGRADES } from "../../../config/src/economy.ts";
import { isLift, isPiste, type ItemId } from "../../../config/src/ids.ts";
import { hexDistance, hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { Intent } from "../protocol/intents.ts";
import type { IntentResult, PlayerRole, ResortState } from "../types.ts";
import { expandable, expansionCost, findEntity, moveCost, occupiedSet, pisteExpandable, pisteExpansionCost, undoable } from "./state.ts";
import { measurePiste } from "./level.ts";
import { eventDef } from "./match.ts";
import { roleAllows, spendable, walletKey, walletMode } from "./rules.ts";
import { MAX_PISTE_HEXES } from "../protocol/intents.ts";
import {
  buildCost,
  discounted,
  isResearchIntent,
  itemUnlocked,
  liftReach,
  lockReason,
  reachLeft,
  validateResearch,
  type ResearchContext,
} from "./research.ts";
import type { PisteWidth } from "../types.ts";
import { validateEditPiste } from "./piste-edit.ts";
import { villageMovable } from "./site.ts";
import { accessAt } from "./access.ts";
import { validateLevel } from "./terraform.ts";
import { withEdits } from "../terrain/edits.ts";
import { validateProposalIntent } from "./proposals.ts";
import { validateReshape } from "./piste-reshape.ts";
import { hexKey } from "../hex.ts";

export function validateHex(
  state: ResortState,
  baseDem: Dem,
  q: number,
  r: number,
  itemId: ItemId,
): IntentResult {
  // The ground as the players have shaped it (see «Gelände ebnen»).
  const dem = withEdits(baseDem, state.terrain);
  if (itemId === "level") return validateLevel(state, baseDem, q, r);
  // Lifts climb higher with research (see liftReach).
  const reach = isLift(itemId) ? liftReach(state, itemId) : 0;
  const ground = validateGround(dem, q, r, itemId, reach, isLift(itemId) && reachLeft(state, itemId));
  if (!ground.ok) return ground;
  // Collision is skipped for pistes: a run has to be able to reach a station,
  // and stations occupy their hex. Not building the set for them keeps a
  // 48-hex path check cheap enough to run on every pointer move.
  if (!isPiste(itemId) && occupiedSet(state).has(`${q},${r}`)) {
    return { ok: false, code: "collision", reason: "Belegt" };
  }
  // Valley buildings on a road, mountain buildings beside a run (see ACCESS).
  const access = accessAt(state, dem, itemId, { q, r });
  if (!access.ok) return { ok: false, code: "invalid", reason: access.reason };
  return { ok: true };
}

/** The terrain half of `validateHex`: what the ground alone allows. */
export function validateGround(dem: Dem, q: number, r: number, itemId: ItemId, reach = 0, canGrow = false): IntentResult {
  const item = BY_ID[itemId];
  if (!item) return { ok: false, code: "invalid", reason: "Unbekanntes Objekt" };
  const { x, z } = hexToWorld(q, r);
  if (Math.abs(x) > 92 || Math.abs(z) > 92) {
    return { ok: false, code: "terrain", reason: "Ausserhalb des Gebiets" };
  }
  if (dem.isWater(x, z)) return { ok: false, code: "terrain", reason: "Auf dem See" };
  const elev = dem.sample(x, z);
  const slope = dem.slope(x, z);
  if (elev < item.minElev) return { ok: false, code: "terrain", reason: `Zu tief für ${item.name}` };
  if (elev > item.maxElev + reach) {
    // In the real metres the players read, with a pointer to research when it helps.
    const top = Math.round(item.maxElev + reach - dem.region.offset).toLocaleString("de-CH");
    return {
      ok: false,
      code: "terrain",
      reason: `Zu hoch für ${item.name}: bis ${top} m${canGrow ? " – Forschung bringt sie höher" : ""}`,
    };
  }
  if (slope > item.maxSlope) return { ok: false, code: "slope", reason: "Zu steil" };
  return { ok: true };
}

/**
 * Whether a drawn run can exist on this terrain.
 *
 * The one rule both sides use. The server used to check only the first hex and
 * the descent while the client's hover checked terrain per hex, so a run the
 * preview painted as impossible was accepted anyway — and a run the preview
 * allowed could still be refused. Neither side may own this alone: the server
 * has to be authoritative and the client has to predict it exactly.
 */
/**
 * What a drawn run would be, if it were built.
 *
 * The one place grade and price are worked out, so the price shown while
 * drawing is the price charged on submit. Null when the line crosses ground
 * too steep to hold a piste.
 */
export function surveyPiste(dem: Dem, itemId: ItemId, hexes: readonly Axial[], width?: PisteWidth) {
  const item = BY_ID[itemId];
  if (!item || itemId !== "piste") return null;
  return measurePiste(
    hexes,
    (hex) => {
      const { x, z } = hexToWorld(hex.q, hex.r);
      return dem.slope(x, z);
    },
    item.cost,
    width,
  );
}

/**
 * What placing this costs.
 *
 * A plain piste is priced from the ground it crosses; everything else is a
 * flat per-segment price as before.
 */
export function pisteCost(dem: Dem, itemId: ItemId, hexes: readonly Axial[], width?: PisteWidth): number {
  const survey = surveyPiste(dem, itemId, hexes, width);
  if (survey) return survey.cost;
  return BY_ID[itemId].cost * Math.max(1, hexes.length - 1);
}

export function validatePistePath(
  state: ResortState,
  dem: Dem,
  itemId: ItemId,
  hexes: readonly Axial[],
): IntentResult {
  if (hexes.length < 2) return { ok: false, code: "invalid", reason: "Zu kurz" };
  for (const hex of hexes) {
    // Collision is skipped for pistes inside validateHex: a run has to be able
    // to reach a station, and stations occupy their hex.
    const v = validateHex(state, dem, hex.q, hex.r, itemId);
    if (!v.ok) return v;
  }
  if (hexes.length > MAX_PISTE_HEXES) {
    return { ok: false, code: "invalid", reason: `Höchstens ${MAX_PISTE_HEXES - 1} Segmente am Stück` };
  }
  // Every step one hex. Checking only the points a client sent let a run of
  // two far-apart points jump the whole slope: priced as one segment, the
  // ground in between never graded.
  for (let i = 1; i < hexes.length; i++) {
    if (hexDistance(hexes[i - 1]!, hexes[i]!) !== 1) {
      return { ok: false, code: "invalid", reason: "Piste muss zusammenhängen" };
    }
  }
  if (itemId === "road") return { ok: true };
  for (let i = 1; i < hexes.length; i++) {
    const prev = hexes[i - 1]!;
    const cur = hexes[i]!;
    const a = hexToWorld(prev.q, prev.r);
    const b = hexToWorld(cur.q, cur.r);
    if (dem.sample(b.x, b.z) > dem.sample(a.x, a.z) + FLOW.pisteRiseTolerance) {
      return { ok: false, code: "slope", reason: "Piste muss talwärts" };
    }
  }
  return { ok: true };
}

export function validateIntent(
  state: ResortState,
  dem: Dem,
  intent: Intent,
  role: PlayerRole,
  now: number,
  /** Who sends it and who is here: purses, roles and alliance research need it. */
  ctx: ResearchContext = {},
): IntentResult {
  if (role !== "builder") return { ok: false, code: "rights", reason: "Keine Baurechte" };

  const match = state.match;
  const actorId = ctx.actorId;
  const money = spendable(state, actorId);
  const purse = walletMode(state) ? "In deiner Kasse fehlt Geld" : "Zu teuer";

  if (intent.type === "set_match_options") {
    if (match?.mode !== "match" || match.phase !== "plan") return { ok: false, code: "invalid", reason: "Keine laufende Partie" };
    if (intent.options.economy && intent.options.economy !== match.options.economy) {
      return { ok: false, code: "locked", reason: "Die Kassen-Regel gilt für die ganze Partie" };
    }
    return { ok: true };
  }
  if (intent.type === "choose_role") {
    if (match?.mode !== "match" || match.options.economy !== "roles") return { ok: false, code: "invalid", reason: "Keine Rollen in dieser Partie" };
    return { ok: true };
  }
  if (intent.type === "transfer_coins") {
    if (!walletMode(state)) return { ok: false, code: "invalid", reason: "Ihr habt eine gemeinsame Kasse" };
    const from = walletKey(state, actorId);
    if (!from) return { ok: false, code: "invalid", reason: "Wähle zuerst deine Rolle" };
    if (from === intent.to || !(intent.to in match.wallets)) return { ok: false, code: "invalid", reason: "Unbekannte Kasse" };
    if (intent.amount > money) return { ok: false, code: "budget", reason: "So viel ist nicht in deiner Kasse" };
    return { ok: true };
  }
  if (intent.type === "start_match") return { ok: true };
  if (intent.type === "free_play") {
    if (match?.mode !== "match") return { ok: false, code: "invalid", reason: "Ihr spielt schon frei" };
    return { ok: true };
  }
  if (intent.type === "end_round") {
    if (match?.mode !== "match" || match.phase !== "plan") {
      return { ok: false, code: "invalid", reason: "Keine laufende Partie" };
    }
    return { ok: true };
  }
  if (intent.type === "choose_event") {
    const pending = match?.mode === "match" ? match.event : null;
    if (!pending) return { ok: false, code: "invalid", reason: "Kein Ereignis offen" };
    if (pending.chosen !== null) return { ok: false, code: "locked", reason: "Schon entschieden" };
    const option = eventDef(pending.id)?.options[intent.option];
    if (!option) return { ok: false, code: "invalid", reason: "Unbekannte Wahl" };
    if (match.options.events === "vote") return { ok: true };
    if ((option.cost ?? 0) > money) return { ok: false, code: "budget", reason: purse };
    return { ok: true };
  }
  // A finished match is a result to look at, not a resort to keep building.
  if (match?.mode === "match" && match.phase === "finished" && intent.type !== "rename") {
    return { ok: false, code: "locked", reason: "Partie ist beendet" };
  }

  if (intent.type === "place_building") {
    const item = BY_ID[intent.itemId];
    if (!item || isLift(intent.itemId) || isPiste(intent.itemId) || intent.itemId === "level") {
      return { ok: false, code: "invalid", reason: "Kein Gebäude" };
    }
    if (!itemUnlocked(state, intent.itemId)) {
      return { ok: false, code: "locked", reason: lockReason(state, intent.itemId)?.text ?? `Level ${item.unlockLevel} nötig` };
    }
    const allowedB = roleAllows(state, actorId, intent.itemId);
    if (!allowedB.ok) return { ok: false, code: "rights", reason: allowedB.reason };
    if (money < buildCost(state, intent.itemId)) return { ok: false, code: "budget", reason: purse };
    if ((item.gemCost ?? 0) > state.gems) return { ok: false, code: "budget", reason: "Zu wenig Edelsteine" };
    return validateHex(state, dem, intent.q, intent.r, intent.itemId);
  }

  if (intent.type === "place_lift") {
    const item = BY_ID[intent.itemId];
    if (!item || !isLift(intent.itemId)) return { ok: false, code: "invalid", reason: "Kein Lift" };
    if (!itemUnlocked(state, intent.itemId)) {
      return { ok: false, code: "locked", reason: lockReason(state, intent.itemId)?.text ?? `Level ${item.unlockLevel} nötig` };
    }
    const allowedL = roleAllows(state, actorId, intent.itemId);
    if (!allowedL.ok) return { ok: false, code: "rights", reason: allowedL.reason };
    if (money < buildCost(state, intent.itemId)) return { ok: false, code: "budget", reason: purse };
    if ((item.gemCost ?? 0) > state.gems) return { ok: false, code: "budget", reason: "Zu wenig Edelsteine" };
    const a = validateHex(state, dem, intent.a.q, intent.a.r, intent.itemId);
    if (!a.ok) return a;
    const b = validateHex(state, dem, intent.b.q, intent.b.r, intent.itemId);
    if (!b.ok) return b;
    const dist = hexDistance(intent.a, intent.b);
    if (dist < (item.minSpan ?? 4)) return { ok: false, code: "invalid", reason: "Zu kurz" };
    if (dist > (item.maxSpan ?? 24)) return { ok: false, code: "invalid", reason: "Zu weit" };
    return { ok: true };
  }

  if (intent.type === "place_piste") {
    const item = BY_ID[intent.itemId];
    if (!item || !isPiste(intent.itemId)) return { ok: false, code: "invalid", reason: "Keine Piste" };
    if (!itemUnlocked(state, intent.itemId)) {
      return { ok: false, code: "locked", reason: lockReason(state, intent.itemId)?.text ?? `Level ${item.unlockLevel} nötig` };
    }
    const path = validatePistePath(state, dem, intent.itemId, intent.hexes);
    if (!path.ok) return path;
    // Price after the terrain check, so "too steep" is reported as too steep
    // rather than as an affordability problem on an impossible run.
    const allowedP = roleAllows(state, actorId, intent.itemId);
    if (!allowedP.ok) return { ok: false, code: "rights", reason: allowedP.reason };
    if (money < discounted(state, pisteCost(dem, intent.itemId, intent.hexes, intent.width))) {
      return { ok: false, code: "budget", reason: "Zu teuer" };
    }
    return { ok: true };
  }

  if (intent.type === "upgrade") {
    const def = UPGRADES.find((u) => u.key === intent.key);
    if (!def) return { ok: false, code: "invalid", reason: "Kein Upgrade" };
    // Only cableways have upgrade tracks the simulation reads. A station id
    // resolves to its lift, so tapping the station upgrades the lift.
    const entity = findEntity(state, intent.entityId);
    if (!entity || entity.kind !== "lift") return { ok: false, code: "invalid", reason: "Nur Bahnen lassen sich ausbauen" };
    const target = entity.lift;
    if (now < target.readyAt) return { ok: false, code: "locked", reason: "Noch im Bau" };
    const cur = target.upgrades[intent.key];
    if (cur >= def.max) return { ok: false, code: "locked", reason: "Maximalstufe" };
    const cost = def.cost[cur] ?? 999999;
    const allowedU = roleAllows(state, actorId, target.itemId);
    if (!allowedU.ok) return { ok: false, code: "rights", reason: allowedU.reason };
    if (money < cost) return { ok: false, code: "budget", reason: purse };
    return { ok: true };
  }

  if (intent.type === "expand") {
    const entity = findEntity(state, intent.entityId);
    const target =
      entity?.kind === "building" && expandable(entity.building.itemId)
        ? { itemId: entity.building.itemId, readyAt: entity.building.readyAt, cost: expansionCost(entity.building) }
        : entity?.kind === "piste" && pisteExpandable(entity.piste)
          ? { itemId: entity.piste.itemId, readyAt: entity.piste.readyAt, cost: pisteExpansionCost(entity.piste) }
          : null;
    if (!target) {
      return { ok: false, code: "invalid", reason: entity?.kind === "lift" ? "Bahnen werden über Upgrades verbessert" : "Lässt sich nicht ausbauen" };
    }
    if (now < target.readyAt) return { ok: false, code: "locked", reason: "Noch im Bau" };
    if (target.cost === null) return { ok: false, code: "locked", reason: "Maximalstufe" };
    const allowedX = roleAllows(state, actorId, target.itemId);
    if (!allowedX.ok) return { ok: false, code: "rights", reason: allowedX.reason };
    if (money < discounted(state, target.cost)) return { ok: false, code: "budget", reason: purse };
    return { ok: true };
  }

  if (intent.type === "demolish") {
    const entity = findEntity(state, intent.entityId);
    if (!entity) return { ok: false, code: "invalid", reason: "Objekt fehlt" };
    return { ok: true };
  }

  if (intent.type === "undo") {
    const entity = findEntity(state, intent.entityId);
    if (!entity) return { ok: false, code: "invalid", reason: "Objekt fehlt" };
    if (!undoable(state, entity, actorId, now)) {
      return { ok: false, code: "locked", reason: "Zu spät zum Rückgängigmachen – abreissen geht noch" };
    }
    return { ok: true };
  }

  if (intent.type === "move_building") {
    const entity = findEntity(state, intent.entityId);
    if (!entity || entity.kind !== "building" || isLift(entity.building.itemId)) {
      return { ok: false, code: "invalid", reason: "Nur Gebäude lassen sich verschieben" };
    }
    const b = entity.building;
    const allowed = roleAllows(state, actorId, b.itemId);
    if (!allowed.ok) return { ok: false, code: "rights", reason: allowed.reason };
    if (money < discounted(state, moveCost(state, b.itemId))) return { ok: false, code: "budget", reason: purse };
    // The building's own hex does not count as taken while it moves.
    const without = { ...state, buildings: state.buildings.filter((x) => x.id !== b.id) };
    return validateHex(without, dem, intent.q, intent.r, b.itemId);
  }

  if (intent.type === "propose" || intent.type === "decide_proposal" || intent.type === "set_proposal_limit") {
    return validateProposalIntent(state, dem, intent, role, now, ctx);
  }

  if (intent.type === "rearrange") {
    let cost = 0;
    for (const m of intent.moves) {
      const b = state.buildings.find((x) => x.id === m.entityId);
      if (!b) return { ok: false, code: "invalid", reason: "Gebäude nicht gefunden" };
      const allowed = roleAllows(state, actorId, b.itemId);
      if (!allowed.ok) return { ok: false, code: "rights", reason: allowed.reason };
      cost += discounted(state, moveCost(state, b.itemId));
    }
    if (money < cost) return { ok: false, code: "budget", reason: purse };
    const check = checkRearrange(state, dem, intent.moves);
    return check.ok ? { ok: true } : { ok: false, code: "invalid", reason: check.reason };
  }

  if (intent.type === "set_speed") {
    if (match?.mode === "match") return { ok: false, code: "invalid", reason: "In einer Partie gibt es Runden statt Tempo" };
    return { ok: true };
  }

  if (intent.type === "name_lift") {
    const entity = findEntity(state, intent.entityId);
    if (!entity || entity.kind !== "lift") return { ok: false, code: "invalid", reason: "Keine Bahn" };
    return { ok: true };
  }

  if (intent.type === "claim_quest") {
    const q = state.quests.find((x) => x.id === intent.questId);
    if (!q) return { ok: false, code: "invalid", reason: "Quest fehlt" };
    if (q.claimed) return { ok: false, code: "locked", reason: "Schon abgeholt" };
    if (q.progress < q.target) return { ok: false, code: "locked", reason: "Noch nicht fertig" };
    return { ok: true };
  }

  if (intent.type === "edit_piste") return validateEditPiste(state, dem, intent, actorId);
  if (intent.type === "reshape_piste") return validateReshape(state, dem, intent, money);
  if (intent.type === "level_ground") return validateLevel(state, dem, intent.q, intent.r, money);


  if (isResearchIntent(intent)) return validateResearch(state, intent, ctx);

  if (intent.type === "set_ticket_price") {
    if (intent.chf < ECONOMY.ticketMin || intent.chf > ECONOMY.ticketMax) {
      return { ok: false, code: "invalid", reason: "Preis ausserhalb" };
    }
    return { ok: true };
  }

  if (intent.type === "rename") {
    if (!intent.name.trim()) return { ok: false, code: "invalid", reason: "Name leer" };
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Whether a set of moves leaves a valid valley: every target on fitting
 * ground, off the runs' stations, and no two buildings on one hex.
 */
export function checkRearrange(
  state: Pick<ResortState, "lifts" | "buildings" | "pistes" | "terrain">,
  natural: Dem,
  moves: readonly { entityId: string; q: number; r: number }[],
): { ok: true } | { ok: false; reason: string } {
  const dem = withEdits(natural, state.terrain);
  const ids = new Set<string>();
  for (const m of moves) {
    if (ids.has(m.entityId)) return { ok: false, reason: "Ein Gebäude doppelt in der Liste" };
    ids.add(m.entityId);
    const b = state.buildings.find((x) => x.id === m.entityId);
    if (!b || !villageMovable(b.itemId)) return { ok: false, reason: "Dieses Gebäude lässt sich nicht neu anordnen" };
    const ground = validateGround(dem, m.q, m.r, b.itemId);
    if (!ground.ok) return { ok: false, reason: `${BY_ID[b.itemId].name}: ${ground.reason}` };
    const access = accessAt(state, dem, b.itemId, m);
    if (!access.ok) return { ok: false, reason: `${BY_ID[b.itemId].name}: ${access.reason}` };
  }
  const taken = new Set<string>();
  for (const l of state.lifts) {
    taken.add(hexKey(l.a.q, l.a.r));
    taken.add(hexKey(l.b.q, l.b.r));
  }
  const target = new Map(moves.map((m) => [m.entityId, m]));
  for (const b of state.buildings) {
    if (isLift(b.itemId)) continue;
    const m = target.get(b.id);
    const k = m ? hexKey(m.q, m.r) : hexKey(b.q, b.r);
    if (taken.has(k)) return { ok: false, reason: "Zwei Gebäude auf demselben Feld" };
    taken.add(k);
  }
  return { ok: true };
}
