import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PISTE_SLOPE, PISTE_GRADES } from "../../../config/src/terrain.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { ITEM_IDS } from "../../../config/src/ids.ts";
import type { Axial, PlacedPiste, ResortState } from "../index.ts";
import { hexToWorld } from "../hex.ts";
import { generateDem } from "../terrain/dem.ts";
import { applyIntent } from "./apply.ts";
import { GameRoom } from "../runtime/room.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { gradeForSlope, measurePiste, pisteCapacity, pisteUpkeep } from "./level.ts";
import { emptyResort, migrateResort } from "./state.ts";
import { pisteCost, surveyPiste, validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;

const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};
const slopeAt = (hex: Axial) => {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.slope(x, z);
};

function rich(): ResortState {
  return { ...emptyResort(), xp: 999_999, coins: 9_000_000 };
}

test("the three difficulty items are gone and one piste remains", () => {
  for (const retired of ["piste-blue", "piste-red", "piste-black"]) {
    assert.equal(
      (ITEM_IDS as readonly string[]).includes(retired),
      false,
      `${retired} is still in the catalogue`,
    );
  }
  assert.ok(BY_ID.piste, "there should be one piste");
  assert.equal(BY_ID.piste.maxSlope, MAX_PISTE_SLOPE);
});

test("grade follows the ground, gentlest band first", () => {
  assert.equal(gradeForSlope(0), "blue");
  assert.equal(gradeForSlope(PISTE_GRADES[0]!.maxSlope), "blue");
  assert.equal(gradeForSlope(PISTE_GRADES[0]!.maxSlope + 0.01), "red");
  assert.equal(gradeForSlope(PISTE_GRADES[1]!.maxSlope), "red");
  assert.equal(gradeForSlope(PISTE_GRADES[1]!.maxSlope + 0.01), "black");
  assert.equal(gradeForSlope(MAX_PISTE_SLOPE), "black");
  // Beyond the last band the ground holds no piste at all.
  assert.equal(gradeForSlope(MAX_PISTE_SLOPE + 0.01), null);
});

test("steeper ground grades harder, carries fewer and costs more", () => {
  const [blue, red, black] = PISTE_GRADES;
  assert.ok(blue!.capacity > red!.capacity);
  assert.ok(red!.capacity > black!.capacity);
  assert.ok(blue!.costFactor < red!.costFactor);
  assert.ok(red!.costFactor < black!.costFactor);
  assert.ok(blue!.upkeepPerSegment < black!.upkeepPerSegment);
});

test("a run takes the grade of its hardest pitch", () => {
  // How real piste maps rate a run: one steep drop makes the whole thing hard.
  const gentle = (_: Axial) => 0.1;
  const oneSteepBit = (hex: Axial) => (hex.r === 5 ? 0.9 : 0.1);
  const all = measurePiste(run(1, 9), gentle, 700)!;
  const mixed = measurePiste(run(1, 9), oneSteepBit, 700)!;
  assert.equal(all.grade, "blue");
  assert.equal(mixed.grade, "black");
  // But the price is per segment, so a mostly-gentle run is not priced as a
  // black from end to end.
  assert.ok(mixed.cost > all.cost);
  assert.ok(mixed.cost < all.cost * PISTE_GRADES[2]!.costFactor);
});

test("ground too steep for any grade cannot be surveyed at all", () => {
  const cliff = () => MAX_PISTE_SLOPE + 1;
  assert.equal(measurePiste(run(1, 9), cliff, 700), null);
});

test("the valley run out of the village grades blue on real terrain", () => {
  const survey = surveyPiste(dem, "piste", run(1, 9))!;
  assert.ok(survey);
  assert.equal(survey.grade, "blue");
  assert.equal(survey.cost, measurePiste(run(1, 9), slopeAt, BY_ID.piste.cost)!.cost);
});

test("the price charged is the price the survey quoted", () => {
  const hexes = run(1, 9);
  const survey = surveyPiste(dem, "piste", hexes)!;
  const before = rich();
  const after = applyIntent(before, { type: "place_piste", itemId: "piste", hexes }, NOW, undefined, dem)
    .state;
  assert.equal(before.coins - after.coins, survey.cost);
  assert.equal(pisteCost(dem, "piste", hexes), survey.cost);
});

test("the built run stores the grade the ground gave it", () => {
  const state = applyIntent(
    rich(),
    { type: "place_piste", itemId: "piste", hexes: run(1, 9) },
    NOW,
    undefined,
    dem,
  ).state;
  assert.equal(state.pistes[0]!.itemId, "piste");
  assert.equal(state.pistes[0]!.difficulty, "blue");
});

test("a room grades what its players build", () => {
  const room = new GameRoom("grade", undefined, dem);
  room.state = { ...room.state, coins: 9_000_000, xp: 999_999 };
  const player = room.join("Michael");
  const result = room.submit(player.id, { type: "place_piste", itemId: "piste", hexes: run(1, 9) });
  assert.equal(result.ok, true);
  assert.equal(room.state.pistes[0]!.difficulty, "blue");
  if (result.ok) assert.match(result.event.body, /Blaue/);
});

test("capacity and upkeep come from the grade, not the item", () => {
  const base: Omit<PlacedPiste, "difficulty"> = {
    id: "p",
    itemId: "piste",
    hexes: run(1, 9),
    builtAt: 0,
    readyAt: 0,
  };
  const blue = { ...base, difficulty: "blue" } as PlacedPiste;
  const black = { ...base, difficulty: "black" } as PlacedPiste;
  assert.ok(pisteCapacity(blue) > pisteCapacity(black));
  assert.ok(pisteUpkeep(blue) < pisteUpkeep(black));
  // Upkeep scales with length, because grooming does.
  const short = { ...blue, hexes: run(7, 9) } as PlacedPiste;
  assert.ok(pisteUpkeep(short) < pisteUpkeep(blue));
});

test("a snowpark keeps its own numbers", () => {
  const park = {
    id: "p",
    itemId: "snowpark",
    difficulty: "park",
    hexes: run(1, 9),
    builtAt: 0,
    readyAt: 0,
  } as PlacedPiste;
  assert.equal(pisteCapacity(park), BY_ID.snowpark.capacity);
});

test("too-steep ground is refused as terrain, not as an affordability problem", () => {
  // Reporting "too expensive" for a run that cannot exist would send the
  // player looking for money instead of for a gentler line.
  const broke = { ...emptyResort(), xp: 999_999, coins: 0 };
  const impossible = validateIntent(
    broke,
    dem,
    { type: "place_piste", itemId: "piste", hexes: [col(1), { q: -16, r: -18 }] },
    "builder",
    NOW,
  );
  assert.equal(impossible.ok, false);
  if (!impossible.ok) assert.notEqual(impossible.code, "budget");
});

test("a run that is possible but unaffordable is refused for the money", () => {
  const broke = { ...emptyResort(), xp: 999_999, coins: 10 };
  const poor = validateIntent(
    broke,
    dem,
    { type: "place_piste", itemId: "piste", hexes: run(1, 9) },
    "builder",
    NOW,
  );
  assert.equal(poor.ok, false);
  if (!poor.ok) assert.equal(poor.code, "budget");
});

test("an old save's blue, red and black runs become graded pistes", () => {
  // Their item ids no longer exist, so `BY_ID[itemId]` would be undefined and
  // take the sim down. The grade the player built is kept as it was.
  const migrated = migrateResort({
    pistes: [
      { id: "a", itemId: "piste-blue", difficulty: "blue", hexes: run(1, 9), builtAt: 0, readyAt: 0 },
      { id: "b", itemId: "piste-red", difficulty: "red", hexes: run(1, 9), builtAt: 0, readyAt: 0 },
      { id: "c", itemId: "piste-black", difficulty: "black", hexes: run(1, 9), builtAt: 0, readyAt: 0 },
      { id: "d", itemId: "road", difficulty: "road", hexes: run(1, 9), builtAt: 0, readyAt: 0 },
    ] as unknown as PlacedPiste[],
  });
  assert.deepEqual(
    migrated.pistes.map((p) => [p.itemId, p.difficulty]),
    [
      ["piste", "blue"],
      ["piste", "red"],
      ["piste", "black"],
      ["road", "road"],
    ],
  );
  // And every one of them resolves to a real catalogue entry again.
  for (const p of migrated.pistes) assert.ok(BY_ID[p.itemId], `${p.itemId} is unknown`);
});
