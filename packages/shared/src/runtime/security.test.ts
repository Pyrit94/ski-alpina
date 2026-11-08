import assert from "node:assert/strict";
import { test } from "node:test";
import { VILLAGE_HEX } from "../engine/graph.ts";
import { emptyResort } from "../engine/state.ts";
import type { ServerMessage } from "../protocol/intents.ts";
import { connect, OPEN_ROOM, RATE, type Binding, type Hub, type Socketish } from "./connection.ts";
import { GameRoom } from "./room.ts";
import { MemorySaveStore, type GameMeta } from "./saves.ts";
import { cleanImport, IMPORT_LIMITS } from "./snapshot.ts";

/**
 * What a review found an attacker could do with one message, pinned so it
 * stays impossible.
 */

function hub(getRoom?: (id: string) => GameRoom) {
  const rooms = new Map<string, GameRoom>();
  const h: Hub = {
    rooms,
    bindings: new Set<Binding>(),
    getRoom:
      getRoom ??
      ((id) => {
        let r = rooms.get(id);
        if (!r) {
          r = new GameRoom(id, emptyResort(id));
          rooms.set(id, r);
        }
        return r;
      }),
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

test("a message that makes the server throw is answered, not fatal", () => {
  const h = hub(() => {
    throw new Error("boom");
  });
  const { s, sent } = socket();
  const conn = connect(h, s, null);
  assert.doesNotThrow(() => conn.onMessage(JSON.stringify({ type: "join", roomId: OPEN_ROOM, name: "Anna" })));
  assert.ok(sent.some((m) => m.type === "error"));
});

test("one socket cannot flood the server", () => {
  const { s, sent } = socket();
  const conn = connect(hub(), s, null);
  for (let i = 0; i < RATE.burst * 3; i++) conn.onMessage(JSON.stringify({ type: "ping", at: i }));
  const pongs = sent.filter((m) => m.type === "pong").length;
  assert.ok(pongs <= RATE.burst + 2, `${pongs} answered`);
  assert.ok(sent.some((m) => m.type === "error" && /Zu viele/.test(m.reason)));
});

test("joining a made-up game id creates nothing", () => {
  const h = hub();
  const { s, sent } = socket();
  const conn = connect(h, s, null);
  conn.onMessage(JSON.stringify({ type: "join", roomId: "made-up-123", name: "Anna" }));
  assert.equal(h.rooms.size, 0);
  assert.ok(sent.some((m) => m.type === "error"));
  conn.onMessage(JSON.stringify({ type: "join", roomId: OPEN_ROOM, name: "Anna" }));
  assert.ok(sent.some((m) => m.type === "welcome"));
});

test("an imported file that would crash the engine is refused", () => {
  // A lift without stations or upgrades made validate throw for everyone.
  assert.equal(cleanImport({ version: 3, lifts: [{ id: "lift_x", itemId: "tbar" }], buildings: [], pistes: [] }).ok, false);
  assert.equal(cleanImport({ lifts: "x", buildings: [], pistes: [] }).ok, false);
  assert.equal(cleanImport(null).ok, false);
  // Unknown items, broken hexes, duplicate ids.
  const b = { id: "b1", itemId: "restaurant", q: 0, r: 0, builtAt: 0, readyAt: 0 };
  assert.equal(cleanImport({ lifts: [], buildings: [{ ...b, itemId: "nuke" }], pistes: [] }).ok, false);
  assert.equal(cleanImport({ lifts: [], buildings: [{ ...b, q: 1.5 }], pistes: [] }).ok, false);
  assert.equal(cleanImport({ lifts: [], buildings: [b, b], pistes: [] }).ok, false);
});

test("an imported file cannot be huge, nor carry absurd numbers or a name that is no text", () => {
  const b = (i: number) => ({ id: `b${i}`, itemId: "restaurant", q: i % 50, r: 0, builtAt: 0, readyAt: 0 });
  const many = Array.from({ length: IMPORT_LIMITS.buildings + 1 }, (_, i) => b(i));
  assert.equal(cleanImport({ lifts: [], buildings: many, pistes: [] }).ok, false);
  const odd = cleanImport({ lifts: [], buildings: [], pistes: [], coins: 1e300, gems: -5, resortName: { x: 1 } });
  assert.equal(odd.ok, false, "a name that is not text is refused");
  const rich = cleanImport({ lifts: [], buildings: [], pistes: [], coins: 1e300, gems: -5, resortName: "  Mein Tal  " });
  assert.ok(rich.ok);
  if (rich.ok) {
    assert.equal(rich.state.coins, IMPORT_LIMITS.coins);
    assert.equal(rich.state.gems, 0);
    assert.equal(rich.state.resortName, "Mein Tal");
  }
  const proto = cleanImport(JSON.parse('{"lifts":[],"buildings":[],"pistes":[],"__proto__":{"polluted":1}}'));
  assert.ok(proto.ok);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("a real exported resort comes back as it was", () => {
  const room = new GameRoom("x", emptyResort("x"));
  const me = room.join("Michael", "tok_michael_1");
  room.submit(me.id, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: { q: VILLAGE_HEX.q, r: 1 } });
  const file = JSON.parse(JSON.stringify(room.state));
  const back = cleanImport(file);
  assert.ok(back.ok, back.ok ? "" : back.reason);
  if (back.ok) {
    assert.equal(back.state.lifts!.length, room.state.lifts.length);
    assert.equal(back.state.buildings!.length, room.state.buildings.length);
    assert.equal(back.state.coins, room.state.coins);
  }
});
