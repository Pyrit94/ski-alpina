import assert from "node:assert/strict";
import { test } from "node:test";
import { MATCH } from "../../../config/src/match.ts";
import { generateDem } from "../terrain/dem.ts";
import { GameRoom, PRESENCE_TIMEOUT_MS } from "../runtime/room.ts";
import type { Axial } from "../hex.ts";
import type { ResortState } from "../types.ts";
import { applyIntent } from "./apply.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { PENDING_READY, drawEvent, resolveRound, roundsPerSeason, startMatch, withPreview } from "./match.ts";
import { emptyResort, migrateResort } from "./state.ts";
import { validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 5_000_000;
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

function starter(state: ResortState): ResortState {
  let s = state;
  s = applyIntent(s, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) }, NOW, undefined, dem).state;
  s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes: run(1, 9) }, NOW, undefined, dem).state;
  return withPreview(s, dem);
}

test("a match starts from an empty valley with the preset's money", () => {
  const before = starter(emptyResort());
  const s = startMatch({ ...before, resortName: "Unser Tal" }, "kurz", NOW, dem);
  assert.equal(s.match.mode, "match");
  assert.equal(s.match.round, 1);
  assert.equal(s.match.roundsTotal, roundsPerSeason());
  assert.equal(s.lifts.length, 0);
  assert.equal(s.resortName, "Unser Tal");
  assert.equal(s.coins, MATCH.presets.find((p) => p.id === "kurz")!.startingCoins);
});

test("building in a match waits for the round, but the preview counts it", () => {
  const s = starter(startMatch(emptyResort(), "kurz", NOW, dem));
  assert.equal(s.lifts[0]!.readyAt, PENDING_READY);
  assert.ok(s.stats.peoplePerHour > 0, "the preview should already route guests");
});

test("a round plays out ten days and pays", () => {
  const s = starter(startMatch(emptyResort(), "normal", NOW, dem));
  const after = resolveRound(s, dem, NOW + 1000);
  const report = after.match.history[0]!;
  assert.equal(after.match.round, 2);
  assert.equal(report.dayFrom, 1);
  assert.equal(after.day, 1 + MATCH.daysPerRound);
  assert.ok(report.guests > 0);
  assert.ok(report.net > 0, `a working starter resort should earn, got ${report.net}`);
  assert.equal(report.weather.length, MATCH.daysPerRound);
  assert.ok(after.lifts[0]!.readyAt <= NOW + 1000, "planned builds are finished");
});

test("rounds are deterministic", () => {
  const s = starter(startMatch(emptyResort(), "normal", NOW, dem));
  assert.deepEqual(resolveRound(s, dem, NOW + 1).match.history, resolveRound(s, dem, NOW + 1).match.history);
});

test("the last round ends the match, scores it and enters the hall of fame", () => {
  let s = starter(startMatch(emptyResort(), "kurz", NOW, dem));
  for (let i = 0; i < roundsPerSeason(); i++) s = resolveRound(s, dem, NOW + i);
  assert.equal(s.match.phase, "finished");
  assert.ok(s.match.score > 0);
  assert.equal(s.hallOfFame.length, 1);
  assert.equal(s.hallOfFame[0]!.score, s.match.score);
  assert.notEqual(s.match.goals[0]!.medal, undefined);
  // Nothing more to build once it is over.
  const v = validateIntent(s, dem, { type: "place_building", itemId: "parking", q: -6, r: 10 }, "builder", NOW);
  assert.equal(v.ok, false);
});

test("a car park valley scores worse than a skiable one", () => {
  const play = (setup: (s: ResortState) => ResortState) => {
    let s = setup(startMatch(emptyResort(), "kurz", NOW, dem));
    for (let i = 0; i < roundsPerSeason(); i++) s = resolveRound(s, dem, NOW + i);
    return s.match.score;
  };
  const parking = play((s) => {
    let x = starter(s);
    for (let i = 0; i < 8; i++) {
      x = applyIntent(x, { type: "place_building", itemId: "parking", q: -6, r: 10 }, NOW, undefined, dem).state;
    }
    return x;
  });
  const skiing = play((s) => {
    let x = starter(s);
    for (const dq of [1, -1]) {
      const hexes = run(1, 9).map((h) => ({ q: h.q + dq, r: h.r }));
      x = applyIntent(x, { type: "place_piste", itemId: "piste", hexes }, NOW, undefined, dem).state;
    }
    x = applyIntent(x, { type: "place_building", itemId: "parking", q: -6, r: 10 }, NOW, undefined, dem).state;
    return x;
  });
  assert.ok(skiing > parking, `skiing ${skiing} vs parking ${parking}`);
});

test("a room waits for every online player before playing the round", () => {
  const room = new GameRoom("m", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  const b = room.join("Johanna", undefined, { userId: "u2", name: "Johanna" });
  assert.equal(room.submit(a.id, { type: "start_match", preset: "kurz" }).ok, true);
  room.submit(a.id, { type: "end_round", ready: true });
  assert.equal(room.state.match.round, 1, "one of two is not enough");
  assert.deepEqual(room.state.match.ready, [a.id]);
  room.submit(b.id, { type: "end_round", ready: true });
  assert.equal(room.state.match.round, 2);
  assert.deepEqual(room.state.match.ready, []);
});

test("a partner who is away does not block the round", () => {
  const room = new GameRoom("m", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  room.join("Johanna", undefined, { userId: "u2", name: "Johanna" });
  room.submit(a.id, { type: "start_match", preset: "kurz" });
  room.submit(a.id, { type: "end_round", ready: true });
  assert.equal(room.state.match.round, 1);
  // Johanna closes the tab; Michael keeps pinging.
  const later = Date.now() + PRESENCE_TIMEOUT_MS + 1000;
  room.players.get(a.id)!.lastSeen = later;
  room.prunePlayers(later);
  assert.equal(room.tick(later), true);
  assert.equal(room.state.match.round, 2);
});

test("taking back ready keeps the round open", () => {
  const room = new GameRoom("m", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  room.join("Johanna", undefined, { userId: "u2", name: "Johanna" });
  room.submit(a.id, { type: "start_match", preset: "kurz" });
  room.submit(a.id, { type: "end_round", ready: true });
  room.submit(a.id, { type: "end_round", ready: false });
  assert.deepEqual(room.state.match.ready, []);
});

test("the match clock does not tick in real time", () => {
  const room = new GameRoom("m", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  room.submit(a.id, { type: "start_match", preset: "kurz" });
  const day = room.state.day;
  const time = room.state.timeOfDay;
  room.tick(Date.now() + 5000);
  assert.equal(room.state.day, day);
  assert.equal(room.state.timeOfDay, time);
});

test("an event is drawn the same way for both players and can be decided once", () => {
  const match = { round: 3, startedAt: NOW };
  assert.deepEqual(drawEvent(match, 20), drawEvent(match, 20));
  assert.equal(drawEvent({ round: 1, startedAt: NOW }, 1), null, "round 1 is for building");
  // Find a round with an event and decide it.
  let s = startMatch(emptyResort(), "lang", NOW, dem);
  for (let round = 2; round < 20 && !s.match.event; round++) {
    s = { ...s, match: { ...s.match, round, event: drawEvent({ round, startedAt: NOW }, 10) } };
  }
  assert.ok(s.match.event, "some round should carry an event");
  const ok = validateIntent({ ...s, coins: 1e6 }, dem, { type: "choose_event", option: 0 }, "builder", NOW);
  assert.equal(ok.ok, true);
  const decided = applyIntent({ ...s, coins: 1e6 }, { type: "choose_event", option: 0 }, NOW, { id: "p", name: "P" }, dem).state;
  assert.equal(decided.match.event!.chosen, 0);
  const again = validateIntent(decided, dem, { type: "choose_event", option: 1 }, "builder", NOW);
  assert.equal(again.ok, false);
});

test("lifts start without upgrades, and tapping a station upgrades its lift", () => {
  let s = { ...emptyResort(), xp: 1e6, coins: 1e6 };
  s = applyIntent(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(0) }, 0).state;
  const lift = s.lifts[0]!;
  assert.deepEqual(lift.upgrades, { speed: 0, cabins: 0, capacity: 0 });
  const v = validateIntent(s, dem, { type: "upgrade", entityId: lift.stationA, key: "capacity" }, "builder", NOW);
  assert.equal(v.ok, true);
  s = applyIntent(s, { type: "upgrade", entityId: lift.stationA, key: "capacity" }, NOW).state;
  assert.equal(s.lifts[0]!.upgrades.capacity, 1);
  assert.equal(s.coins, 1e6 - 18500 - 1800);
  // A restaurant has nothing the simulation would read.
  s = applyIntent(s, { type: "place_building", itemId: "restaurant", q: -5, r: 8 }, 0).state;
  const restaurant = s.buildings.find((b) => b.itemId === "restaurant")!;
  assert.equal(
    validateIntent(s, dem, { type: "upgrade", entityId: restaurant.id, key: "speed" }, "builder", NOW).ok,
    false,
  );
});

test("old saves lose the free upgrade step and gain an empty match", () => {
  const old = {
    version: 2,
    lifts: [{ id: "l1", itemId: "tbar", a: VILLAGE_HEX, b: col(1), stationA: "a", stationB: "b", level: 1, builtAt: 0, readyAt: 0, upgrades: { speed: 1, cabins: 2, capacity: 1 } }],
  } as unknown as ResortState;
  const s = migrateResort(old, "x");
  assert.deepEqual(s.lifts[0]!.upgrades, { speed: 0, cabins: 1, capacity: 0 });
  assert.equal(s.match.mode, "sandbox");
  assert.deepEqual(s.hallOfFame, []);
  // Migrating twice must not shift again.
  assert.deepEqual(migrateResort(s, "x").lifts[0]!.upgrades, { speed: 0, cabins: 1, capacity: 0 });
});

test("both players building in a round earns the teamwork bonus", () => {
  const room = new GameRoom("m", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  const b = room.join("Johanna", undefined, { userId: "u2", name: "Johanna" });
  room.submit(a.id, { type: "start_match", preset: "kurz" });
  room.submit(a.id, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) });
  room.submit(b.id, { type: "place_piste", itemId: "piste", hexes: run(1, 9) });
  assert.deepEqual([...room.state.match.roundBuilders].sort(), [a.id, b.id].sort());
  const stars = room.state.stars;
  room.submit(a.id, { type: "end_round", ready: true });
  room.submit(b.id, { type: "end_round", ready: true });
  const report = room.state.match.history[0]!;
  assert.equal(report.teamwork, true);
  assert.equal(room.state.stars, stars + MATCH.teamwork.stars);
  assert.deepEqual(room.state.match.roundBuilders, [], "reset for the next round");
});

test("one player building alone earns no teamwork bonus", () => {
  let s = starter(startMatch(emptyResort(), "kurz", NOW, dem));
  s = { ...s, match: { ...s.match, roundBuilders: ["p1"] } };
  assert.equal(resolveRound(s, dem, NOW + 1).match.history[0]!.teamwork, undefined);
});

test("chat is kept with the resort and bounded", () => {
  const room = new GameRoom("m", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  assert.equal(room.say(a.id, "   "), null);
  const entry = room.say(a.id, "  Schau   mal hier  ");
  assert.equal(entry?.text, "Schau mal hier");
  assert.equal(room.state.chat.at(-1)?.actorName, "Michael");
  for (let i = 0; i < 100; i++) room.say(a.id, `n${i}`);
  assert.ok(room.state.chat.length <= 60);
  // A new match keeps the conversation.
  room.submit(a.id, { type: "start_match", preset: "kurz" });
  assert.ok(room.state.chat.length > 0);
});

test("a map mark shows in presence and expires", () => {
  const room = new GameRoom("m", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  room.setMark(a.id, { q: 1, r: 2 }, "build", Date.now());
  assert.deepEqual(room.presence()[0]!.mark?.hex, { q: 1, r: 2 });
  room.setMark(a.id, { q: 1, r: 2 }, "build", Date.now() - 10 * 60_000);
  assert.equal(room.presence()[0]!.mark, null);
});
