import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { drapedRibbon, joinRun, markerPoles, mergeRibbons, smoothPath, snowPlaza } from "./piste-mesh.ts";

const zigzag = [
  { x: 0, z: 0 },
  { x: 4, z: 3 },
  { x: 0, z: 6 },
  { x: 4, z: 9 },
];

test("a run is smoothed through its hex centres, not cut across them", () => {
  const path = smoothPath(zigzag, 4);
  assert.equal(path.length, (zigzag.length - 1) * 4 + 1);
  // Ends stay put, so the run still starts and stops at its stations.
  assert.ok(Math.hypot(path[0]!.x - 0, path[0]!.z - 0) < 1e-6);
  assert.ok(Math.hypot(path.at(-1)!.x - 4, path.at(-1)!.z - 9) < 1e-6);
});

test("the strip is draped: every vertex sits just above the ground under it", () => {
  // A ridge across the run: the ground rises with x.
  const ground = (x: number) => x * 0.5;
  const geo = drapedRibbon(smoothPath(zigzag, 4), { width: 2, color: new THREE.Color("#2b7de9"), lift: 0.1 }, ground);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const below = ground(pos.getX(i));
    assert.ok(pos.getY(i) >= below + 0.1 - 1e-6, `vertex ${i} above ground`);
    assert.ok(pos.getY(i) <= below + 1.2, `vertex ${i} not floating`);
  }
  assert.ok(geo.attributes.pisteUv && geo.attributes.pisteW && geo.attributes.color);
});

test("a road is flagged so the shader paints asphalt, not snow", () => {
  const geo = drapedRibbon(zigzag, { width: 1.3, color: new THREE.Color("#5a6570"), road: true }, () => 0);
  assert.ok(geo.attributes.pisteW!.getX(0) < 0);
});

test("marker poles stand outside the run, alternating sides, at the spacing asked", () => {
  const straight = [
    { x: 0, z: 0 },
    { x: 0, z: 30 },
  ];
  const poles = markerPoles(straight, 2, new THREE.Color("red"), () => 0, 3);
  assert.equal(poles.length, 10);
  for (const p of poles) assert.ok(Math.abs(p.x) > 1, "outside the edge");
  assert.ok(Math.sign(poles[0]!.x) !== Math.sign(poles[1]!.x), "alternating");
});

test("all runs merge into one geometry, so they cost one draw call", () => {
  const a = drapedRibbon(zigzag, { width: 2, color: new THREE.Color("blue") }, () => 0);
  const b = drapedRibbon(zigzag, { width: 3, color: new THREE.Color("red") }, () => 0);
  const merged = mergeRibbons([a, b])!;
  assert.equal(merged.attributes.position!.count, a.attributes.position!.count + b.attributes.position!.count);
  assert.equal(mergeRibbons([]), null);
});

test("the strip faces the sky, so it is not culled as a back face", () => {
  for (const dir of [
    [{ x: 0, z: 0 }, { x: 0, z: 10 }],
    [{ x: 0, z: 0 }, { x: 10, z: 0 }],
    [{ x: 0, z: 0 }, { x: -7, z: -7 }],
  ]) {
    const geo = drapedRibbon(dir, { width: 2, color: new THREE.Color("blue") }, () => 0);
    const n = geo.attributes.normal!;
    for (let i = 0; i < n.count; i++) assert.ok(n.getY(i) > 0.9, "normal points up");
  }
});

test("a run flowing into another borrows its line below the junction and fades there", () => {
  const main = { hexes: [0, 1, 2, 3, 4, 5].map((r) => ({ q: 0, r })), points: [0, 1, 2, 3, 4, 5].map((r) => ({ x: 0, z: r * 4 })) };
  const side = { hexes: [{ q: 3, r: -2 }, { q: 2, r: 0 }, { q: 1, r: 2 }], points: [{ x: 9, z: -4 }, { x: 6, z: 2 }, { x: 3, z: 8 }] };
  const near = (a: { q: number; r: number }, b: { q: number; r: number }) => Math.abs(a.q - b.q) + Math.abs(a.r - b.r) <= 1;
  const joined = joinRun(side, [main, side], near);
  // Ends next to main's hex 2, so main's points 3 and 4 follow.
  assert.deepEqual(joined.points.slice(-2), [main.points[3], main.points[4]]);
  assert.ok(joined.fadeOut > 0);
  assert.equal(joined.fadeIn, 0);
  const geo = drapedRibbon(smoothPath(joined.points, 4), { width: 2, color: new THREE.Color("#fff"), fadeOut: joined.fadeOut }, () => 0);
  const fade = geo.attributes.pisteFade!;
  assert.equal(fade.getX(fade.count - 1), 0);
  assert.equal(fade.getX(0), 1);
});

test("a plaza is a disc in the run material", () => {
  const geo = snowPlaza(0, 0, 3, () => 0);
  for (const a of ["position", "color", "pisteUv", "pisteW", "pisteFade"]) assert.ok(geo.attributes[a], a);
  assert.equal(geo.attributes.pisteUv!.getX(0), 0.5);
});
