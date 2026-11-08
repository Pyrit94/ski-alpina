import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuestState } from "../../../packages/shared/src/types.ts";
import {
  COUNT_MS,
  FLOAT_MS,
  LAND_S,
  SETTLE_S,
  coinFeedback,
  completedQuests,
  easeOutCubic,
  landing,
  onceEach,
  snowflakes,
  tweenAt,
} from "./juice.ts";
import { BUZZ_PATTERN } from "./haptics.ts";

test("the purse only animates a change an action caused", () => {
  assert.equal(coinFeedback(-18_500, true), "spend");
  assert.equal(coinFeedback(2_000, true), "gain");
  // Income ticking in, or upkeep going out, without an action: quiet.
  assert.equal(coinFeedback(340, false), "quiet");
  assert.equal(coinFeedback(-120, false), "quiet");
  // An action that cost nothing, or rounding: quiet.
  assert.equal(coinFeedback(0, true), "quiet");
  assert.equal(coinFeedback(0.4, true), "quiet");
  assert.equal(coinFeedback(Number.NaN, true), "quiet");
});

test("the count eases from the old balance to the new and lands exactly", () => {
  assert.equal(tweenAt(100_000, 81_500, 0), 100_000);
  assert.equal(tweenAt(100_000, 81_500, 1), 81_500);
  assert.equal(tweenAt(100_000, 81_500, 5), 81_500);
  const half = tweenAt(0, 1000, 0.5);
  // Ease-out: more than half the way at half the time.
  assert.ok(half > 500 && half < 1000, `${half}`);
  // Monotone, no overshoot on money.
  let last = -1;
  for (let t = 0; t <= 1; t += 0.05) {
    const v = tweenAt(0, 1000, t);
    assert.ok(v >= last && v <= 1000);
    last = v;
  }
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(2), 1);
  assert.ok(COUNT_MS < FLOAT_MS, "the number settles before the float is gone");
});

test("a building falls, squashes on landing, settles and comes to rest", () => {
  const start = landing(0);
  assert.ok(start.lift > 2 && !start.landed);
  assert.ok(landing(LAND_S * 0.5).lift < start.lift);
  const touch = landing(LAND_S + 0.001);
  assert.equal(touch.lift, 0);
  assert.ok(touch.landed);
  assert.ok(touch.sy < 0.9 && touch.sxz > 1.05, "squashed when it lands");
  // One overshoot the other way, then small.
  const over = Array.from({ length: 40 }, (_, i) => landing(LAND_S + (i / 40) * SETTLE_S).sy);
  assert.ok(Math.max(...over) > 1, "settles past rest once");
  assert.ok(Math.max(...over) < 1.08, "a heavy thing, not a rubber ball");
  const end = landing(LAND_S + SETTLE_S - 0.001);
  assert.ok(Math.abs(end.sy - 1) < 0.01 && Math.abs(end.sxz - 1) < 0.01, "at rest when it joins its instances");
  assert.deepEqual(landing(LAND_S + SETTLE_S), { lift: 0, sy: 1, sxz: 1, landed: true });
});

test("reduced motion: the building is simply there", () => {
  assert.deepEqual(landing(0, true), { lift: 0, sy: 1, sxz: 1, landed: true });
});

test("each celebration once", () => {
  const once = onceEach(3);
  assert.equal(once("room:level:4"), true);
  assert.equal(once("room:level:4"), false);
  assert.equal(once("room:level:5"), true);
  // Forgets the oldest past its limit, so it never grows without bound.
  once("a");
  once("b");
  assert.equal(once("room:level:4"), true);
});

const quest = (id: string, over: Partial<QuestState> = {}): QuestState => ({
  id,
  title: id,
  hint: "",
  xp: 50,
  coins: 5000,
  gems: 0,
  progress: 0,
  target: 1,
  claimed: false,
  tier: 0,
  ...over,
});

test("a goal counts as completed when it is claimed or a contract moves up a tier", () => {
  const before = [quest("first-lift", { progress: 1 }), quest("guests", { progress: 900, target: 900 }), quest("idle")];
  const after = [
    quest("first-lift", { progress: 1, claimed: true }),
    quest("guests", { tier: 1, target: 1400, coins: 8000 }),
    quest("idle"),
  ];
  const done = completedQuests(before, after);
  assert.deepEqual(
    done.map((q) => q.id),
    ["first-lift", "guests"],
  );
  // The reward reported is the one paid, not the raised one.
  assert.equal(done[1]!.coins, 5000);
  assert.deepEqual(completedQuests(after, after), []);
});

test("snowflakes cover the width without clumping and stay the same", () => {
  const a = snowflakes(34);
  assert.deepEqual(a, snowflakes(34));
  const buckets = new Set(a.map((f) => Math.floor(f.left / 10)));
  assert.equal(buckets.size, 10, "a flake in every tenth of the screen");
  assert.ok(a.every((f) => f.left >= 0 && f.left < 100 && f.duration > 2 && f.size >= 6));
  assert.ok(a.some((f) => f.gold) && a.filter((f) => f.gold).length < a.length / 4, "a few glints of gold, mostly snow");
});

test("haptic patterns stay short", () => {
  for (const [kind, pattern] of Object.entries(BUZZ_PATTERN)) {
    const total = pattern.reduce((s, v) => s + v, 0);
    assert.ok(total <= 250, `${kind} buzzes ${total} ms`);
  }
});
