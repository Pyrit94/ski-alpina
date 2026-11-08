import { FLOW } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexDistance, hexLine, hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { IntentResult, ResortState } from "../types.ts";

/**
 * Helpers for drawing a run, shared so they can be tested without a browser.
 * Nothing here decides what the server accepts — that stays
 * `validatePistePath` — they only shape how a draft grows while it is drawn.
 */

export interface DraftStep {
  draft: Axial[];
  /** Hexes added (negative: taken back). */
  added: number;
  /** Why the line stopped short of the pointer, if it did. */
  blocked: Extract<IntentResult, { ok: false }> | null;
}

const same = (a: Axial, b: Axial) => a.q === b.q && a.r === b.r;

/**
 * Grow a draft toward `target`, the way a drag stroke does.
 *
 * Hexes are added along the straight hex line from the draft's end, one at a
 * time, for as long as the run stays valid; the first hex that would break it
 * stops the line there. Pointing back at a hex this stroke already drew takes
 * the draft back to it, so overshooting is undone by moving back, not by
 * starting over. `floor` is the shortest the draft may be taken back to —
 * the length it had when the stroke began.
 */
export function extendDraft(
  draft: readonly Axial[],
  target: Axial,
  floor: number,
  check: (path: readonly Axial[]) => IntentResult,
): DraftStep {
  if (draft.length === 0) return { draft: [target], added: 1, blocked: null };
  const at = draft.findIndex((h) => same(h, target));
  if (at >= 0) {
    const keep = at + 1;
    if (keep >= Math.max(1, floor) && keep < draft.length) {
      return { draft: draft.slice(0, keep), added: keep - draft.length, blocked: null };
    }
    return { draft: [...draft], added: 0, blocked: null };
  }
  const line = hexLine(draft[draft.length - 1]!, target).slice(1);
  const out = [...draft];
  for (const hex of line) {
    // A run that crosses itself is never what the player meant.
    if (out.some((h) => same(h, hex))) {
      return { draft: out, added: out.length - draft.length, blocked: { ok: false, code: "invalid", reason: "Piste kreuzt sich" } };
    }
    out.push(hex);
    const v = check(out);
    if (!v.ok) {
      out.pop();
      return { draft: out, added: out.length - draft.length, blocked: v };
    }
  }
  return { draft: out, added: out.length - draft.length, blocked: null };
}

export type AnchorKind = "lift-top" | "lift-base" | "piste" | "village" | "exit";

export interface Anchor {
  hex: Axial;
  kind: AnchorKind;
  /** The lift or piste this belongs to, when there is one. */
  id?: string;
}

const elevAt = (dem: Dem, hex: Axial) => {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.sample(x, z);
};

/**
 * Every place a run can join, by what it is.
 *
 * Mirrors the ports `graph.ts` clusters: lift stations by which end is higher,
 * piste ends, the village, and the doors guests arrive and leave through.
 */
export function pisteAnchors(state: ResortState, dem: Dem): Anchor[] {
  const out: Anchor[] = [];
  for (const l of state.lifts) {
    const aHigh = elevAt(dem, l.a) > elevAt(dem, l.b);
    out.push({ hex: aHigh ? l.a : l.b, kind: "lift-top", id: l.id });
    out.push({ hex: aHigh ? l.b : l.a, kind: "lift-base", id: l.id });
  }
  for (const p of state.pistes) {
    if (p.difficulty === "road" || p.hexes.length < 2) continue;
    // Anywhere along a run, not only its ends: runs meet, branch and merge,
    // and the graph splits a run wherever another one joins it.
    for (const hex of p.hexes) out.push({ hex, kind: "piste", id: p.id });
  }
  out.push({ hex: dem.region.villageHex, kind: "village" });
  for (const b of state.buildings) {
    const item = BY_ID[b.itemId];
    if (b.itemId === "parking" || b.itemId === "bus" || (item?.beds ?? 0) > 0) {
      out.push({ hex: { q: b.q, r: b.r }, kind: "exit", id: b.id });
    }
  }
  return out;
}

function nearest(anchors: readonly Anchor[], hex: Axial, kinds: readonly AnchorKind[]): Anchor | null {
  let best: Anchor | null = null;
  let bestD = Infinity;
  for (const a of anchors) {
    if (!kinds.includes(a.kind)) continue;
    const d = hexDistance(a.hex, hex);
    // Ties go to the kind listed first.
    const rank = d + kinds.indexOf(a.kind) * 0.01;
    if (d <= FLOW.linkRadius && rank < bestD) {
      best = a;
      bestD = rank;
    }
  }
  return best;
}

const START_KINDS: readonly AnchorKind[] = ["lift-top", "piste"];
const END_KINDS: readonly AnchorKind[] = ["lift-base", "village", "exit", "piste"];

/**
 * Where a run started at `hex` should really start.
 *
 * Within the link radius of a lift's top station or another run's end, the
 * start moves onto it, so a run begins where guests actually arrive instead
 * of a hex beside it. Null when there is nothing close enough.
 */
export function snapPisteStart(state: ResortState, dem: Dem, hex: Axial): Anchor | null {
  return nearest(pisteAnchors(state, dem), hex, START_KINDS);
}

export interface PisteLinks {
  /** What feeds the top of the run, if anything. */
  start: Anchor | null;
  /** Where guests leave the bottom of the run, if anywhere. */
  end: Anchor | null;
}

/**
 * Whether a drawn line is joined at both ends, by the same radius rule the
 * flow graph uses to merge ports. A run whose top no lift reaches, or whose
 * bottom leads nowhere, carries nobody.
 */
export function pisteLinks(
  state: ResortState,
  dem: Dem,
  hexes: readonly Axial[],
  /** Runs that lead nowhere themselves; ending on one joins nothing. */
  deadEnds: ReadonlySet<string> = new Set(),
): PisteLinks {
  if (hexes.length === 0) return { start: null, end: null };
  const anchors = pisteAnchors(state, dem);
  const ends = anchors.filter((a) => !(a.kind === "piste" && a.id && deadEnds.has(a.id)));
  return {
    start: nearest(anchors, hexes[0]!, START_KINDS),
    end: hexes.length < 2 ? null : nearest(ends, hexes[hexes.length - 1]!, END_KINDS),
  };
}
