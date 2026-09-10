import { BY_ID } from "../../../config/src/items.ts";
import { ECONOMY, UPGRADES } from "../../../config/src/economy.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import { createId } from "../ids.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import type { QuestState, ResortState } from "../types.ts";
import { GRADE_LABEL, pisteDifficulty } from "./level.ts";
import { entityCost, findEntity } from "./state.ts";
import { surveyPiste } from "./validate.ts";

export interface Applied {
  state: ResortState;
  title: string;
  body: string;
  kind: "ok" | "info" | "warn";
}

/** Who is doing this. Absent for a solo or unauthenticated session. */
export interface Actor {
  id: string;
  name: string;
}

/** How much history the save carries. Enough to see a session's worth. */
const ACTIVITY_LIMIT = 30;

/**
 * Record who did it.
 *
 * Two people were building one resort with no trace of either: events were
 * broadcast and forgotten, nothing said who acted, and coming back after an
 * hour told you nothing about what had changed. Bookkeeping lives here rather
 * than in each branch, so a new intent is logged and attributed by default
 * instead of by remembering to.
 */
function record(
  before: ResortState,
  applied: Applied,
  intent: Intent,
  now: number,
  actor?: Actor,
): Applied {
  const next = applied.state;
  const spent = Math.max(0, before.coins - next.coins);
  const isBuild =
    intent.type === "place_building" || intent.type === "place_lift" || intent.type === "place_piste";

  let contributors = next.contributors;
  if (actor) {
    const prev = contributors[actor.id];
    contributors = {
      ...contributors,
      [actor.id]: {
        // The current name wins, so a rename shows up on old work too.
        name: actor.name,
        builds: (prev?.builds ?? 0) + (isBuild ? 1 : 0),
        demolished: (prev?.demolished ?? 0) + (intent.type === "demolish" ? 1 : 0),
        coinsSpent: (prev?.coinsSpent ?? 0) + spent,
      },
    };
  }

  // Reading the tutorial is not news for the other player.
  const newsworthy = intent.type !== "next_tutorial" && intent.type !== "dismiss_tutorial";
  const activity = newsworthy
    ? [
        {
          id: createId("a"),
          at: now,
          actor: actor?.id ?? "",
          actorName: actor?.name ?? "System",
          title: applied.title,
          body: applied.body,
          kind: applied.kind,
        },
        ...next.activity,
      ].slice(0, ACTIVITY_LIMIT)
    : next.activity;

  return { ...applied, state: { ...next, contributors, activity } };
}

/**
 * `dem` is what lets a piste be graded from the ground it crosses. It is
 * optional only so the many call sites that never place one stay unchanged;
 * `GameRoom` always passes it, and without it a run falls back to its
 * catalogue difficulty.
 */
export function applyIntent(
  state: ResortState,
  intent: Intent,
  now: number,
  actor?: Actor,
  dem?: Dem,
): Applied {
  return record(state, applyOne(state, intent, now, actor, dem), intent, now, actor);
}

function applyOne(
  state: ResortState,
  intent: Intent,
  now: number,
  actor?: Actor,
  dem?: Dem,
): Applied {
  if (intent.type === "place_building") {
    const item = BY_ID[intent.itemId];
    const building = {
      id: createId("b"),
      itemId: intent.itemId,
      q: intent.q,
      r: intent.r,
      level: 1,
      builtAt: now,
      readyAt: now + item.buildSeconds * 1000,
      upgrades: { speed: 1, cabins: 1, capacity: 1 },
      builtBy: actor?.id,
    };
    return {
      state: {
        ...state,
        buildings: [...state.buildings, building],
        coins: state.coins - item.cost,
        gems: state.gems - (item.gemCost ?? 0),
        xp: state.xp + item.xp,
        stars: state.stars + (item.xp >= 40 ? 1 : 0),
      },
      title: "Im Bau",
      body: `${item.name} wird errichtet.`,
      kind: "ok",
    };
  }

  if (intent.type === "place_lift") {
    const item = BY_ID[intent.itemId];
    const stationA = createId("st");
    const stationB = createId("st");
    const liftId = createId("l");
    const base = {
      itemId: intent.itemId,
      level: 1,
      builtAt: now,
      readyAt: now + item.buildSeconds * 1000,
      upgrades: { speed: 1, cabins: 1, capacity: 1 },
      builtBy: actor?.id,
    };
    return {
      state: {
        ...state,
        buildings: [
          ...state.buildings,
          { ...base, id: stationA, q: intent.a.q, r: intent.a.r },
          { ...base, id: stationB, q: intent.b.q, r: intent.b.r },
        ],
        lifts: [
          ...state.lifts,
          {
            ...base,
            id: liftId,
            a: intent.a,
            b: intent.b,
            stationA,
            stationB,
          },
        ],
        coins: state.coins - item.cost,
        gems: state.gems - (item.gemCost ?? 0),
        xp: state.xp + item.xp,
        stars: state.stars + 1,
      },
      title: "Bahn im Bau",
      body: `${item.name} verbindet die Haenge.`,
      kind: "ok",
    };
  }

  if (intent.type === "place_piste") {
    const item = BY_ID[intent.itemId];
    const segs = Math.max(1, intent.hexes.length - 1);
    // The ground decides the grade, so it is settled here and stored — the
    // run keeps its rating even if the terrain model is ever retuned.
    const survey = dem ? surveyPiste(dem, intent.itemId, intent.hexes) : null;
    const piste = {
      id: createId("p"),
      itemId: intent.itemId,
      difficulty: survey ? survey.grade : pisteDifficulty(intent.itemId),
      hexes: intent.hexes,
      builtAt: now,
      readyAt: now + item.buildSeconds * 1000,
      builtBy: actor?.id,
    };
    const cost = survey ? survey.cost : item.cost * segs;
    return {
      state: {
        ...state,
        pistes: [...state.pistes, piste],
        coins: state.coins - cost,
        xp: state.xp + item.xp * segs,
      },
      title: "Piste geoeffnet",
      body: survey
        ? `${GRADE_LABEL[survey.grade]} Piste, ${segs} Segmente.`
        : `${item.name} ist bereit.`,
      kind: "ok",
    };
  }

  if (intent.type === "upgrade") {
    const def = UPGRADES.find((u) => u.key === intent.key)!;
    const lift = state.lifts.find((l) => l.id === intent.entityId);
    const building = state.buildings.find((b) => b.id === intent.entityId);
    const target = lift ?? building;
    const cur = target!.upgrades[intent.key];
    const cost = def.cost[cur] ?? 0;
    const next = cur + 1;
    const bump = (id: string, upgrades: { speed: number; cabins: number; capacity: number }, level: number) =>
      id === intent.entityId ? { upgrades: { ...upgrades, [intent.key]: next }, level: Math.max(level, next) } : null;
    return {
      state: {
        ...state,
        coins: state.coins - cost,
        xp: state.xp + 12,
        lifts: state.lifts.map((l) => {
          const b = bump(l.id, l.upgrades, l.level);
          return b ? { ...l, ...b } : l;
        }),
        buildings: state.buildings.map((x) => {
          const b = bump(x.id, x.upgrades, x.level);
          return b ? { ...x, ...b } : x;
        }),
      },
      title: "Upgrade",
      body: `${def.label} auf Stufe ${next}.`,
      kind: "ok",
    };
  }

  if (intent.type === "demolish") {
    const entity = findEntity(state, intent.entityId)!;
    const price = entityCost(entity);
    const refund = {
      coins: Math.floor(price.coins * ECONOMY.demolishRefund),
      gems: Math.floor(price.gems * ECONOMY.demolishRefund),
    };
    const base = {
      ...state,
      coins: state.coins + refund.coins,
      gems: state.gems + refund.gems,
    };
    if (entity.kind === "lift") {
      const { lift } = entity;
      return {
        state: {
          ...base,
          lifts: state.lifts.filter((l) => l.id !== lift.id),
          // The two station buildings go with the cableway they belong to.
          buildings: state.buildings.filter(
            (b) => b.id !== lift.stationA && b.id !== lift.stationB,
          ),
        },
        title: "Abgerissen",
        body: `${BY_ID[lift.itemId].name} entfernt, ${refund.coins} CHF zurueck.`,
        kind: "info",
      };
    }
    if (entity.kind === "building") {
      return {
        state: { ...base, buildings: state.buildings.filter((b) => b.id !== entity.building.id) },
        title: "Abgerissen",
        body: `${BY_ID[entity.building.itemId].name} entfernt, ${refund.coins} CHF zurueck.`,
        kind: "info",
      };
    }
    return {
      state: { ...base, pistes: state.pistes.filter((p) => p.id !== entity.piste.id) },
      title: "Zurueckgebaut",
      body: `${BY_ID[entity.piste.itemId].name} entfernt, ${refund.coins} CHF zurueck.`,
      kind: "info",
    };
  }

  if (intent.type === "claim_quest") {
    const q = state.quests.find((x) => x.id === intent.questId)!;
    const def = QUEST_DEFS.find((d) => d.id === intent.questId);
    // A standing contract comes straight back, harder and worth more, so the
    // goal list never empties out.
    const renew = (x: QuestState): QuestState => {
      if (!def?.repeatable) return { ...x, claimed: true };
      const tier = x.tier + 1;
      const scale = Math.pow(def.growth ?? 1.6, tier);
      return {
        ...x,
        tier,
        claimed: false,
        progress: 0,
        target: Math.round(def.target * scale),
        coins: Math.round(def.coins * scale),
        gems: Math.round(def.gems * scale),
        xp: Math.round(def.xp * scale),
      };
    };
    return {
      state: {
        ...state,
        coins: state.coins + q.coins,
        gems: state.gems + q.gems,
        xp: state.xp + q.xp,
        stars: state.stars + 1,
        quests: state.quests.map((x) => (x.id === intent.questId ? renew(x) : x)),
      },
      title: "Belohnung",
      body: def?.repeatable
        ? `${q.title} abgeschlossen. Neuer Auftrag steht.`
        : `${q.title} abgeschlossen.`,
      kind: "ok",
    };
  }

  if (intent.type === "set_ticket_price") {
    return {
      state: { ...state, ticketPrice: intent.chf },
      title: "Tarif",
      body: `Tageskarte ${intent.chf} CHF.`,
      kind: "info",
    };
  }

  if (intent.type === "rename") {
    return {
      state: { ...state, resortName: intent.name.trim() },
      title: "Umbenannt",
      body: intent.name.trim(),
      kind: "info",
    };
  }

  if (intent.type === "next_tutorial") {
    const step = Math.min(3, state.tutorialStep + 1);
    return {
      state: { ...state, tutorialStep: step, tutorialOpen: step < 4 },
      title: "Hinweis",
      body: "Weiter im Tutorial.",
      kind: "info",
    };
  }

  return {
    state: { ...state, tutorialOpen: false },
    title: "Tutorial",
    body: "Geschlossen.",
    kind: "info",
  };
}
