import assert from "node:assert/strict";
import { test } from "node:test";
import { ECONOMY } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { MATCH } from "../../../config/src/match.ts";
import { RESEARCH, RESEARCH_BY_ID, RESEARCH_GATE, RESEARCH_NODES, researchCost } from "../../../config/src/research.ts";
import { generateDem } from "../terrain/dem.ts";
import { GameRoom } from "../runtime/room.ts";
import type { Axial } from "../hex.ts";
import type { Intent } from "../protocol/intents.ts";
import type { ResortState } from "../types.ts";
import { applyIntent } from "./apply.ts";
import { tickFlow } from "./flow.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { resolveRound, startMatch, withPreview } from "./match.ts";
import {
  accrueResearch,
  buildCost,
  itemUnlocked,
  lockReason,
  nodeStatus,
  researchEffects,
  researchRate,
} from "./research.ts";
import { emptyResort, migrateResort } from "./state.ts";
import { tickResort } from "./tick.ts";
import { pisteCost, validateIntent } from "./validate.ts";

const dem = generateDem();
const NOW = 1_000_000;
const BUILT = NOW - 60_000;
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push(col(r));
  return out;
};

/** A working resort: a chair up from the village and a run back down. */
function circuit(): ResortState {
  let s: ResortState = { ...emptyResort(), timeOfDay: 0.5 };
  s = applyIntent(s, { type: "place_lift", itemId: "chair", a: VILLAGE_HEX, b: col(1) }, BUILT, undefined, dem).state;
  s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes: run(1, 9) }, BUILT, undefined, dem).state;
  return s;
}

function withDone(state: ResortState, ...ids: string[]): ResortState {
  return { ...state, research: { ...state.research, done: [...state.research.done, ...ids] } };
}

/** Validate, then apply — the way the room does it. */
function act(
  state: ResortState,
  intent: Intent,
  actor?: { id: string; name: string },
  team?: string[],
): { state: ResortState; ok: boolean; reason?: string } {
  const v = validateIntent(state, dem, intent, "builder", NOW, { actorId: actor?.id, team });
  if (!v.ok) return { state, ok: false, reason: v.reason };
  return { state: applyIntent(state, intent, NOW, actor, dem, team).state, ok: true };
}

test("the tree is well formed: known prerequisites, no cycles, rising prices", () => {
  for (const node of RESEARCH_NODES) {
    for (const req of node.requires) {
      const parent = RESEARCH_BY_ID[req];
      assert.ok(parent, `${node.id} requires unknown ${req}`);
      assert.ok(parent.tier < node.tier, `${node.id} must sit below ${req}`);
    }
    assert.ok(researchCost(node) > 0);
  }
  // Grew with the Dorf branch and the nodes that unlock lift types and buildings.
  assert.ok(RESEARCH_NODES.length >= 16 && RESEARCH_NODES.length <= 40);
  const costs = RESEARCH.tierCost.slice(1);
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i]! > costs[i - 1]!);
});

test("running the resort earns points; a busier resort earns more", () => {
  const empty = emptyResort();
  const busy = withPreview(circuit(), dem);
  const idle = researchRate(empty, empty.stats);
  assert.equal(idle, RESEARCH.basePerDay);
  assert.ok(researchRate(busy, busy.stats) > idle, "guests and vertical metres should add points");

  // Free play: the clock accrues by days of game time.
  const day = ECONOMY.daySecondsReal;
  const after = tickResort(circuit(), dem, day / 2, NOW);
  assert.ok(after.research.points > 0);
  assert.ok(after.research.points < researchRate(after, after.stats), "half a day earns less than a day");
});

test("points flow into the running node, finish it and start the next in line", () => {
  let s = emptyResort();
  s = act(s, { type: "start_research", nodeId: "energie" }).state;
  assert.equal(s.research.active?.id, "energie");
  // Queue the follow-up while its prerequisite still runs.
  const queued = act(s, { type: "start_research", nodeId: "werkstatt" });
  assert.equal(queued.ok, true);
  s = queued.state;
  assert.deepEqual(s.research.queue, ["werkstatt"]);
  assert.equal(nodeStatus(s, "werkstatt"), "queued");

  const total = researchCost(RESEARCH_BY_ID.energie!) + 5;
  s = accrueResearch(s, { ...s.stats, guestsPerHour: 0, verticalPerHour: 0 }, total / RESEARCH.basePerDay, NOW);
  assert.ok(s.research.done.includes("energie"));
  assert.equal(s.research.active?.id, "werkstatt");
  assert.ok(Math.abs(s.research.active!.progress - 5) < 1e-6, "the overflow carries into the next node");
  assert.equal(s.research.queue.length, 0);
  assert.equal(s.activity[0]?.title, "Erforscht");
});

test("banked points pay for a node the moment it starts", () => {
  let s = { ...emptyResort(), research: { ...emptyResort().research, points: 500 } };
  s = act(s, { type: "start_research", nodeId: "onlinetickets" }).state;
  assert.ok(s.research.done.includes("onlinetickets"));
  assert.equal(s.research.active, null);
  assert.equal(s.research.points, 500 - researchCost(RESEARCH_BY_ID.onlinetickets!));
});

test("prerequisites: a tier-2 node cannot start before its parent", () => {
  const s = emptyResort();
  const r = act(s, { type: "start_research", nodeId: "marketing" });
  assert.equal(r.ok, false);
  assert.equal(act(s, { type: "start_research", nodeId: "nope" }).ok, false);
  const done = withDone(s, "onlinetickets");
  assert.equal(act(done, { type: "start_research", nodeId: "marketing" }).ok, true);
  assert.equal(act(done, { type: "start_research", nodeId: "onlinetickets" }).ok, false, "already done");
});

test("cancel gives the points back; the queue can be trimmed", () => {
  let s = act(emptyResort(), { type: "start_research", nodeId: "energie" }).state;
  s = accrueResearch(s, s.stats, 2, NOW);
  const progress = s.research.active!.progress;
  assert.ok(progress > 0);
  s = act(s, { type: "start_research", nodeId: "praeparierung" }).state;
  s = act(s, { type: "cancel_research", nodeId: "praeparierung" }).state;
  assert.deepEqual(s.research.queue, []);
  s = act(s, { type: "cancel_research" }).state;
  assert.equal(s.research.active, null);
  assert.equal(s.research.points, progress);
  assert.equal(act(s, { type: "cancel_research" }).ok, false, "nothing left to cancel");
});

test("the queue is bounded", () => {
  let s = act(emptyResort(), { type: "start_research", nodeId: "energie" }).state;
  for (const id of ["praeparierung", "onlinetickets", "kuppelbar"]) s = act(s, { type: "start_research", nodeId: id }).state;
  assert.equal(s.research.queue.length, RESEARCH.queueMax);
  assert.equal(act(s, { type: "start_research", nodeId: "werkstatt" }).ok, false);
});

test("money buys points, at the configured rate", () => {
  let s = act(emptyResort(), { type: "start_research", nodeId: "kuppelbar" }).state;
  const coins = s.coins;
  s = act(s, { type: "boost_research" }).state;
  assert.equal(s.coins, coins - RESEARCH.boost.coins);
  assert.equal(s.research.active!.progress, RESEARCH.boost.points);
  assert.equal(act({ ...s, coins: 10 }, { type: "boost_research" }).ok, false);
  assert.equal(act(emptyResort(), { type: "boost_research" }).ok, false, "nothing to speed up");
});

test("alliance: a node waits for every player's pledge, then starts by itself", () => {
  const anna = { id: "pl_anna", name: "Anna" };
  const jo = { id: "pl_jo", name: "Johanna" };
  const team = [anna.id, jo.id];
  let s = emptyResort();
  const direct = act(s, { type: "start_research", nodeId: "einkauf" }, anna, team);
  assert.equal(direct.ok, false, "cannot start without both");
  assert.equal(act(s, { type: "pledge_research", nodeId: "energie" }, anna, team).ok, false, "only alliance nodes");

  s = act(s, { type: "pledge_research", nodeId: "einkauf" }, anna, team).state;
  assert.equal(s.research.active, null);
  assert.deepEqual(s.research.pledges.einkauf, [anna.id]);
  assert.equal(act(s, { type: "pledge_research", nodeId: "einkauf" }, anna, team).ok, false, "pledge once");

  s = act(s, { type: "pledge_research", nodeId: "einkauf" }, jo, team).state;
  assert.equal(s.research.active?.id, "einkauf");

  // A later tier still needs its prerequisite.
  assert.equal(act(s, { type: "pledge_research", nodeId: "vision" }, anna, team).ok, false);
});

test("alliance: a player alone counts as everyone", () => {
  const solo = { id: "pl_solo", name: "Solo" };
  const s = act(emptyResort(), { type: "pledge_research", nodeId: "einkauf" }, solo, [solo.id]).state;
  assert.equal(s.research.active?.id, "einkauf");
  // No room at all (a test, a script): the asker is the team.
  const t = act(emptyResort(), { type: "pledge_research", nodeId: "einkauf" }, solo).state;
  assert.equal(t.research.active?.id, "einkauf");
});

test("alliance through the room: only online builders are asked", () => {
  const room = new GameRoom("allianz", undefined, dem);
  const a = room.join("Anna", "token-anna-1");
  const b = room.join("Johanna", "token-jo-12");
  const running = () => room.state.research.active?.id;
  const first = room.submit(a.id, { type: "pledge_research", nodeId: "einkauf" });
  assert.equal(first.ok, true);
  assert.equal(running(), undefined, "waits for Johanna");
  assert.equal(room.submit(a.id, { type: "start_research", nodeId: "einkauf" }).ok, false);
  room.submit(b.id, { type: "pledge_research", nodeId: "einkauf" });
  assert.equal(running(), "einkauf");

  // With Johanna away, Anna's pledge is enough for the next one.
  room.state = withDone(room.state, "einkauf");
  room.state = { ...room.state, research: { ...room.state.research, active: null } };
  room.players.get(b.id)!.online = false;
  room.submit(a.id, { type: "pledge_research", nodeId: "funk" });
  assert.equal(running(), "funk");
});

test("effects reach the flow: more demand, less upkeep, more lift capacity", () => {
  const base = circuit();
  const plain = tickFlow(base, dem, 1, NOW).stats;

  const marketing = tickFlow(withDone(base, "onlinetickets", "marketing"), dem, 1, NOW).stats;
  assert.ok(marketing.marketPerHour > plain.marketPerHour, "marketing draws more guests");

  const energy = tickFlow(withDone(base, "energie"), dem, 1, NOW).stats;
  assert.ok(energy.upkeepPerHour < plain.upkeepPerHour, "energy management cuts upkeep");

  const chairs = tickFlow(withDone(base, "kuppelbar"), dem, 1, NOW).stats;
  assert.equal(chairs.liftCapacity, Math.round(plain.liftCapacity * 1.2));

  const comfy = tickFlow(withDone(base, "kuppelbar", "sitzheizung"), dem, 1, NOW).stats;
  assert.ok(comfy.satisfaction > plain.satisfaction);
});

test("avalanche protection keeps black runs open when an event closes them", () => {
  const s = startMatch(emptyResort(), "kurz", NOW, dem);
  const closed = { ...s, match: { ...s.match, mods: { ...s.match.mods, closed: ["black" as const] } } };
  assert.deepEqual(researchEffects(withDone(closed, "praeparierung", "beschneiung2", "lawinenschutz")).keepOpen, ["black"]);
});

test("snowmaking research pushes the snow line further down", () => {
  let s = { ...circuit(), day: 70 };
  s = applyIntent(s, { type: "place_building", itemId: "snowmaker", q: VILLAGE_HEX.q + 2, r: 2 }, BUILT, undefined, dem).state;
  const plain = tickFlow(s, dem, 1, NOW).stats.snowLineM;
  const better = tickFlow(withDone(s, "praeparierung", "beschneiung2"), dem, 1, NOW).stats.snowLineM;
  assert.ok(better < plain, `${better} should be below ${plain}`);
});

test("build cost discount applies the same in validate and apply", () => {
  const disc = withDone(emptyResort(), "einkauf");
  const price = buildCost(disc, "restaurant");
  assert.equal(price, Math.round(BY_ID.restaurant.cost * 0.92));
  const place: Intent = { type: "place_building", itemId: "restaurant", q: -4, r: 7 };

  // Exactly enough for the discounted price, not for the list price.
  const tight = { ...disc, coins: price };
  assert.equal(validateIntent({ ...emptyResort(), coins: price }, dem, place, "builder", NOW).ok, false);
  assert.equal(validateIntent(tight, dem, place, "builder", NOW).ok, true);
  assert.equal(applyIntent(tight, place, NOW).state.coins, 0);

  // Pistes too.
  const hexes = run(1, 9);
  const list = pisteCost(dem, "piste", hexes);
  const discounted = Math.round(list * 0.92);
  const pisteState = { ...disc, coins: discounted };
  assert.equal(validateIntent(pisteState, dem, { type: "place_piste", itemId: "piste", hexes }, "builder", NOW).ok, true);
  assert.equal(applyIntent(pisteState, { type: "place_piste", itemId: "piste", hexes }, NOW, undefined, dem).state.coins, 0);
});

test("research can unlock an item before its level", () => {
  const s = emptyResort();
  assert.equal(itemUnlocked(s, "funitel"), false);
  const opened = withDone(s, "kuppelbar", "kabinen", "funitel");
  assert.equal(itemUnlocked(opened, "funitel"), true);
  assert.equal(itemUnlocked(opened, "glacier"), false);
  const intent: Intent = { type: "place_lift", itemId: "funitel", a: VILLAGE_HEX, b: col(-3) };
  const locked = validateIntent({ ...s, coins: 1e6, gems: 1e3 }, dem, intent, "builder", NOW);
  assert.equal(locked.ok, false);
  if (!locked.ok) assert.equal(locked.code, "locked");
  const v = validateIntent({ ...opened, coins: 1e6, gems: 1e3 }, dem, intent, "builder", NOW);
  if (!v.ok) assert.notEqual(v.code, "locked", "the level check no longer applies");
});

test("a match with research off refuses research and earns no points", () => {
  let s = startMatch(emptyResort(), "kurz", NOW, dem, { research: false });
  const r = validateIntent(s, dem, { type: "start_research", nodeId: "energie" }, "builder", NOW);
  assert.equal(r.ok, false);
  s = applyIntent(s, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) }, NOW, undefined, dem).state;
  s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes: run(1, 9) }, NOW, undefined, dem).state;
  const after = resolveRound(withPreview(s, dem), dem, NOW + 1);
  assert.equal(after.research.points, 0);
  assert.equal(after.match.history[0]!.research, undefined);
  // Even finished nodes in the save do nothing.
  assert.equal(researchEffects(withDone(after, "einkauf")).buildCostFactor, 1);
});

test("a match round earns points, reports them and resets on a new match", () => {
  let s = startMatch(emptyResort(), "normal", NOW, dem);
  s = applyIntent(s, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) }, NOW, undefined, dem).state;
  s = applyIntent(s, { type: "place_piste", itemId: "piste", hexes: run(1, 9) }, NOW, undefined, dem).state;
  s = act(s, { type: "start_research", nodeId: "energie" }).state;
  const after = resolveRound(withPreview(s, dem), dem, NOW + 1);
  const gained = after.match.history[0]!.research ?? 0;
  assert.ok(gained >= MATCH.daysPerRound * RESEARCH.basePerDay, `got ${gained}`);
  assert.ok(after.research.done.includes("energie") || (after.research.active?.progress ?? 0) > 0);
  const fresh = startMatch(after, "kurz", NOW + 2, dem);
  assert.deepEqual(fresh.research.done, []);
  assert.equal(fresh.research.points, 0);
});

test("the alliance radio makes the teamwork bonus bigger", () => {
  const prep = (done: string[]) => {
    let s = startMatch(emptyResort(), "kurz", NOW, dem);
    s = { ...withDone(s, ...done), match: { ...s.match, roundBuilders: ["a", "b"] } };
    return resolveRound(s, dem, NOW + 1).coins;
  };
  const plain = prep([]);
  const radio = prep(["einkauf", "funk"]);
  assert.ok(radio - plain >= MATCH.teamwork.coins * 0.5 - 1, `${radio} vs ${plain}`);
});

test("old saves gain an empty research state, and a partial one is completed", () => {
  const old = { ...emptyResort() } as Partial<ResortState>;
  delete old.research;
  const migrated = migrateResort(old);
  assert.deepEqual(migrated.research, { done: [], active: null, points: 0, pledges: {}, queue: [] });
  const partial = migrateResort({
    ...emptyResort(),
    research: { done: ["energie"], active: null, points: 12, pledges: {} } as unknown as ResortState["research"],
  });
  assert.deepEqual(partial.research.queue, []);
  assert.deepEqual(partial.research.done, ["energie"]);
  assert.equal(partial.research.points, 12);
});

test("new lift types and buildings come from research, not from the level", () => {
  const veteran = { ...emptyResort(), xp: 999_999 };
  // Every gated item stays locked at any level until its node is done.
  for (const [itemId, nodeId] of Object.entries(RESEARCH_GATE)) {
    assert.equal(itemUnlocked(veteran, itemId as never), false, `${itemId} should wait for ${nodeId}`);
    assert.equal(lockReason(veteran, itemId as never)?.kind, "research");
    assert.equal(itemUnlocked(withDone(veteran, nodeId!), itemId as never), true);
  }
  // The basics still follow the level alone.
  assert.equal(itemUnlocked(emptyResort(), "chair"), true);
  assert.equal(itemUnlocked(emptyResort(), "parking"), true);
  // Gondola, hotels and the rest are gated.
  for (const id of ["gondola", "tram", "funitel", "glacier", "hotel1", "hotel3", "hotel5", "bus", "snowmaker"]) {
    assert.ok(RESEARCH_GATE[id as keyof typeof RESEARCH_GATE], `${id} should be gated`);
  }
  // The server refuses a gated build and says which research is missing.
  const v = validateIntent({ ...veteran, coins: 1e7 }, dem, { type: "place_lift", itemId: "gondola", a: VILLAGE_HEX, b: col(1) }, "builder", NOW);
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.reason, /Forschung/);
});

test("with research switched off for a match, the level unlocks everything again", () => {
  const s = { ...startMatch(emptyResort(), "kurz", NOW, dem, { research: false }), xp: 999_999 };
  assert.equal(itemUnlocked(s, "gondola"), true);
});
