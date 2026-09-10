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
