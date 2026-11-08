// Explicit extensions so the node test runner can load this directly.
import type { Category } from "../../../packages/config/src/ids.ts";
import { LOW_RUN_POINTS, NEIGHBOUR_NOTABLE, VILLAGE_POOR, type AssistFacts } from "./helper-status.ts";
import type { HelperOpen } from "./helpers.ts";

/**
 * «Entdecken»: short hints that introduce a feature the moment it becomes
 * useful — a lift long enough for a middle station, a neighbour taking
 * guests, a run with few points — each once per device, one at a time.
 */
export type HintAction =
  | { kind: "helper"; open: HelperOpen; focus?: "lift" | "neighbour" }
  | { kind: "build"; category: Category };

export interface DiscoverHint {
  /** Stable per feature (and subject, where several can come up): shown once. */
  id: string;
  text: string;
  action: HintAction;
}

export interface DiscoverContext {
  /** Something else has the player's attention: a card, a sheet, a selection, building. */
  busy: boolean;
  /** The advisor has something broken to fix first; features can wait. */
  urgent: boolean;
}

type Rule = (f: AssistFacts) => DiscoverHint | null;

/** With a no-break space, so «8 %» never splits across lines. */
const pct = (v: number) => `${Math.round(v * 100)}${String.fromCharCode(0xa0)}%`;

/** In order of priority: the first rule with something to say wins. */
const RULES: readonly Rule[] = [
  (f) =>
    f.researchUnlock
      ? {
          id: `unlock:${f.researchUnlock.itemId}`,
          text: `${f.researchUnlock.itemName} ist erforscht und lässt sich jetzt bauen.`,
          action: { kind: "build", category: f.researchUnlock.category },
        }
      : null,
  (f) =>
    f.topNeighbour && f.topNeighbour.share >= NEIGHBOUR_NOTABLE
      ? {
          id: "neighbour",
          text: `${f.topNeighbour.name} nimmt euch ${pct(f.topNeighbour.share)} der Gäste. Tarifverbund oder Kauf?`,
          action: { kind: "helper", open: { id: "neighbour", neighbourId: f.topNeighbour.id }, focus: "neighbour" },
        }
      : null,
  (f) =>
    f.buyable
      ? {
          id: "buyout",
          text: `Euer Geld reicht, um ${f.buyable.name} zu kaufen.`,
          action: { kind: "helper", open: { id: "neighbour", neighbourId: f.buyable.id }, focus: "neighbour" },
        }
      : null,
  (f) =>
    f.midCandidate
      ? {
          id: "midstation",
          text: `${f.midCandidate.name} ist lang genug für eine Mittelstation.`,
          action: { kind: "helper", open: { id: "midstation", liftId: f.midCandidate.liftId }, focus: "lift" },
        }
      : null,
  (f) =>
    f.lowRun && f.lowRun.points < LOW_RUN_POINTS
      ? {
          id: "reshape",
          text: `${f.lowRun.name} hat nur ${f.lowRun.points} Punkte. Eine schwungvollere Linie bringt mehr.`,
          action: { kind: "helper", open: { id: "reshape" } },
        }
      : null,
  (f) =>
    f.villageAverage !== null && f.villageAverage < VILLAGE_POOR
      ? {
          id: "village",
          text: `Lage im Dorf im Schnitt ${pct(f.villageAverage)}. «Dorf ordnen» findet bessere Plätze.`,
          action: { kind: "helper", open: { id: "village" } },
        }
      : null,
];

/** The hint to show now, or null: never while busy or urgent, never one already seen. */
export function nextHint(facts: AssistFacts, seen: ReadonlySet<string>, ctx: DiscoverContext): DiscoverHint | null {
  if (ctx.busy || ctx.urgent) return null;
  for (const rule of RULES) {
    const hint = rule(facts);
    if (hint && !seen.has(hint.id)) return hint;
  }
  return null;
}

/** Where the seen hints live on this device. */
export const SEEN_KEY = "ski-alpina-hints-seen";

/** The storage calls used; `localStorage` has them. */
export interface HintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The hints this device has shown. Empty when storage is missing or broken. */
export function loadSeen(storage: HintStorage | null | undefined): Set<string> {
  try {
    const raw = storage?.getItem(SEEN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Remember a hint as shown; a full or blocked storage only forgets it. */
export function markSeen(storage: HintStorage | null | undefined, seen: Set<string>, id: string): Set<string> {
  const next = new Set(seen);
  next.add(id);
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify([...next]));
  } catch {
    // Private mode or full: shown once this session, then.
  }
  return next;
}

/** The browser's storage, when there is one to reach. */
export function deviceStorage(): HintStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
