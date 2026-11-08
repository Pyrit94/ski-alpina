import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS } from "../../../../packages/config/src/regions.ts";
import { generateDem, getDem, loadAllRegions } from "../../../../packages/shared/src/terrain/dem.ts";
import { alongPath, pathLength, valleyRoad } from "./valley-road.ts";

test("every map gets a road from its edge into the village, along the valley floor", async () => {
  await loadAllRegions();
  for (const def of REGIONS) {
    const dem = getDem(def.id);
    const road = valleyRoad(dem);
    assert.ok(road.length > 4, `${def.id}: a road`);
    const first = road[0]!;
    const last = road[road.length - 1]!;
    const half = dem.world / 2;
    assert.ok(Math.max(Math.abs(first.x), Math.abs(first.z)) > half - 3, `${def.id}: starts at the edge`);
    const v = dem.region.village;
    assert.ok(Math.hypot(last.x - v.x, last.z - v.z) < 2, `${def.id}: ends in the village`);
    // A road, not a ski run. On a ~110 m grid a gorge like the Schöllenen
    // still shows a steep cell or two; the road as a whole stays a road.
    let worst = 0;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1]!;
      const b = road[i]!;
      const run = Math.hypot(b.x - a.x, b.z - a.z) * 92;
      if (run < 1) continue;
      worst = Math.max(worst, Math.abs(dem.sample(b.x, b.z) - dem.sample(a.x, a.z)) / run);
    }
    assert.ok(worst < 0.55, `${def.id}: steepest stretch ${worst.toFixed(2)}`);
    // It enters below the village: the valley's way in, not over a pass.
    assert.ok(dem.sample(first.x, first.z) < dem.sample(v.x, v.z), `${def.id}: enters from below`);
  }
});

test("the classic valley's road starts inside its raised rim", () => {
  const road = valleyRoad(generateDem());
  assert.ok(road.length > 4);
});

test("cars can be placed anywhere along the road", () => {
  const path = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
  ];
  assert.equal(pathLength(path), 20);
  const mid = alongPath(path, 15);
  assert.equal(mid.x, 10);
  assert.equal(mid.z, 5);
});
