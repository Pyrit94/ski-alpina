import { ClientMessageSchema, type Intent, type ServerMessage } from "../protocol/intents.ts";
import type { ChatEntry } from "../types.ts";
import type { GameRoom } from "./room.ts";
import { canSee, handleLobby, isLobbyMessage, type GameMeta, type SaveStore } from "./saves.ts";
import { currentSnapshot, fieldSigs, newStream, nextUpdate, type RoomStream } from "./stream.ts";

/**
 * What one game socket does with the messages it receives: join, chat, marks,
 * intents and the save-point lobby.
 *
 * Shared by the production socket (scripts/ws-server.mjs) and the
 * development one (src/lib/game/server/hub.ts), so the two can no longer
 * drift apart. Each server keeps only what really differs: how sockets are
 * accepted and authenticated, where resorts are stored, and the timers.
 */

export interface Socketish {
  send: (data: string) => void;
}

export interface Binding<S extends Socketish = Socketish> {
  socket: S;
  playerId: string;
  roomId: string;
}

/** Who a socket belongs to, when sign-in vouched for it. */
export interface Identity {
  userId: string;
  name: string;
}

export interface Hub<S extends Socketish = Socketish> {
  rooms: Map<string, GameRoom>;
  bindings: Set<Binding<S>>;
  /** The room for an id, made on first use. */
  getRoom: (id: string) => GameRoom;
  /** A new room on a fresh resort, for the lobby's «Neues Spiel». */
  createRoom: (id: string, meta: GameMeta, region: string) => GameRoom;
  store: SaveStore;
  /** Rooms that must not be served, e.g. a save that failed to load. */
  isBlocked?: (roomId: string) => boolean;
  /** Called after an accepted chat line, e.g. to send a push notification. */
  onChat?: (room: GameRoom, entry: ChatEntry) => void;
  /** Called after an accepted intent. */
  onIntent?: (room: GameRoom, playerId: string, intent: Intent) => void;
  /** Called before an intent is applied, e.g. to remember the round count. */
  beforeIntent?: (room: GameRoom) => void;
  log: (label: string, err: unknown) => void;
}

export function sendTo(socket: Socketish, msg: ServerMessage): void {
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    // A socket closing mid-send is not this connection's problem.
  }
}

/** The whole state, as a one-off message outside any room's update stream (tests, tools). */
export function snapshotOf(room: GameRoom): ServerMessage {
  return { type: "snapshot", seq: room.seq, state: room.snapshot(), players: room.presence() };
}

/** Each room's update stream (runtime/stream.ts), made on first use. */
const streams = new WeakMap<GameRoom, RoomStream>();
export function streamOf(room: GameRoom): RoomStream {
  let stream = streams.get(room);
  if (!stream) {
    stream = newStream();
    streams.set(room, stream);
  }
  return stream;
}

/**
 * Tell everyone in the room what changed: a patch of the changed fields, or
 * a full snapshot when due. Worked out once per room, then sent to each socket.
 */
export function publish<S extends Socketish>(hub: Hub<S>, room: GameRoom, opts: { full?: boolean } = {}): void {
  broadcastTo(hub, room.state.roomId, nextUpdate(streamOf(room), room.snapshot(), room.presence(), opts));
}

/**
 * The whole current state for one socket (joining, or asking after a gap).
 *
 * Everyone else is first brought up to the same update, so the next patch
 * applies for all of them alike. Pass `always` when the room's presence just
 * changed (a join), so the others hear of it even if the resort did not move.
 */
export function sendSnapshot<S extends Socketish>(hub: Hub<S>, room: GameRoom, socket: Socketish, always = false): void {
  const stream = streamOf(room);
  if (always || !stream.sigs || !sameSigs(stream.sigs, fieldSigs(room.snapshot()))) publish(hub, room);
  sendTo(socket, currentSnapshot(stream, room.snapshot(), room.presence()));
}

function sameSigs(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/** How often one socket may ask for the whole state again. */
export const RESYNC_MIN_MS = 1000;

export function broadcastTo<S extends Socketish>(hub: Hub<S>, roomId: string, msg: ServerMessage): void {
  // Serialised once for the whole room, not once per player.
  let data: string | null = null;
  for (const b of hub.bindings) {
    if (b.roomId !== roomId) continue;
    data ??= JSON.stringify(msg);
    try {
      b.socket.send(data);
    } catch {
      // A socket closing mid-send is not the room's problem.
    }
  }
}

/** The shared room anyone may open without an invitation (the classic valley). */
export const OPEN_ROOM = "zermatt";

/**
 * How many messages one socket may send: a burst of `burst`, then `perSecond`.
 * Far above what playing produces (a ping every few seconds, a build now and
 * then), far below what would let one socket keep the server busy.
 */
export const RATE = { burst: 60, perSecond: 20 } as const;

/** One socket's message handler and its clean-up. */
export function connect<S extends Socketish>(
  hub: Hub<S>,
  socket: S,
  identity: Identity | null,
): { onMessage: (raw: string) => void; close: () => void } {
  let bound: Binding<S> | null = null;
  const send = (msg: ServerMessage) => sendTo(socket, msg);
  const broadcast = (roomId: string, msg: ServerMessage) => broadcastTo(hub, roomId, msg);
  let lastResync = 0;

  let tokens: number = RATE.burst;
  let refilled = Date.now();
  let warned = 0;
  const allowed = () => {
    const now = Date.now();
    tokens = Math.min(RATE.burst, tokens + ((now - refilled) / 1000) * RATE.perSecond);
    refilled = now;
    if (tokens < 1) {
      if (now - warned > 1000) {
        warned = now;
        send({ type: "error", reason: "Zu viele Nachrichten – kurz warten", code: "invalid" });
      }
      return false;
    }
    tokens -= 1;
    return true;
  };

  // Nothing one message does may take the server down: whatever throws is
  // logged and answered, and every other game carries on.
  const onMessage = (raw: string) => {
    if (!allowed()) return;
    try {
      handle(raw);
    } catch (err) {
      hub.log("message", err);
      send({ type: "error", reason: "Das ging nicht", code: "invalid" });
    }
  };

  const handle = (raw: string) => {
    let parsed: ReturnType<typeof ClientMessageSchema.safeParse>;
    try {
      parsed = ClientMessageSchema.safeParse(JSON.parse(raw));
    } catch {
      send({ type: "error", reason: "Ungueltiges JSON", code: "invalid" });
      return;
    }
    if (!parsed.success) {
      send({ type: "error", reason: "Nachricht abgelehnt", code: "invalid" });
      return;
    }
    const msg = parsed.data;

    if (msg.type === "ping") {
      // A ping is how a quiet player says they are still here.
      if (bound) hub.getRoom(bound.roomId).touch(bound.playerId);
      send({ type: "pong", at: msg.at });
      return;
    }
    if (msg.type === "focus") {
      // Carried by the next tick's snapshot, so a moving pointer cannot flood.
      if (bound) hub.getRoom(bound.roomId).setFocus(bound.playerId, msg.hex);
      return;
    }
    if (msg.type === "resync") {
      // A full snapshot is the most expensive thing a socket can ask for.
      const now = Date.now();
      if (!bound || now - lastResync < RESYNC_MIN_MS) return;
      lastResync = now;
      const room = hub.rooms.get(bound.roomId);
      if (room) sendSnapshot(hub, room, socket);
      return;
    }
    if (isLobbyMessage(msg)) {
      const player = bound ? hub.rooms.get(bound.roomId)?.players.get(bound.playerId) : undefined;
      void handleLobby(msg, {
        store: hub.store,
        rooms: hub.rooms,
        createRoom: hub.createRoom,
        userId: identity?.userId ?? null,
        userName: identity?.name ?? player?.name ?? "Gast",
        boundRoomId: bound?.roomId ?? null,
        send,
        broadcast,
        publish: (room, opts) => publish(hub, room, opts),
        isBlocked: hub.isBlocked,
      }).catch((err: unknown) => {
        hub.log("saves", err);
        send({ type: "error", reason: "Spielstände gerade nicht erreichbar", code: "invalid", reqId: msg.reqId });
      });
      return;
    }
    if (msg.type === "join") {
      if (hub.isBlocked?.(msg.roomId)) {
        send({ type: "error", reason: "Dieser Spielstand konnte nicht geladen werden", code: "invalid" });
        return;
      }
      const existing = hub.rooms.get(msg.roomId);
      // New games come from the lobby («Neues Spiel»), not from joining a
      // made-up id, which would otherwise create and save one each time.
      if (!existing && msg.roomId !== OPEN_ROOM) {
        send({ type: "error", reason: "Dieses Spiel gibt es nicht", code: "invalid" });
        return;
      }
      if (existing && !canSee(existing.meta, identity?.userId ?? null)) {
        send({ type: "error", reason: "Dieses Spiel gehört jemand anderem", code: "rights" });
        return;
      }
      const room = hub.getRoom(msg.roomId);
      // A signed-in socket takes its identity from the account, never from
      // the name and token the client sent (those are for local play).
      const player = room.join(msg.name, msg.token, identity ?? undefined);
      if (bound) hub.bindings.delete(bound);
      bound = null;
      send({ type: "welcome", playerId: player.id, token: player.token, roomId: room.state.roomId });
      // The others hear of the arrival as a patch; the newcomer gets the
      // whole state as of that same update, and only then joins the stream.
      sendSnapshot(hub, room, socket, true);
      bound = { socket, playerId: player.id, roomId: room.state.roomId };
      hub.bindings.add(bound);
      return;
    }
    if (!bound) {
      send({ type: "error", reason: "Zuerst beitreten", code: "rights" });
      return;
    }
    const room = hub.getRoom(bound.roomId);
    room.touch(bound.playerId);

    if (msg.type === "chat") {
      const entry = room.say(bound.playerId, msg.text);
      if (entry) {
        publish(hub, room);
        hub.onChat?.(room, entry);
      }
      return;
    }
    if (msg.type === "mark") {
      room.setMark(bound.playerId, msg.hex, msg.kind);
      publish(hub, room);
      return;
    }

    hub.beforeIntent?.(room);
    const result = room.submit(bound.playerId, msg.intent);
    if (!result.ok) {
      send({ type: "error", intentId: msg.id, reason: result.reason, code: result.code });
      return;
    }
    broadcast(bound.roomId, {
      type: "event",
      title: result.event.title,
      body: result.event.body,
      kind: result.event.kind,
      actorId: result.event.actorId,
      actorName: result.event.actorName,
    });
    publish(hub, room);
    hub.onIntent?.(room, bound.playerId, msg.intent);
  };

  return {
    onMessage,
    close: () => {
      if (bound) hub.bindings.delete(bound);
      bound = null;
    },
  };
}
