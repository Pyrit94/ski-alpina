import { setNeighbourMode } from "./neighbours.ts";
import { applyTrade, isTradeIntent } from "./neighbour-trade.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { BUILDING_LEVELS, ECONOMY, PISTE_LEVELS, PISTE_SCORE, UPGRADES } from "../../../config/src/economy.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import { createId } from "../ids.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import type { QuestState, ResortState } from "../types.ts";
import { GRADE_LABEL, pisteDifficulty } from "./level.ts";
import { buildingLevel, entityCost, expansionCost, findEntity, moveCost, pisteExpansionCost, pisteLevel, TUTORIAL_STEPS } from "./state.ts";
import { followTutorial } from "./tutorial.ts";
import { pisteCost, surveyPiste } from "./validate.ts";
import { applyEditPiste } from "./piste-edit.ts";
import { continueFree, inMatch, PENDING_READY, startMatch, startSandbox } from "./match.ts";
import { applyEventWeights, recordVote, settleActorCoins, walletKey } from "./rules.ts";
import { MATCH } from "../../../config/src/match.ts";
import { applyResearch, buildCost, discounted, isResearchIntent } from "./research.ts";
import { applyProposalIntent } from "./proposals.ts";
import { scorePiste } from "./piste-score.ts";
import { applyReshape } from "./piste-reshape.ts";
import { applyLevel } from "./terraform.ts";
import { applyMidStation, midStationCost } from "./mid-station.ts";

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
  // An accepted proposal's own steps were booked to their proposer already.
  const nested = intent.type === "decide_proposal";
  const spent = nested ? 0 : Math.max(0, before.coins - next.coins);
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
  const newsworthy =
    intent.type !== "next_tutorial" && intent.type !== "dismiss_tutorial" && intent.type !== "end_round";
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

  // In a match, remember who built this round for the teamwork bonus.
  let match = next.match;
  if (actor && isBuild && match?.mode === "match" && !match.roundBuilders.includes(actor.id)) {
    match = { ...match, roundBuilders: [...match.roundBuilders, actor.id] };
  }

  let settled: ResortState = { ...next, contributors, activity, match };
  // Separate purses: whatever the intent cost or paid lands with its actor.
  if (intent.type !== "start_match" && !nested) settled = settleActorCoins(before, settled, actor?.id);
  return { ...applied, state: settled };
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
  /** Online builders, for alliance research; see ResearchContext. */
  team?: readonly string[],
): Applied {
  const applied = record(state, applyOne(state, intent, now, actor, dem, team), intent, now, actor);
  // Building is what moves the tutorial on; a dismissed one stays closed.
  return intent.type === "dismiss_tutorial" ? applied : { ...applied, state: followTutorial(applied.state) };
}

function applyOne(
  state: ResortState,
  intent: Intent,
  now: number,
  actor?: Actor,
  dem?: Dem,
  team?: readonly string[],
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
      readyAt: readyAtFor(state, now, item.buildSeconds),
      upgrades: { speed: 0, cabins: 0, capacity: 0 },
      builtBy: actor?.id,
    };
    return {
      state: {
        ...state,
        buildings: [...state.buildings, building],
        coins: state.coins - buildCost(state, intent.itemId),
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
      readyAt: readyAtFor(state, now, item.buildSeconds),
      upgrades: { speed: 0, cabins: 0, capacity: 0 },
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
        coins: state.coins - buildCost(state, intent.itemId),
        gems: state.gems - (item.gemCost ?? 0),
        xp: state.xp + item.xp,
        stars: state.stars + 1,
      },
      title: "Bahn im Bau",
      body: `${item.name} verbindet die Hänge.`,
      kind: "ok",
    };
  }

  if (intent.type === "place_piste") {
    const item = BY_ID[intent.itemId];
    const segs = Math.max(1, intent.hexes.length - 1);
    // The ground decides the grade, so it is settled here and stored — the
    // run keeps its rating even if the terrain model is ever retuned.
    const survey = dem ? surveyPiste(dem, intent.itemId, intent.hexes, intent.width) : null;
    const name = intent.name?.trim();
    // How good it is to ski: stored, and worth XP (see PISTE_SCORE).
    const rating = dem && survey && item.id !== "road" ? scorePiste(intent.hexes, dem) : null;
    const piste = {
      id: createId("p"),
      itemId: intent.itemId,
      difficulty: survey ? survey.grade : pisteDifficulty(intent.itemId),
      hexes: intent.hexes,
      builtAt: now,
      readyAt: readyAtFor(state, now, item.buildSeconds),
      builtBy: actor?.id,
      // Only stored when chosen, so older and default runs stay identical.
      ...(intent.width && intent.width !== 2 ? { width: intent.width } : {}),
      ...(name ? { name } : {}),
      ...(rating ? { score: rating.points } : {}),
    };
    const cost = discounted(state, survey ? survey.cost : item.cost * segs);
    return {
      state: {
        ...state,
        pistes: [...state.pistes, piste],
        coins: state.coins - cost,
        xp: state.xp + item.xp * segs + (rating ? Math.round(rating.points * PISTE_SCORE.xpPerPoint) : 0),
      },
      title: item.id === "road" ? "Strasse gebaut" : "Piste angelegt",
      body: survey
        ? `${name ? `«${name}»: ` : ""}${GRADE_LABEL[survey.grade]} Piste, ${segs} Segmente${rating ? `, ${rating.points} Punkte ${"★".repeat(rating.stars)}` : ""}.`
        : `${item.name} ist bereit.`,
      kind: "ok",
    };
  }

  if (intent.type === "upgrade") {
    const def = UPGRADES.find((u) => u.key === intent.key)!;
    const entity = findEntity(state, intent.entityId);
    const lift = entity?.kind === "lift" ? entity.lift : null;
    if (!lift) return { state, title: "Upgrade", body: "Nichts zu verbessern.", kind: "warn" };
    const cur = lift.upgrades[intent.key];
    const cost = def.cost[cur] ?? 0;
    const next = cur + 1;
    return {
      state: {
        ...state,
        coins: state.coins - cost,
        xp: state.xp + 12,
        lifts: state.lifts.map((l) =>
          l.id === lift.id
            ? { ...l, upgrades: { ...l.upgrades, [intent.key]: next }, level: Math.max(l.level, next + 1) }
            : l,
        ),
      },
      title: "Ausgebaut",
      body: `${BY_ID[lift.itemId].name}: ${def.label} Stufe ${next}.`,
      kind: "ok",
    };
  }

  if (intent.type === "expand") {
    const entity = findEntity(state, intent.entityId);
    if (entity?.kind === "piste") {
      const p = entity.piste;
      const list = pisteExpansionCost(p);
      if (list === null) return { state, title: "Ausbau", body: "Nichts auszubauen.", kind: "warn" };
      const level = pisteLevel(p) + 1;
      return {
        state: {
          ...state,
          coins: state.coins - discounted(state, list),
          xp: state.xp + 8,
          pistes: state.pistes.map((x) => (x.id === p.id ? { ...x, level } : x)),
        },
        title: "Ausgebaut",
        body: `${p.name ?? "Piste"}: ${PISTE_LEVELS.labels[level - 1] ?? `Stufe ${level}`}.`,
        kind: "ok",
      };
    }
    const b = entity?.kind === "building" ? entity.building : null;
    const list = b ? expansionCost(b) : null;
    if (!b || list === null) return { state, title: "Ausbau", body: "Nichts auszubauen.", kind: "warn" };
    const level = buildingLevel(b) + 1;
    const label = BUILDING_LEVELS.labels[b.itemId]?.[level - 1];
    return {
      state: {
        ...state,
        coins: state.coins - discounted(state, list),
        xp: state.xp + 12,
        buildings: state.buildings.map((x) => (x.id === b.id ? { ...x, level } : x)),
      },
      title: "Ausgebaut",
      body: `${BY_ID[b.itemId].name}: Stufe ${level}${label ? ` – ${label}` : ""}.`,
      kind: "ok",
    };
  }

  if (intent.type === "free_play") {
    return {
      state: continueFree(state, now),
      title: "Freies Spiel",
      body: "Keine Runden mehr: Das Tal läuft weiter, solange jemand da ist.",
      kind: "ok",
    };
  }

  if (intent.type === "undo") {
    const entity = findEntity(state, intent.entityId)!;
    // The full price back, and the XP it gave: as if it had never been built.
    if (entity.kind === "lift") {
      const { lift } = entity;
      const item = BY_ID[lift.itemId];
      return {
        state: {
          ...state,
          // The middle station too, if it has one: "voller Preis" means all of it.
          coins: state.coins + buildCost(state, lift.itemId) + (lift.mid ? midStationCost(state, lift.itemId) : 0),
          gems: state.gems + (item.gemCost ?? 0),
          xp: Math.max(0, state.xp - item.xp),
          lifts: state.lifts.filter((l) => l.id !== lift.id),
          buildings: state.buildings.filter((b) => b.id !== lift.stationA && b.id !== lift.stationB && b.id !== lift.stationMid),
        },
        title: "Rückgängig",
        body: `${item.name} zurückgenommen, voller Preis zurück.`,
        kind: "info",
      };
    }
    if (entity.kind === "building") {
      const b = entity.building;
      const item = BY_ID[b.itemId];
      return {
        state: {
          ...state,
          coins: state.coins + buildCost(state, b.itemId),
          gems: state.gems + (item.gemCost ?? 0),
          xp: Math.max(0, state.xp - item.xp),
          buildings: state.buildings.filter((x) => x.id !== b.id),
        },
        title: "Rückgängig",
        body: `${item.name} zurückgenommen, voller Preis zurück.`,
        kind: "info",
      };
    }
    const p = entity.piste;
    const item = BY_ID[p.itemId];
    const segs = Math.max(1, p.hexes.length - 1);
    const paid = discounted(state, dem ? pisteCost(dem, p.itemId, p.hexes, p.width) : item.cost * segs);
    return {
      state: {
        ...state,
        coins: state.coins + paid,
        xp: Math.max(0, state.xp - item.xp * segs),
        pistes: state.pistes.filter((x) => x.id !== p.id),
      },
      title: "Rückgängig",
      body: `${p.name ?? item.name} zurückgenommen, voller Preis zurück.`,
      kind: "info",
    };
  }

  if (intent.type === "move_building") {
    const entity = findEntity(state, intent.entityId);
    const b = entity?.kind === "building" ? entity.building : null;
    if (!b) return { state, title: "Verschieben", body: "Nichts zu verschieben.", kind: "warn" };
    return {
      state: {
        ...state,
        coins: state.coins - discounted(state, moveCost(state, b.itemId)),
        buildings: state.buildings.map((x) => (x.id === b.id ? { ...x, q: intent.q, r: intent.r } : x)),
      },
      title: "Verschoben",
      body: `${BY_ID[b.itemId].name} steht jetzt am neuen Platz.`,
      kind: "ok",
    };
  }

  if (intent.type === "propose" || intent.type === "decide_proposal" || intent.type === "set_proposal_limit") {
    return applyProposalIntent(state, dem, intent, now, actor, team);
  }

  if (intent.type === "rearrange") {
    const to = new Map(intent.moves.map((m) => [m.entityId, m]));
    const cost = state.buildings
      .filter((b) => to.has(b.id))
      .reduce((n, b) => n + discounted(state, moveCost(state, b.itemId)), 0);
    return {
      state: {
        ...state,
        coins: state.coins - cost,
        buildings: state.buildings.map((b) => {
          const m = to.get(b.id);
          return m ? { ...b, q: m.q, r: m.r } : b;
        }),
      },
      title: "Dorf neu angeordnet",
      body: `${to.size} ${to.size === 1 ? "Gebäude steht" : "Gebäude stehen"} jetzt an besseren Plätzen.`,
      kind: "ok",
    };
  }

  if (isTradeIntent(intent)) return applyTrade(state, intent, now, actor);

  if (intent.type === "set_neighbours") {
    if (!dem) return { state, title: "Nachbarn", body: "", kind: "info" };
    const next = setNeighbourMode(state, dem, intent.mode, now);
    const names = (next.neighbours?.list ?? []).map((n) => n.name);
    const body =
      intent.mode === "off"
        ? "Die Nachbar-Skigebiete ruhen."
        : names.length === 0
          ? "Auf dieser Karte ist kein Platz für ein Nachbargebiet."
          : intent.mode === "wettbewerb"
            ? `${names.join(" und ")} ${names.length === 1 ? "macht" : "machen"} euch jetzt Konkurrenz – mit günstigeren Pässen.`
            : `${names.join(" und ")} ${names.length === 1 ? "betreibt" : "betreiben"} jetzt Lifte in der Gegend.`;
    return { state: next, title: "Nachbarn", body, kind: "info" };
  }

  if (intent.type === "set_speed") {
    const label = intent.speed === 0 ? "Pausiert" : intent.speed === 1 ? "Normales Tempo" : "Schnell (3×)";
    return { state: { ...state, speed: intent.speed }, title: "Spieltempo", body: label, kind: "info" };
  }

  if (intent.type === "name_lift") {
    const name = intent.name.trim();
    return {
      state: {
        ...state,
        lifts: state.lifts.map((l) => {
          if (l.id !== intent.entityId && l.stationA !== intent.entityId && l.stationB !== intent.entityId && l.stationMid !== intent.entityId) return l;
          const { name: _old, ...rest } = l;
          void _old;
          return name ? { ...rest, name } : rest;
        }),
      },
      title: "Umbenannt",
      body: name ? `Die Bahn heisst jetzt «${name}».` : "Name entfernt.",
      kind: "info",
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
            (b) => b.id !== lift.stationA && b.id !== lift.stationB && b.id !== lift.stationMid,
          ),
        },
        title: "Abgerissen",
        body: `${BY_ID[lift.itemId].name} entfernt, ${fmtChf(refund.coins)} zurück.`,
        kind: "info",
      };
    }
    if (entity.kind === "building") {
      return {
        state: { ...base, buildings: state.buildings.filter((b) => b.id !== entity.building.id) },
        title: "Abgerissen",
        body: `${BY_ID[entity.building.itemId].name} entfernt, ${fmtChf(refund.coins)} zurück.`,
        kind: "info",
      };
    }
    return {
      state: { ...base, pistes: state.pistes.filter((p) => p.id !== entity.piste.id) },
      title: "Zurückgebaut",
      body: `${BY_ID[entity.piste.itemId].name} entfernt, ${fmtChf(refund.coins)} zurück.`,
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
      body: `Tageskarte neu ${intent.chf} CHF.`,
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
    // Moving past the last step closes it.
    const step = state.tutorialStep + 1;
    return {
      state: { ...state, tutorialStep: Math.min(TUTORIAL_STEPS - 1, step), tutorialOpen: step < TUTORIAL_STEPS },
      title: "Hinweis",
      body: "Weiter im Tutorial.",
      kind: "info",
    };
  }

  if (intent.type === "start_match") {
    if (intent.preset === "sandbox") {
      return { state: startSandbox(state), title: "Freies Spiel", body: "Ein leeres Tal, keine Uhr, kein Ende.", kind: "info" };
    }
    const preset = MATCH.presets.find((p) => p.id === intent.preset)!;
    return {
      state: dem ? startMatch(state, intent.preset, now, dem, intent.options) : state,
      title: "Neue Partie",
      body: `${preset.label}: ${preset.hint}. Viel Glück!`,
      kind: "ok",
    };
  }

  if (intent.type === "end_round") {
    const id = actor?.id ?? "";
    const others = state.match.ready.filter((x) => x !== id);
    return {
      state: { ...state, match: { ...state.match, ready: intent.ready ? [...others, id] : others } },
      title: intent.ready ? "Bereit" : "Doch nicht bereit",
      body: intent.ready ? "Runde beendet – wartet auf alle." : "Runde wieder offen.",
      kind: "info",
    };
  }

  if (intent.type === "choose_event") {
    const pending = state.match.event!;
    const option = pending.options[intent.option]!;
    if (state.match.options.events === "vote") {
      // A vote; the room settles it once everyone online has voted.
      return {
        state: { ...state, match: { ...state.match, event: recordVote(pending, actor?.id ?? "", intent.option) } },
        title: pending.title,
        body: `Stimme für «${option.label}».`,
        kind: "info",
      };
    }
    const weights = [0, 0];
    weights[intent.option] = 1;
    return {
      state: applyEventWeights(state, weights, actor?.id ?? ""),
      title: pending.title,
      body: `Entschieden: ${option.label}.`,
      kind: "ok",
    };
  }

  if (intent.type === "set_match_options") {
    const { economy: _economy, ...rest } = intent.options;
    return {
      state: { ...state, match: { ...state.match, options: { ...state.match.options, ...rest } } },
      title: "Regeln angepasst",
      body: "Gilt ab dieser Runde.",
      kind: "info",
    };
  }

  if (intent.type === "choose_role") {
    const id = actor?.id ?? "";
    const label = intent.role === "berg" ? "Berg (Bahnen & Pisten)" : "Tal (Hotels, Gastro & Dienste)";
    return {
      state: { ...state, match: { ...state.match, roles: { ...state.match.roles, [id]: intent.role } } },
      title: "Rolle gewählt",
      body: `${actor?.name ?? "Jemand"} führt jetzt: ${label}.`,
      kind: "info",
    };
  }

  if (intent.type === "transfer_coins") {
    const from = walletKey(state, actor?.id);
    if (!from) return { state, title: "Überweisung", body: "Keine eigene Kasse.", kind: "warn" };
    const wallets = { ...state.match.wallets };
    wallets[from] = (wallets[from] ?? 0) - intent.amount;
    wallets[intent.to] = (wallets[intent.to] ?? 0) + intent.amount;
    const toLabel = intent.to === "berg" ? "Berg" : intent.to === "tal" ? "Tal" : (state.contributors[intent.to]?.name ?? "Mitspieler:in");
    // Coins in total do not change, so settleActorCoins leaves this alone.
    return {
      state: { ...state, match: { ...state.match, wallets } },
      title: "Überweisung",
      body: `${fmtChf(intent.amount)} an ${toLabel}.`,
      kind: "ok",
    };
  }

  if (isResearchIntent(intent)) {
    return applyResearch(state, intent, now, { actorId: actor?.id, team });
  }

  if (intent.type === "edit_piste") return applyEditPiste(state, intent, dem);
  if (intent.type === "reshape_piste") return applyReshape(state, dem, intent);
  if (intent.type === "level_ground") return applyLevel(state, dem, intent);
  if (intent.type === "add_mid_station") return applyMidStation(state, intent, now, actor);

  if (intent.type === "dismiss_tutorial") {
    return {
      state: { ...state, tutorialOpen: false },
      title: "Tutorial",
      body: "Geschlossen.",
      kind: "info",
    };
  }

  // Implemented in their own modules as they land; until then, nothing changes.
  return { state, title: "Hinweis", body: "Diese Funktion kommt gleich.", kind: "info" };
}

/** Real seconds in free play; finished when the round is played in a match. */
function readyAtFor(state: ResortState, now: number, buildSeconds: number): number {
  return inMatch(state) ? PENDING_READY : now + buildSeconds * 1000;
}

function fmtChf(n: number): string {
  return `${Math.round(n).toLocaleString("de-CH")} CHF`;
}
