import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { ClientMessageSchema } from "../../../packages/shared/src/index.ts";
import { GameRoom } from "../../../packages/shared/src/runtime/room.ts";

const rooms = new Map<string, GameRoom>();
function room(id: string): GameRoom {
  let r = rooms.get(id);
  if (!r) {
    r = new GameRoom(id);
    rooms.set(id, r);
  }
  return r;
}

/**
 * This process accepts websockets with no authentication whatsoever: `join`
 * takes a display name and a token the client invented. That is fine behind a
 * closed network and unacceptable on a public URL, so it refuses to start
 * unless someone says out loud that anonymous play is intended.
 *
 * The Coolify deployment does not use this process — the container runs
 * `vite preview`, which attaches the authenticated socket from
 * `src/lib/game/server/attach.ts`. This is the infra/docker-compose stack,
 * where nginx sits in front and the API is not published directly.
 */
if (process.env.SKI_API_ALLOW_ANONYMOUS !== "1") {
  console.error(
    "[api] refusing to start: this server does not authenticate websockets.\n" +
      "      Set SKI_API_ALLOW_ANONYMOUS=1 only when it is not reachable from\n" +
      "      the internet. For a public deployment use the container's\n" +
      "      `vite preview` server, which verifies the session on upgrade.",
  );
  process.exit(1);
}

const app = Fastify({ logger: true });
await app.register(websocket);

app.get("/health", async () => ({ ok: true }));

app.get("/api/game/snapshot", async (req) => {
  const id = String((req.query as { room?: string }).room ?? "zermatt");
  const r = room(id);
  return { state: r.snapshot(), players: r.presence(), seq: r.seq };
});

app.get("/ws", { websocket: true }, (socket) => {
  let playerId = "";
  let roomId = "zermatt";
  socket.on("message", (raw: Buffer) => {
    const parsed = ClientMessageSchema.safeParse(JSON.parse(raw.toString()));
    if (!parsed.success) {
      socket.send(JSON.stringify({ type: "error", reason: "ungueltig", code: "invalid" }));
      return;
    }
    const msg = parsed.data;
    if (msg.type === "join") {
      const r = room(msg.roomId);
      const p = r.join(msg.name, msg.token);
      playerId = p.id;
      roomId = r.state.roomId;
      socket.send(JSON.stringify({ type: "welcome", playerId: p.id, token: p.token, roomId }));
      socket.send(JSON.stringify({ type: "snapshot", seq: r.seq, state: r.snapshot(), players: r.presence() }));
      return;
    }
    if (msg.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: msg.at }));
      return;
    }
    if (msg.type === "focus") {
      room(roomId).setFocus(playerId, msg.hex);
      return;
    }
    const r = room(roomId);
    const result = r.submit(playerId, msg.intent);
    if (!result.ok) {
      socket.send(JSON.stringify({ type: "error", intentId: msg.id, reason: result.reason, code: result.code }));
      return;
    }
    socket.send(JSON.stringify({ type: "event", title: result.event.title, body: result.event.body, kind: result.event.kind }));
    socket.send(JSON.stringify({ type: "snapshot", seq: r.seq, state: r.snapshot(), players: r.presence() }));
  });
});

setInterval(() => {
  for (const r of rooms.values()) r.tick();
}, 1000);

const port = Number(process.env.API_PORT || process.env.PORT || 8787);
await app.listen({ port, host: "0.0.0.0" });
