import { FLOW } from "../../../config/src/economy.ts";
import { isLift, isPiste, type ItemId } from "../../../config/src/ids.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { EVENTS, RULES, SECRET_GOALS, VIPS, type RuleCondition, type RuleMetric } from "../../../config/src/match.ts";
import type { FlowEdgeViz, PendingEvent, ResortState, RoundModifiers, TeamRole, VipRequest } from "../types.ts";

/**
 * The switchable match rules: separate purses (roles, duel), voting on
 * events, secret goals and VIP guests. Pure functions over the resort state;
 * the room decides when they run.
 */

// ---------------------------------------------------------------------------
// Purses
// ---------------------------------------------------------------------------

/** Whether money is held in separate purses rather than one shared account. */
export function walletMode(state: ResortState): boolean {
  const m = state.match;
  return m?.mode === "match" && (m.options?.economy === "roles" || m.options?.economy === "duel");
}

/** Which purse an actor spends from: their role in "roles", themselves in "duel". */
export function walletKey(state: ResortState, actorId: string | undefined): string | null {
  if (!walletMode(state) || !actorId) return null;
  if (state.match.options.economy === "roles") return state.match.roles[actorId] ?? null;
  return actorId;
}

/** What an actor can spend right now. */
export function spendable(state: ResortState, actorId?: string): number {
  if (!walletMode(state)) return state.coins;
  const key = walletKey(state, actorId);
  return key ? Math.max(0, state.match.wallets[key] ?? 0) : 0;
}

function withWallets(state: ResortState, wallets: Record<string, number>): ResortState {
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(wallets)) clean[k] = Math.max(0, Math.round(v));
  const coins = Object.values(clean).reduce((n, v) => n + v, 0);
  return { ...state, coins, match: { ...state.match, wallets: clean } };
}

/**
 * Book whatever an intent did to the account against the actor's purse.
 *
 * The intent handlers only ever touch `coins`; this keeps them unaware of
 * purses. A refund or a quest reward lands with whoever triggered it.
 */
export function settleActorCoins(before: ResortState, after: ResortState, actorId?: string): ResortState {
  if (!walletMode(after) || !walletMode(before)) return after;
  const delta = after.coins - before.coins;
  if (delta === 0) return after;
  const key = walletKey(after, actorId);
  // Nobody's purse (e.g. no role chosen yet): everyone's.
  if (!key) return creditAll({ ...after, coins: before.coins }, delta);
  const wallets = { ...after.match.wallets };
  wallets[key] = (before.match.wallets[key] ?? 0) + delta;
  return withWallets(after, wallets);
}

/** Money for everyone (bonuses, VIP rewards): split evenly between purses. */
export function creditAll(state: ResortState, amount: number): ResortState {
  if (!walletMode(state)) return { ...state, coins: Math.max(0, state.coins + amount) };
  const keys = Object.keys(state.match.wallets);
  if (keys.length === 0) return { ...state, coins: Math.max(0, state.coins + amount) };
  const wallets = { ...state.match.wallets };
  for (const k of keys) wallets[k] = (wallets[k] ?? 0) + amount / keys.length;
  return withWallets(state, wallets);
}

/** Purses a new duel player or a role starts with. */
export function openWallet(state: ResortState, key: string, amount: number): ResortState {
  if (key in state.match.wallets) return state;
  return withWallets(state, { ...state.match.wallets, [key]: amount });
}

/** In "roles": which role an item belongs to. */
export function roleForItem(itemId: ItemId): TeamRole {
  if ((RULES.bergItems as string[]).includes(itemId)) return "berg";
  const category = BY_ID[itemId]?.category ?? "buildings";
  return RULES.roleCategories.berg.includes(category) ? "berg" : "tal";
}

function ownerOf<T extends { builtBy?: string }>(e: T): string {
  return e.builtBy ?? "";
}

/**
 * One step of income, divided between the purses.
 *
 * Roles split the net by the agreed share. In a duel each player earns from
 * the guests their own lifts carried and the beds and seats they built, and
 * pays the upkeep of what they own — a lift nobody rides is a cost to its
 * builder alone.
 */
export function shareIncome(
  state: ResortState,
  step: { revenue: number; upkeep: number; flow: FlowEdgeViz[] },
): { state: ResortState; guestsByPlayer?: Record<string, number> } {
  if (!walletMode(state)) return { state };
  const net = step.revenue - step.upkeep;
  const options = state.match.options;
  if (options.economy === "roles") {
    const wallets = { ...state.match.wallets };
    if (!("berg" in wallets)) wallets.berg = 0;
    if (!("tal" in wallets)) wallets.tal = 0;
    wallets.berg! += (net * options.roleSplit) / 100;
    wallets.tal! += (net * (100 - options.roleSplit)) / 100;
    return { state: withWallets(state, wallets) };
  }

  // Duel.
  const players = Object.keys(state.match.wallets);
  if (players.length === 0) return { state };
  const share = (weights: Record<string, number>) => {
    const total = Object.values(weights).reduce((n, v) => n + v, 0);
    const out: Record<string, number> = {};
    for (const p of players) out[p] = total > 0 ? (weights[p] ?? 0) / total : 1 / players.length;
    return out;
  };
  const rides: Record<string, number> = {};
  for (const e of step.flow) {
    if (e.kind !== "lift") continue;
    const lift = state.lifts.find((l) => l.id === e.id);
    const who = lift ? ownerOf(lift) : "";
    if (who) rides[who] = (rides[who] ?? 0) + e.flow;
  }
  const hosting: Record<string, number> = {};
  for (const b of state.buildings) {
    if (isLift(b.itemId)) continue;
    const item = BY_ID[b.itemId];
    const weight = (item?.beds ?? 0) + (item?.seatsPerHour ?? 0) / 10 + (item?.retailPerHour ?? 0) / 20;
    if (weight > 0 && b.builtBy) hosting[b.builtBy] = (hosting[b.builtBy] ?? 0) + weight;
  }
  const upkeepBase: Record<string, number> = {};
  const addUpkeep = (who: string, v: number) => {
    if (who) upkeepBase[who] = (upkeepBase[who] ?? 0) + v;
  };
  for (const l of state.lifts) addUpkeep(ownerOf(l), BY_ID[l.itemId]?.upkeep ?? 0);
  for (const b of state.buildings) if (!isLift(b.itemId)) addUpkeep(ownerOf(b), BY_ID[b.itemId]?.upkeep ?? 0);
  for (const p of state.pistes) addUpkeep(ownerOf(p), (BY_ID[p.itemId]?.upkeep ?? 0) * Math.max(1, p.hexes.length - 1));
  const rideShare = share(rides);
  const hostShare = share(hosting);
  const hasHosting = Object.values(hosting).some((v) => v > 0);
  const upkeepShare = share(upkeepBase);
  const wallets = { ...state.match.wallets };
  const guestsByPlayer: Record<string, number> = {};
  for (const p of players) {
    // Food and beds earn their builder a share; without any, the lifts take it all.
    const revenueShare = hasHosting ? 0.7 * rideShare[p]! + 0.3 * hostShare[p]! : rideShare[p]!;
    wallets[p] = (wallets[p] ?? 0) + step.revenue * revenueShare - step.upkeep * upkeepShare[p]!;
    guestsByPlayer[p] = rideShare[p]!;
  }
  return { state: withWallets(state, wallets), guestsByPlayer };
}

// ---------------------------------------------------------------------------
// Reading the resort for goals and wishes
// ---------------------------------------------------------------------------

export function metric(state: ResortState, m: RuleMetric): number {
  const runs = state.pistes.filter((p) => p.difficulty !== "road");
  const count = (ids: string[]) => state.buildings.filter((b) => ids.includes(b.itemId)).length;
  switch (m) {
    case "blackRuns":
      return runs.filter((p) => p.difficulty === "black").length;
    case "redRuns":
      return runs.filter((p) => p.difficulty === "red").length;
    case "blueKm":
      return runs
        .filter((p) => p.difficulty === "blue")
        .reduce((n, p) => n + Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment, 0);
    case "pisteKm":
      return runs.reduce((n, p) => n + Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment, 0);
    case "lifts":
      return state.lifts.length;
    case "cableways":
      return state.lifts.filter((l) => (BY_ID[l.itemId]?.downhillShare ?? 0) > 0).length;
    case "beds":
      return state.buildings.reduce((n, b) => n + (isLift(b.itemId) ? 0 : (BY_ID[b.itemId]?.beds ?? 0)), 0);
    case "hotels3":
      return count(["hotel3", "hotel5", "hotel-resort"]);
    case "foodPlaces":
      return count(["restaurant", "hut", "apres", "gastro-hall"]);
    case "snowmakers":
      return count(["snowmaker"]);
    case "parks":
      return state.pistes.filter((p) => p.itemId === "snowpark" || p.difficulty === "park").length;
    case "satisfaction":
      return state.stats.satisfaction;
    case "cash":
      return state.coins;
    case "guestsLastRound":
      return state.match.history[state.match.history.length - 1]?.guests ?? 0;
    case "verticalPerHour":
      return state.stats.verticalPerHour;
    case "spa":
      return count(["spa"]);
  }
}

export function conditionsMet(state: ResortState, all: RuleCondition[]): boolean {
  return all.every((c) => metric(state, c.metric) >= c.target);
}

/** Progress towards a set of conditions, 0..1 (the weakest one counts). */
export function conditionsProgress(state: ResortState, all: RuleCondition[]): number {
  if (all.length === 0) return 1;
  return Math.min(...all.map((c) => Math.min(1, metric(state, c.metric) / Math.max(1e-9, c.target))));
}

function hash01(a: number, b: number, c: number): number {
  let h = (a * 2_654_435_761) ^ (b * 1_597_334_677) ^ (c * 3_812_015_801);
  h = Math.imul(h ^ (h >>> 15), 2_246_822_519);
  h = Math.imul(h ^ (h >>> 13), 3_266_489_917);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// ---------------------------------------------------------------------------
// Secret goals
// ---------------------------------------------------------------------------

/** Give every builder without one a secret goal, never two the same. */
export function ensureSecretGoals(state: ResortState, playerIds: string[]): ResortState {
  const m = state.match;
  if (m?.mode !== "match" || !m.options.secretGoals) return state;
  const secret = { ...m.secret };
  let changed = false;
  for (const p of playerIds) {
    if (secret[p]) continue;
    const taken = new Set(Object.values(secret));
    const free = SECRET_GOALS.filter((g) => !taken.has(g.id));
    const pool = free.length ? free : SECRET_GOALS;
    const pick = pool[Math.floor(hash01(Math.floor(m.startedAt / 1000) % 100_000, strHash(p) % 100_000, 7) * pool.length)]!;
    secret[p] = pick.id;
    changed = true;
  }
  return changed ? { ...state, match: { ...m, secret } } : state;
}

export function secretGoalResults(state: ResortState) {
  return Object.entries(state.match.secret ?? {}).map(([playerId, id]) => {
    const def = SECRET_GOALS.find((g) => g.id === id);
    return { playerId, def, met: def ? conditionsMet(state, def.all) : false };
  });
}

// ---------------------------------------------------------------------------
// VIP guests
// ---------------------------------------------------------------------------

/**
 * After a round: settle the open wish, then perhaps bring a new guest for the
 * next one. Returns what happened to the old one for the report.
 */
export function settleVip(
  state: ResortState,
  playedRound: number,
): { state: ResortState; settled: { name: string; status: "done" | "failed" } | null } {
  const m = state.match;
  let next = state;
  let settled: { name: string; status: "done" | "failed" } | null = null;
  const vip = m.vip;
  if (vip && vip.status === "open") {
    const def = VIPS.find((v) => v.id === vip.id);
    const met = def ? conditionsMet(state, def.all) : false;
    if (met || playedRound >= vip.dueRound) {
      const status: VipRequest["status"] = met ? "done" : "failed";
      settled = { name: vip.name, status };
      if (met) {
        next = creditAll(next, vip.rewardCoins);
        next = { ...next, stars: next.stars + vip.rewardStars };
      } else {
        next = { ...next, stars: Math.max(0, next.stars - RULES.vipMissStars) };
      }
      next = {
        ...next,
        match: { ...next.match, vip: null, vipHistory: [...next.match.vipHistory, { ...vip, status }].slice(-20) },
      };
    }
  }
  return { state: next, settled };
}

/** Maybe a new VIP for the round about to be planned. Deterministic per match. */
export function drawVip(state: ResortState, round: number): ResortState {
  const m = state.match;
  if (m.mode !== "match" || !m.options.vips || m.vip || m.phase !== "plan") return state;
  if (round <= 1 || round >= m.roundsTotal) return state;
  const seed = Math.floor(m.startedAt / 1000) % 100_000;
  if (hash01(seed, round, 11) > RULES.vipChance) return state;
  const seen = new Set(m.vipHistory.map((v) => v.id));
  const pool = VIPS.filter((v) => !seen.has(v.id));
  if (pool.length === 0) return state;
  const def = pool[Math.floor(hash01(seed, round, 12) * pool.length)]!;
  const vip: VipRequest = {
    id: def.id,
    name: def.name,
    wish: def.wish,
    dueRound: Math.min(m.roundsTotal, round + def.rounds - 1),
    rewardCoins: def.rewardCoins,
    rewardStars: def.rewardStars,
    status: "open",
  };
  return { ...state, match: { ...m, vip } };
}

// ---------------------------------------------------------------------------
// Events: who decides, and the compromise
// ---------------------------------------------------------------------------

/**
 * Apply event options with weights: [1, 0] is the first option, [0.5, 0.5]
 * the compromise when two players voted differently. Multipliers blend
 * geometrically so half of "+30 %" is about "+14 %", not "+15 %" of something
 * else; closures only happen at full strength.
 */
export function applyEventWeights(state: ResortState, weights: number[], decidedBy: string, compromise = false): ResortState {
  const m = state.match;
  const pending = m.event;
  if (!pending || pending.chosen !== null) return state;
  const def = EVENTS.find((e) => e.id === pending.id);
  let mods: RoundModifiers = { ...m.mods, closed: [...m.mods.closed] };
  let perks: RoundModifiers = { ...m.perks, closed: [...m.perks.closed] };
  let coins = 0;
  let stars = 0;
  weights.forEach((w, i) => {
    if (w <= 0) return;
    const effect = def?.options[i]?.effect ?? {};
    const target = effect.lasting ? perks : mods;
    target.demand *= Math.pow(effect.demand ?? 1, w);
    target.snow += (effect.snow ?? 0) * w;
    target.wait *= Math.pow(effect.wait ?? 1, w);
    target.upkeep *= Math.pow(effect.upkeep ?? 1, w);
    target.ticket *= Math.pow(effect.ticket ?? 1, w);
    if (w >= 1) target.closed = [...target.closed, ...(effect.closed ?? [])];
    coins += (effect.coins ?? 0) * w;
    stars += Math.floor((effect.stars ?? 0) * w);
    if (effect.lasting) perks = target;
    else mods = target;
  });
  const chosen = weights.findIndex((w) => w >= 1);
  let next: ResortState = {
    ...state,
    stars: state.stars + stars,
    match: {
      ...m,
      mods,
      perks,
      event: {
        ...pending,
        chosen: chosen >= 0 ? chosen : 0,
        chosenBy: decidedBy,
        ...(compromise ? { compromise: true } : {}),
      },
    },
  };
  // A single decider pays from their purse (settled by the caller); a vote
  // or a default is everyone's.
  next = decidedBy && !compromise ? { ...next, coins: Math.max(0, next.coins + coins) } : creditAll(next, coins);
  return next;
}

/**
 * With voting on: decide once everyone online has voted. Same vote: that
 * option. Different votes: the compromise. Returns null while votes are
 * missing.
 */
export function decideVotes(state: ResortState, onlineIds: string[]): ResortState | null {
  const m = state.match;
  const event = m.event;
  if (!event || event.chosen !== null || m.options.events !== "vote") return null;
  const votes = event.votes ?? {};
  if (onlineIds.length === 0 || !onlineIds.every((id) => id in votes)) return null;
  return settleVotes(state);
}

/** Settle whatever votes there are (also at round end, when someone never voted). */
export function settleVotes(state: ResortState): ResortState {
  const event = state.match.event;
  if (!event || event.chosen !== null) return state;
  const values = Object.values(event.votes ?? {});
  if (values.length === 0) return applyEventWeights(state, [0, 1], "");
  const unique = [...new Set(values)];
  if (unique.length === 1) {
    const w = [0, 0];
    w[unique[0]!] = 1;
    return applyEventWeights(state, w, "");
  }
  return applyEventWeights(state, [0.5, 0.5], "", true);
}

export function recordVote(event: PendingEvent, actorId: string, option: number): PendingEvent {
  return { ...event, votes: { ...(event.votes ?? {}), [actorId]: option } };
}

/** Whether an item may be built by this actor under "roles". */
export function roleAllows(state: ResortState, actorId: string | undefined, itemId: ItemId): { ok: true } | { ok: false; reason: string } {
  const m = state.match;
  if (m?.mode !== "match" || m.options.economy !== "roles") return { ok: true };
  const role = actorId ? m.roles[actorId] : undefined;
  if (!role) return { ok: false, reason: "Wähle zuerst deine Rolle: Berg oder Tal" };
  const needed = roleForItem(itemId);
  if (needed !== role) {
    return { ok: false, reason: needed === "berg" ? "Das baut, wer den Berg führt" : "Das baut, wer das Tal führt" };
  }
  return { ok: true };
}

/** Pistes and lifts belong to the mountain; used where only the item kind is known. */
export function isMountainItem(itemId: ItemId): boolean {
  return isLift(itemId) || isPiste(itemId) || (RULES.bergItems as string[]).includes(itemId);
}
