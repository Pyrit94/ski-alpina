// Explicit extensions so the node test runner can load this directly.
import { BY_ID } from "../../../packages/config/src/items.ts";
import type { ItemId } from "../../../packages/config/src/ids.ts";
import type { EdgeLink } from "../../../packages/shared/src/engine/descent.ts";
import type { FlowEdgeViz, PlacedBuilding, PlacedLift, PlacedPiste, SimStats } from "../../../packages/shared/src/types.ts";
import { worstNeed, type Need } from "./needs.ts";

/**
 * The one thing worth doing next, in a sentence, with the button that does it.
 *
 * Read off the layout and the last tick: first whatever keeps guests from
 * riding at all, then what turns them away, then what would bring more. Only
 * ever one, so it reads as advice rather than a to-do list.
 */
export type StepAction =
  | { kind: "descent"; liftId: string }
  | { kind: "build"; itemId: ItemId }
  | { kind: "select"; id: string }
  | { kind: "piste-from"; liftId: string }
  | { kind: "research"; nodeId: string };

export interface NextStep {
  /** Stable per situation, so a dismissed tip stays away until it changes. */
  id: string;
  text: string;
  action?: StepAction;
  actionLabel?: string;
  tone: "fix" | "grow";
}

export interface StepInput {
  lifts: readonly PlacedLift[];
  pistes: readonly PlacedPiste[];
  buildings: readonly PlacedBuilding[];
  stats: SimStats;
  flow: readonly FlowEdgeViz[];
  links: ReadonlyMap<string, EdgeLink>;
  /** Items the players may build now. */
  unlocked: (itemId: ItemId) => boolean;
  coins: number;
  /**
   * Research: whether something is in work, and a node worth starting now
   * (affordable, prerequisites met), with its name. Absent when research is off.
   */
  research?: { busy: boolean; next: { id: string; name: string } | null };
  /** What the resort is short of (see needs.ts). */
  needs?: readonly Need[];
}

const has = (buildings: readonly PlacedBuilding[], ids: readonly string[]) =>
  buildings.some((b) => ids.includes(b.itemId));

export function nextStep(input: StepInput): NextStep | null {
  const { lifts, pistes, buildings, stats, flow, links, unlocked, coins } = input;
  const runs = pistes.filter((p) => p.difficulty !== "road");
  const name = (itemId: ItemId) => BY_ID[itemId]?.name ?? itemId;
  const affordable = (itemId: ItemId) => unlocked(itemId) && coins >= (BY_ID[itemId]?.cost ?? Infinity);

  if (lifts.length === 0) {
    return {
      id: "first-lift",
      text: "Bau den ersten Lift: Talstation beim Dorf, Bergstation oben am Hang.",
      action: { kind: "build", itemId: unlocked("chair") ? "chair" : "tbar" },
      actionLabel: unlocked("chair") ? "Sessellift" : "Schlepplift",
      tone: "fix",
    };
  }
  for (const l of lifts) {
    const link = links.get(l.id);
    if (link === "no-descent") {
      return {
        id: `descent-${l.id}`,
        text: `${name(l.itemId)}: noch keine Abfahrt. Ohne Piste fährt hier niemand.`,
        action: { kind: "descent", liftId: l.id },
        actionLabel: "Abfahrt anlegen",
        tone: "fix",
      };
    }
    if (link === "no-access") {
      return {
        id: `access-${l.id}`,
        text: `${name(l.itemId)}: Gäste kommen nicht zur Talstation. Eine Piste dorthin oder ein Parkhaus daneben hilft.`,
        action: { kind: "select", id: l.id },
        actionLabel: "Zeigen",
        tone: "fix",
      };
    }
  }
  const lost = runs.find((p) => links.get(p.id) === "dead-end");
  if (lost) {
    return {
      id: `dead-end-${lost.id}`,
      text: `«${lost.name || "Piste"}» endet im Nichts. Zieh sie bis zu einer Talstation, ins Dorf oder auf eine andere Piste.`,
      action: { kind: "select", id: lost.id },
      actionLabel: "Zeigen",
      tone: "fix",
    };
  }

  if (stats.turnedAway > 0) {
    const door: ItemId = affordable("parking") ? "parking" : affordable("bus") ? "bus" : "parking";
    return {
      id: "turned-away",
      text: `${stats.turnedAway} Gäste pro Stunde kommen nicht ins Tal. Ein ${name(door)} lässt mehr herein.`,
      action: { kind: "build", itemId: door },
      actionLabel: `${name(door)} bauen`,
      tone: "fix",
    };
  }

  if (stats.bottleneckId && stats.bottleneckUse >= 0.92) {
    return {
      id: `bottleneck-${stats.bottleneckId}`,
      text: `${stats.bottleneckLabel} ist zu ${Math.round(stats.bottleneckUse * 100)} % ausgelastet. Ein Ausbau bringt sofort mehr Fahrten.`,
      action: { kind: "select", id: stats.bottleneckId },
      actionLabel: "Ausbauen",
      tone: "fix",
    };
  }

  if (stats.incomePerHour < 0 && stats.idleLifts + stats.idlePistes > 0) {
    return {
      id: "idle-costs",
      text: "Ungenutzte Anlagen kosten jeden Tag Unterhalt. Anschliessen oder abreissen.",
      tone: "fix",
    };
  }

  // Guests are there, but something they want is missing: say what, and offer it.
  const short = input.needs ? worstNeed(input.needs) : null;
  if (short?.itemId && short.covered < 0.7) {
    return {
      id: `need-${short.key}`,
      text: `Am meisten fehlt: ${short.label}. ${short.detail}.`,
      action: { kind: "build", itemId: short.itemId },
      actionLabel: `${name(short.itemId)} bauen`,
      tone: "fix",
    };
  }

  // Everything works: what would bring more guests?
  const liftEdges = flow.filter((e) => e.kind === "lift" && e.capacity > 0);
  const use = liftEdges.length ? liftEdges.reduce((n, e) => n + e.flow / e.capacity, 0) / liftEdges.length : 0;
  // The newest lift: most likely the one the players are working on.
  const top = lifts[lifts.length - 1]!;
  const grades = new Set(runs.map((p) => p.difficulty));
  if (runs.length > 0 && grades.size < 2) {
    const want = grades.has("blue") ? "rote oder schwarze" : "blaue";
    return {
      id: "variety",
      text: `Nur eine Pistenfarbe: eine ${want} Abfahrt bringt Abwechslung und deutlich mehr Gäste.`,
      action: { kind: "piste-from", liftId: top.id },
      actionLabel: "Neue Abfahrt",
      tone: "grow",
    };
  }
  if (!has(buildings, ["parking", "bus"]) && unlocked("parking")) {
    return {
      id: "first-door",
      text: "Ohne Parkhaus oder Bus kommen nur die Gäste aus dem Dorf. Ein Parkhaus lässt viel mehr herein.",
      action: { kind: "build", itemId: "parking" },
      actionLabel: "Parkhaus bauen",
      tone: "grow",
    };
  }
  if (!has(buildings, ["restaurant", "hut", "apres", "gastro-hall"]) && unlocked("restaurant")) {
    return {
      id: "first-food",
      text: "Hungrige Gäste: ein Restaurant bringt Umsatz und Zufriedenheit.",
      action: { kind: "build", itemId: "restaurant" },
      actionLabel: "Restaurant bauen",
      tone: "grow",
    };
  }
  if (liftEdges.length > 0 && use < 0.25) {
    return {
      id: "empty-lifts",
      text: "Die Lifte sind kaum ausgelastet: es fehlen Gäste, nicht Kapazität. Mehr Pisten-Kilometer ziehen mehr Gäste an.",
      action: { kind: "piste-from", liftId: top.id },
      actionLabel: "Neue Abfahrt",
      tone: "grow",
    };
  }
  // Research is where new lifts and buildings come from: never let it idle.
  if (input.research && !input.research.busy && input.research.next && lifts.length > 0) {
    const n = input.research.next;
    return {
      id: `research-${n.id}`,
      text: `Die Forschung steht still. «${n.name}» bringt neue Bahnen oder Gebäude.`,
      action: { kind: "research", nodeId: n.id },
      actionLabel: "Erforschen",
      tone: "grow",
    };
  }
  if (stats.beds === 0 && unlocked("hotel1")) {
    return {
      id: "first-hotel",
      text: "Noch keine Betten: ein Hotel bringt Übernachtungsgäste und Einnahmen auch am Abend.",
      action: { kind: "build", itemId: "hotel1" },
      actionLabel: "Hotel bauen",
      tone: "grow",
    };
  }
  if (stats.waitMinutes > 8) {
    return {
      id: "queues",
      text: `Gäste warten ${stats.waitMinutes} Minuten. Ein zweiter Lift oder ein Ausbau verkürzt die Schlange.`,
      action: { kind: "build", itemId: unlocked("chair") ? "chair" : "tbar" },
      actionLabel: "Neuer Lift",
      tone: "grow",
    };
  }
  return null;
}
