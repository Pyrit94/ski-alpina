import assert from "node:assert/strict";
import { test } from "node:test";
import { VILLAGE_HEX } from "../engine/graph.ts";
import { emptyResort } from "../engine/state.ts";
import { ClientMessageSchema, ServerMessageSchema, type ServerMessage } from "../protocol/intents.ts";
import type { ResortState } from "../types.ts";
import { connect, OPEN_ROOM, streamOf, type Binding, type Hub, type Socketish } from "./connection.ts";
import { GameRoom } from "./room.ts";
import { MemorySaveStore, type GameMeta } from "./saves.ts";
import { applyPatch, FULL_EVERY, newStream, nextUpdate, RESYNC_WAIT_MS, StreamReceiver } from "./stream.ts";

/** Through the wire and back, as a browser would hold it. */
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Update = Extract<ServerMessage, { type: "snapshot" | "patch" }>;
const asUpdate = (m: ServerMessage): Update => {
  assert.ok(m.type === "snapshot" || m.type === "patch", `expected an update, got ${m.type}`);
  return m;
};

function hub() {
  const rooms = new Map<string, GameRoom>();
  const h: Hub = {
    rooms,
    bindings: new Set<Binding>(),
    getRoom: (id) => {
      let r = rooms.get(id);
      if (!r) {
        r = new GameRoom(id, emptyResort(id));
        rooms.set(id, r);
      }
      return r;
    },
    createRoom: (id: string, meta: GameMeta, region: string) => {
      const r = new GameRoom(id, emptyResort(id, region));
      r.meta = meta;
      rooms.set(id, r);
      return r;
    },
    store: new MemorySaveStore(),
    log: () => {},
  };
  return h;
}

function socket() {
  const sent: ServerMessage[] = [];
  const s: Socketish = { send: (d) => sent.push(JSON.parse(d) as ServerMessage) };
  return { s, sent };
}

const lift = { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: { q: VILLAGE_HEX.q, r: 1 } } as const;

test("a patch carries exactly the fields that changed", () => {
  const room = new GameRoom("r1", emptyResort("r1"));
  const me = room.join("Anna", "tok_anna_123");
  const stream = newStream();
  const first = nextUpdate(stream, room.snapshot(), room.presence());
  assert.equal(first.type, "snapshot", "the first update is the whole state");

  // Nothing happened: an empty patch.
  const idle = nextUpdate(stream, room.snapshot(), room.presence());
  assert.equal(idle.type, "patch");
  assert.deepEqual(idle.type === "patch" && Object.keys(idle.fields), []);

  // A lift: the lifts and whatever the build touched, never the untouched rest.
  const before = wire(room.snapshot()) as unknown as Record<string, unknown>;
  assert.ok(room.submit(me.id, lift).ok);
  const after = wire(room.snapshot()) as unknown as Record<string, unknown>;
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]));
  const patch = nextUpdate(stream, room.snapshot(), room.presence());
  assert.equal(patch.type, "patch");
  if (patch.type !== "patch") return;
  assert.deepEqual(Object.keys(patch.fields).sort(), changed.sort());
  assert.ok("lifts" in patch.fields);
  assert.ok(!("pistes" in patch.fields), "unchanged fields stay out");
  assert.equal(patch.seq, 3);
  assert.ok(ServerMessageSchema.safeParse(wire(patch)).success, "the patch fits its schema");
});

test("a field that disappears is listed as removed", () => {
  const state = emptyResort("r2");
  const stream = newStream();
  nextUpdate(stream, { ...state, proposalLimit: 5 } as ResortState, []);
  const patch = nextUpdate(stream, { ...state, proposalLimit: undefined } as ResortState, []);
  assert.ok(patch.type === "patch");
  assert.deepEqual(patch.removed, ["proposalLimit"]);
  const merged = applyPatch({ ...state, proposalLimit: 5 } as ResortState, patch.fields, patch.removed);
  assert.ok(!("proposalLimit" in merged));
});

test("patches merged on the client give the same state as a full snapshot", () => {
  const room = new GameRoom("r3", emptyResort("r3"));
  const me = room.join("Anna", "tok_anna_123");
  const stream = newStream();
  const client = new StreamReceiver();
  let now = Date.now();
  const deliver = () => {
    const r = client.receive(asUpdate(wire(nextUpdate(stream, room.snapshot(), room.presence()))));
    assert.ok(r && r !== "resync");
    return r.state;
  };
  deliver();
  for (let i = 0; i < 12; i++) {
    now += 1000;
    room.tick(now);
    if (i === 3) assert.ok(room.submit(me.id, lift).ok);
    if (i === 6) room.say(me.id, "Hoi zäme");
    const held = deliver();
    assert.deepEqual(held, wire(room.snapshot()), `after update ${i + 2}`);
  }
});

test("a missed patch makes the client ask for a snapshot, once, until it comes", () => {
  const room = new GameRoom("r4", emptyResort("r4"));
  room.join("Anna", "tok_anna_123");
  const stream = newStream();
  const client = new StreamReceiver();
  const next = () => asUpdate(wire(nextUpdate(stream, room.snapshot(), room.presence())));
  assert.ok(client.receive(next(), 0));
  room.tick(Date.now() + 1000);
  next(); // lost on the way
  const t = 10_000;
  assert.equal(client.receive(next(), t), "resync");
  assert.equal(client.receive(next(), t + 100), null, "no second ask while waiting");
  assert.equal(client.receive(next(), t + RESYNC_WAIT_MS + 1), "resync", "asks again if nothing came");
  const full = asUpdate(wire({ type: "snapshot", seq: stream.seq, state: room.snapshot(), players: room.presence() } as ServerMessage));
  assert.ok(client.receive(full, t + RESYNC_WAIT_MS + 2));
  const resumed = client.receive(next(), t + RESYNC_WAIT_MS + 3);
  assert.ok(resumed && resumed !== "resync", "back on the stream");
  assert.deepEqual(resumed.state, wire(room.snapshot()));
});

test("every so often the whole state goes out anyway", () => {
  const room = new GameRoom("r5", emptyResort("r5"));
  room.join("Anna", "tok_anna_123");
  const stream = newStream();
  const kinds: string[] = [];
  for (let i = 0; i < FULL_EVERY * 2 + 3; i++) kinds.push(nextUpdate(stream, room.snapshot(), room.presence()).type);
  assert.equal(kinds[0], "snapshot");
  assert.equal(kinds[FULL_EVERY + 1], "snapshot");
  assert.equal(kinds[FULL_EVERY * 2 + 2], "snapshot");
  assert.equal(kinds.filter((k) => k === "snapshot").length, 3);
  // A forced one (a save loaded) restarts the count.
  assert.equal(nextUpdate(stream, room.snapshot(), room.presence(), { full: true }).type, "snapshot");
  assert.equal(nextUpdate(stream, room.snapshot(), room.presence()).type, "patch");
});

test("over a socket: a joiner gets a snapshot, the others a patch, and builds arrive as patches", () => {
  const h = hub();
  const a = socket();
  const b = socket();
  const ca = connect(h, a.s, null);
  const cb = connect(h, b.s, null);
  ca.onMessage(JSON.stringify({ type: "join", roomId: OPEN_ROOM, name: "Anna", token: "tok_anna_123" }));
  assert.deepEqual(a.sent.map((m) => m.type), ["welcome", "snapshot"]);
  a.sent.length = 0;
  cb.onMessage(JSON.stringify({ type: "join", roomId: OPEN_ROOM, name: "Beat", token: "tok_beat_123" }));
  assert.deepEqual(b.sent.map((m) => m.type), ["welcome", "snapshot"], "the joiner: the whole state");
  assert.deepEqual(a.sent.map((m) => m.type), ["patch"], "the one already there: who arrived");
  const ra = new StreamReceiver();
  const rb = new StreamReceiver();
  // Anna's receiver catches up from a snapshot of her own.
  const room = h.rooms.get(OPEN_ROOM)!;
  ra.receive({ type: "snapshot", seq: streamOf(room).seq, state: wire(room.snapshot()), players: [] });
  rb.receive(asUpdate(b.sent[1]!));
  a.sent.length = 0;
  b.sent.length = 0;

  ca.onMessage(JSON.stringify({ type: "intent", id: "i1", intent: lift }));
  const patch = b.sent.find((m) => m.type === "patch");
  assert.ok(patch && patch.type === "patch" && "lifts" in patch.fields, "Beat sees Anna's lift");
  for (const [r, sent] of [
    [ra, a.sent],
    [rb, b.sent],
  ] as const) {
    const got = r.receive(asUpdate(sent.find((m) => m.type === "patch")!));
    assert.ok(got && got !== "resync");
    assert.deepEqual(got.state, wire(room.snapshot()));
  }
});

test("over a socket: asking for a resync brings the whole state, not too often", () => {
  const h = hub();
  const a = socket();
  const ca = connect(h, a.s, null);
  ca.onMessage(JSON.stringify({ type: "resync" }));
  assert.equal(a.sent.length, 0, "nothing before joining");
  ca.onMessage(JSON.stringify({ type: "join", roomId: OPEN_ROOM, name: "Anna", token: "tok_anna_123" }));
  a.sent.length = 0;
  ca.onMessage(JSON.stringify({ type: "resync" }));
  assert.deepEqual(a.sent.map((m) => m.type), ["snapshot"]);
  ca.onMessage(JSON.stringify({ type: "resync" }));
  assert.equal(a.sent.length, 1, "a second ask right away is ignored");
  assert.ok(ClientMessageSchema.safeParse({ type: "resync" }).success);
});
