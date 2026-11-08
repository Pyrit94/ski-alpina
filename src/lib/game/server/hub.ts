import { GameRoom, PERSIST_MS, TICK_MS } from "../../../../packages/shared/src/runtime/room.ts";
import { emptyResort } from "../../../../packages/shared/src/engine/state.ts";
import { loadAllRegions } from "../../../../packages/shared/src/terrain/dem.ts";
import { SqlSaveStore, type GameMeta } from "../../../../packages/shared/src/runtime/saves.ts";
import {
  broadcastTo,
  connect,
  snapshotOf,
  type Binding,
  type Hub,
} from "../../../../packages/shared/src/runtime/connection.ts";
import { getSql } from "@/lib/db";
import type { SocketIdentity } from "./identity.server";

/**
 * The game socket in development. The message handling is the same module
 * production uses (packages/shared/src/runtime/connection.ts); only storage
 * (PGLite or Postgres via getSql) and the timers live here.
 */

type Socket = {
  send: (data: string) => void;
  close?: () => void;
};

const rooms = new Map<string, GameRoom>();
const bindings = new Set<Binding<Socket>>();
let timersStarted = false;
let persistChain: Promise<void> = Promise.resolve();

export function getRoom(roomId: string): GameRoom {
  let room = rooms.get(roomId);
  if (!room) {
    room = new GameRoom(roomId);
    rooms.set(roomId, room);
  }
  return room;
}

/** Save points, in the same database as the resorts. */
const saveStore = new SqlSaveStore(async (text, params) => (await getSql()).query(text, params));

function createRoom(id: string, meta: GameMeta, region: string): GameRoom {
  const room = new GameRoom(id, emptyResort(id, region));
  room.meta = meta;
  rooms.set(id, room);
  return room;
}

export async function hydrateRooms(): Promise<void> {
  // Every game's map must be in memory before its room is built.
  await loadAllRegions();
  try {
    const sql = await getSql();
    const rows = await sql.query<{ id: string; snapshot: unknown; kind?: string; owner?: string | null; updated_at?: unknown }>(
      "select id, snapshot, kind, owner, updated_at from resorts",
    );
    for (const row of rows) {
      const snap = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
      const room = new GameRoom(row.id, snap as GameRoom["state"]);
      room.meta = { kind: row.kind === "own" ? "own" : "shared", owner: row.owner ?? null };
      if (row.updated_at) room.updatedAt = new Date(String(row.updated_at)).getTime() || room.updatedAt;
      rooms.set(row.id, room);
    }
  } catch (err) {
    console.warn("[ski] hydrate skipped", err);
  }
  ensureTimers();
}

function ensureTimers() {
  if (timersStarted) return;
  timersStarted = true;
  setInterval(() => {
    for (const room of rooms.values()) {
      room.tick();
      // Drop players who stopped answering, or the online count only climbs.
      room.prunePlayers();
      broadcast(room.state.roomId, snapshotOf(room));
    }
  }, TICK_MS);
  setInterval(() => {
    persistChain = persistChain.then(() => persistAll()).catch((err) => {
      console.warn("[ski] persist", err);
    });
  }, PERSIST_MS);
}

async function persistAll() {
  const sql = await getSql();
  for (const room of rooms.values()) {
    // Kind and owner are written once, when the game is first stored.
    await sql.query(
      `insert into resorts (id, name, snapshot, kind, owner, updated_at)
       values ($1, $2, $3::jsonb, $4, $5, now())
       on conflict (id) do update set name = excluded.name, snapshot = excluded.snapshot, updated_at = now()`,
      [room.state.roomId, room.state.resortName, room.snapshot(), room.meta.kind, room.meta.owner],
    );
  }
}

const hub: Hub<Socket> = {
  rooms,
  bindings,
  getRoom,
  createRoom,
  store: saveStore,
  log: (label, err) => console.warn(`[ski] ${label}`, err),
};

function broadcast(roomId: string, msg: Parameters<typeof broadcastTo>[2]) {
  broadcastTo(hub, roomId, msg);
}

export function handleSocket(socket: Socket, identity?: SocketIdentity | null): void {
  ensureTimers();
  const conn = connect(hub, socket, identity ?? null);
  Object.assign(socket, { ingest: conn.onMessage, drop: conn.close });
}

export function ingestSocketMessage(socket: Socket, raw: string, identity?: SocketIdentity | null) {
  const rec = socket as Socket & { ingest?: (raw: string) => void };
  if (!rec.ingest) handleSocket(socket, identity);
  (socket as Socket & { ingest: (raw: string) => void }).ingest(raw);
}

export function dropSocket(socket: Socket) {
  (socket as Socket & { drop?: () => void }).drop?.();
}

export function listRoomSnapshot(roomId: string) {
  const room = getRoom(roomId);
  return { state: room.snapshot(), players: room.presence(), seq: room.seq };
}
