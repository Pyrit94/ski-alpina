import assert from "node:assert/strict";
import { test } from "node:test";
import type { ItemId } from "../../../config/src/ids.ts";
import type { Axial } from "../hex.ts";
import { generateDem } from "../terrain/dem.ts";
import type { PisteDifficulty, PlacedLift, PlacedPiste } from "../types.ts";
import { buildResortGraph, clusterPorts, junctionsOn, pisteUse, VILLAGE_HEX } from "./graph.ts";
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

function mkPiste(id: string, itemId: ItemId, hexes: Axial[], grade?: PisteDifficulty): PlacedPiste {
  return { id, itemId, difficulty: grade ?? pisteDifficulty(itemId), hexes, builtAt: 0, readyAt: 0 };
}

/** The valley column through the village: r descends as the ground rises. */
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
/** Hexes from `top` down to `bottom` along that column. */
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

/** The two-phase solve the sim runs: ski what you can, ride the rest down. */
const solve = (input: Parameters<typeof buildResortGraph>[0]) => {
  const graph = buildResortGraph(input);
  const skied = graph.net.maxFlow(graph.source, graph.sink);
  graph.openDescents();
  const served = skied + graph.net.maxFlow(graph.source, graph.sink);
  return { graph, served, skied };
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
    pistes: [mkPiste("p1", "piste", run(1, 9))],
    ...base,
  });
  assert.equal(served, 500);
  assert.ok(graph.net.flowOn(graph.lifts[0]!.uphill) > 0);
  assert.ok(pisteUse(graph.net, graph.pistes[0]!) > 0);
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

test("guests ski when they can and ride down only for the overflow", () => {
  // Max-flow has no preferences, so without the two-phase solve the order the
  // edges happened to be added decided this — and the gondola always won.
  const { graph, skied, served } = solve({
    lifts: [mkLift("l1", "gondola", col(9), col(1))],
    pistes: [mkPiste("p1", "piste", run(1, 9), "black")],
    demands: [{ hex: VILLAGE_HEX, perHour: 900 }],
    exits: [],
    dem,
  });
  const onPiste = pisteUse(graph.net, graph.pistes[0]!);
  const inCabins = graph.net.flowOn(graph.lifts[0]!.downhill!);
  // The 700-wide run fills first; only the rest takes the cabins back down.
  assert.equal(onPiste, graph.pistes[0]!.capacity);
  assert.equal(skied, graph.pistes[0]!.capacity);
  assert.equal(inCabins, served - skied);
  assert.ok(inCabins > 0);
});

test("a run wide enough for everyone leaves the cabins empty", () => {
  const { graph } = solve({
    lifts: [mkLift("l1", "gondola", col(9), col(1))],
    pistes: [mkPiste("p1", "piste", run(1, 9))],
    ...base,
  });
  assert.equal(graph.net.flowOn(graph.lifts[0]!.downhill!), 0);
  assert.equal(pisteUse(graph.net, graph.pistes[0]!), 500);
});

test("a lift nowhere near an arrival point carries nobody", () => {
  // This is the bug the old even-split sim hid: capacity without a connection.
  const stranded = mkLift("l1", "chair", { q: 30, r: -20 }, { q: 30, r: -28 });
  const { served } = solve({
    lifts: [stranded],
    pistes: [mkPiste("p1", "piste", [{ q: 30, r: -28 }, { q: 30, r: -20 }])],
    ...base,
  });
  assert.equal(served, 0);
});

test("adding stranded lifts does not add throughput", () => {
  const connected = {
    lifts: [mkLift("l1", "tbar", col(9), col(1))],
    pistes: [mkPiste("p1", "piste", run(1, 9))],
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
    pistes: [mkPiste("p1", "piste", run(1, 9), "black")],
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
      mkPiste("p1", "piste", run(1, 9), "black"),
      mkPiste("p2", "piste", run(1, 9), "black"),
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
      mkPiste("p1", "piste", run(1, 9)),
      mkPiste("p2", "piste", run(1, 9)),
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
    pistes: [mkPiste("p1", "piste", run(1, 9))],
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
    pistes: [mkPiste("p1", "piste", run(1, 9))],
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
    pistes: [mkPiste("p1", "piste", run(1, 9))],
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

// --- Joining rules: lift up, run down, done. ---------------------------------

const hex = (q: number, r: number): Axial => ({ q, r });

test("a run ending at any valley station counts, not only the village", () => {
  // A: village up to col(-7). Its run lands at B's valley station, and B's run
  // comes back to B's own valley station — nothing of B reaches the village.
  const layout = {
    lifts: [mkLift("A", "chair", col(9), col(-7)), mkLift("B", "tbar", col(1), col(-3))],
    pistes: [mkPiste("pA", "piste", run(-7, 1)), mkPiste("pB", "piste", run(-3, 1))],
    ...base,
  };
  const { graph, served } = solve(layout);
  assert.ok(served > 0, "guests should ride A and ski down to B");
  // Max-flow ends each guest's day at B's valley station; the laps put them
  // on B, without changing how many were served.
  graph.addLaps(served);
  assert.ok(graph.net.flowOn(graph.lifts[1]!.uphill) > 0, "B carries guests");
  assert.equal(graph.net.flowOn(graph.lifts[0]!.uphill), served);
  assert.deepEqual(
    graph.lifts.map((l) => l.link),
    ["ok", "ok"],
  );
  assert.deepEqual(
    graph.pistes.map((p) => p.link),
    ["ok", "ok"],
  );
});

test("a lift no guest can reach is reported as such, and carries nobody", () => {
  // B alone: its valley station sits 300 m above the village, too far up to
  // walk to, and no run leads there.
  const { graph, served } = solve({
    lifts: [mkLift("B", "tbar", col(1), col(-3))],
    pistes: [mkPiste("pB", "piste", run(-3, 1))],
    ...base,
  });
  assert.equal(served, 0);
  assert.equal(graph.lifts[0]!.link, "no-access");
  assert.equal(graph.pistes[0]!.link, "unreached");
});

test("a valley station near the village needs no road", () => {
  // Three hexes out on the valley floor: beyond the link radius, within reach
  // on foot.
  const { graph, served } = solve({
    lifts: [mkLift("L", "tbar", hex(-2, 6), hex(-8, 6))],
    pistes: [mkPiste("p", "piste", [hex(-8, 6), hex(-7, 6), hex(-6, 6), hex(-5, 6), hex(-4, 6), hex(-3, 6), hex(-2, 6)])],
    ...base,
  });
  assert.equal(graph.lifts[0]!.link, "ok");
  assert.ok(served > 0);
});

test("a lift with nothing down from its top says so", () => {
  const { graph } = solve({ lifts: [mkLift("L", "chair", col(9), col(1))], pistes: [], ...base });
  assert.equal(graph.lifts[0]!.link, "no-descent");
});

test("a run that joins another mid-way is joined, one that ends nowhere is not", () => {
  const top = col(-7);
  const layout = {
    lifts: [mkLift("A", "chair", col(9), top)],
    pistes: [
      mkPiste("main", "piste", run(-7, 9)),
      // Leaves A's top westwards and comes back into the main run at col(1).
      mkPiste("merge", "piste", [top, hex(-7, -5), hex(-7, -3), hex(-6, -1), col(1)]),
      // Leaves A's top and stops on an open slope.
      mkPiste("lost", "piste", [top, hex(-7, -5), hex(-8, -3), hex(-9, 1)]),
    ],
    ...base,
  };
  const { graph } = solve(layout);
  const link = Object.fromEntries(graph.pistes.map((p) => [p.piste.id, p.link]));
  assert.equal(link.main, "ok");
  assert.equal(link.merge, "ok");
  assert.equal(link.lost, "dead-end");
  // The main run is split where the other one joins it.
  assert.equal(graph.pistes[0]!.segments.length, 2);
});

test("guests use a run that only joins another mid-way", () => {
  // B's top has a single way down: into the main run of A, half-way.
  const layout = {
    lifts: [mkLift("A", "chair", col(9), col(-7)), mkLift("B", "tbar", hex(-2, 6), hex(-8, -3))],
    pistes: [
      mkPiste("main", "piste", run(-7, 9)),
      mkPiste("feeder", "piste", [hex(-8, -3), hex(-7, -2), hex(-6, -1), hex(-5, 0), col(1)]),
    ],
    ...base,
  };
  const { graph } = solve(layout);
  graph.addLaps(500);
  assert.equal(graph.lifts[1]!.link, "ok");
  assert.equal(graph.pistes[1]!.link, "ok");
  assert.ok(pisteUse(graph.net, graph.pistes[1]!) > 0, "guests ski the feeder");
});

test("junctions are found mid-run only, never right beside the run's own ends", () => {
  const hexes = run(-7, 9);
  assert.deepEqual(junctionsOn(hexes, [col(1)]), [8]);
  // Beside the top: the top already joins it.
  assert.deepEqual(junctionsOn(hexes, [col(-6)]), []);
  // Too far off to the side.
  assert.deepEqual(junctionsOn(hexes, [hex(VILLAGE_HEX.q + 5, 1)]), []);
});
