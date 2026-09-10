import assert from "node:assert/strict";
import { test } from "node:test";
import type { Axial, ResortState } from "../index.ts";
import { generateDem } from "../terrain/dem.ts";
import { GameRoom, MAX_REMEMBERED_PLAYERS, PRESENCE_TIMEOUT_MS } from "../runtime/room.ts";
import { applyIntent } from "./apply.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { emptyResort, migrateResort } from "./state.ts";

const dem = generateDem();
const NOW = 1_000_000;

const MICHAEL = { id: "pl_michael", name: "Michael" };
const JIHNNA = { id: "pl_jihnna", name: "Jihnna" };

const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

function rich(): ResortState {
  return { ...emptyResort(), xp: 999_999, coins: 5_000_000 };
}

test("a build records who made it", () => {
  const after = applyIntent(
    rich(),
    { type: "place_building", itemId: "parking", q: -6, r: 9 },
    NOW,
    MICHAEL,
  ).state;
  assert.equal(after.buildings[0]!.builtBy, MICHAEL.id);
});

test("a lift and both its stations carry the same author", () => {
  const after = applyIntent(
    rich(),
    { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) },
    NOW,
    JIHNNA,
  ).state;
  assert.equal(after.lifts[0]!.builtBy, JIHNNA.id);
  for (const station of after.buildings) assert.equal(station.builtBy, JIHNNA.id);
});

test("a run records its author too", () => {
  const after = applyIntent(
    rich(),
    { type: "place_piste", itemId: "piste", hexes: run(1, 9) },
    NOW,
    MICHAEL,
  ).state;
  assert.equal(after.pistes[0]!.builtBy, MICHAEL.id);
});

test("the contributor list counts builds and what they cost", () => {
  let state = rich();
  const before = state.coins;
  state = applyIntent(state, { type: "place_building", itemId: "parking", q: -6, r: 9 }, NOW, MICHAEL).state;
  state = applyIntent(state, { type: "place_building", itemId: "ticket", q: -6, r: 10 }, NOW, MICHAEL).state;
  const mine = state.contributors[MICHAEL.id]!;
  assert.equal(mine.name, "Michael");
  assert.equal(mine.builds, 2);
  assert.equal(mine.coinsSpent, before - state.coins);
});

test("two builders are counted apart", () => {
  let state = rich();
  state = applyIntent(state, { type: "place_building", itemId: "parking", q: -6, r: 9 }, NOW, MICHAEL).state;
  state = applyIntent(state, { type: "place_building", itemId: "ticket", q: -6, r: 10 }, NOW, JIHNNA).state;
  assert.equal(state.contributors[MICHAEL.id]!.builds, 1);
  assert.equal(state.contributors[JIHNNA.id]!.builds, 1);
  assert.equal(Object.keys(state.contributors).length, 2);
});

test("a rename reaches the work already done", () => {
  // `builtBy` holds an id, so the displayed name comes from here — which is
  // what lets an old building show its author's current name.
  let state = applyIntent(rich(), { type: "place_building", itemId: "parking", q: -6, r: 9 }, NOW, MICHAEL).state;
  state = applyIntent(
    state,
    { type: "place_building", itemId: "ticket", q: -6, r: 10 },
    NOW,
    { id: MICHAEL.id, name: "Michi" },
  ).state;
  assert.equal(state.contributors[MICHAEL.id]!.name, "Michi");
  assert.equal(state.buildings[0]!.builtBy, MICHAEL.id);
});

test("demolishing counts separately from building", () => {
  let state = applyIntent(rich(), { type: "place_building", itemId: "parking", q: -6, r: 9 }, NOW, MICHAEL).state;
  const id = state.buildings[0]!.id;
  state = applyIntent(state, { type: "demolish", entityId: id }, NOW, JIHNNA).state;
  assert.equal(state.contributors[MICHAEL.id]!.builds, 1);
  assert.equal(state.contributors[MICHAEL.id]!.demolished, 0);
  assert.equal(state.contributors[JIHNNA.id]!.demolished, 1);
  assert.equal(state.contributors[JIHNNA.id]!.builds, 0);
});

test("a refund is not counted as money spent", () => {
  let state = applyIntent(rich(), { type: "place_building", itemId: "parking", q: -6, r: 9 }, NOW, MICHAEL).state;
  const id = state.buildings[0]!.id;
  const spentBefore = state.contributors[MICHAEL.id]!.coinsSpent;
  state = applyIntent(state, { type: "demolish", entityId: id }, NOW, MICHAEL).state;
  assert.equal(state.contributors[MICHAEL.id]!.coinsSpent, spentBefore);
});

test("the log records what happened, newest first", () => {
  let state = rich();
  state = applyIntent(state, { type: "place_building", itemId: "parking", q: -6, r: 9 }, NOW, MICHAEL).state;
  state = applyIntent(state, { type: "place_building", itemId: "ticket", q: -6, r: 10 }, NOW + 1000, JIHNNA).state;
  assert.equal(state.activity.length, 2);
  assert.equal(state.activity[0]!.actorName, "Jihnna");
  assert.equal(state.activity[1]!.actorName, "Michael");
  assert.ok(state.activity[0]!.at > state.activity[1]!.at);
  assert.equal(state.activity[0]!.actor, JIHNNA.id);
});

test("the log stays bounded rather than growing without limit", () => {
  let state = rich();
  for (let i = 0; i < 60; i++) {
    state = applyIntent(state, { type: "set_ticket_price", chf: 60 + (i % 20) }, NOW + i, MICHAEL).state;
  }
  assert.ok(state.activity.length <= 30, `log grew to ${state.activity.length}`);
});

test("reading the tutorial is not news", () => {
  let state = rich();
  state = applyIntent(state, { type: "next_tutorial" }, NOW, MICHAEL).state;
  state = applyIntent(state, { type: "dismiss_tutorial" }, NOW, MICHAEL).state;
  assert.equal(state.activity.length, 0);
});

test("a solo session still works with nobody named", () => {
  const state = applyIntent(rich(), { type: "place_building", itemId: "parking", q: -6, r: 9 }, NOW).state;
  assert.equal(state.buildings[0]!.builtBy, undefined);
  assert.deepEqual(state.contributors, {});
  assert.equal(state.activity[0]!.actorName, "System");
});

test("an older save gains the new fields rather than undefined", () => {
  const migrated = migrateResort({ coins: 100 });
  assert.deepEqual(migrated.contributors, {});
  assert.deepEqual(migrated.activity, []);
});

test("a room attributes an intent to the player who sent it", () => {
  const room = new GameRoom("coop", undefined, dem);
  room.state = { ...room.state, coins: 5_000_000, xp: 999_999 };
  const player = room.join("Michael");
  const result = room.submit(player.id, { type: "place_building", itemId: "parking", q: -6, r: 9 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.event.actorId, player.id);
    assert.equal(result.event.actorName, "Michael");
  }
  assert.equal(room.state.buildings[0]!.builtBy, player.id);
  assert.equal(room.state.contributors[player.id]!.name, "Michael");
});

test("focus is shared through presence and can be cleared", () => {
  const room = new GameRoom("coop", undefined, dem);
  const player = room.join("Michael");
  assert.equal(room.presence()[0]!.focus, null);
  room.setFocus(player.id, { q: 2, r: -3 });
  assert.deepEqual(room.presence()[0]!.focus, { q: 2, r: -3 });
  room.setFocus(player.id, null);
  assert.equal(room.presence()[0]!.focus, null);
});

test("focus for an unknown player is ignored, not an error", () => {
  const room = new GameRoom("coop", undefined, dem);
  room.setFocus("pl_nobody", { q: 0, r: 0 });
  assert.equal(room.presence().length, 0);
});

test("the same account reconnecting resumes its player", () => {
  // Otherwise every reload added another body to the online list.
  const room = new GameRoom("coop", undefined, dem);
  const first = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  const again = room.join("ignored", "other-token", { userId: "u1", name: "Michael M" });
  assert.equal(again.id, first.id);
  assert.equal(room.presence().length, 1);
  assert.equal(again.name, "Michael M");
});

test("different accounts are different players", () => {
  const room = new GameRoom("coop", undefined, dem);
  room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  room.join("Jihnna", undefined, { userId: "u2", name: "Jihnna" });
  assert.equal(room.presence().length, 2);
});

test("a player who stops answering leaves the presence list", () => {
  const room = new GameRoom("coop", undefined, dem);
  const player = room.join("Michael", "tok-michael-1");
  room.prunePlayers(Date.now() + PRESENCE_TIMEOUT_MS + 1000);
  assert.equal(room.presence().length, 0);
  // A ping keeps them in it.
  const back = room.join("Michael", "tok-michael-1");
  room.touch(back.id);
  room.prunePlayers(Date.now() + PRESENCE_TIMEOUT_MS - 1000);
  assert.equal(room.presence().length, 1);
  assert.equal(back.id, player.id);
});

test("coming back after going quiet is the same person, not a new one", () => {
  // Deleting a quiet player gave the returning one a fresh id, so their own
  // past work stopped being attributed to them and they picked up a second row
  // in the contributor list under the same name.
  const room = new GameRoom("coop", undefined, dem);
  room.state = { ...room.state, coins: 5_000_000, xp: 999_999 };
  const first = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  room.submit(first.id, { type: "place_building", itemId: "parking", q: -6, r: 9 });
  room.prunePlayers(Date.now() + PRESENCE_TIMEOUT_MS + 1000);
  assert.equal(room.presence().length, 0);

  const again = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  assert.equal(again.id, first.id);
  room.submit(again.id, { type: "place_building", itemId: "ticket", q: -6, r: 10 });
  assert.equal(Object.keys(room.state.contributors).length, 1);
  assert.equal(room.state.contributors[first.id]!.builds, 2);
  // And the work they did before still points at them.
  for (const b of room.state.buildings) assert.equal(b.builtBy, first.id);
});

test("an unauthenticated player is remembered by their token", () => {
  const room = new GameRoom("coop", undefined, dem);
  const first = room.join("Gast", "guesttoken1234");
  room.prunePlayers(Date.now() + PRESENCE_TIMEOUT_MS + 1000);
  const again = room.join("Gast", "guesttoken1234");
  assert.equal(again.id, first.id);
});

test("the remembered roster is bounded", () => {
  // Otherwise a long-running server accumulates every guest token it ever saw.
  const room = new GameRoom("coop", undefined, dem);
  for (let i = 0; i < MAX_REMEMBERED_PLAYERS + 20; i++) {
    room.join(`Gast ${i}`, `token-${i}-xxxxxxxx`);
    room.prunePlayers(Date.now() + PRESENCE_TIMEOUT_MS + 1000 + i);
  }
  assert.ok(room.players.size <= MAX_REMEMBERED_PLAYERS);
});

test("someone still online is never forgotten to make room", () => {
  const room = new GameRoom("coop", undefined, dem);
  // A crowd of guests who have all gone quiet.
  for (let i = 0; i < MAX_REMEMBERED_PLAYERS + 20; i++) {
    room.join(`Gast ${i}`, `token-${i}-xxxxxxxx`);
  }
  room.prunePlayers(Date.now() + PRESENCE_TIMEOUT_MS + 1000);
  // Then someone actually arrives, putting the roster over its cap.
  const here = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  room.prunePlayers(Date.now());
  assert.ok(room.players.has(here.id), "the connected player was evicted");
  assert.ok(room.players.size <= MAX_REMEMBERED_PLAYERS);
  assert.equal(room.presence().length, 1);
});
