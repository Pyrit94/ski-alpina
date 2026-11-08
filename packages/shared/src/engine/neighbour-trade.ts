import { NEIGHBOURS } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { createId } from "../ids.ts";
import { hexDistance, hexesInRange, type Axial } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { IntentResult, Neighbour, PlacedBuilding, PlacedLift, PlacedPiste, ResortState } from "../types.ts";
import { absDay, neighbourKm, neighboursOn, pactFee } from "./neighbours.ts";
import { seasonDemandShare } from "./season.ts";
import { occupiedSet } from "./state.ts";

/**
 * Dealing with a neighbour ski area: a «Tarifverbund» (one pass for both,
 * see `pactFee`), and buying it out. An offer at or above what it wants is
 * taken at once; below, it names its price for a few days. Everything is
 * worked out from the state, without chance. All numbers in NEIGHBOURS.
 */

export type TradeIntent = Extract<Intent, { type: "neighbour_pact" | "offer_buyout" | "answer_counter" }>;

export function isTradeIntent(intent: Intent): intent is TradeIntent {
  return intent.type === "neighbour_pact" || intent.type === "offer_buyout" || intent.type === "answer_counter";
}

const B = NEIGHBOURS.buyout;
const step = (v: number) => Math.max(B.priceStep, Math.round(v / B.priceStep) * B.priceStep);
const chf = (n: number) => `${Math.round(n).toLocaleString("de-CH")} CHF`;

/** What its lifts and runs would cost new, at `assetShare`. */
function assetValue(n: Neighbour): number {
  const lifts = n.lifts.reduce((sum, l) => sum + (BY_ID[l.itemId]?.cost ?? 0), 0);
  const runs = n.pistes.reduce((sum, p) => sum + Math.max(1, p.hexes.length - 1) * (BY_ID[p.itemId]?.cost ?? 0), 0);
  return (lifts + runs) * B.assetShare;
}

/** Its takings on a full winter day, CHF. */
function dailyIncome(n: Neighbour): number {
  return neighbourKm(n) * NEIGHBOURS.guestsPerKmDay * NEIGHBOURS.marginPerGuest;
}

/** What a neighbour is worth on paper: its lifts and runs, and some days of takings. */
export function neighbourEstimate(n: Neighbour): number {
  return step(assetValue(n) + dailyIncome(n) * B.incomeDays);
}

/** An offer at a share of the estimate, in whole price steps (the card's quick offers). */
export function offerAt(n: Neighbour, share: number): number {
  return step(neighbourEstimate(n) * share);
}

/**
 * How well it is doing, 0 … 1: half the season's demand right now, half its
 * savings. A neighbour in the thaw with an empty till is cheap.
 */
export function neighbourMood(state: Pick<ResortState, "day">, n: Neighbour): number {
  const season = seasonDemandShare(state.day);
  const savings = Math.min(1, Math.max(0, n.coins / B.boomCoins));
  return Math.min(1, Math.max(0, 0.5 * season + 0.5 * savings));
}

/** The least it takes today. */
export function neighbourReservation(state: Pick<ResortState, "day">, n: Neighbour): number {
  const [low, high] = B.moodFactor;
  return step(neighbourEstimate(n) * (low + (high - low) * neighbourMood(state, n)));
}

function findNeighbour(state: ResortState, id: string): Neighbour | undefined {
  return neighboursOn(state).find((n) => n.id === id);
}

/** A counteroffer that still holds today, if any. */
export function liveCounter(state: Pick<ResortState, "season" | "day">, n: Neighbour) {
  return n.counter && n.counter.until >= absDay(state) ? n.counter : null;
}

export function validateTrade(state: ResortState, intent: TradeIntent, money: number, purse: string): IntentResult {
  if ((state.neighbours?.mode ?? "off") === "off") return { ok: false, code: "invalid", reason: "Keine Nachbarn in diesem Spiel" };
  const n = findNeighbour(state, intent.neighbourId);
  if (!n) return { ok: false, code: "invalid", reason: "Dieses Skigebiet gibt es nicht" };
  if (intent.type === "neighbour_pact") {
    if (Boolean(n.pact) === intent.on) {
      return { ok: false, code: "invalid", reason: intent.on ? "Schon im Tarifverbund" : "Kein Tarifverbund" };
    }
    if (intent.on && money < pactFee(n)) return { ok: false, code: "budget", reason: purse };
    return { ok: true };
  }
  if (intent.type === "offer_buyout") {
    if (intent.amount > money) return { ok: false, code: "budget", reason: purse };
    return { ok: true };
  }
  const counter = liveCounter(state, n);
  if (!counter) return { ok: false, code: "invalid", reason: "Kein Gegenangebot offen" };
  if (intent.accept && counter.price > money) return { ok: false, code: "budget", reason: purse };
  return { ok: true };
}

type Applied = { state: ResortState; title: string; body: string; kind: "ok" | "info" | "warn" };
type Actor = { id: string; name: string };

const withNeighbour = (state: ResortState, n: Neighbour): ResortState => ({
  ...state,
  neighbours: { mode: state.neighbours?.mode ?? "off", list: (state.neighbours?.list ?? []).map((x) => (x.id === n.id ? n : x)) },
});

export function applyTrade(state: ResortState, intent: TradeIntent, now: number, actor?: Actor): Applied {
  const n = findNeighbour(state, intent.neighbourId);
  if (!n) return { state, title: "Nachbarn", body: "Dieses Skigebiet gibt es nicht mehr.", kind: "warn" };

  if (intent.type === "neighbour_pact") {
    const next = withNeighbour(state, { ...n, pact: intent.on });
    return intent.on
      ? {
          state: next,
          title: "Tarifverbund",
          body: `Ein Pass für euch und ${n.name}: Sie nehmen euch keine Gäste mehr. ${chf(pactFee(n))} pro Tag.`,
          kind: "ok",
        }
      : { state: next, title: "Tarifverbund beendet", body: `${n.name} geht wieder eigene Wege.`, kind: "info" };
  }

  if (intent.type === "answer_counter") {
    const counter = liveCounter(state, n);
    if (!counter) return { state, title: "Gegenangebot", body: "Das Angebot gilt nicht mehr.", kind: "warn" };
    if (intent.accept) return takeOver(state, n, counter.price, now, actor);
    const rest = { ...n };
    delete rest.counter;
    return { state: withNeighbour(state, rest), title: "Gegenangebot abgelehnt", body: `${n.name} bleibt eigenständig.`, kind: "info" };
  }

  // An offer.
  const price = neighbourReservation(state, n);
  if (intent.amount >= price) return takeOver(state, n, intent.amount, now, actor);
  if (intent.amount < neighbourEstimate(n) * B.insultShare) {
    return {
      state,
      title: "Angebot abgelehnt",
      body: `${n.name} winkt ab: ${chf(intent.amount)} ist weit unter dem Wert.`,
      kind: "warn",
    };
  }
  const counter = { price: step(price * B.counterMarkup), until: absDay(state) + B.counterDays - 1 };
  return {
    state: withNeighbour(state, { ...n, counter }),
    title: "Gegenangebot",
    body: `${n.name} will ${chf(counter.price)}. Das Angebot gilt ${B.counterDays} Tage.`,
    kind: "info",
  };
}

/**
 * The neighbour becomes the players': its lifts, stations and runs with new
 * ids of their own, built by whoever bought it, and its car park by its
 * valley station, so its guests still arrive. It leaves the list.
 */
function takeOver(state: ResortState, n: Neighbour, price: number, now: number, actor?: Actor): Applied {
  const own = { builtAt: now, readyAt: now, builtBy: actor?.id, acquired: true };
  const stationId = new Map(n.buildings.map((b) => [b.id, createId("st")]));
  const buildings: PlacedBuilding[] = n.buildings.map((b) => ({ ...b, ...own, id: stationId.get(b.id)! }));
  const lifts: PlacedLift[] = n.lifts.map((l) => ({
    ...l,
    ...own,
    id: createId("l"),
    stationA: stationId.get(l.stationA) ?? createId("st"),
    stationB: stationId.get(l.stationB) ?? createId("st"),
  }));
  const pistes: PlacedPiste[] = n.pistes.map((p) => ({ ...p, ...own, id: createId("p") }));
  const rest = (state.neighbours?.list ?? []).filter((x) => x.id !== n.id);
  let next: ResortState = {
    ...state,
    coins: state.coins - price,
    buildings: [...state.buildings, ...buildings],
    lifts: [...state.lifts, ...lifts],
    pistes: [...state.pistes, ...pistes],
    neighbours: { mode: state.neighbours?.mode ?? "off", list: rest },
  };
  const door = doorSpot(next, n.base);
  if (door) {
    next = {
      ...next,
      buildings: [
        ...next.buildings,
        {
          id: createId("b"),
          itemId: B.door,
          q: door.q,
          r: door.r,
          level: 1,
          upgrades: { speed: 0, cabins: 0, capacity: 0 },
          ...own,
        },
      ],
    };
  }
  return {
    state: next,
    title: "Übernahme",
    body: `${n.name} gehört jetzt euch: ${n.lifts.length} ${n.lifts.length === 1 ? "Bahn" : "Bahnen"} und ${n.pistes.length} ${n.pistes.length === 1 ? "Piste" : "Pisten"} für ${chf(price)}.`,
    kind: "ok",
  };
}

/**
 * Where the bought area's car park goes: on the neighbour's valley station
 * hex, or the nearest free hex to it. Its runs end around there, so the
 * guests arriving by car reach them as before.
 */
function doorSpot(state: ResortState, base: Axial): Axial | null {
  const taken = occupiedSet(state);
  for (const p of state.pistes) for (const h of p.hexes) taken.add(`${h.q},${h.r}`);
  for (const other of neighboursOn(state)) {
    for (const b of other.buildings) taken.add(`${b.q},${b.r}`);
    for (const p of other.pistes) for (const h of p.hexes) taken.add(`${h.q},${h.r}`);
  }
  const free = hexesInRange(base, 2)
    .filter((h) => !taken.has(`${h.q},${h.r}`))
    .sort((a, b) => hexDistance(a, base) - hexDistance(b, base) || a.q - b.q || a.r - b.r);
  return free[0] ?? null;
}
