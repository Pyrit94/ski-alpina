#!/usr/bin/env node
/**
 * The authoritative game socket, as its own process.
 *
 * Development serves `/ws` from inside Vite (see `vite.config.ts`), which can
 * load the engine through the SSR runner with aliases resolved. A built
 * container cannot: the Vite config is bundled without `resolve.alias`, and the
 * module graph behind the socket boots PGLite and Better Auth on import, so
 * pulling it into the config would do that on every build. Hence a separate
 * process, with `preview.proxy` putting it back on the same origin — which is
 * what makes the browser send the session cookie along with the upgrade.
 *
 * Run with `node --experimental-strip-types` so the shared TypeScript engine
 * imports directly. Every import here is relative for the same reason.
 */
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import pg from "pg";
import { GameRoom, PERSIST_MS, TICK_MS } from "../packages/shared/src/runtime/room.ts";
import { ClientMessageSchema } from "../packages/shared/src/protocol/intents.ts";
import { NOT_ALLOWED_MESSAGE, rosterAdmits, rosterGate } from "../src/lib/auth/allowlist.ts";

const WS_PORT = Number(process.env.WS_PORT || 8788);
/** Where the app itself listens, for verifying sessions over loopback. */
const APP_PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL?.trim();

const rooms = new Map();
/** Sockets currently in a room, so a snapshot reaches everyone in it. */
const bindings = new Set();
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null;

if (!pool) {
  console.warn("[ws] no DATABASE_URL — the resort will not survive a restart");
}

function getRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = new GameRoom(id);
    rooms.set(id, room);
  }
  return room;
}

async function hydrate() {
  if (!pool) return;
  try {
    const { rows } = await pool.query("select id, snapshot from resorts");
    for (const row of rows) {
      const snap = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
      rooms.set(row.id, new GameRoom(row.id, snap));
    }
    console.info(`[ws] restored ${rows.length} resort(s)`);
  } catch (err) {
    console.warn("[ws] hydrate skipped", err);
  }
}

async function persist() {
  if (!pool) return;
  for (const room of rooms.values()) {
    await pool.query(
      `insert into resorts (id, name, snapshot, updated_at)
       values ($1, $2, $3::jsonb, now())
       on conflict (id) do update
         set name = excluded.name, snapshot = excluded.snapshot, updated_at = now()`,
      [room.state.roomId, room.state.resortName, JSON.stringify(room.snapshot())],
    );
  }
}

/**
 * Ask the app who this cookie belongs to.
 *
 * Verifying over loopback rather than importing Better Auth keeps this process
 * free of the alias-and-side-effect graph that made bundling impossible, and
 * means there is exactly one implementation of "who is signed in".
 */
async function sessionFor(cookie) {
  if (!cookie) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/auth/get-session`, {
      headers: { cookie, accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.user ?? null;
  } catch {
    return null;
  }
}

function displayName(user) {
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  if (name) return name.slice(0, 24);
  const local = typeof user?.email === "string" ? user.email.split("@", 1)[0] : "";
  return (local || "Gast").slice(0, 24);
}

/** Refuse at the HTTP level, so no socket is ever created. */
function refuse(socket, status, reason) {
  const label = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Bad Request";
  socket.write(
    `HTTP/1.1 ${status} ${label}\r\nConnection: close\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(reason)}\r\n\r\n${reason}`,
  );
  socket.destroy();
}

const send = (socket, msg) => {
  try {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  } catch {
    /* closed */
  }
};

function broadcast(roomId, msg) {
  for (const b of bindings) if (b.roomId === roomId) send(b.socket, msg);
}

function snapshotOf(room) {
  return { type: "snapshot", seq: room.seq, state: room.snapshot(), players: room.presence() };
}

await hydrate();

const http = createServer((req, res) => {
  // The proxy only forwards /ws; anything else reaching here is a health probe.
  res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "text/plain" });
  res.end(req.url === "/health" ? "ok" : "not found");
});

const wss = new WebSocketServer({ noServer: true });

http.on("upgrade", (req, socket, head) => {
  if (!(req.url ?? "").startsWith("/ws")) {
    socket.destroy();
    return;
  }
  const gate = rosterGate(process.env);
  void sessionFor(req.headers.cookie).then((user) => {
    if (gate.enforced) {
      if (!user) {
        refuse(socket, 401, "Nicht angemeldet");
        return;
      }
      if (!rosterAdmits(gate, user.email)) {
        console.warn(`[ws] refused ${user.email ?? "account with no email"}: not on ALLOWED_EMAILS`);
        refuse(socket, 403, NOT_ALLOWED_MESSAGE);
        return;
      }
    }
    const identity = user ? { userId: user.id, name: displayName(user) } : null;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req, identity));
  });
});

wss.on("connection", (ws, _req, identity) => {
  let bound = null;

  ws.on("message", (raw) => {
    let parsed;
    try {
      parsed = ClientMessageSchema.safeParse(JSON.parse(raw.toString()));
    } catch {
      send(ws, { type: "error", reason: "Ungueltiges JSON", code: "invalid" });
      return;
    }
    if (!parsed.success) {
      send(ws, { type: "error", reason: "Nachricht abgelehnt", code: "invalid" });
      return;
    }
    const msg = parsed.data;

    if (msg.type === "ping") {
      if (bound) getRoom(bound.roomId).touch(bound.playerId);
      send(ws, { type: "pong", at: msg.at });
      return;
    }

    if (msg.type === "join") {
      const room = getRoom(msg.roomId);
      // An authenticated socket takes its identity from the account, never
      // from the name and token the client supplied.
      const player = room.join(msg.name, msg.token, identity ?? undefined);
      if (bound) bindings.delete(bound);
      bound = { socket: ws, playerId: player.id, roomId: room.state.roomId };
      bindings.add(bound);
      send(ws, {
        type: "welcome",
        playerId: player.id,
        token: player.token,
        roomId: room.state.roomId,
      });
      broadcast(room.state.roomId, snapshotOf(room));
      return;
    }

    if (!bound) {
      send(ws, { type: "error", reason: "Zuerst beitreten", code: "rights" });
      return;
    }
    const room = getRoom(bound.roomId);
    room.touch(bound.playerId);
    const result = room.submit(bound.playerId, msg.intent);
    if (!result.ok) {
      send(ws, { type: "error", intentId: msg.id, reason: result.reason, code: result.code });
      return;
    }
    broadcast(bound.roomId, {
      type: "event",
      title: result.event.title,
      body: result.event.body,
      kind: result.event.kind,
    });
    broadcast(bound.roomId, snapshotOf(room));
  });

  ws.on("close", () => {
    if (bound) bindings.delete(bound);
  });
});

setInterval(() => {
  for (const room of rooms.values()) {
    room.tick();
    room.prunePlayers();
    broadcast(room.state.roomId, snapshotOf(room));
  }
}, TICK_MS);

let persisting = Promise.resolve();
setInterval(() => {
  persisting = persisting.then(persist).catch((err) => console.warn("[ws] persist", err));
}, PERSIST_MS);

http.listen(WS_PORT, "127.0.0.1", () => {
  const gate = rosterGate(process.env);
  console.info(
    `[ws] game socket on 127.0.0.1:${WS_PORT} — roster ${
      gate.enforced ? `enforced (${gate.allowed.length} allowed)` : "open (development)"
    }`,
  );
  if (gate.enforced && gate.allowed.length === 0) {
    console.warn("[ws] ALLOWED_EMAILS is empty, so nobody can join. This is deliberate.");
  }
});
