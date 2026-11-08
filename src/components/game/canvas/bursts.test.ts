import assert from "node:assert/strict";
import { test } from "node:test";
import { DUST_N, DUST_S, GLINT_LANES, GLINT_N, GLINT_RUN_S, GLINT_S, POOL, alongLine, burstLength, dustAt, glintAt, jitter } from "./bursts.ts";

test("a ring of dust spreads out, slows down and is gone within a second", () => {
  const radius = (t: number) => {
    const p = dustAt(0, t, 7)!;
    return Math.hypot(p.dx, p.dz);
  };
  assert.ok(radius(0.1) < radius(0.4) && radius(0.4) < radius(0.9));
  // Air drag: the second half covers less ground than the first.
  assert.ok(radius(0.9) - radius(0.45) < radius(0.45) - radius(0));
  assert.ok(radius(DUST_S) < 3, "stays around the building");
  assert.equal(dustAt(0, -0.01, 7), null);
  assert.equal(dustAt(0, DUST_S + 0.01, 7), null);
  assert.ok(dustAt(0, DUST_S * 0.95, 7)!.alpha < 0.05, "fades out rather than popping off");
  assert.equal(burstLength("dust"), DUST_S);
});

test("the dust goes all the way round", () => {
  let left = 0;
  let right = 0;
  for (let i = 0; i < DUST_N; i++) {
    const p = dustAt(i, 0.3, 3)!;
    if (p.dx < 0) left++;
    else right++;
  }
  assert.ok(Math.abs(left - right) <= 4);
});

test("the shimmer runs from the first glint to the last, each once", () => {
  const n = 12;
  // At the start only the first glints shine; the last has not started.
  assert.ok(glintAt(0, n, 0.15)!.alpha > 0);
  assert.equal(glintAt(n - 1, n, 0.15)!.alpha, 0);
  // At the end of the run the last one shines and the first is done.
  assert.ok(glintAt(n - 1, n, GLINT_RUN_S + GLINT_S / 2, 1)!.alpha > 0.6);
  assert.equal(glintAt(0, n, GLINT_RUN_S + GLINT_S / 2)!.alpha, 0);
  assert.equal(glintAt(0, n, burstLength("glint") + 0.01), null);
  // Every glint gets its full flash within the burst.
  for (let i = 0; i < n; i++)
    for (let lane = 0; lane < GLINT_LANES; lane++) {
      let peak = 0;
      for (let t = 0; t <= burstLength("glint"); t += 0.01) peak = Math.max(peak, glintAt(i, n, t, lane)!.alpha);
      assert.ok(peak > 0.98, `glint ${i}/${lane} peaks at ${peak}`);
    }
});

test("glints sit at equal steps along the run, ends included", () => {
  const pts = alongLine(
    [
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      { x: 10, z: 30 },
    ],
    5,
  );
  assert.equal(pts.length, 5);
  assert.deepEqual(pts[0], { x: 0, z: 0 });
  assert.deepEqual(pts[4], { x: 10, z: 30 });
  assert.deepEqual(pts[1], { x: 10, z: 0 });
  assert.deepEqual(pts[2], { x: 10, z: 10 });
  assert.deepEqual(alongLine([], 3), []);
  assert.deepEqual(alongLine([{ x: 1, z: 2 }], 3), [{ x: 1, z: 2 }]);
});

test("jitter is stable and in range; the pool holds several bursts at once", () => {
  assert.equal(jitter(3, 9), jitter(3, 9));
  for (let i = 0; i < 50; i++) {
    const j = jitter(i, 11);
    assert.ok(j >= 0 && j < 1);
  }
  // A lift's two stations and a long run built together fit.
  assert.ok(POOL >= DUST_N * 2 + GLINT_N * GLINT_LANES);
});
