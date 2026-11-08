import { z } from "zod";
import { ECONOMY } from "../../../config/src/economy.ts";
import { ITEM_IDS } from "../../../config/src/ids.ts";
import { RESEARCH_BY_ID } from "../../../config/src/research.ts";
import { MAX_PISTE_HEXES } from "../protocol/intents.ts";
import type { ResortState } from "../types.ts";

/**
 * What a resort file brought in from outside («Spielstand importieren») may
 * contain. The server trusts the state it holds, so a file is checked hard
 * before it becomes one: known items only, whole hexes on the map, finite
 * numbers within reason, and no more of anything than a real resort has.
 * Everything that is history or session (chat, activity, a running match,
 * proposals, stats) starts fresh; it is not worth trusting.
 */
export const IMPORT_LIMITS = {
  lifts: 300,
  buildings: 1500,
  pistes: 600,
  coins: 1_000_000_000,
  gems: 1_000_000,
  xp: 100_000_000,
  terrain: 5000,
  name: 60,
} as const;

const coord = z.number().int().min(-200).max(200);
const Hex = z.object({ q: coord, r: coord });
const time = z.number().finite();
const id = z.string().min(1).max(64);
const level = z.number().int().min(1).max(10);
const Upgrades = z.object({
  speed: z.number().int().min(0).max(10),
  cabins: z.number().int().min(0).max(10),
  capacity: z.number().int().min(0).max(10),
});
const NO_UPGRADES = { speed: 0, cabins: 0, capacity: 0 };
const ItemId = z.enum(ITEM_IDS);

const Building = z.object({
  id,
  itemId: ItemId,
  q: coord,
  r: coord,
  level: level.default(1),
  builtAt: time,
  readyAt: time,
  upgrades: Upgrades.default(NO_UPGRADES),
  builtBy: z.string().max(64).optional(),
});

const Lift = z.object({
  id,
  itemId: ItemId,
  name: z.string().max(32).optional(),
  a: Hex,
  b: Hex,
  stationA: id,
  stationB: id,
  mid: Hex.optional(),
  stationMid: id.optional(),
  level: level.default(1),
  builtAt: time,
  readyAt: time,
  upgrades: Upgrades.default(NO_UPGRADES),
  builtBy: z.string().max(64).optional(),
});

const Piste = z.object({
  id,
  itemId: ItemId,
  difficulty: z.enum(["blue", "red", "black", "park", "road"]),
  hexes: z.array(Hex).min(2).max(MAX_PISTE_HEXES),
  builtAt: time,
  readyAt: time,
  builtBy: z.string().max(64).optional(),
  width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  name: z.string().max(32).optional(),
  level: level.optional(),
  score: z.number().finite().min(0).max(100).optional(),
});

const Research = z.object({
  done: z.array(z.string()).max(200),
  active: z.object({ id: z.string(), progress: z.number().finite().min(0) }).nullable(),
  points: z.number().finite().min(0),
  pledges: z.record(z.string(), z.array(z.string().max(64)).max(16)).default({}),
  queue: z.array(z.string()).max(50).default([]),
});

const Import = z.object({
  resortName: z.string().optional(),
  region: z.string().max(32).optional(),
  coins: z.number().finite().optional(),
  gems: z.number().finite().optional(),
  stars: z.number().finite().optional(),
  xp: z.number().finite().optional(),
  season: z.number().int().min(1).max(10_000).optional(),
  day: z.number().int().min(1).max(366).optional(),
  ticketPrice: z.number().finite().optional(),
  lifts: z.array(Lift).max(IMPORT_LIMITS.lifts),
  buildings: z.array(Building).max(IMPORT_LIMITS.buildings),
  pistes: z.array(Piste).max(IMPORT_LIMITS.pistes),
  research: Research.optional(),
  terrain: z.record(z.string().regex(/^-?\d{1,3},-?\d{1,3}$/), z.number().finite().min(-1000).max(9000)).optional(),
  neighbours: z.object({ mode: z.enum(["off", "gemuetlich", "wettbewerb"]) }).passthrough().optional(),
  version: z.number().int().optional(),
});

const clamp = (v: number | undefined, lo: number, hi: number) => (v === undefined ? undefined : Math.min(hi, Math.max(lo, v)));

/**
 * A resort file, checked and trimmed to what may be trusted — or the reason
 * it is refused. Neighbours come back as a mode only; the server lays them
 * out afresh on the map, as it does for a new game.
 */
export function cleanImport(raw: unknown): { ok: true; state: Partial<ResortState> } | { ok: false; reason: string } {
  const parsed = Import.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "Diese Datei ist kein gültiger Spielstand von Ski Alpina" };
  const s = parsed.data;
  if (s.terrain && Object.keys(s.terrain).length > IMPORT_LIMITS.terrain) {
    return { ok: false, reason: "Diese Datei ist kein gültiger Spielstand von Ski Alpina" };
  }
  // Ids are how everything is found again: two things with one id are not a resort.
  const ids = [...s.lifts.map((l) => l.id), ...s.buildings.map((b) => b.id), ...s.pistes.map((p) => p.id)];
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "Diese Datei ist kein gültiger Spielstand von Ski Alpina" };
  // Every lift's stations are buildings of that lift, as the server makes them.
  const byId = new Map(s.buildings.map((b) => [b.id, b]));
  const stationOk = (sid: string | undefined, itemId: string) => sid !== undefined && byId.get(sid)?.itemId === itemId;
  for (const l of s.lifts) {
    if (!stationOk(l.stationA, l.itemId) || !stationOk(l.stationB, l.itemId) || (l.mid && !stationOk(l.stationMid, l.itemId))) {
      return { ok: false, reason: "Diese Datei ist kein gültiger Spielstand von Ski Alpina" };
    }
  }
  const research = s.research && {
    ...s.research,
    done: s.research.done.filter((n) => RESEARCH_BY_ID[n]),
    queue: s.research.queue.filter((n) => RESEARCH_BY_ID[n]),
    active: s.research.active && RESEARCH_BY_ID[s.research.active.id] ? s.research.active : null,
  };
  const state: Partial<ResortState> = {
    ...(s.version !== undefined ? { version: s.version } : {}),
    ...(s.resortName ? { resortName: s.resortName.trim().slice(0, IMPORT_LIMITS.name) || undefined } : {}),
    ...(s.region ? { region: s.region } : {}),
    coins: clamp(s.coins, 0, IMPORT_LIMITS.coins),
    gems: clamp(s.gems, 0, IMPORT_LIMITS.gems),
    stars: clamp(s.stars, 0, 5),
    xp: clamp(s.xp, 0, IMPORT_LIMITS.xp),
    season: s.season,
    day: s.day,
    ticketPrice: clamp(s.ticketPrice, ECONOMY.ticketMin, ECONOMY.ticketMax),
    lifts: s.lifts,
    buildings: s.buildings,
    pistes: s.pistes,
    ...(research ? { research } : {}),
    ...(s.terrain ? { terrain: s.terrain } : {}),
    ...(s.neighbours ? { neighbours: { mode: s.neighbours.mode, list: [] } } : {}),
  };
  for (const k of Object.keys(state) as (keyof ResortState)[]) if (state[k] === undefined) delete state[k];
  return { ok: true, state };
}
