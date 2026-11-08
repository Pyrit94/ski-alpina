import { setNeighbourMode } from "../engine/neighbours.ts";
import { createId } from "../ids.ts";
import type { ResortState } from "../types.ts";
import type { ClientMessage, ServerMessage } from "../protocol/intents.ts";
import type { GameRoom } from "./room.ts";
import { CLASSIC_REGION } from "../../../config/src/regions.ts";
import { knownRegion } from "../terrain/dem.ts";

/**
 * Games and save points.
 *
 * A *game* is a resort that keeps itself saved as it is played — exactly what
 * every room already was. Its kind says who sees it: a shared game is open to
 * everyone on the roster, an own game only to the account that started it.
 *
 * A *save* is a named snapshot of a game, as many as anyone wants. Loading one
 * puts that state back into its game for everyone in it, after first saving
 * the state it replaces, so nothing is ever lost by loading. Nobody is put into
 * a game automatically: the start screen lists them and you pick one.
 *
 * Shared by the production socket (scripts/ws-server.mjs) and the dev hub, so
 * there is one implementation of who may see, save and load what.
 */

export type GameKind = "shared" | "own";

export interface GameMeta {
  kind: GameKind;
  /** Account that owns an own game. Null: nobody recorded, visible to all. */
  owner: string | null;
}

export interface SaveSummary {
  day: number;
  season: number;
  coins: number;
  stars: number;
  lifts: number;
  pistes: number;
  /** Set while a match is on: round played so far of how many. */
  round?: number;
  rounds?: number;
}

export interface SaveInfo {
  id: string;
  gameId: string;
  name: string;
  createdAt: number;
  createdByName: string;
  summary: SaveSummary;
}

export interface SaveRecord extends SaveInfo {
  createdBy: string | null;
  snapshot: ResortState;
}

export interface GameInfo {
  id: string;
  name: string;
  kind: GameKind;
  /** The map: a region id from config/regions.ts, or "classic". */
  region: string;
  /** Whether the asking account owns it (always false for shared games). */
  mine: boolean;
  updatedAt: number;
  /** People connected right now. */
  online: number;
  summary: SaveSummary;
  saves: SaveInfo[];
}

/** Where save points live: Postgres in production, memory in tests. */
export interface SaveStore {
  list(gameIds: readonly string[]): Promise<SaveInfo[]>;
  get(id: string): Promise<SaveRecord | null>;
  insert(save: SaveRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

export const SAVE_NAME_MAX = 40;
export const GAME_NAME_MAX = 32;

export function summarize(state: ResortState): SaveSummary {
  const match = state.match;
  const inMatch = match?.mode === "match";
  return {
    day: state.day,
    season: state.season,
    coins: Math.round(state.coins),
    stars: state.stars,
    lifts: state.lifts.length,
    pistes: state.pistes.filter((p) => p.difficulty !== "road").length,
    ...(inMatch ? { round: match.round, rounds: match.roundsTotal } : {}),
  };
}

/** Whether `userId` may see and play a game. */
export function canSee(meta: GameMeta, userId: string | null): boolean {
  if (meta.kind === "shared" || !meta.owner) return true;
  return meta.owner === userId;
}

/** "Sa 8.11. 21:30", in Swiss time: the default name of a save. */
export function defaultSaveName(at = Date.now()): string {
  const parts = new Intl.DateTimeFormat("de-CH", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday").replace(".", "")} ${get("day")}.${get("month")}. ${get("hour")}:${get("minute")}`;
}

const clean = (text: string | undefined, max: number) => (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** A deep copy, so a save never shares objects with the live game. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MemorySaveStore implements SaveStore {
  private saves = new Map<string, SaveRecord>();
  async list(gameIds: readonly string[]): Promise<SaveInfo[]> {
    const ids = new Set(gameIds);
    return [...this.saves.values()]
      .filter((s) => ids.has(s.gameId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ snapshot: _s, createdBy: _c, ...info }) => info);
  }
  async get(id: string): Promise<SaveRecord | null> {
    const s = this.saves.get(id);
    return s ? copy(s) : null;
  }
  async insert(save: SaveRecord): Promise<void> {
    this.saves.set(save.id, copy(save));
  }
  async remove(id: string): Promise<void> {
    this.saves.delete(id);
  }
}

/** Run a parameterised query, returning row objects. */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const millis = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());
const json = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

export class SqlSaveStore implements SaveStore {
  private readonly query: Query;
  constructor(query: Query) {
    this.query = query;
  }
  async list(gameIds: readonly string[]): Promise<SaveInfo[]> {
    if (gameIds.length === 0) return [];
    const rows = await this.query(
      `select id, resort_id, name, summary, created_by_name, created_at
         from resort_saves where resort_id = any($1::text[]) order by created_at desc`,
      [gameIds],
    );
    return rows.map((r) => ({
      id: String(r.id),
      gameId: String(r.resort_id),
      name: String(r.name),
      createdAt: millis(r.created_at),
      createdByName: String(r.created_by_name ?? ""),
      summary: json<SaveSummary>(r.summary),
    }));
  }
  async get(id: string): Promise<SaveRecord | null> {
    const rows = await this.query(
      `select id, resort_id, name, summary, snapshot, created_by, created_by_name, created_at
         from resort_saves where id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: String(r.id),
      gameId: String(r.resort_id),
      name: String(r.name),
      createdAt: millis(r.created_at),
      createdBy: r.created_by == null ? null : String(r.created_by),
      createdByName: String(r.created_by_name ?? ""),
      summary: json<SaveSummary>(r.summary),
      snapshot: json<ResortState>(r.snapshot),
    };
  }
  async insert(save: SaveRecord): Promise<void> {
    await this.query(
      `insert into resort_saves (id, resort_id, name, snapshot, summary, created_by, created_by_name, created_at)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, to_timestamp($8 / 1000.0))`,
      [
        save.id,
        save.gameId,
        save.name,
        JSON.stringify(save.snapshot),
        JSON.stringify(save.summary),
        save.createdBy,
        save.createdByName,
        save.createdAt,
      ],
    );
  }
  async remove(id: string): Promise<void> {
    await this.query("delete from resort_saves where id = $1", [id]);
  }
}

export type LobbyMessage = Extract<
  ClientMessage,
  { type: "list_games" | "create_game" | "import_game" | "save_game" | "load_save" | "delete_save" }
>;

export function isLobbyMessage(msg: ClientMessage): msg is LobbyMessage {
  return (
    msg.type === "list_games" ||
    msg.type === "create_game" ||
    msg.type === "import_game" ||
    msg.type === "save_game" ||
    msg.type === "load_save" ||
    msg.type === "delete_save"
  );
}

export interface LobbyContext {
  store: SaveStore;
  rooms: Map<string, GameRoom>;
  /** Make (and register) a new room, on a fresh resort of `region`. */
  createRoom: (id: string, meta: GameMeta, region: string) => GameRoom;
  /** Signed-in account, or null without sign-in (local play). */
  userId: string | null;
  userName: string;
  /** The game this socket is in, if any. */
  boundRoomId: string | null;
  send: (msg: ServerMessage) => void;
  broadcast: (roomId: string, msg: ServerMessage) => void;
  snapshotOf: (room: GameRoom) => ServerMessage;
  /** Rooms that must not be served (failed to load). */
  isBlocked?: (id: string) => boolean;
}

/** Every game this account may see, with its saves, newest activity first. */
export async function listGames(ctx: LobbyContext): Promise<GameInfo[]> {
  const visible = [...ctx.rooms.values()].filter(
    (r) => !ctx.isBlocked?.(r.state.roomId) && canSee(r.meta, ctx.userId),
  );
  const saves = await ctx.store.list(visible.map((r) => r.state.roomId));
  return visible
    .map((r) => ({
      id: r.state.roomId,
      name: r.state.resortName,
      kind: r.meta.kind,
      region: r.state.region ?? CLASSIC_REGION,
      mine: r.meta.kind === "own" && r.meta.owner !== null && r.meta.owner === ctx.userId,
      updatedAt: r.updatedAt,
      online: r.presence().length,
      summary: summarize(r.state),
      saves: saves.filter((s) => s.gameId === r.state.roomId),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Handle a games-and-saves message. Every reply carries the request's `reqId`
 * and ends with the fresh game list, so the asking screen is always current.
 */
export async function handleLobby(msg: LobbyMessage, ctx: LobbyContext): Promise<void> {
  const reqId = msg.reqId;
  const fail = (reason: string, code = "invalid") => ctx.send({ type: "error", reason, code, reqId });
  const games = async () => ctx.send({ type: "games", reqId, games: await listGames(ctx) });
  const gameFor = (id: string | undefined | null) => {
    if (!id) return null;
    const room = ctx.rooms.get(id);
    if (!room || ctx.isBlocked?.(id) || !canSee(room.meta, ctx.userId)) return null;
    return room;
  };

  if (msg.type === "list_games") {
    await games();
    return;
  }

  if (msg.type === "create_game") {
    const kind = msg.kind;
    const id = createId(kind === "shared" ? "g" : "own");
    const region = msg.region && knownRegion(msg.region) ? msg.region : CLASSIC_REGION;
    const room = ctx.createRoom(id, { kind, owner: kind === "own" ? ctx.userId : null }, region);
    const name = clean(msg.name, GAME_NAME_MAX);
    if (name) room.state = { ...room.state, resortName: name };
    room.state = setNeighbourMode(room.state, room.dem, msg.neighbours ?? "gemuetlich", Date.now());
    room.touchGame();
    ctx.send({ type: "created", reqId, roomId: id });
    await games();
    return;
  }

  if (msg.type === "import_game") {
    // A file someone exported: a new game on its map, nothing else replaced.
    const snap = msg.snapshot as Partial<ResortState>;
    if (!Array.isArray(snap.lifts) || !Array.isArray(snap.buildings) || !Array.isArray(snap.pistes)) {
      return fail("Diese Datei ist kein Spielstand von Ski Alpina");
    }
    const kind = msg.kind;
    const id = createId(kind === "shared" ? "g" : "own");
    const region = typeof snap.region === "string" && knownRegion(snap.region) ? snap.region : CLASSIC_REGION;
    const room = ctx.createRoom(id, { kind, owner: kind === "own" ? ctx.userId : null }, region);
    try {
      room.restore({ ...(snap as ResortState), roomId: id, region });
    } catch {
      ctx.rooms.delete(id);
      return fail("Dieser Spielstand liess sich nicht lesen");
    }
    const name = clean(msg.name, GAME_NAME_MAX);
    if (name) room.state = { ...room.state, resortName: name };
    room.touchGame();
    ctx.send({ type: "created", reqId, roomId: id });
    await games();
    return;
  }

  if (msg.type === "save_game") {
    const room = gameFor(msg.gameId ?? ctx.boundRoomId);
    if (!room) return fail("Dieses Spiel gibt es nicht oder es gehört jemand anderem");
    const now = Date.now();
    const save: SaveRecord = {
      id: createId("sv"),
      gameId: room.state.roomId,
      name: clean(msg.name, SAVE_NAME_MAX) || defaultSaveName(now),
      createdAt: now,
      createdBy: ctx.userId,
      createdByName: ctx.userName,
      summary: summarize(room.state),
      snapshot: copy(room.snapshot()),
    };
    await ctx.store.insert(save);
    ctx.broadcast(room.state.roomId, {
      type: "event",
      title: "Spielstand gesichert",
      body: `${ctx.userName}: «${save.name}»`,
      kind: "ok",
    });
    await games();
    return;
  }

  if (msg.type === "load_save") {
    const save = await ctx.store.get(msg.saveId);
    const room = save ? gameFor(save.gameId) : null;
    if (!save || !room) return fail("Diesen Spielstand gibt es nicht mehr");
    const now = Date.now();
    // Loading never loses anything: what is replaced is saved first.
    await ctx.store.insert({
      id: createId("sv"),
      gameId: room.state.roomId,
      name: `Automatisch vor «${save.name}»`.slice(0, SAVE_NAME_MAX + 14),
      createdAt: now,
      createdBy: ctx.userId,
      createdByName: ctx.userName,
      summary: summarize(room.state),
      snapshot: copy(room.snapshot()),
    });
    room.restore(save.snapshot);
    room.touchGame();
    ctx.broadcast(room.state.roomId, {
      type: "event",
      title: "Spielstand geladen",
      body: `${ctx.userName} hat «${save.name}» geladen. Der vorherige Stand ist gesichert.`,
      kind: "info",
    });
    ctx.broadcast(room.state.roomId, ctx.snapshotOf(room));
    await games();
    return;
  }

  if (msg.type === "delete_save") {
    const save = await ctx.store.get(msg.saveId);
    if (!save || !gameFor(save.gameId)) return fail("Diesen Spielstand gibt es nicht mehr");
    await ctx.store.remove(save.id);
    await games();
  }
}
