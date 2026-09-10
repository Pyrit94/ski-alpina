import assert from "node:assert/strict";
import { test } from "node:test";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import { generateDem } from "../terrain/dem.ts";
import { GameRoom } from "../runtime/room.ts";
import type { ResortState } from "../types.ts";
import { emptyResort, migrateResort } from "./state.ts";

const dem = generateDem();

test("a snapshot missing newer stats comes back fully populated", () => {
  // How a room saved before a stat existed used to reach the client: the field
  // was undefined and the HUD rendered NaN instead of failing loudly.
  const old = {
    ...emptyResort("zermatt"),
    stats: { peoplePerHour: 12, satisfaction: 80 },
  } as unknown as Partial<ResortState>;
  const migrated = migrateResort(old);
  for (const [key, value] of Object.entries(migrated.stats)) {
    assert.equal(Number.isNaN(value as number), false, `${key} is NaN`);
    assert.notEqual(value, undefined, `${key} is undefined`);
  }
  // What the save did carry is kept.
  assert.equal(migrated.stats.peoplePerHour, 12);
  assert.equal(migrated.stats.satisfaction, 80);
  assert.equal(migrated.stats.upkeepPerHour, 0);
});

test("missing collections become empty rather than undefined", () => {
  const migrated = migrateResort({ coins: 500 });
  assert.deepEqual(migrated.buildings, []);
  assert.deepEqual(migrated.lifts, []);
  assert.deepEqual(migrated.pistes, []);
  assert.deepEqual(migrated.flow, []);
  assert.equal(migrated.coins, 500);
});

test("quest progress survives while a newly added goal appears", () => {
  const first = QUEST_DEFS[0]!;
  const migrated = migrateResort({
    quests: [
      { id: first.id, title: "alt", hint: "alt", xp: 1, coins: 1, gems: 1, progress: 1, target: 1, claimed: true },
    ],
  });
  assert.equal(migrated.quests.length, QUEST_DEFS.length);
  const kept = migrated.quests.find((q) => q.id === first.id)!;
  assert.equal(kept.claimed, true);
  assert.equal(kept.progress, 1);
  // Wording and rewards follow the config, not the stale copy in the save.
  assert.equal(kept.title, first.title);
  assert.equal(kept.coins, first.coins);
});

test("a quest that no longer exists is dropped", () => {
  const migrated = migrateResort({
    quests: [
      { id: "gone", title: "x", hint: "x", xp: 1, coins: 1, gems: 1, progress: 5, target: 5, claimed: false },
    ],
  });
  assert.equal(
    migrated.quests.some((q) => q.id === "gone"),
    false,
  );
});

test("the room migrates whatever it is handed and keeps its own id", () => {
  const room = new GameRoom(
    "alpina",
    { coins: 1234, stats: { satisfaction: 55 } } as unknown as ResortState,
    dem,
  );
  assert.equal(room.state.roomId, "alpina");
  assert.equal(room.state.coins, 1234);
  assert.equal(room.state.stats.demandPerHour, 0);
  // A migrated room must be tickable without producing NaN anywhere.
  room.tick();
  for (const [key, value] of Object.entries(room.state.stats)) {
    if (typeof value === "number") assert.equal(Number.isNaN(value), false, `${key} is NaN`);
  }
  assert.equal(Number.isNaN(room.state.coins), false);
});
