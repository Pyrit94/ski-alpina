/**
 * The feel of an action: how a building lands, how the purse counts, which
 * changes are worth a fuss and which stay quiet. Pure, so the timing can be
 * tested; the components and the scene only read from here.
 *
 * Timings here are feel, not balancing: they change how a moment looks, never
 * what it is worth.
 */

// Explicit extensions so the node test runner can load this directly.
import type { QuestState } from "../../../packages/shared/src/types.ts";

/** Seconds a new building falls before it touches the ground. */
export const LAND_S = 0.3;
/** Seconds the squash-and-settle after landing takes to die away. */
export const SETTLE_S = 0.4;
/** How long the purse counts from the old balance to the new. */
export const COUNT_MS = 650;
/** How long the «−18'500» under the purse stays. */
export const FLOAT_MS = 1400;

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

/** A value on its way from `from` to `to`, `t` from 0 to 1, slowing toward the end. */
export function tweenAt(from: number, to: number, t: number): number {
  if (t >= 1) return to;
  return from + (to - from) * easeOutCubic(t);
}

/**
 * Where a new building stands `age` seconds after it was placed: it falls a
 * short way, lands with a squash and settles with one small overshoot, the
 * way a heavy thing set down in snow does — not a cartoon bounce.
 *
 * `lift` is the height above its seat, `sy` and `sxz` its vertical and
 * horizontal scale. After LAND_S + SETTLE_S it is at rest (1, 1, 0).
 */
export function landing(
  age: number,
  reduced = false,
): { lift: number; sy: number; sxz: number; landed: boolean } {
  if (reduced || age >= LAND_S + SETTLE_S) return { lift: 0, sy: 1, sxz: 1, landed: true };
  if (age < LAND_S) {
    const f = clamp01(age / LAND_S);
    // Falling: accelerating, and growing from a little smaller.
    const s = 0.7 + 0.3 * f;
    return { lift: 2.2 * (1 - f * f), sy: s * (1 + 0.06 * f), sxz: s, landed: false };
  }
  const u = age - LAND_S;
  const wob = Math.exp(-u * 9) * Math.cos(u * 20);
  return { lift: 0, sy: 1 - 0.16 * wob, sxz: 1 + 0.09 * wob, landed: true };
}

export type CoinFeedback = "spend" | "gain" | "quiet";

/**
 * Which change of the purse earns an animation.
 *
 * Only a change that came with an action — a build, an undo, a claimed goal,
 * a partner's purchase — counts; the income that arrives every second stays
 * quiet, or the counter would twitch all game long. Changes smaller than a
 * franc are rounding.
 */
export function coinFeedback(delta: number, fromAction: boolean): CoinFeedback {
  if (!fromAction || !Number.isFinite(delta) || Math.abs(delta) < 1) return "quiet";
  return delta < 0 ? "spend" : "gain";
}

/** A guard that says yes once per key: the same level-up is never celebrated twice. */
export function onceEach(limit = 200): (key: string) => boolean {
  const seen: string[] = [];
  return (key) => {
    if (seen.includes(key)) return false;
    seen.push(key);
    if (seen.length > limit) seen.shift();
    return true;
  };
}

/**
 * Goals completed between two snapshots: a one-shot goal turns claimed, a
 * standing contract moves up a tier. Reported as they were before, with the
 * reward that was paid out.
 */
export function completedQuests(before: QuestState[], after: QuestState[]): QuestState[] {
  const out: QuestState[] = [];
  for (const q of after) {
    const was = before.find((b) => b.id === q.id);
    if (!was) continue;
    if ((!was.claimed && q.claimed) || q.tier > was.tier) out.push(was);
  }
  return out;
}

export interface Flake {
  /** Start position across the screen, in percent. */
  left: number;
  /** Seconds before it starts. */
  delay: number;
  /** Seconds it takes to fall. */
  duration: number;
  /** Diameter in px. */
  size: number;
  /** Sideways drift over the fall, in px. */
  drift: number;
  /** A crystal or a soft flake. */
  crystal: boolean;
  /** Gold glint instead of snow. */
  gold: boolean;
}

/**
 * Snowflakes for a celebration, spread evenly but not in a grid: a golden
 * angle walk, so any count covers the width without clumping. Same count,
 * same flakes, so a re-render does not reshuffle them mid-fall.
 */
export function snowflakes(n: number): Flake[] {
  const out: Flake[] = [];
  for (let i = 0; i < n; i++) {
    const g = (i * 0.618034) % 1;
    const h = (i * 0.414214) % 1;
    out.push({
      left: Math.round(g * 1000) / 10,
      delay: Math.round(h * 9) / 10,
      duration: 2.2 + ((i * 7) % 10) / 10,
      size: 6 + ((i * 5) % 9),
      drift: (i % 2 ? 1 : -1) * (12 + ((i * 11) % 28)),
      crystal: i % 3 === 0,
      gold: i % 7 === 3,
    });
  }
  return out;
}
