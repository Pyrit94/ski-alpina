import assert from "node:assert/strict";
import { test } from "node:test";
import { atmosphereAt, createAtmosphere } from "./atmosphere.ts";
import { keepIfSame } from "./stable.ts";
import { bakeOcclusion, groundAlbedo } from "./terrain-shading.ts";

const warmth = (c: readonly number[]) => c[0]! - c[2]!;

test("the sun is warm in the morning, neutral at noon, golden in the evening", () => {
  const morning = atmosphereAt(0.3);
  const noon = { ...atmosphereAt(0.5) };
  const evening = atmosphereAt(0.7);
  assert.ok(warmth(morning.sunColor) > warmth(noon.sunColor), "morning warmer than noon");
  assert.ok(warmth(evening.sunColor) > warmth(noon.sunColor), "evening warmer than noon");
  assert.ok(noon.sunDir[1] > atmosphereAt(0.3).sunDir[1], "noon sun is highest");
});

test("the sun rises in the east, sets in the west, and stays on the viewer's side", () => {
  // +x is east and the opening camera looks toward -z, so a sun with z >= 0
  // lights the faces the player sees.
  const rise = [...atmosphereAt(0.27).sunDir];
  const set = [...atmosphereAt(0.73).sunDir];
  assert.ok(rise[0]! > 0, "morning sun in the east");
  assert.ok(set[0]! < 0, "evening sun in the west");
  for (let t = 0.24; t <= 0.76; t += 0.02) {
    const d = atmosphereAt(t).sunDir;
    assert.ok(d[1] > 0.05, `sun above the horizon at ${t.toFixed(2)}`);
    assert.ok(d[2] > -0.1, `sun behind the viewer at ${t.toFixed(2)}`);
    assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-6, "unit vector");
  }
});

test("night is dim but playable, and the clock wraps", () => {
  const night = atmosphereAt(0.02);
  assert.equal(night.night, 1);
  assert.ok(night.sunIntensity > 0.1 && night.sunIntensity < 0.5);
  assert.deepEqual([...atmosphereAt(1.02).sunColor], [...atmosphereAt(0.02).sunColor]);
});

test("the light changes smoothly through the day", () => {
  // A 90-second day is watched continuously: no frame-to-frame jumps.
  const a = createAtmosphere();
  const b = createAtmosphere();
  for (let t = 0; t < 1; t += 0.001) {
    atmosphereAt(t, a);
    atmosphereAt(t + 0.001, b);
    const jump = Math.hypot(a.sunDir[0] - b.sunDir[0], a.sunDir[1] - b.sunDir[1], a.sunDir[2] - b.sunDir[2]);
    assert.ok(jump < 0.05, `sun direction jump at ${t.toFixed(3)}`);
    assert.ok(Math.abs(a.sunIntensity - b.sunIntensity) < 0.05, `intensity jump at ${t.toFixed(3)}`);
  }
});

test("snow covers what lies above the snow line, rock shows on steep faces", () => {
  const snow = groundAlbedo(2800, 0.2, 1500, 99, false);
  const below = groundAlbedo(1600, 0.2, 2500, 99, false);
  const face = groundAlbedo(3800, 1.6, 1500, 99, false);
  assert.ok(snow[0] > 0.7 && snow[2] >= snow[0], "snow is bright and not warm");
  assert.ok(below[1] < 0.4, "pasture below the snow line");
  assert.ok(face[0] < 0.2, "steep high faces are rock");
  assert.ok(face[0] > face[2], "rock is warm grey-brown");
});

test("gullies are darker than ridges in the occlusion bake", () => {
  // A V-shaped valley along z: low in the middle column, rising either side.
  const n = 21;
  const elev = new Float32Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) elev[z * n + x] = 2000 + Math.abs(x - 10) * 60;
  const ao = bakeOcclusion(elev, n, 100);
  const floor = ao[10 * n + 10]!;
  const flank = ao[10 * n + 4]!;
  assert.ok(floor < 0.9, `valley floor occluded (${floor.toFixed(2)})`);
  assert.ok(flank > floor, "open flank sees more sky than the floor");
  // An inverted V: a ridge brightens, but only a little.
  for (let i = 0; i < elev.length; i++) elev[i] = 4000 - elev[i]!;
  const ridge = bakeOcclusion(elev, n, 100)[10 * n + 10]!;
  assert.ok(ridge >= 1 && ridge <= 1.1001, `ridge (${ridge.toFixed(2)})`);
});

test("a snapshot with the same content keeps the old reference", () => {
  const first = keepIfSame(null, [{ id: "a", q: 1, r: 2 }]);
  const same = keepIfSame(first, [{ id: "a", q: 1, r: 2 }]);
  assert.equal(same.value, first.value, "identical content, same reference");
  const moved = keepIfSame(same, [{ id: "a", q: 1, r: 3 }]);
  assert.notEqual(moved.value, first.value, "a visible change gets through");
});
