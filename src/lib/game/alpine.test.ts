import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getHeightmap,
  scatterRocks,
  scatterTrees,
  surfaceY,
  terrainColor,
  visualRelief,
} from "./alpine.ts";
import { mulberry32, seedFromString } from "./rng.ts";

const hm = getHeightmap();
const SAMPLES: Array<[number, number]> = [
  [0, 0],
  [12, -30],
  [-44, 58],
  [70, 70],
  [-80, -12],
];

test("the surface a prop stands on is the surface that gets drawn", () => {
  // The ground mesh displaces every vertex by visualRelief. Anything placed at
  // the bare DEM height is off by that much — buried or hovering.
  for (const [x, z] of SAMPLES) {
    assert.equal(surfaceY(hm, x, z), hm.worldY(x, z) + visualRelief(x, z));
  }
});

test("decorative relief never moves the height the rules read", () => {
  // The whole point of keeping two heights: worldY is what a descent, a rise
  // and a too-steep hex are judged on, so it must not drift when the look
  // changes. If these ever converge, relief becomes a gameplay input.
  for (const [x, z] of SAMPLES) {
    const delta = surfaceY(hm, x, z) - hm.worldY(x, z);
    assert.ok(Math.abs(delta) <= 0.41, `relief of ${delta} at ${x},${z}`);
  }
});

test("scattered trees and rocks sit on the drawn surface", () => {
  const trees = scatterTrees(hm, 40, mulberry32(seedFromString("t")));
  const rocks = scatterRocks(hm, 40, mulberry32(seedFromString("r")));
  assert.ok(trees.length > 0);
  assert.ok(rocks.length > 0);
  for (const p of [...trees, ...rocks]) {
    assert.equal(p.y, surfaceY(hm, p.x, p.z));
  }
});

test("the snow line the simulation reports is the snow line that is painted", () => {
  // Ground well above the line is snow; well below it is not. Without this the
  // renderer used a fixed 2400 m ramp and a resort with a 1560 m line drew its
  // whole skiable area as summer pasture.
  // Asked per point rather than by absolute colour: shading alone tints steep
  // ground blue, so "is this pixel blueish" cannot tell snow from a shadowed
  // slope. Comparing one point under two snow lines isolates the cover.
  const half = hm.world / 2;
  let tested = 0;
  let whiter = 0;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 37) % 180) - half + 8;
    const z = ((i * 91) % 180) - half + 8;
    if (hm.isWater(x, z)) continue;
    if (hm.slope(x, z) > 0.4) continue; // steep ground sheds snow by design
    const m = hm.sample(x, z);
    const covered = terrainColor(hm, x, z, m - 400); // line below: snow here
    const bare = terrainColor(hm, x, z, m + 400); // line above: no snow here
    tested += 1;
    // Snow may never make ground darker than the same ground without it.
    assert.ok(covered[2] >= bare[2] - 1e-9, `snow darkened ${x},${z}`);
    if (covered[2] - bare[2] > 0.05) whiter += 1;
  }
  assert.ok(tested > 200, `thin sample: ${tested}`);
  assert.ok(whiter / tested > 0.8, `only ${whiter}/${tested} responded to the line`);
});

test("raising the snow line uncovers ground that was white", () => {
  // What a thaw has to look like, and what snowmaking reverses.
  const half = hm.world / 2;
  let changed = 0;
  for (let i = 0; i < 2000; i++) {
    const x = ((i * 53) % 180) - half + 8;
    const z = ((i * 29) % 180) - half + 8;
    if (hm.isWater(x, z)) continue;
    const low = terrainColor(hm, x, z, 1500);
    const high = terrainColor(hm, x, z, 2600);
    if (low[2] - high[2] > 0.05) changed += 1;
  }
  assert.ok(changed > 50, `only ${changed} points responded to the snow line`);
});
