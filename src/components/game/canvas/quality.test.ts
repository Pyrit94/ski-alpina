import assert from "node:assert/strict";
import { test } from "node:test";
import { QUALITY } from "./quality.ts";

const { low, high } = QUALITY;

test("the mobile tier never costs more than the desktop one", () => {
  // The point of a tier is that one of them is cheaper. Every axis here is
  // something a GPU pays for per frame or per pixel, and each one has been
  // wrong at some point in a codebase that keeps its settings as inline
  // ternaries at the call site.
  assert.ok(low.trees < high.trees, "tree instances");
  assert.ok(low.rocks < high.rocks, "rock instances");
  assert.ok(low.dpr[1] < high.dpr[1], "pixel ratio ceiling");
  assert.ok(low.fogFar < high.fogFar, "how much distance is drawn");
  assert.ok(low.terrain.octaves <= high.terrain.octaves, "noise octaves");
  assert.ok(low.treesPerClump * low.trees < high.treesPerClump * high.trees, "trees drawn");
});

test("the expensive effects are desktop only", () => {
  assert.equal(low.shadows, false);
  assert.equal(low.antialias, false);
  assert.equal(high.shadows, true);
  assert.equal(high.antialias, true);
});

test("mobile skips the ground normal gradient entirely", () => {
  // The ground is a full-screen surface, so its fragment shader is the one
  // per-pixel cost that matters most on a phone. `bump` at zero is what drops
  // the two extra noise samples the gradient needs.
  assert.equal(low.terrain.bump, 0);
  assert.ok(high.terrain.bump > 0);
});

test("mobile lights brighter, and that inversion is on purpose", () => {
  // Not an oversight and not free to "fix": with no shadow map there is
  // nothing darkening the ground, so matching desktop's exposure and fill
  // renders the mountain flat. Anyone tempted to even these out should read
  // this test first.
  assert.ok(low.exposure > high.exposure, "exposure");
  assert.ok(low.hemisphere > high.hemisphere, "hemisphere fill");
  assert.ok(low.ambient > high.ambient, "ambient fill");
  assert.ok(low.sunBoost > high.sunBoost, "sun compensation");
});

test("a phone opens closer, with a wider lens", () => {
  const dist = (t: typeof low) =>
    Math.hypot(
      t.cameraAt[0] - t.cameraTarget[0],
      t.cameraAt[1] - t.cameraTarget[1],
      t.cameraAt[2] - t.cameraTarget[2],
    );
  assert.ok(dist(low) < dist(high), "opening distance");
  assert.ok(low.fov > high.fov, "field of view");
  assert.equal(low.compactLabels, true);
});

test("every tier is fully specified", () => {
  // A missing key reads as `undefined` and silently becomes NaN in a shader
  // uniform or a light intensity.
  for (const [name, tier] of Object.entries(QUALITY)) {
    for (const [key, value] of Object.entries(tier)) {
      assert.notEqual(value, undefined, `${name}.${key}`);
      if (typeof value === "number") assert.ok(Number.isFinite(value), `${name}.${key}`);
    }
  }
});

test("the opening view is oblique, not a map and not a horizon shot", () => {
  // Top-down flattened the range into a grey sheet; too shallow and the
  // village drops out of frame behind the first ridge. Steeper than about 45
  // and the summit leaves the top of the frame (see quality.ts).
  for (const [name, t] of Object.entries(QUALITY)) {
    const dx = t.cameraAt[0] - t.cameraTarget[0];
    const dy = t.cameraAt[1] - t.cameraTarget[1];
    const dz = t.cameraAt[2] - t.cameraTarget[2];
    const pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
    assert.ok(pitch > 28 && pitch < 45, `${name} pitch ${pitch.toFixed(1)}`);
    // Looking south (toward -z), where the high peaks are.
    assert.ok(dz > 0, `${name} faces the peaks`);
  }
});

test("adaptive resolution steps down before the frame rate floor", () => {
  // The budget's floor is 40 fps on a mid-range phone, i.e. 25 ms. Stepping
  // down only once that is already missed is too late.
  for (const [name, t] of Object.entries(QUALITY)) {
    assert.ok(t.slowFrameMs > 16.7 && t.slowFrameMs <= 25, `${name}.slowFrameMs`);
    assert.ok(t.dpr[0] <= t.dpr[1], `${name}.dpr`);
  }
});
