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
import { emptyResort } from "../packages/shared/src/engine/state.ts";
import { loadAllRegions } from "../packages/shared/src/terrain/dem.ts";
import { MemorySaveStore, SqlSaveStore } from "../packages/shared/src/runtime/saves.ts";
import { connect, publish } from "../packages/shared/src/runtime/connection.ts";
import { NOT_ALLOWED_MESSAGE, rosterAdmits, rosterGate } from "../src/lib/auth/allowlist.ts";
import { createNotifier } from "./notify.mjs";

const WS_PORT = Number(process.env.WS_PORT || 8788);
/** Where the app itself listens, for verifying sessions over loopback. */
const APP_PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL?.trim();

const rooms = new Map();
/** Push to whoever is away (ntfy). Silent without NTFY_URL. */
const notifier = createNotifier({ url: process.env.NTFY_URL, publicUrl: process.env.BETTER_AUTH_URL?.trim() });
/** Rounds each room has reported, to notice one being played. */
const reportedRounds = new WeakMap();

function notifyRoundIfPlayed(room) {
  const played = room.state.match?.history?.length ?? 0;
  const before = reportedRounds.get(room);
  reportedRounds.set(room, played);
  if (before !== undefined && played > before) void notifier.roundPlayed(room);
}
/** `seq` of each room at its last save, so an idle resort is not rewritten every few seconds. */
const savedSeq = new Map();
/** Kind of each room at its last save: «freigeben» changes it without moving `seq`. */
const savedKind = new Map();
/** Last presence each room broadcast, to notice arrivals and departures. */
const presenceSeen = new WeakMap();
/** Saved resorts that failed to load. Never served and never overwritten. */
const quarantined = new Set();
/** Sockets currently in a room, so a snapshot reaches everyone in it. */
const bindings = new Set();
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null;

if (!pool) {
  console.warn("[ws] no DATABASE_URL — the resort will not survive a restart");
}

/** Save points: in Postgres with the resorts, in memory without a database. */
const saveStore = pool
  ? new SqlSaveStore(async (text, params) => (await pool.query(text, params)).rows)
  : new MemorySaveStore();

function createRoom(id, meta, region) {
  const room = new GameRoom(id, emptyResort(id, region));
  room.meta = meta;
  rooms.set(id, room);
  return room;
}

function getRoom(id) {
  if (quarantined.has(id)) throw new Error(`resort ${id} is quarantined`);
  let room = rooms.get(id);
  if (!room) {
    room = new GameRoom(id);
    rooms.set(id, room);
  }
  return room;
}

/**
 * Load every saved resort before the socket opens.
 *
 * A failed read must stop the process, not be shrugged off: carrying on meant
 * the next join created an empty resort under the same id, and the periodic
 * save then overwrote the real one with it. Exiting lets the container restart
 * and try again once the database is back. A single unreadable row is skipped
 * and left untouched in the table, rather than taking every other resort down.
 */
async function hydrate() {
  // Every game's map must be in memory before its room is built.
  await loadAllRegions();
  if (!pool) return;
  let rows;
  try {
    ({ rows } = await pool.query("select id, snapshot, kind, owner, updated_at from resorts"));
  } catch (err) {
    console.error("[ws] could not load saved resorts — refusing to start with an empty world", err);
    process.exit(1);
  }
  for (const row of rows) {
    try {
      const snap = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
      const room = new GameRoom(row.id, snap);
      room.meta = { kind: row.kind === "own" ? "own" : "shared", owner: row.owner ?? null };
      if (row.updated_at) room.updatedAt = new Date(row.updated_at).getTime() || room.updatedAt;
      rooms.set(row.id, room);
      savedSeq.set(row.id, room.seq);
      savedKind.set(row.id, room.meta.kind);
    } catch (err) {
      quarantined.add(row.id);
      console.error(`[ws] resort ${row.id} could not be loaded and stays untouched`, err);
    }
  }
  console.info(`[ws] restored ${rooms.size} resort(s)`);
}

/** Write the resorts that changed since their last save. */
async function persist() {
  if (!pool) return;
  for (const room of rooms.values()) {
    const id = room.state.roomId;
    if (quarantined.has(id) || (savedSeq.get(id) === room.seq && savedKind.get(id) === room.meta.kind)) continue;
    const seq = room.seq;
    const kind = room.meta.kind;
    // The owner is written once, when the game is first stored. The kind can
    // change later, one way only: the owner sharing an own game («freigeben»).
    await pool.query(
      `insert into resorts (id, name, snapshot, kind, owner, updated_at)
       values ($1, $2, $3::jsonb, $4, $5, now())
       on conflict (id) do update
         set name = excluded.name, snapshot = excluded.snapshot, kind = excluded.kind, updated_at = now()`,
      [id, room.state.resortName, JSON.stringify(room.snapshot()), kind, room.meta.owner],
    );
    savedSeq.set(id, seq);
    savedKind.set(id, kind);
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
  const found = await lookupSession(cookie);
  return found === UNKNOWN ? null : found;
}

/** The app could not be asked (restarting, overloaded): neither yes nor no. */
const UNKNOWN = Symbol("unknown");

async function lookupSession(cookie) {
  if (!cookie) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/auth/get-session`, {
      headers: { cookie, accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.status >= 500) return UNKNOWN;
    if (!res.ok) return null;
    const body = await res.json();
    return body?.user ?? null;
  } catch {
    return UNKNOWN;
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

/**
 * The message handling is shared with the development socket
 * (packages/shared/src/runtime/connection.ts). What stays here: accepting
 * and authenticating sockets, Postgres, quarantine, push notifications and
 * the timers.
 */
const hub = {
  rooms,
  bindings,
  getRoom,
  createRoom,
  store: saveStore,
  isBlocked: (id) => quarantined.has(id),
  onChat: (room, entry) => void notifier.chat(room, entry),
  beforeIntent: (room) => {
    if (!reportedRounds.has(room)) reportedRounds.set(room, room.state.match?.history?.length ?? 0);
  },
  onIntent: (room, playerId, intent) => {
    if (intent.type === "end_round" && intent.ready) {
      void notifier.readyWaiting(room, room.players.get(playerId)?.name ?? "Jemand");
    }
    notifyRoundIfPlayed(room);
  },
  log: (label, err) => console.warn(`[ws] ${label}`, err),
};

await hydrate();

const http = createServer((req, res) => {
  // The proxy only forwards /ws; anything else reaching here is a health probe.
  res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "text/plain" });
  res.end(req.url === "/health" ? "ok" : "not found");
});

// A snapshot is ~20 KB of JSON and compresses about six times; nothing a
// player sends comes near 2 MB (an imported resort file is the biggest).
const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024, perMessageDeflate: { threshold: 1024 } });

/**
 * Hostnames a browser may open the socket from: the public URL, its
 * `ALLOWED_HOSTS` aliases and this machine. A page on another site — even a
 * sibling subdomain, which the Lax session cookie still covers — must not be
 * able to play, load or delete in someone's name.
 */
function allowedOrigins(env) {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  try {
    if (env.BETTER_AUTH_URL?.trim()) hosts.add(new URL(env.BETTER_AUTH_URL.trim()).hostname);
  } catch {
    // Not a URL: the app warns about that itself.
  }
  for (const part of (env.ALLOWED_HOSTS ?? "").split(/[,;\s]+/)) if (part) hosts.add(part.toLowerCase());
  return hosts;
}
const ORIGINS = allowedOrigins(process.env);
const originOk = (origin) => {
  // Browsers always send one on a WebSocket; tools without one hold no victim's cookie.
  if (!origin) return true;
  try {
    return ORIGINS.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
};

/** Each open socket's cookie, so a sign-out or a removal from the roster can close it. */
const cookies = new Map();

http.on("upgrade", (req, socket, head) => {
  if (!(req.url ?? "").startsWith("/ws")) {
    socket.destroy();
    return;
  }
  if (!originOk(req.headers.origin)) {
    console.warn(`[ws] refused upgrade from origin ${req.headers.origin}`);
    refuse(socket, 403, "Fremde Herkunft");
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
  // Only open sockets are written to; the shared handler sends through this.
  const socket = { send: (data) => ws.readyState === WebSocket.OPEN && ws.send(data) };
  const conn = connect(hub, socket, identity);
  cookies.set(ws, _req.headers.cookie);
  ws.on("message", (raw) => conn.onMessage(raw.toString()));
  ws.on("close", () => {
    cookies.delete(ws);
    conn.close();
  });
});

/**
 * Signed out, or taken off ALLOWED_EMAILS: the socket goes too. Checked every
 * few minutes rather than per message, which would ask the app on every tap.
 */
const RECHECK_MS = 5 * 60 * 1000;
setInterval(() => {
  const gate = rosterGate(process.env);
  if (!gate.enforced) return;
  for (const [ws, cookie] of cookies) {
    void lookupSession(cookie).then((user) => {
      // A hiccup of the app is not a sign-out: only a clear no closes the socket.
      if (user === UNKNOWN) return;
      if (!user || !rosterAdmits(gate, user.email)) ws.close(4401, "Abgemeldet");
    });
  }
}, RECHECK_MS).unref?.();

setInterval(() => {
  for (const room of rooms.values()) {
    // One resort throwing must not stop the others, nor kill the process into
    // a restart loop that reloads the same state and throws again.
    try {
      room.prunePlayers();
      if (!reportedRounds.has(room)) reportedRounds.set(room, room.state.match?.history?.length ?? 0);
      const moved = room.tick();
      if (moved) notifyRoundIfPlayed(room);
      // Presence can change while nothing else does (a match has no clock),
      // and the other player should see someone leave.
      const who = room.presence().map((p) => p.id).join(",");
      if (moved || presenceSeen.get(room) !== who) {
        presenceSeen.set(room, who);
        // Only the fields that changed; a full snapshot now and then (runtime/stream.ts).
        publish(hub, room);
      }
    } catch (err) {
      console.error(`[ws] tick failed for ${room.state.roomId}`, err);
    }
  }
}, TICK_MS);

let persisting = Promise.resolve();
setInterval(() => {
  persisting = persisting.then(persist).catch((err) => console.warn("[ws] persist", err));
}, PERSIST_MS);

/**
 * Write the resort once more before going.
 *
 * Every deploy stops this process; without a final save whatever happened
 * since the last interval — up to a few seconds of building — was lost.
 */
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.info(`[ws] ${signal} — saving and shutting down`);
  wss.close();
  try {
    await persisting;
    await persist();
  } catch (err) {
    console.warn("[ws] final save failed", err);
  }
  await pool?.end().catch(() => {});
  process.exit(0);
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void shutdown(signal));
}

http.listen(WS_PORT, "127.0.0.1", () => {
  const gate = rosterGate(process.env);
  console.info(
    `[ws] game socket on 127.0.0.1:${WS_PORT} — push ${notifier.enabled ? "on" : "off"} — roster ${
      gate.enforced ? `enforced (${gate.allowed.length} allowed)` : "open (development)"
    }`,
  );
  if (gate.enforced && gate.allowed.length === 0) {
    console.warn("[ws] ALLOWED_EMAILS is empty, so nobody can join. This is deliberate.");
  }
});
