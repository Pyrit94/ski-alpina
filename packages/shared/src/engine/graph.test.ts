import assert from "node:assert/strict";
import { test } from "node:test";
import type { ItemId } from "../../../config/src/ids.ts";
import type { Axial } from "../hex.ts";
import { generateDem } from "../terrain/dem.ts";
import type { PlacedLift, PlacedPiste } from "../types.ts";
import { buildResortGraph, clusterPorts, VILLAGE_HEX } from "./graph.ts";
import { pisteDifficulty } from "./level.ts";

const dem = generateDem();

/** Level-1 upgrades, matching what applyIntent stamps on a new build. */
const UPGRADES = { speed: 1, cabins: 1, capacity: 1 };

function mkLift(id: string, itemId: ItemId, a: Axial, b: Axial): PlacedLift {
  return {
    id,
    itemId,
    a,
    b,
    stationA: `${id}-a`,
    stationB: `${id}-b`,
    level: 1,
    builtAt: 0,
    readyAt: 0,
    upgrades: { ...UPGRADES },
  };
}

function mkPiste(id: string, itemId: ItemId, hexes: Axial[]): PlacedPiste {
  return { id, itemId, difficulty: pisteDifficulty(itemId), hexes, builtAt: 0, readyAt: 0 };
}

/** The valley column through the village: r descends as the ground rises. */
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
/** Hexes from `top` down to `bottom` along that column. */
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

const solve = (input: Parameters<typeof buildResortGraph>[0]) => {
  const graph = buildResortGraph(input);
  const served = graph.net.maxFlow(graph.source, graph.sink);
  return { graph, served };
};

const base = { demands: [{ hex: VILLAGE_HEX, perHour: 500 }], exits: [], dem };

test("the village is a node even with nothing built", () => {
  const { served, graph } = solve({ lifts: [], pistes: [], ...base });
  assert.equal(served, 0);
  assert.equal(graph.offered, 500);
});

test("a lift out of the village with a piste back down carries guests", () => {
  const { served, graph } = solve({
    lifts: [mkLift("l1", "tbar", col(9), col(1))],
    pistes: [mkPiste("p1", "piste-blue", run(1, 9))],
    ...base,
  });
  assert.equal(served, 500);
  assert.ok(graph.net.flowOn(graph.lifts[0]!.uphill) > 0);
  assert.ok(graph.net.flowOn(graph.pistes[0]!.edge) > 0);
});

test("a T-bar with no way back down carries nobody", () => {
  // A surface lift only goes up: without a run, the circuit does not close.
  const { served, graph } = solve({
    lifts: [mkLift("l1", "tbar", col(9), col(1))],
    pistes: [],
    ...base,
  });
  assert.equal(served, 0);
  assert.equal(graph.net.flowOn(graph.lifts[0]!.uphill), 0);
});

test("a gondola is its own way down, so it works without a piste", () => {
  const { served, graph } = solve({
    lifts: [mkLift("l1", "gondola", col(9), col(1))],
    pistes: [],
    // Above the descent capacity, so the cap is what gets measured.
    demands: [{ hex: VILLAGE_HEX, perHour: 9000 }],
    exits: [],
    dem,
  });
  const down = graph.lifts[0]!.downhill;
  assert.ok(down !== null);
  // The ride up is wider; coming back down is what limits a sightseeing loop.
  assert.equal(served, graph.net.capacityOf(down));
  assert.ok(served < graph.lifts[0]!.capacity);
});

test("a lift nowhere near an arrival point carries nobody", () => {
  // This is the bug the old even-split sim hid: capacity without a connection.
  const stranded = mkLift("l1", "chair", { q: 30, r: -20 }, { q: 30, r: -28 });
  const { served } = solve({
    lifts: [stranded],
    pistes: [mkPiste("p1", "piste-blue", [{ q: 30, r: -28 }, { q: 30, r: -20 }])],
    ...base,
  });
  assert.equal(served, 0);
});

test("adding stranded lifts does not add throughput", () => {
  const connected = {
    lifts: [mkLift("l1", "tbar", col(9), col(1))],
    pistes: [mkPiste("p1", "piste-blue", run(1, 9))],
    ...base,
  };
  const withJunk = {
    ...connected,
    lifts: [
      ...connected.lifts,
      mkLift("l2", "gondola", { q: 28, r: -14 }, { q: 28, r: -22 }),
      mkLift("l3", "gondola", { q: 34, r: -14 }, { q: 34, r: -22 }),
    ],
  };
  assert.equal(solve(withJunk).served, solve(connected).served);
});

test("the narrowest edge of the circuit sets the throughput", () => {
  // 1104 people/h up the T-bar, but only a 700-wide black run back down.
  const { served, graph } = solve({
    lifts: [mkLift("l1", "tbar", col(9), col(1))],
    pistes: [mkPiste("p1", "piste-black", run(1, 9))],
    demands: [{ hex: VILLAGE_HEX, perHour: 5000 }],
    exits: [],
    dem,
  });
  assert.equal(served, graph.pistes[0]!.capacity);
  assert.ok(graph.lifts[0]!.capacity > served);
});

test("two runs down from one lift add their widths, up to the lift", () => {
  const lift = mkLift("l1", "chair", col(9), col(1));
  const { served, graph } = solve({
    lifts: [lift],
    pistes: [
      mkPiste("p1", "piste-black", run(1, 9)),
      mkPiste("p2", "piste-black", run(1, 9)),
    ],
    demands: [{ hex: VILLAGE_HEX, perHour: 5000 }],
    exits: [],
    dem,
  });
  assert.equal(served, graph.pistes[0]!.capacity + graph.pistes[1]!.capacity);
  assert.ok(served < graph.lifts[0]!.capacity);
});

test("throughput is capped by the lift when the runs are wider", () => {
  const { served, graph } = solve({
    lifts: [mkLift("l1", "tbar", col(9), col(1))],
    pistes: [
      mkPiste("p1", "piste-blue", run(1, 9)),
      mkPiste("p2", "piste-blue", run(1, 9)),
    ],
    demands: [{ hex: VILLAGE_HEX, perHour: 9000 }],
    exits: [],
    dem,
  });
  assert.equal(served, graph.lifts[0]!.capacity);
});

test("demand stranded away from the network is never served", () => {
  const { served } = solve({
    lifts: [mkLift("l1", "tbar", col(9), col(1))],
    pistes: [mkPiste("p1", "piste-blue", run(1, 9))],
    // 400 arrive in the village, 600 at a car park on the far ridge.
    demands: [
      { hex: VILLAGE_HEX, perHour: 400 },
      { hex: { q: 40, r: -30 }, perHour: 600 },
    ],
    exits: [{ q: 40, r: -30 }],
    dem,
  });
  assert.equal(served, 400);
});

test("a road brings otherwise stranded demand onto the mountain", () => {
  const carPark: Axial = { q: -5, r: 15 };
  const layout = {
    lifts: [mkLift("l1", "chair", col(9), col(1))],
    pistes: [mkPiste("p1", "piste-blue", run(1, 9))],
    demands: [
      { hex: VILLAGE_HEX, perHour: 100 },
      { hex: carPark, perHour: 600 },
    ],
    exits: [carPark],
    dem,
  };
  // Six hexes from the village is beyond the link radius: no road, no guests.
  assert.equal(solve(layout).served, 100);
  const withRoad = {
    ...layout,
    pistes: [...layout.pistes, mkPiste("r1", "road", [carPark, col(9)])],
  };
  assert.equal(solve(withRoad).served, 700);
});

test("the ski-school bonus widens exactly the blue runs", () => {
  const layout = {
    lifts: [mkLift("l1", "gondola", col(9), col(1))],
    pistes: [mkPiste("p1", "piste-blue", run(1, 9))],
    demands: [{ hex: VILLAGE_HEX, perHour: 9000 }],
    exits: [],
    dem,
  };
  const plain = solve(layout);
  const schooled = solve({ ...layout, pisteCapacityScale: () => 1.08 });
  assert.ok(schooled.graph.pistes[0]!.capacity > plain.graph.pistes[0]!.capacity);
});

test("a lift knows which end is the valley, whichever way it was drawn", () => {
  const up = buildResortGraph({ lifts: [mkLift("l1", "tbar", col(9), col(1))], pistes: [], ...base });
  const down = buildResortGraph({ lifts: [mkLift("l1", "tbar", col(1), col(9))], pistes: [], ...base });
  assert.deepEqual(up.lifts[0]!.base, down.lifts[0]!.base);
  assert.deepEqual(up.lifts[0]!.top, down.lifts[0]!.top);
  assert.ok(up.lifts[0]!.rise > 0);
});

test("ports within the link radius become one node, beyond it stay separate", () => {
  const clusters = clusterPorts([{ q: 0, r: 0 }, { q: 0, r: 2 }, { q: 0, r: 9 }], 2);
  assert.equal(clusters[0], clusters[1]);
  assert.notEqual(clusters[0], clusters[2]);
});

test("clustering renumbers to dense ids usable as node offsets", () => {
  const clusters = clusterPorts([{ q: 0, r: 0 }, { q: 20, r: 0 }, { q: 0, r: 1 }], 2);
  assert.deepEqual([...new Set(clusters)].sort(), [0, 1]);
});
