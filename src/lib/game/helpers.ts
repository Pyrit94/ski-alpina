// Explicit extensions so the node test runner can load this directly.
import type { AutoMix } from "../../../packages/shared/src/engine/auto-pistes.ts";

/**
 * The helpers — «Pisten automatisch», «Dorf ordnen», «Pisten optimieren»,
 * a neighbour's card, the mid-station planner — and the «Assistent» hub
 * that lists them. One field in the store says which one is open, so
 * opening one closes whichever was open before.
 */
export type HelperOpen =
  | { id: "hub" }
  | { id: "auto"; liftIds: string[] | null; mix: AutoMix }
  | { id: "village" }
  | { id: "reshape" }
  | { id: "neighbour"; neighbourId: string }
  | { id: "midstation"; liftId: string };

export type HelperId = HelperOpen["id"];

/** The helper of this kind, when it is the one open. */
export function helperOf<K extends HelperId>(open: HelperOpen | null, id: K): Extract<HelperOpen, { id: K }> | null {
  return open && open.id === id ? (open as Extract<HelperOpen, { id: K }>) : null;
}

/** Same helper, same subject: a neighbour's card for another neighbour is another card. */
export function sameHelper(a: HelperOpen | null, b: HelperOpen | null): boolean {
  if (!a || !b || a.id !== b.id) return false;
  if (a.id === "neighbour" && b.id === "neighbour") return a.neighbourId === b.neighbourId;
  if (a.id === "midstation" && b.id === "midstation") return a.liftId === b.liftId;
  return true;
}

/**
 * The store change for opening `next` (null closes): the helper replaces
 * whatever was open, and a sheet or a selected object makes way, since a
 * helper card is where the eye goes next.
 */
export function openHelperPatch(next: HelperOpen | null): { helper: HelperOpen | null; sheet?: "none"; selectedId?: null } {
  return next ? { helper: next, sheet: "none", selectedId: null } : { helper: null };
}

/** A button that opens what is already open closes it. */
export function toggleHelperPatch(current: HelperOpen | null, next: HelperOpen) {
  return openHelperPatch(sameHelper(current, next) ? null : next);
}
