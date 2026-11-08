import { ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { createId } from "../ids.ts";
import { hexDistance, hexLine, type Axial } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import type { IntentResult, ResortState } from "../types.ts";
import { buildCost } from "./research.ts";
import { validateHex } from "./validate.ts";

/**
 * Middle stations: a stop part-way up a lift. Guests get on and off there,
 * and runs can start or end at it — the way a long gondola serves the
 * slopes along its way and not only its top.
 */
type Adding = Extract<Intent, { type: "add_mid_station" }>;

export function midStationCost(state: ResortState, itemId: string): number {
  // buildCost already carries the research discount; once is enough.
  return Math.round(buildCost(state, itemId as never) * ECONOMY.midStationShare);
}

/** Hexes on the line between a lift's stations where a middle station could stand. */
export function midStationSpots(state: ResortState, dem: Dem, liftId: string): Axial[] {
  const lift = state.lifts.find((l) => l.id === liftId);
  if (!lift || lift.mid) return [];
  return hexLine(lift.a, lift.b).filter(
    (h) =>
      hexDistance(h, lift.a) >= ECONOMY.midStationGap &&
      hexDistance(h, lift.b) >= ECONOMY.midStationGap &&
      validateHex(state, dem, h.q, h.r, lift.itemId).ok,
  );
}

export function validateMidStation(state: ResortState, dem: Dem, intent: Adding, money: number): IntentResult {
  const lift = state.lifts.find((l) => l.id === intent.liftId);
  if (!lift) return { ok: false, code: "invalid", reason: "Keine Bahn" };
  if (lift.mid) return { ok: false, code: "invalid", reason: "Diese Bahn hat schon eine Mittelstation" };
  const h = { q: intent.q, r: intent.r };
  const span = hexDistance(lift.a, lift.b);
  if (hexDistance(lift.a, h) + hexDistance(h, lift.b) > span + 1) {
    return { ok: false, code: "invalid", reason: "Die Mittelstation steht auf der Linie der Bahn" };
  }
  if (hexDistance(lift.a, h) < ECONOMY.midStationGap || hexDistance(lift.b, h) < ECONOMY.midStationGap) {
    return { ok: false, code: "invalid", reason: "Zu nah an einer Endstation" };
  }
  const ground = validateHex(state, dem, h.q, h.r, lift.itemId);
  if (!ground.ok) return ground;
  if (money < midStationCost(state, lift.itemId)) return { ok: false, code: "budget", reason: "Zu teuer" };
  return { ok: true };
}

export function applyMidStation(state: ResortState, intent: Adding, now: number, actor?: { id: string }) {
  const lift = state.lifts.find((l) => l.id === intent.liftId)!;
  const item = BY_ID[lift.itemId];
  const id = createId("st");
  const station = {
    id,
    itemId: lift.itemId,
    q: intent.q,
    r: intent.r,
    level: 1,
    builtAt: now,
    readyAt: Math.max(now, lift.readyAt),
    upgrades: { speed: 0, cabins: 0, capacity: 0 },
    builtBy: actor?.id,
  };
  return {
    state: {
      ...state,
      coins: state.coins - midStationCost(state, lift.itemId),
      buildings: [...state.buildings, station],
      lifts: state.lifts.map((l) => (l.id === lift.id ? { ...l, mid: { q: intent.q, r: intent.r }, stationMid: id } : l)),
    },
    title: "Mittelstation",
    body: `${lift.name ?? item.name} hält jetzt auch unterwegs.`,
    kind: "ok" as const,
  };
}
