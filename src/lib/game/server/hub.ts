import { ClientMessageSchema, type ServerMessage } from "@ski/shared";
import { GameRoom, PERSIST_MS, TICK_MS } from "../../../../packages/shared/src/runtime/room.ts";
import { getSql } from "@/lib/db";
import type { SocketIdentity } from "./identity.server";

type Socket = {
  send: (data: string) => void;
  close?: () => void;
};

interface Bound {
  socket: Socket;
  playerId: string;
  roomId: string;
}

const rooms = new Map<string, GameRoom>();
const bindings = new Set<Bound>();
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

export async function hydrateRooms(): Promise<void> {
  try {
    const sql = await getSql();
    const rows = await sql.query<{ id: string; snapshot: unknown }>("select id, snapshot from resorts");
    for (const row of rows) {
      const snap = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
      rooms.set(row.id, new GameRoom(row.id, snap as GameRoom["state"]));
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
      broadcast(room.state.roomId, {
        type: "snapshot",
        seq: room.seq,
        state: room.snapshot(),
        players: room.presence(),
      });
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
    await sql.query(
      `insert into resorts (id, name, snapshot, updated_at)
       values ($1, $2, $3::jsonb, now())
       on conflict (id) do update set name = excluded.name, snapshot = excluded.snapshot, updated_at = now()`,
      [room.state.roomId, room.state.resortName, room.snapshot()],
    );
  }
}

function send(socket: Socket, msg: ServerMessage) {
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    /* closed */
  }
}

function broadcast(roomId: string, msg: ServerMessage) {
  for (const b of bindings) {
    if (b.roomId === roomId) send(b.socket, msg);
  }
}

export function handleSocket(socket: Socket, identity?: SocketIdentity | null): void {
  ensureTimers();
  let bound: Bound | null = null;

  const onMessage = (raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      send(socket, { type: "error", reason: "Ungueltiges JSON", code: "invalid" });
      return;
    }
    const msg = ClientMessageSchema.safeParse(parsed);
    if (!msg.success) {
      send(socket, { type: "error", reason: "Nachricht abgelehnt", code: "invalid" });
      return;
    }
    if (msg.data.type === "ping") {
      // A ping is how a quiet player says they are still here.
      if (bound) getRoom(bound.roomId).touch(bound.playerId);
      send(socket, { type: "pong", at: msg.data.at });
      return;
    }
    if (msg.data.type === "join") {
      const room = getRoom(msg.data.roomId);
      // When the socket was authenticated the account decides who this is —
      // the name and token in the message are only a fallback for local dev.
      const player = room.join(msg.data.name, msg.data.token, identity ?? undefined);
      if (bound) bindings.delete(bound);
      bound = { socket, playerId: player.id, roomId: room.state.roomId };
      bindings.add(bound);
      send(socket, { type: "welcome", playerId: player.id, token: player.token, roomId: room.state.roomId });
      send(socket, {
        type: "snapshot",
        seq: room.seq,
        state: room.snapshot(),
        players: room.presence(),
      });
      broadcast(room.state.roomId, {
        type: "snapshot",
        seq: room.seq,
        state: room.snapshot(),
        players: room.presence(),
      });
      return;
    }
    if (!bound) {
      send(socket, { type: "error", reason: "Zuerst beitreten", code: "rights" });
      return;
    }
    const room = getRoom(bound.roomId);
    const result = room.submit(bound.playerId, msg.data.intent);
    if (!result.ok) {
      send(socket, { type: "error", intentId: msg.data.id, reason: result.reason, code: result.code });
      return;
    }
    broadcast(bound.roomId, {
      type: "event",
      title: result.event.title,
      body: result.event.body,
      kind: result.event.kind,
    });
    broadcast(bound.roomId, {
      type: "snapshot",
      seq: room.seq,
      state: room.snapshot(),
      players: room.presence(),
    });
  };

  Object.assign(socket, {
    ingest: onMessage,
    drop: () => {
      if (bound) bindings.delete(bound);
    },
  });
}

export function ingestSocketMessage(
  socket: Socket,
  raw: string,
  identity?: SocketIdentity | null,
) {
  const rec = socket as Socket & { ingest?: (raw: string) => void };
  if (!rec.ingest) handleSocket(socket, identity);
  (socket as Socket & { ingest: (raw: string) => void }).ingest(raw);
}

export function dropSocket(socket: Socket) {
  const rec = socket as Socket & { drop?: () => void };
  rec.drop?.();
}

export function listRoomSnapshot(roomId: string) {
  const room = getRoom(roomId);
  return { state: room.snapshot(), players: room.presence(), seq: room.seq };
}
