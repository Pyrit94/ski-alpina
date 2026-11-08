import { ClientMessageSchema, type Intent, type ServerMessage } from "../protocol/intents.ts";
import type { ChatEntry } from "../types.ts";
import type { GameRoom } from "./room.ts";
import { canSee, handleLobby, isLobbyMessage, type GameMeta, type SaveStore } from "./saves.ts";

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

export function snapshotOf(room: GameRoom): ServerMessage {
  return { type: "snapshot", seq: room.seq, state: room.snapshot(), players: room.presence() };
}

export function broadcastTo<S extends Socketish>(hub: Hub<S>, roomId: string, msg: ServerMessage): void {
  for (const b of hub.bindings) if (b.roomId === roomId) sendTo(b.socket, msg);
}

/** One socket's message handler and its clean-up. */
export function connect<S extends Socketish>(
  hub: Hub<S>,
  socket: S,
  identity: Identity | null,
): { onMessage: (raw: string) => void; close: () => void } {
  let bound: Binding<S> | null = null;
  const send = (msg: ServerMessage) => sendTo(socket, msg);
  const broadcast = (roomId: string, msg: ServerMessage) => broadcastTo(hub, roomId, msg);

  const onMessage = (raw: string) => {
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
        snapshotOf,
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
      if (existing && !canSee(existing.meta, identity?.userId ?? null)) {
        send({ type: "error", reason: "Dieses Spiel gehört jemand anderem", code: "rights" });
        return;
      }
      const room = hub.getRoom(msg.roomId);
      // A signed-in socket takes its identity from the account, never from
      // the name and token the client sent (those are for local play).
      const player = room.join(msg.name, msg.token, identity ?? undefined);
      if (bound) hub.bindings.delete(bound);
      bound = { socket, playerId: player.id, roomId: room.state.roomId };
      hub.bindings.add(bound);
      send({ type: "welcome", playerId: player.id, token: player.token, roomId: room.state.roomId });
      broadcast(room.state.roomId, snapshotOf(room));
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
        broadcast(bound.roomId, snapshotOf(room));
        hub.onChat?.(room, entry);
      }
      return;
    }
    if (msg.type === "mark") {
      room.setMark(bound.playerId, msg.hex, msg.kind);
      broadcast(bound.roomId, snapshotOf(room));
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
    broadcast(bound.roomId, snapshotOf(room));
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
