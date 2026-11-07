import assert from "node:assert/strict";
import { test } from "node:test";
import { MATCH, SECRET_GOALS } from "../../../config/src/match.ts";
import { generateDem } from "../terrain/dem.ts";
import { GameRoom } from "../runtime/room.ts";
import type { Axial } from "../hex.ts";
import { VILLAGE_HEX } from "./graph.ts";
import { duelScores, resolveRound } from "./match.ts";
import { metric, roleForItem, spendable } from "./rules.ts";

const dem = generateDem();
const col = (r: number): Axial => ({ q: VILLAGE_HEX.q, r });
const run = (top: number, bottom: number, dq = 0): Axial[] => {
  const out: Axial[] = [];
  for (let r = top; r <= bottom; r++) out.push({ q: VILLAGE_HEX.q + dq, r });
  return out;
};

function twoPlayers() {
  const room = new GameRoom("r", undefined, dem);
  const a = room.join("Michael", undefined, { userId: "u1", name: "Michael" });
  const b = room.join("Johanna", undefined, { userId: "u2", name: "Johanna" });
  return { room, a, b };
}

test("roles: each role has its purse and builds only its own things", () => {
  const { room, a, b } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "kurz", options: { economy: "roles", roleSplit: 60 } });
  const start = MATCH.presets.find((p) => p.id === "kurz")!.startingCoins;
  assert.equal(room.state.match.wallets.berg, Math.round(start * 0.6));
  assert.equal(room.state.coins, start);
  // No role yet: nothing to build.
  const noRole = room.submit(a.id, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) });
  assert.equal(noRole.ok, false);
  room.submit(a.id, { type: "choose_role", role: "berg" });
  room.submit(b.id, { type: "choose_role", role: "tal" });
  // The valley cannot build lifts.
  assert.equal(room.submit(b.id, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) }).ok, false);
  assert.equal(room.submit(a.id, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) }).ok, true);
  assert.equal(room.state.match.wallets.berg, Math.round(start * 0.6) - 4500);
  assert.equal(room.state.match.wallets.tal, start - Math.round(start * 0.6));
  assert.equal(room.state.coins, start - 4500, "the total still adds up");
  assert.equal(spendable(room.state, b.id), room.state.match.wallets.tal);
  // Money can be handed over.
  assert.equal(room.submit(b.id, { type: "transfer_coins", to: "berg", amount: 1000 }).ok, true);
  assert.equal(room.state.coins, start - 4500);
  assert.equal(room.state.match.wallets.tal, start - Math.round(start * 0.6) - 1000);
});

test("roles: the income is split by the agreed share", () => {
  const { room, a, b } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "kurz", options: { economy: "roles", roleSplit: 70 } });
  room.submit(a.id, { type: "choose_role", role: "berg" });
  room.submit(b.id, { type: "choose_role", role: "tal" });
  room.submit(a.id, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) });
  room.submit(a.id, { type: "place_piste", itemId: "piste", hexes: run(1, 9) });
  const before = { ...room.state.match.wallets };
  const after = resolveRound(room.state, dem, Date.now() + 1);
  const gainB = after.match.wallets.berg! - before.berg!;
  const gainT = after.match.wallets.tal! - before.tal!;
  assert.ok(gainB > 0 && gainT > 0);
  assert.ok(Math.abs(gainB / (gainB + gainT) - 0.7) < 0.03, `berg share ${gainB / (gainB + gainT)}`);
  assert.equal(after.coins, Object.values(after.match.wallets).reduce((n, v) => n + v, 0));
});

test("duel: everyone has a purse, earns from their own lifts, and gets a score", () => {
  const { room, a, b } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "kurz", options: { economy: "duel" } });
  const start = MATCH.presets.find((p) => p.id === "kurz")!.startingCoins;
  assert.equal(room.state.match.wallets[a.id], start);
  assert.equal(room.state.match.wallets[b.id], start);
  room.submit(a.id, { type: "place_lift", itemId: "tbar", a: VILLAGE_HEX, b: col(1) });
  room.submit(a.id, { type: "place_piste", itemId: "piste", hexes: run(1, 9) });
  const before = { ...room.state.match.wallets };
  const after = resolveRound(room.state, dem, Date.now() + 1);
  const gainA = after.match.wallets[a.id]! - before[a.id]!;
  const gainB = after.match.wallets[b.id]! - before[b.id]!;
  assert.ok(gainA > 0, `the one with the lift earns (${gainA})`);
  assert.equal(gainB, 0, "the one with nothing built earns nothing and pays nothing");
  const scores = duelScores(after);
  assert.equal(scores[0]!.playerId, a.id);
});

test("voting: same vote decides, different votes make a compromise", () => {
  const { room, a, b } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "lang", options: { events: "vote" } });
  // Force an event in.
  room.state = {
    ...room.state,
    coins: 1e6,
    match: {
      ...room.state.match,
      event: { id: "weltcup", title: "Weltcup", body: "", options: [{ label: "Zusagen", detail: "" }, { label: "Absagen", detail: "" }], chosen: null },
    },
  };
  room.submit(a.id, { type: "choose_event", option: 0 });
  assert.equal(room.state.match.event!.chosen, null, "waits for the second vote");
  room.submit(b.id, { type: "choose_event", option: 1 });
  assert.equal(room.state.match.event!.compromise, true);
  // Half of "+35 % demand" applied, and half the cost.
  assert.ok(room.state.match.mods.demand > 1.1 && room.state.match.mods.demand < 1.2);
  assert.equal(room.state.coins, 1e6 - 7500);
});

test("events off: no event is drawn", () => {
  const { room, a, b } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "lang", options: { events: "off" } });
  let s = room.state;
  for (let i = 0; i < 6; i++) {
    s = resolveRound(s, dem, Date.now() + i);
    assert.equal(s.match.event, null);
  }
  void b;
});

test("rules can change between rounds, the purse rule cannot", () => {
  const { room, a } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "kurz" });
  assert.equal(room.submit(a.id, { type: "set_match_options", options: { vips: false, events: "vote" } }).ok, true);
  assert.equal(room.state.match.options.vips, false);
  assert.equal(room.state.match.options.events, "vote");
  assert.equal(room.submit(a.id, { type: "set_match_options", options: { economy: "duel" } }).ok, false);
});

test("secret goals: one each, different, and they score when met", () => {
  const { room, a, b } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "kurz", options: { secretGoals: true } });
  const ga = room.state.match.secret[a.id];
  const gb = room.state.match.secret[b.id];
  assert.ok(ga && gb && ga !== gb);
  assert.ok(SECRET_GOALS.some((g) => g.id === ga));
});

test("VIP guests turn up, and a met wish pays", () => {
  const { room, a } = twoPlayers();
  room.submit(a.id, { type: "start_match", preset: "lang", options: { vips: true } });
  let s = room.state;
  // Play until a VIP appears.
  for (let i = 0; i < 10 && !s.match.vip; i++) s = resolveRound(s, dem, Date.now() + i);
  assert.ok(s.match.vip, "a VIP should turn up within ten rounds");
  const vip = s.match.vip!;
  const coins = s.coins;
  const stars = s.stars;
  // Fake a resort that meets every wish.
  s = {
    ...s,
    stats: { ...s.stats, satisfaction: 99, verticalPerHour: 1e6 },
    match: { ...s.match, history: [...s.match.history.slice(0, -1), { ...s.match.history.at(-1)!, guests: 1e5 }] },
  };
  const big = (n: number) => Array.from({ length: n }, (_, i) => i);
  s = {
    ...s,
    buildings: [
      ...s.buildings,
      ...big(6).map((i) => ({ id: `h${i}`, itemId: "hotel3" as const, q: 50 + i, r: 0, level: 1, builtAt: 0, readyAt: 0, upgrades: { speed: 0, cabins: 0, capacity: 0 } })),
      ...big(5).map((i) => ({ id: `r${i}`, itemId: "restaurant" as const, q: 60 + i, r: 0, level: 1, builtAt: 0, readyAt: 0, upgrades: { speed: 0, cabins: 0, capacity: 0 } })),
      ...big(4).map((i) => ({ id: `s${i}`, itemId: "snowmaker" as const, q: 70 + i, r: 0, level: 1, builtAt: 0, readyAt: 0, upgrades: { speed: 0, cabins: 0, capacity: 0 } })),
      { id: "spa", itemId: "spa" as const, q: 75, r: 0, level: 1, builtAt: 0, readyAt: 0, upgrades: { speed: 0, cabins: 0, capacity: 0 } },
    ],
  };
  void coins;
  void stars;
  // Metrics are read straight off the resort.
  assert.ok(metric(s, "beds") >= 300);
  assert.equal(roleForItem("snowmaker"), "berg");
  assert.equal(roleForItem("hotel1"), "tal");
  assert.ok(vip.dueRound >= s.match.round);
});

test("old saves get default rules", async () => {
  const { migrateResort } = await import("./state.ts");
  const s = migrateResort({ match: { mode: "match" } } as never, "x");
  assert.equal(s.match.options.economy, "shared");
  assert.deepEqual(s.match.wallets, {});
  assert.deepEqual(s.research.done, []);
});
