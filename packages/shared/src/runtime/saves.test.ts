import assert from "node:assert/strict";
import { test } from "node:test";
import { VILLAGE_HEX } from "../engine/graph.ts";
import { ClientMessageSchema, type ServerMessage } from "../protocol/intents.ts";
import { GameRoom } from "./room.ts";
import { emptyResort } from "../engine/state.ts";
import { getDem, loadRegion } from "../terrain/dem.ts";
import {
  canSee,
  defaultSaveName,
  handleLobby,
  MemorySaveStore,
  type GameInfo,
  type GameMeta,
  type LobbyContext,
  type LobbyMessage,
} from "./saves.ts";

/** A small server: rooms, a save store, and what one socket was sent. */
function server() {
  const rooms = new Map<string, GameRoom>();
  const store = new MemorySaveStore();
  const broadcasts: { roomId: string; msg: ServerMessage }[] = [];
  const ctx = (userId: string | null, boundRoomId: string | null = null) => {
    const sent: ServerMessage[] = [];
    const c: LobbyContext = {
      store,
      rooms,
      createRoom: (id: string, meta: GameMeta, region: string) => {
        const room = new GameRoom(id, emptyResort(id, region));
        room.meta = meta;
        rooms.set(id, room);
        return room;
      },
      userId,
      userName: userId ?? "Gast",
      boundRoomId,
      send: (m) => sent.push(m),
      broadcast: (roomId, msg) => broadcasts.push({ roomId, msg }),
      publish: (r) => broadcasts.push({ roomId: r.state.roomId, msg: { type: "snapshot", seq: r.seq, state: r.snapshot(), players: r.presence() } }),
    };
    return { c, sent };
  };
  const ask = async (userId: string | null, msg: LobbyMessage, bound: string | null = null) => {
    const { c, sent } = ctx(userId, bound);
    await handleLobby(msg, c);
    const games = sent.filter((m) => m.type === "games").at(-1);
    return { sent, games: (games && games.type === "games" ? games.games : []) as GameInfo[] };
  };
  return { rooms, store, broadcasts, ask };
}

const build = (room: GameRoom, playerId: string) =>
  room.submit(playerId, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: { q: VILLAGE_HEX.q, r: 1 } });

test("a shared game is listed for everyone, an own game only for its owner", async () => {
  const s = server();
  const created = await s.ask("michael", { type: "create_game", kind: "own", name: "Mein Gebiet" });
  assert.ok(created.sent.some((m) => m.type === "created"));
  await s.ask("johanna", { type: "create_game", kind: "shared", name: "Wochenende" });
  const michael = (await s.ask("michael", { type: "list_games" })).games;
  const johanna = (await s.ask("johanna", { type: "list_games" })).games;
  assert.deepEqual(michael.map((g) => g.name).sort(), ["Mein Gebiet", "Wochenende"]);
  assert.deepEqual(johanna.map((g) => g.name), ["Wochenende"]);
  assert.equal(michael.find((g) => g.name === "Mein Gebiet")!.mine, true);
});

test("as many saves as you like, each a frozen copy of that moment", async () => {
  const s = server();
  await s.ask("michael", { type: "create_game", kind: "shared", name: "Wochenende" });
  const room = [...s.rooms.values()][0]!;
  const me = room.join("Michael", "tok_michael_1");
  for (let i = 0; i < 5; i++) await s.ask("michael", { type: "save_game", name: `Stand ${i}` }, room.state.roomId);
  build(room, me.id);
  const { games } = await s.ask("michael", { type: "save_game", name: "Mit Lift" }, room.state.roomId);
  const saves = games[0]!.saves;
  assert.equal(saves.length, 6);
  assert.equal(saves.find((x) => x.name === "Mit Lift")!.summary.lifts, 1);
  assert.equal(saves.find((x) => x.name === "Stand 0")!.summary.lifts, 0);
});

test("loading a save puts it back, after saving what it replaces", async () => {
  const s = server();
  await s.ask("michael", { type: "create_game", kind: "shared", name: "Wochenende" });
  const room = [...s.rooms.values()][0]!;
  const me = room.join("Michael", "tok_michael_1");
  const before = await s.ask("michael", { type: "save_game", name: "Samstagabend" }, room.state.roomId);
  build(room, me.id);
  assert.equal(room.state.lifts.length, 1);
  const saveId = before.games[0]!.saves[0]!.id;
  // Chosen on the start screen, before joining.
  const after = await s.ask("johanna", { type: "load_save", saveId });
  assert.equal(room.state.lifts.length, 0, "the Saturday state is back");
  assert.equal(room.state.roomId, before.games[0]!.id, "still the same game");
  const names = after.games[0]!.saves.map((x) => x.name);
  assert.ok(names.some((n) => n.startsWith("Automatisch vor")), "the replaced state was saved");
  const auto = after.games[0]!.saves.find((x) => x.name.startsWith("Automatisch"))!;
  assert.equal(auto.summary.lifts, 1);
  // Everyone in the game sees the loaded state at once.
  assert.ok(s.broadcasts.some((b) => b.roomId === room.state.roomId && b.msg.type === "snapshot"));
});

test("nobody can save, load or delete someone else's own game", async () => {
  const s = server();
  await s.ask("michael", { type: "create_game", kind: "own", name: "Privat" });
  const room = [...s.rooms.values()][0]!;
  const saved = await s.ask("michael", { type: "save_game", gameId: room.state.roomId });
  const saveId = saved.games[0]!.saves[0]!.id;
  for (const msg of [
    { type: "save_game", gameId: room.state.roomId },
    { type: "load_save", saveId },
    { type: "delete_save", saveId },
  ] as LobbyMessage[]) {
    const { sent } = await s.ask("johanna", msg);
    assert.ok(sent.some((m) => m.type === "error"), `${msg.type} refused`);
  }
  assert.equal((await s.store.list([room.state.roomId])).length, 1);
});

test("deleting a save removes only that one", async () => {
  const s = server();
  await s.ask("m", { type: "create_game", kind: "shared" });
  const id = [...s.rooms.keys()][0]!;
  await s.ask("m", { type: "save_game", gameId: id, name: "A" });
  const two = await s.ask("m", { type: "save_game", gameId: id, name: "B" });
  const a = two.games[0]!.saves.find((x) => x.name === "A")!;
  const left = await s.ask("m", { type: "delete_save", saveId: a.id });
  assert.deepEqual(left.games[0]!.saves.map((x) => x.name), ["B"]);
});

test("an unnamed save gets the Swiss date and time", async () => {
  assert.equal(defaultSaveName(Date.UTC(2026, 10, 7, 20, 30)), "Sa 7.11. 21:30");
});

test("visibility rules", () => {
  assert.ok(canSee({ kind: "shared", owner: null }, null));
  assert.ok(canSee({ kind: "own", owner: null }, "x"), "an old own game with no owner stays visible");
  assert.ok(canSee({ kind: "own", owner: "a" }, "a"));
  assert.ok(!canSee({ kind: "own", owner: "a" }, "b"));
  assert.ok(!canSee({ kind: "own", owner: "a" }, null));
});

test("a new game is built on the region chosen for it", async () => {
  await loadRegion("flims-laax");
  const s = server();
  const { games } = await s.ask("m", { type: "create_game", kind: "shared", region: "flims-laax" });
  assert.equal(games[0]!.region, "flims-laax");
  assert.equal(games[0]!.name, "Flims Laax");
  const room = [...s.rooms.values()][0]!;
  assert.equal(room.dem.region.id, "flims-laax");
  assert.equal(room.dem, getDem("flims-laax"));
  // Unknown maps fall back to the classic valley instead of failing.
  const odd = await s.ask("m", { type: "create_game", kind: "own", region: "atlantis" });
  assert.ok(odd.games.some((g) => g.region === "classic"));
});

test("an exported resort comes back as a new game, on its own map", async () => {
  const s = server();
  await s.ask("michael", { type: "create_game", kind: "shared", name: "Original" });
  const original = [...s.rooms.values()][0]!;
  build(original, "p1");
  const exported = JSON.parse(JSON.stringify(original.snapshot()));
  const { sent, games } = await s.ask("michael", { type: "import_game", kind: "own", name: "Kopie", snapshot: exported });
  assert.ok(sent.some((m) => m.type === "created"));
  const copy = games.find((g) => g.name === "Kopie");
  assert.ok(copy);
  assert.equal(s.rooms.get(copy.id)!.state.lifts.length, original.state.lifts.length);
  // Something that is not a resort is refused.
  const bad = await s.ask("michael", { type: "import_game", kind: "own", snapshot: { hello: 1 } });
  assert.ok(bad.sent.some((m) => m.type === "error"));
});

test("a new game has neighbour ski areas unless they are switched off", async () => {
  const s = server();
  await s.ask("michael", { type: "create_game", kind: "own", name: "Mit Nachbarn" });
  await s.ask("michael", { type: "create_game", kind: "own", name: "Allein im Tal", neighbours: "off" });
  const rooms = [...s.rooms.values()];
  const withN = rooms.find((r) => r.state.resortName === "Mit Nachbarn")!;
  const without = rooms.find((r) => r.state.resortName === "Allein im Tal")!;
  assert.equal(withN.state.neighbours?.mode, "gemuetlich");
  assert.ok((withN.state.neighbours?.list.length ?? 0) > 0);
  assert.equal(without.state.neighbours?.mode, "off");
  assert.equal(without.state.neighbours?.list.length ?? 0, 0);
});

test("only the owner can share an own game, and then everyone sees it", async () => {
  const s = server();
  await s.ask("michael", { type: "create_game", kind: "own", name: "Privat" });
  const id = [...s.rooms.keys()][0]!;
  // Someone else: refused, and nothing changes.
  const other = await s.ask("johanna", { type: "share_game", gameId: id });
  const refusal = other.sent.find((m) => m.type === "error");
  assert.ok(refusal && refusal.type === "error" && refusal.code === "rights");
  assert.equal(s.rooms.get(id)!.meta.kind, "own");
  assert.equal((await s.ask("johanna", { type: "list_games" })).games.length, 0);
  // Without an account at all: refused too.
  assert.ok((await s.ask(null, { type: "share_game", gameId: id })).sent.some((m) => m.type === "error"));
  // The owner: shared, the owner kept, and now on the other's list.
  const mine = await s.ask("michael", { type: "share_game", gameId: id });
  assert.ok(!mine.sent.some((m) => m.type === "error"));
  assert.deepEqual(s.rooms.get(id)!.meta, { kind: "shared", owner: "michael" });
  assert.deepEqual((await s.ask("johanna", { type: "list_games" })).games.map((g) => g.id), [id]);
  assert.ok(s.broadcasts.some((b) => b.roomId === id && b.msg.type === "event" && b.msg.title === "Spiel freigegeben"));
  // Sharing a shared game again is harmless; a missing one is an error.
  assert.ok(!(await s.ask("johanna", { type: "share_game", gameId: id })).sent.some((m) => m.type === "error"));
  assert.ok((await s.ask("michael", { type: "share_game", gameId: "g_nope" })).sent.some((m) => m.type === "error"));
});

test("share_game is validated: the game id must look like one", () => {
  assert.ok(ClientMessageSchema.safeParse({ type: "share_game", gameId: "own_abc123" }).success);
  assert.ok(!ClientMessageSchema.safeParse({ type: "share_game", gameId: "../etc" }).success);
  assert.ok(!ClientMessageSchema.safeParse({ type: "share_game" }).success);
  assert.ok(!ClientMessageSchema.safeParse({ type: "share_game", gameId: "x".repeat(41) }).success);
});
