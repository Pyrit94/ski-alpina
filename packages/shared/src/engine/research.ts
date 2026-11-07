import { BY_ID } from "../../../config/src/items.ts";
import type { ItemId } from "../../../config/src/ids.ts";
import {
  RESEARCH,
  RESEARCH_BRANCHES,
  RESEARCH_BY_ID,
  researchCost,
  type ResearchNodeDef,
} from "../../../config/src/research.ts";
import { createId } from "../ids.ts";
import type { Intent } from "../protocol/intents.ts";
import type {
  IntentResult,
  PisteDifficulty,
  ResearchState,
  ResortState,
  RoundModifiers,
  SimStats,
} from "../types.ts";
import { levelFromXp } from "./level.ts";

/**
 * Research: the tree, the points that pay for it, and what finished nodes do.
 *
 * Everything else in the engine only asks two questions of this module: "what
 * does research change right now" (`researchEffects`) and "let the resort earn
 * points for this stretch of time" (`accrueResearch`). Intents come in through
 * `validateResearch` and `applyResearch`.
 */

export type ResearchIntent = Extract<
  Intent,
  { type: "start_research" | "cancel_research" | "pledge_research" | "boost_research" }
>;

export function isResearchIntent(intent: Intent): intent is ResearchIntent {
  return (
    intent.type === "start_research" ||
    intent.type === "cancel_research" ||
    intent.type === "pledge_research" ||
    intent.type === "boost_research"
  );
}

/** Who has to agree to an alliance node, and who is asking. */
export interface ResearchContext {
  /** The player sending the intent. */
  actorId?: string;
  /**
   * The builders whose pledge an alliance node needs: those online right now.
   * A partner who is away does not block the other, the same rule a round
   * uses; their pledge, once given, is kept.
   */
  team?: readonly string[];
}

/** All effects combined. Factors are 1 and additions 0 when nothing is done. */
export interface ResearchEffects {
  demand: number;
  ticket: number;
  wait: number;
  upkeep: number;
  snow: number;
  liftCapacity: number;
  liftCapacityByItem: Partial<Record<ItemId, number>>;
  pisteCapacity: number;
  snowmakerDrop: number;
  buildCostFactor: number;
  satisfaction: number;
  teamworkFactor: number;
  researchSpeed: number;
  upkeepCut: number;
  lightsFactor: number;
  schoolBonus: number;
  clinicBonus: number;
  reputationFloor: number;
  keepOpen: PisteDifficulty[];
  unlocks: ItemId[];
}

export const NO_RESEARCH_EFFECTS: ResearchEffects = {
  demand: 1,
  ticket: 1,
  wait: 1,
  upkeep: 1,
  snow: 0,
  liftCapacity: 1,
  liftCapacityByItem: {},
  pisteCapacity: 1,
  snowmakerDrop: 1,
  buildCostFactor: 1,
  satisfaction: 0,
  teamworkFactor: 1,
  researchSpeed: 1,
  upkeepCut: 0,
  lightsFactor: 1,
  schoolBonus: 0,
  clinicBonus: 0,
  reputationFloor: 0,
  keepOpen: [],
  unlocks: [],
};

const FACTORS = [
  "demand",
  "ticket",
  "wait",
  "upkeep",
  "liftCapacity",
  "pisteCapacity",
  "snowmakerDrop",
  "buildCostFactor",
  "teamworkFactor",
  "researchSpeed",
  "lightsFactor",
] as const;
const ADDITIONS = ["snow", "satisfaction", "upkeepCut", "schoolBonus", "clinicBonus", "reputationFloor"] as const;

/** Research of an older save, or of a state built by hand in a test. */
function researchOf(state: Pick<ResortState, "research">): ResearchState {
  return state.research ?? { done: [], active: null, points: 0, pledges: {}, queue: [] };
}

/**
 * What finished research changes, folded into one record.
 *
 * Effects only come from `done`; the running node does nothing until it is
 * finished. A match with research switched off has none, even if a saved
 * state carries finished nodes.
 */
export function researchEffects(state: Pick<ResortState, "research" | "match">): ResearchEffects {
  if (!researchEnabled(state)) return NO_RESEARCH_EFFECTS;
  const done = researchOf(state).done;
  if (done.length === 0) return NO_RESEARCH_EFFECTS;
  const fx: ResearchEffects = {
    ...NO_RESEARCH_EFFECTS,
    liftCapacityByItem: {},
    keepOpen: [],
    unlocks: [],
  };
  for (const id of done) {
    const effect = RESEARCH_BY_ID[id]?.effect;
    if (!effect) continue;
    for (const key of FACTORS) fx[key] *= effect[key] ?? 1;
    for (const key of ADDITIONS) fx[key] += effect[key] ?? 0;
    for (const [item, factor] of Object.entries(effect.liftCapacityByItem ?? {})) {
      const k = item as ItemId;
      fx.liftCapacityByItem[k] = (fx.liftCapacityByItem[k] ?? 1) * (factor ?? 1);
    }
    for (const g of effect.keepOpen ?? []) if (!fx.keepOpen.includes(g)) fx.keepOpen.push(g);
    for (const u of effect.unlocks ?? []) if (!fx.unlocks.includes(u)) fx.unlocks.push(u);
  }
  fx.upkeepCut = Math.min(RESEARCH.maxUpkeepCut, fx.upkeepCut);
  return fx;
}

/** Fold research into a round's modifiers: the part the flow already reads. */
export function withResearchMods(mods: RoundModifiers, fx: ResearchEffects): RoundModifiers {
  if (fx === NO_RESEARCH_EFFECTS) return mods;
  return {
    demand: mods.demand * fx.demand,
    ticket: mods.ticket * fx.ticket,
    wait: mods.wait * fx.wait,
    upkeep: mods.upkeep * fx.upkeep,
    snow: mods.snow + fx.snow,
    closed: mods.closed.filter((g) => !fx.keepOpen.includes(g)),
  };
}

/** A lift's throughput factor from research. */
export function liftResearchFactor(fx: ResearchEffects, itemId: ItemId): number {
  return fx.liftCapacity * (fx.liftCapacityByItem[itemId] ?? 1);
}

/** Free play always researches; a match only when its rules say so. */
export function researchEnabled(state: Pick<ResortState, "match">): boolean {
  const match = state.match;
  if (!match || match.mode !== "match") return true;
  return match.options?.research !== false;
}

/** A price after research discounts. The one rule for every build. */
export function discounted(state: Pick<ResortState, "research" | "match">, chf: number): number {
  const factor = researchEffects(state).buildCostFactor;
  return factor === 1 ? chf : Math.round(chf * factor);
}

/** What placing one of these costs this resort, in CHF. Pistes: per segment. */
export function buildCost(state: Pick<ResortState, "research" | "match">, itemId: ItemId): number {
  return discounted(state, BY_ID[itemId]?.cost ?? 0);
}

/** Whether this resort may build the item: its level, or research, opens it. */
export function itemUnlocked(state: Pick<ResortState, "research" | "match" | "xp">, itemId: ItemId): boolean {
  const item = BY_ID[itemId];
  if (!item) return false;
  if (levelFromXp(state.xp) >= item.unlockLevel) return true;
  return researchEffects(state).unlocks.includes(itemId);
}

/** Research points per in-game day at these stats. */
export function researchRate(state: Pick<ResortState, "research" | "match">, stats: SimStats): number {
  if (!researchEnabled(state)) return 0;
  const raw =
    RESEARCH.basePerDay +
    Math.max(0, stats.guestsPerHour) / RESEARCH.guestsPerPoint +
    Math.max(0, stats.verticalPerHour) / RESEARCH.verticalPerPoint;
  return raw * researchEffects(state).researchSpeed;
}

/** Every point the resort has earned so far: banked, in progress, and spent. */
export function researchTotal(state: Pick<ResortState, "research">): number {
  const r = researchOf(state);
  const spent = r.done.reduce((n, id) => n + (RESEARCH_BY_ID[id] ? researchCost(RESEARCH_BY_ID[id]) : 0), 0);
  return r.points + (r.active?.progress ?? 0) + spent;
}

export function isAllianceNode(node: ResearchNodeDef): boolean {
  return RESEARCH_BRANCHES.find((b) => b.id === node.branch)?.alliance === true;
}

/** The node's prerequisites are finished, or (with `planned`) at least ahead in line. */
export function prerequisitesMet(research: ResearchState, node: ResearchNodeDef, planned = false): boolean {
  return node.requires.every(
    (id) =>
      research.done.includes(id) ||
      (planned && (research.active?.id === id || (research.queue ?? []).includes(id))),
  );
}

/** Ids whose pledge is still missing for this node. */
export function missingPledges(state: Pick<ResortState, "research">, nodeId: string, team: readonly string[]): string[] {
  const pledged = researchOf(state).pledges[nodeId] ?? [];
  return team.filter((id) => !pledged.includes(id));
}

export type NodeStatus = "done" | "active" | "queued" | "available" | "locked";

export function nodeStatus(state: Pick<ResortState, "research">, nodeId: string): NodeStatus {
  const r = researchOf(state);
  const node = RESEARCH_BY_ID[nodeId];
  if (!node) return "locked";
  if (r.done.includes(nodeId)) return "done";
  if (r.active?.id === nodeId) return "active";
  if ((r.queue ?? []).includes(nodeId)) return "queued";
  return prerequisitesMet(r, node, true) ? "available" : "locked";
}

function teamOf(ctx: ResearchContext): string[] {
  const team = [...(ctx.team ?? [])];
  // Whoever asks is part of the team, whatever the room thinks.
  if (ctx.actorId && !team.includes(ctx.actorId)) team.push(ctx.actorId);
  return team;
}

/** Whether a node can be started now, or put in line. */
function canStart(state: ResortState, node: ResearchNodeDef): IntentResult {
  const r = researchOf(state);
  const status = nodeStatus(state, node.id);
  if (status === "done") return { ok: false, code: "locked", reason: "Schon erforscht" };
  if (status === "active") return { ok: false, code: "locked", reason: "Läuft bereits" };
  if (status === "queued") return { ok: false, code: "locked", reason: "Schon in der Warteschlange" };
  if (status === "locked") return { ok: false, code: "locked", reason: "Zuerst die Voraussetzungen erforschen" };
  if (r.active && (r.queue ?? []).length >= RESEARCH.queueMax) {
    return { ok: false, code: "locked", reason: "Warteschlange ist voll" };
  }
  return { ok: true };
}

export function validateResearch(state: ResortState, intent: ResearchIntent, ctx: ResearchContext = {}): IntentResult {
  if (!researchEnabled(state)) {
    return { ok: false, code: "locked", reason: "Forschung ist in dieser Partie aus" };
  }
  const r = researchOf(state);

  if (intent.type === "cancel_research") {
    if (intent.nodeId) {
      if (!(r.queue ?? []).includes(intent.nodeId)) {
        return { ok: false, code: "invalid", reason: "Nicht in der Warteschlange" };
      }
      return { ok: true };
    }
    if (!r.active) return { ok: false, code: "invalid", reason: "Es läuft keine Forschung" };
    return { ok: true };
  }

  if (intent.type === "boost_research") {
    if (!r.active) return { ok: false, code: "invalid", reason: "Zuerst eine Forschung starten" };
    if (state.coins < RESEARCH.boost.coins) return { ok: false, code: "budget", reason: "Zu teuer" };
    return { ok: true };
  }

  const node = RESEARCH_BY_ID[intent.nodeId];
  if (!node) return { ok: false, code: "invalid", reason: "Unbekannte Forschung" };

  if (intent.type === "pledge_research") {
    if (!isAllianceNode(node)) return { ok: false, code: "invalid", reason: "Nur Allianz-Forschung braucht Zusagen" };
    const status = nodeStatus(state, node.id);
    if (status === "done") return { ok: false, code: "locked", reason: "Schon erforscht" };
    if (status === "active" || status === "queued") return { ok: false, code: "locked", reason: "Läuft bereits" };
    if (status === "locked") return { ok: false, code: "locked", reason: "Zuerst die Voraussetzungen erforschen" };
    if (ctx.actorId && (r.pledges[node.id] ?? []).includes(ctx.actorId)) {
      return { ok: false, code: "locked", reason: "Du hast schon zugesagt" };
    }
    return { ok: true };
  }

  // start_research
  const start = canStart(state, node);
  if (!start.ok) return start;
  if (isAllianceNode(node) && missingPledges(state, node.id, teamOf(ctx)).length > 0) {
    return { ok: false, code: "locked", reason: "Braucht die Zusage aller Spieler" };
  }
  return { ok: true };
}

export interface ResearchApplied {
  state: ResortState;
  title: string;
  body: string;
  kind: "ok" | "info" | "warn";
}

/** Start the node now if nothing runs, otherwise line it up. Then settle points. */
function startOrQueue(state: ResortState, nodeId: string, now: number): { state: ResortState; queued: boolean } {
  const r = researchOf(state);
  if (r.active) {
    return { state: { ...state, research: { ...r, queue: [...(r.queue ?? []), nodeId] } }, queued: true };
  }
  return { state: settleResearch({ ...state, research: { ...r, active: { id: nodeId, progress: 0 } } }, now), queued: false };
}

export function applyResearch(
  state: ResortState,
  intent: ResearchIntent,
  now: number,
  ctx: ResearchContext = {},
): ResearchApplied {
  const r = researchOf(state);

  if (intent.type === "cancel_research") {
    if (intent.nodeId) {
      const name = RESEARCH_BY_ID[intent.nodeId]?.name ?? intent.nodeId;
      return {
        state: { ...state, research: { ...r, queue: (r.queue ?? []).filter((id) => id !== intent.nodeId) } },
        title: "Forschung",
        body: `${name} aus der Warteschlange genommen.`,
        kind: "info",
      };
    }
    const active = r.active!;
    const name = RESEARCH_BY_ID[active.id]?.name ?? active.id;
    // Nothing is lost: the points go back to the bank and the next in line starts.
    const next = settleResearch(
      { ...state, research: { ...r, active: null, points: r.points + active.progress } },
      now,
    );
    return {
      state: next,
      title: "Forschung abgebrochen",
      body: `${name} gestoppt, ${Math.floor(active.progress)} FP zurück.`,
      kind: "info",
    };
  }

  if (intent.type === "boost_research") {
    const next = settleResearch(
      {
        ...state,
        coins: state.coins - RESEARCH.boost.coins,
        research: { ...r, points: r.points + RESEARCH.boost.points },
      },
      now,
    );
    return {
      state: next,
      title: "Forschung beschleunigt",
      body: `+${RESEARCH.boost.points} FP für ${RESEARCH.boost.coins.toLocaleString("de-CH")} CHF.`,
      kind: "ok",
    };
  }

  const node = RESEARCH_BY_ID[intent.nodeId]!;

  if (intent.type === "pledge_research") {
    const pledged = r.pledges[node.id] ?? [];
    const who = ctx.actorId ?? "";
    const pledges = { ...r.pledges, [node.id]: pledged.includes(who) ? pledged : [...pledged, who] };
    const pledgedState: ResortState = { ...state, research: { ...r, pledges } };
    const missing = missingPledges(pledgedState, node.id, teamOf(ctx));
    if (missing.length > 0) {
      return {
        state: pledgedState,
        title: "Allianz",
        body: `Zusage für ${node.name} – wartet auf ${missing.length === 1 ? "die andere Zusage" : `${missing.length} Zusagen`}.`,
        kind: "info",
      };
    }
    // Everyone is in: start it right away, or line it up.
    if (!canStart(pledgedState, node).ok) {
      return {
        state: pledgedState,
        title: "Allianz steht",
        body: `${node.name}: alle sind dabei. Starten, sobald Platz ist.`,
        kind: "ok",
      };
    }
    const started = startOrQueue(pledgedState, node.id, now);
    return {
      state: started.state,
      title: "Allianz steht",
      body: started.queued ? `${node.name} wartet in der Warteschlange.` : `${node.name} wird gemeinsam erforscht.`,
      kind: "ok",
    };
  }

  const started = startOrQueue(state, node.id, now);
  const finished = researchOf(started.state).done.includes(node.id);
  return {
    state: started.state,
    title: "Forschung",
    body: started.queued
      ? `${node.name} ist als Nächstes dran.`
      : finished
        ? `${node.name} sofort erforscht.`
        : `${node.name} gestartet.`,
    kind: "ok",
  };
}

/** How much history the save carries; matches the bookkeeping in apply. */
const ACTIVITY_LIMIT = 30;

/**
 * Move banked points into the running node, finish it when it is paid,
 * and pull the next one from the queue. Repeats while points last.
 */
export function settleResearch(state: ResortState, now: number): ResortState {
  let r = researchOf(state);
  const queue = [...(r.queue ?? [])];
  let active = r.active;
  let points = r.points;
  const done = [...r.done];
  const pledges = { ...r.pledges };
  const finished: ResearchNodeDef[] = [];
  let changed = false;

  for (let guard = 0; guard < 64; guard++) {
    if (!active) {
      // The next one in line whose prerequisites are now finished; any whose
      // prerequisite was cancelled can no longer run and drops out.
      let nextId: string | undefined;
      while (queue.length > 0 && !nextId) {
        const id = queue.shift()!;
        changed = true;
        const node = RESEARCH_BY_ID[id];
        if (node && !done.includes(id) && prerequisitesMet({ ...r, done }, node)) nextId = id;
      }
      if (!nextId) break;
      active = { id: nextId, progress: 0 };
    }
    const node = RESEARCH_BY_ID[active.id];
    if (!node) {
      active = null;
      changed = true;
      continue;
    }
    const cost = researchCost(node);
    const take = Math.min(points, Math.max(0, cost - active.progress));
    if (take > 0) {
      active = { ...active, progress: active.progress + take };
      points -= take;
      changed = true;
    }
    if (active.progress + 1e-9 < cost) break;
    done.push(node.id);
    delete pledges[node.id];
    finished.push(node);
    active = null;
    changed = true;
  }

  if (!changed && active === r.active) return state;
  r = { ...r, done, active, points, pledges, queue };
  let activity = state.activity;
  if (finished.length > 0) {
    const entries = finished.map((node) => ({
      id: createId("a"),
      at: now,
      actor: "",
      actorName: "Forschung",
      title: "Erforscht",
      body: `${node.name}: ${node.effectText}`,
      kind: "ok" as const,
    }));
    activity = [...entries.reverse(), ...(state.activity ?? [])].slice(0, ACTIVITY_LIMIT);
  }
  return { ...state, research: r, activity };
}

/**
 * Let the resort earn research points for `dtDays` days at these stats.
 *
 * Called once per sim step: by the free-play clock and by each step of a
 * match round. With research off in a match, nothing accrues.
 */
export function accrueResearch(state: ResortState, stats: SimStats, dtDays: number, now: number): ResortState {
  if (dtDays <= 0 || !researchEnabled(state)) return state;
  const gained = researchRate(state, stats) * dtDays;
  if (gained <= 0) return state;
  const r = researchOf(state);
  return settleResearch({ ...state, research: { ...r, points: r.points + gained } }, now);
}
