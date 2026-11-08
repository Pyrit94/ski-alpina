import { neighbourCut } from "./neighbours.ts";
import { ECONOMY, FLOW, PISTE_LEVELS, PISTE_SCORE } from "../../../config/src/economy.ts";
import { RESEARCH } from "../../../config/src/research.ts";
import { isLift } from "../../../config/src/ids.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexDistance, hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { FlowEdgeViz, PlacedPiste, ResortState, RoundModifiers, SimStats } from "../types.ts";
import { buildResortGraph, pisteUse, type DemandSource } from "./graph.ts";
import { pisteUpkeep } from "./level.ts";
import { pisteWidthDraw } from "./piste-width.ts";
import { pisteSnowScale, seasonDemandShare, snowLine } from "./season.ts";
import { liftResearchFactor, researchEffects, withResearchMods } from "./research.ts";
import { bedsFactor, bonusFactor, capacityFactor, cutFactor, pisteLevel, pisteUpkeepFactor, upkeepFactor } from "./state.ts";
import { siteContext, siteFactors } from "./site.ts";
import { pistePoints } from "./piste-score.ts";

export interface FlowTick {
  stats: SimStats;
  coinsDelta: number;
  flow: FlowEdgeViz[];
}

function hourFactor(t: number): number {
  const hour = t * 24;
  if (hour < 8 || hour > 17) return 0.18;
  if (hour >= 10 && hour <= 14) return 1;
  return 0.62;
}

/**
 * One hour of resort operation.
 *
 * Demand is offered at the places guests actually arrive — the village, each
 * car park, each bus station, each hotel — and then routed over the transport
 * graph by max-flow. What the resort earns is therefore what its layout can
 * physically carry: a lift joined to nothing carries nobody and earns nothing,
 * however much capacity it has on paper.
 */
export function tickFlow(state: ResortState, dem: Dem, dtHours: number, now: number): FlowTick {
  const readyLifts = state.lifts.filter((l) => l.readyAt <= now);
  const readyPistes = state.pistes.filter((p) => p.readyAt <= now);
  const buildings = state.buildings.filter((b) => b.readyAt <= now);

  // Where each building stands (see SITE): a hut on the run serves more than
  // one in the woods. 1 for everything the location does not matter to.
  const site = siteFactors(siteContext(state, dem, now));
  const at = (b: { id: string }) => site.get(b.id) ?? 1;
  // An expanded building counts as more of itself: a level-3 ticket office
  // is two ticket offices' worth (see BUILDING_LEVELS).
  const count = (id: string) => buildings.filter((b) => b.itemId === id).reduce((n, b) => n + bonusFactor(b) * at(b), 0);
  // For services where one is enough, the best one on site sets the effect.
  const best = (id: string) => buildings.filter((b) => b.itemId === id).reduce((n, b) => Math.max(n, bonusFactor(b) * at(b)), 0);
  const beds = buildings.reduce((n, b) => n + (BY_ID[b.itemId].beds ?? 0) * bedsFactor(b), 0);
  // The room rate follows the location; the bed count does not.
  const bedValue = buildings.reduce((n, b) => n + (BY_ID[b.itemId].beds ?? 0) * bedsFactor(b) * at(b), 0);
  const school = best("skischool");
  const clinic = best("clinic");
  const lights = best("lights");
  const snowmakers = count("snowmaker");
  const groomers = best("groomer");
  const tickets = count("ticket");
  // Read off the items rather than off their type, so a bigger restaurant is
  // simply a bigger number and not another branch here.
  const sum = (field: "seatsPerHour" | "retailPerHour" | "satisfactionBonus" | "summerDraw") =>
    buildings.reduce(
      (n, b) =>
        n +
        (BY_ID[b.itemId][field] ?? 0) *
          (field === "seatsPerHour" || field === "retailPerHour" ? capacityFactor(b) * at(b) : bonusFactor(b)),
      0,
    );
  const seats = sum("seatsPerHour");
  const retailCapacity = sum("retailPerHour");
  const comfort = sum("satisfactionBonus");
  const summerDraw = sum("summerDraw");

  const fx = researchEffects(state);
  const mods = withResearchMods(activeModifiers(state), fx);
  const snowQuality = Math.max(0, Math.min(1, state.weather.snowQuality + mods.snow));

  // Where the snow actually ends today, snowmaking included.
  const line = snowLine(state.day, snowQuality, snowmakers, fx.snowmakerDrop);
  // Snow guns along a run let it count higher against the snow line.
  const snowLift = (piste: Pick<PlacedPiste, "difficulty" | "level">) =>
    pisteLevel(piste) >= 2 ? PISTE_LEVELS.snowmakingMetres : 0;
  const snowAt = (piste: PlacedPiste) => {
    if (mods.closed.includes(piste.difficulty)) return 0;
    const ends = [piste.hexes[0]!, piste.hexes[piste.hexes.length - 1]!];
    const bottom = Math.min(...ends.map((h) => worldElev(dem, h.q, h.r)));
    return pisteSnowScale(bottom + snowLift(piste), line);
  };

  // What the mountain is worth to a skier: open kilometres, weighted by how
  // interesting they are, plus how many kinds of run there are to choose from.
  let weightedKm = 0;
  const gradesOpen = new Set<string>();
  for (const p of readyPistes) {
    if (p.difficulty === "road") continue;
    const snow = snowAt(p);
    if (snow <= 0) continue;
    const km =
      p.difficulty === "park"
        ? ECONOMY.parkKmEquivalent
        : Math.max(1, p.hexes.length - 1) * FLOW.kmPerSegment;
    weightedKm +=
      km *
      (ECONOMY.gradeDraw[p.difficulty] ?? 1) *
      snow *
      pisteWidthDraw(p) *
      (PISTE_LEVELS.draw[pisteLevel(p) - 1] ?? 1) *
      // A run that is good to ski draws a few more (see PISTE_SCORE).
      (1 + PISTE_SCORE.drawPerPoint * pistePoints(p));
    gradesOpen.add(p.difficulty);
  }
  const varietyDraw = 1 + ECONOMY.varietyDemandStep * Math.max(0, gradesOpen.size - 1);
  const comfortDraw = 1 + Math.min(ECONOMY.comfortDemandCap, comfort * ECONOMY.comfortDemandPerPoint);
  const prestige = 1 + Math.min(ECONOMY.prestigeCap, state.stars * ECONOMY.prestigePerStar);

  // When it is worth coming at all: time of day, weather, and the price.
  const nightLights = lights > 0 && (state.timeOfDay < 0.3 || state.timeOfDay > 0.7);
  let appetite =
    hourFactor(state.timeOfDay) * (nightLights ? 1 + ECONOMY.lightsDayExtension * lights * fx.lightsFactor : 1);
  appetite *= 0.72 + snowQuality * 0.4;
  // Willingness to pay: 1 at the reference price, falling away either side of
  // it steeply enough that revenue peaks at an interior price.
  appetite *=
    2 / (1 + Math.pow(state.ticketPrice / ECONOMY.ticketReference, ECONOMY.priceElasticity));
  // Reputation from last tick. Queues today cost guests tomorrow.
  const reputation = Math.max(0, Math.min(1, state.stats.satisfaction / 100));
  const floor = Math.min(RESEARCH.maxReputationFloor, ECONOMY.reputationFloor + fx.reputationFloor);
  appetite *= floor + (1 - floor) * reputation;
  appetite *= mods.demand;
  const opening = openingBoost(state);
  appetite *= opening;
  appetite = Math.max(0, appetite);

  // Skiers come for the snow; once it is gone, only cableways that run both
  // ways, viewpoints, the spa and the museum still bring anyone up.
  const inSeason = seasonDemandShare(state.day);
  const cableways = readyLifts.filter((l) => (BY_ID[l.itemId].downhillShare ?? 0) > 0).length;
  const sightseers =
    (1 - inSeason) *
    (Math.min(3, cableways) * ECONOMY.sightseersPerCableway + summerDraw * ECONOMY.summerDrawScale);
  // The neighbour areas take their share of the region's guests (see NEIGHBOURS).
  const neighbourShare = neighbourCut(state, weightedKm);
  const market =
    (ECONOMY.demandPerKm * weightedKm * varietyDraw * comfortDraw * prestige + sightseers) * appetite * (1 - neighbourShare);

  // The doors guests come in through. Demand beyond them is turned away.
  const arrivals: { hex: Axial; perHour: number; id?: string }[] = [
    { hex: dem.region.villageHex, perHour: ECONOMY.villageArrivalsPerHour },
  ];
  const exits: Axial[] = [];
  for (const b of buildings) {
    const item = BY_ID[b.itemId];
    const hex = { q: b.q, r: b.r };
    let perHour = 0;
    if (b.itemId === "parking") perHour = ECONOMY.parkingArrivalsPerHour * capacityFactor(b);
    else if (b.itemId === "bus") perHour = ECONOMY.busArrivalsPerHour * capacityFactor(b);
    else if (b.itemId === "train") perHour = ECONOMY.trainArrivalsPerHour * capacityFactor(b);
    else if (item.beds) perHour = item.beds * bedsFactor(b) * ECONOMY.bedArrivalsPerHour;
    if (perHour <= 0) continue;
    arrivals.push({ hex, perHour, id: b.id });
    exits.push(hex);
  }
  const doorCapacity = arrivals.reduce((n, a) => n + a.perHour, 0);
  const admitted = Math.min(market, doorCapacity);
  const turnedAway = Math.max(0, market - admitted);
  // A car park or hotel next to a lift sends its guests straight there;
  // anything farther out shuttles them into the village. Otherwise a door in
  // the wrong spot would swallow its share of the crowd without a trace.
  const ports: Axial[] = [
    ...readyLifts.flatMap((l) => [l.a, l.b]),
    ...readyPistes.flatMap((p) => [p.hexes[0]!, p.hexes[p.hexes.length - 1]!]),
  ];
  const linked = (hex: Axial) => ports.some((p) => hexDistance(p, hex) <= FLOW.linkRadius);
  const demands: DemandSource[] = arrivals.map((a) => ({
    hex: linked(a.hex) ? a.hex : dem.region.villageHex,
    perHour: doorCapacity > 0 ? (admitted * a.perHour) / doorCapacity : 0,
  }));

  const graph = buildResortGraph({
    lifts: readyLifts,
    pistes: readyPistes,
    demands,
    exits,
    dem,
    pisteCapacityScale: (piste, ends) => {
      // Snow first: a run standing on bare ground carries nobody, whatever
      // else is built next to it.
      if (mods.closed.includes(piste.difficulty)) return 0;
      let scale = pisteSnowScale(worldElev(dem, ends.bottom.q, ends.bottom.r) + snowLift(piste), line);
      if (scale <= 0) return 0;
      if (piste.difficulty === "blue" && school > 0) scale *= 1 + ECONOMY.schoolBonus * school + fx.schoolBonus;
      if (piste.difficulty === "black" && clinic > 0) scale *= 1 + ECONOMY.clinicBlackBonus * clinic + fx.clinicBonus;
      return scale * fx.pisteCapacity * (PISTE_LEVELS.capacity[pisteLevel(piste) - 1] ?? 1);
    },
    liftCapacityScale: (lift) => liftResearchFactor(fx, lift.itemId),
  });

  // Skiing first, cabins only for what is left over.
  const skiedDown = graph.net.maxFlow(graph.source, graph.sink);
  graph.openDescents();
  const served = skiedDown + graph.net.maxFlow(graph.source, graph.sink);
  const unserved = Math.max(0, graph.offered - served);

  // A lift with a middle station is as busy as its busier half.
  const riders = (l: (typeof graph.lifts)[number]) =>
    Math.max(graph.net.flowOn(l.uphill), l.upper !== undefined ? graph.net.flowOn(l.upper) : 0);
  const liftFlow = graph.lifts.map((l) => ({ edge: l, used: riders(l) }));
  const pisteFlow = graph.pistes.map((p) => ({ edge: p, used: pisteUse(graph.net, p) }));
  // Then the laps guests ride on top. They show where people actually are —
  // a lift fed by another lift's run is busy, not idle — but takings, queues
  // and the bottleneck stay with the guests who came in.
  graph.addLaps(Math.round(served * FLOW.lapShare));
  const liftShown = graph.lifts.map((l) => riders(l));
  const pisteShown = graph.pistes.map((p) => pisteUse(graph.net, p));

  const flow: FlowEdgeViz[] = [
    ...liftFlow.map(({ edge }, i) => ({
      id: edge.lift.id,
      kind: "lift" as const,
      from: edge.base,
      to: edge.top,
      flow: Math.round(liftShown[i]!),
      capacity: edge.capacity,
      link: edge.link,
    })),
    ...pisteFlow.map(({ edge }, i) => ({
      id: edge.piste.id,
      kind: "piste" as const,
      from: edge.top,
      to: edge.bottom,
      flow: Math.round(pisteShown[i]!),
      capacity: edge.capacity,
      path: edge.piste.hexes,
      link: edge.link,
    })),
  ];

  // The busiest edge is what the player should widen next, so name it.
  let bottleneckUse = 0;
  let bottleneckLabel = "";
  let bottleneckId = "";
  for (const { edge, used } of liftFlow) {
    const use = edge.capacity > 0 ? used / edge.capacity : 0;
    if (use <= bottleneckUse) continue;
    bottleneckUse = use;
    bottleneckLabel = BY_ID[edge.lift.itemId].name;
    bottleneckId = edge.lift.id;
  }
  for (const { edge, used } of pisteFlow) {
    const use = edge.capacity > 0 ? used / edge.capacity : 0;
    if (use <= bottleneckUse) continue;
    bottleneckUse = use;
    bottleneckLabel = BY_ID[edge.piste.itemId].name;
    bottleneckId = edge.piste.id;
  }
  const saturated = bottleneckUse >= FLOW.bottleneckThreshold;

  const liftCapacity = graph.lifts.reduce((n, l) => n + l.capacity, 0);
  const verticalPerHour = liftFlow.reduce((n, { edge, used }) => n + used * Math.max(0, edge.rise), 0);
  const idleLifts = liftShown.filter((used) => used <= 0).length;
  const idlePistes = pisteShown.filter((used) => used <= 0).length;

  // Queueing comes from either a saturated edge or demand with nowhere to go.
  // With no lift running there is nothing to queue at: an empty valley is not
  // a half-hour wait, it is simply not a resort yet.
  const overflow = graph.offered > 0 ? unserved / graph.offered : 0;
  const congestion =
    graph.lifts.length === 0 ? 0 : Math.min(1, Math.max(bottleneckUse, overflow));
  const wait = Math.min(
    FLOW.maxWaitMinutes,
    (FLOW.baseWaitMinutes + congestion * FLOW.saturationWaitMinutes) *
      (groomers > 0 ? 1 - Math.min(0.5, ECONOMY.groomerWaitCut * groomers) : 1) *
      mods.wait,
  );

  const pisteKm = graph.pistes.reduce((n, p) => n + p.km, 0);
  // Only runs guests actually ski count as variety: a black run joined to
  // nothing, or one buried under the snow line, offers nobody anything.
  const variety = new Set(
    pisteFlow
      .filter(({ edge, used }) => used > 0 && edge.capacity > 0 && edge.piste.difficulty !== "road")
      .map(({ edge }) => edge.piste.difficulty),
  ).size;
  let sat: number = ECONOMY.targetSatisfaction;
  sat += variety * ECONOMY.varietyBonus;
  sat -= wait * ECONOMY.waitPenaltyPerMinute;
  sat +=
    Math.min(1, snowQuality + snowmakers * ECONOMY.snowmakerQuality) *
    ECONOMY.snowSatisfactionWeight;
  sat += comfort + fx.satisfaction;
  // Guests who came to ski and only got a cabin ride down are not satisfied
  // guests, however smoothly the network moved them.
  const onPistes = pisteFlow.reduce((n, { used }) => n + used, 0);
  const skiedShare = served > 0 ? Math.min(1, onPistes / served) : 1;
  sat -= (1 - skiedShare) * inSeason * ECONOMY.noSkiingPenalty;
  sat -=
    Math.max(0, state.ticketPrice - ECONOMY.ticketReference) * ECONOMY.pricePenaltyPerFranc;
  // Full car parks are remembered too, if less sharply than a queue.
  if (market > 0) sat -= Math.min(8, (turnedAway / market) * 10);
  sat = Math.max(ECONOMY.minSatisfaction, Math.min(ECONOMY.maxSatisfaction, sat));

  // Food and retail are capacity businesses: an unbuilt restaurant sells nothing
  // and one hut cannot feed a whole mountain.
  // The network counts rides; a ticket is bought once per guest.
  const guests = served / ECONOMY.ridesPerGuest;
  // Beds fill from everyone who wanted to come, not only those who got in.
  const occupancy =
    beds <= 0 ? 0 : Math.min(1, ((market / ECONOMY.ridesPerGuest) * ECONOMY.overnightShare) / beds);
  const ticketIncome =
    guests * state.ticketPrice * (1 + tickets * ECONOMY.ticketOfficeIncomeBonus) * mods.ticket;
  const hotelIncome = bedValue * occupancy * ECONOMY.hotelRatePerBed;
  const fb = Math.min(guests, seats) * ECONOMY.fbPerGuest;
  const retail = Math.min(guests, retailCapacity) * ECONOMY.shopPerGuest;
  const revenue = ticketIncome + hotelIncome + fb + retail;

  // Upkeep runs whether or not anyone shows up, which is what makes an
  // over-built resort a mistake rather than merely a slow start. A workshop
  // maintains the cableways, so it only discounts the lifts.
  // Only the best maintenance depot on the mountain counts; two workshops do
  // not halve the bill twice over.
  const bestCut = Math.min(
    RESEARCH.maxUpkeepCut,
    buildings.reduce((n, b) => Math.max(n, (BY_ID[b.itemId].upkeepCut ?? 0) * cutFactor(b)), 0) + fx.upkeepCut,
  );
  const liftUpkeep = readyLifts.reduce((n, l) => n + (BY_ID[l.itemId].upkeep ?? 0), 0) * (1 - bestCut);
  // Placing a lift also records its two stations in `buildings`, so charging
  // every building would bill each cableway three times over.
  const buildingUpkeep = buildings
    .filter((b) => !isLift(b.itemId))
    .reduce((n, b) => n + (BY_ID[b.itemId].upkeep ?? 0) * upkeepFactor(b), 0);
  // Grooming a steep run costs more than a gentle one, so upkeep follows the
  // grade the ground gave it rather than one catalogue number.
  const runUpkeep = readyPistes.reduce((n, p) => n + pisteUpkeep(p) * pisteUpkeepFactor(p), 0);
  const upkeepPerHour = (liftUpkeep + buildingUpkeep + runUpkeep) * mods.upkeep;
  const incomePerHour = revenue - upkeepPerHour;

  const stats: SimStats = {
    peoplePerHour: Math.round(served),
    satisfaction: Math.round(sat),
    incomePerHour: Math.round(incomePerHour),
    revenuePerHour: Math.round(revenue),
    upkeepPerHour: Math.round(upkeepPerHour),
    visitorsToday: state.stats.visitorsToday + guests * dtHours,
    visitorsTotal: state.stats.visitorsTotal + guests * dtHours,
    occupancy,
    waitMinutes: Math.round(wait * 10) / 10,
    pisteKm: Math.round(pisteKm * 10) / 10,
    beds,
    liftCapacity,
    queued: Math.round(unserved),
    demandPerHour: Math.round(graph.offered),
    idleLifts,
    idlePistes,
    verticalPerHour: Math.round(verticalPerHour),
    bottleneckLabel: saturated ? bottleneckLabel : "",
    bottleneckId: saturated ? bottleneckId : "",
    bottleneckUse: Math.round(bottleneckUse * 100) / 100,
    snowLineM: Math.round(line),
    closedPistes: graph.pistes.filter((p) => p.capacity <= 0).length,
    turnedAway: Math.round(turnedAway),
    marketPerHour: Math.round(market),
    neighbourCut: neighbourShare,
    guestsPerHour: Math.round(guests),
    openingBoost: Math.round(opening * 100) / 100,
  };

  // What each building does for the resort, for its info panel: arrivals
  // through a door, guests a restaurant or shop serves, a ticket office's
  // extra takings. Without this they all read "—".
  const doorUse = doorCapacity > 0 ? admitted / doorCapacity : 0;
  const servedBy = (field: "seatsPerHour" | "retailPerHour", total: number) =>
    buildings
      .filter((b) => (BY_ID[b.itemId][field] ?? 0) > 0)
      .map((b) => {
        const cap = (BY_ID[b.itemId][field] ?? 0) * capacityFactor(b) * at(b);
        return {
          id: b.id,
          kind: "building" as const,
          unit: "served" as const,
          from: { q: b.q, r: b.r },
          to: { q: b.q, r: b.r },
          flow: total > 0 ? Math.round((Math.min(guests, total) * cap) / total) : 0,
          capacity: cap,
        };
      });
  flow.push(
    ...arrivals
      .filter((a) => a.id)
      .map((a) => ({
        id: a.id!,
        kind: "building" as const,
        unit: "arrivals" as const,
        from: a.hex,
        to: a.hex,
        flow: Math.round(a.perHour * doorUse),
        capacity: Math.round(a.perHour),
      })),
    ...servedBy("seatsPerHour", seats),
    ...servedBy("retailPerHour", retailCapacity),
    ...buildings
      .filter((b) => b.itemId === "ticket")
      .map((b) => ({
        id: b.id,
        kind: "building" as const,
        unit: "chf" as const,
        from: { q: b.q, r: b.r },
        to: { q: b.q, r: b.r },
        flow: Math.round(guests * state.ticketPrice * ECONOMY.ticketOfficeIncomeBonus * bonusFactor(b) * at(b) * mods.ticket),
        capacity: 0,
      })),
  );

  return { stats, coinsDelta: incomePerHour * dtHours, flow };
}

/** The opening-season demand multiplier (see ECONOMY.openingDays). */
export function openingBoost(state: Pick<ResortState, "season" | "day">): number {
  if (state.season !== 1 || state.day > ECONOMY.openingDays) return 1;
  const left = 1 - (state.day - 1) / ECONOMY.openingDays;
  return 1 + (ECONOMY.openingDemand - 1) * Math.max(0, left);
}

export const NEUTRAL_MODS: RoundModifiers = {
  demand: 1,
  snow: 0,
  wait: 1,
  upkeep: 1,
  ticket: 1,
  closed: [],
};

/** This round's event effects combined with the match's lasting perks. */
export function activeModifiers(state: ResortState): RoundModifiers {
  const match = state.match;
  if (!match || match.mode !== "match") return NEUTRAL_MODS;
  const a = match.mods ?? NEUTRAL_MODS;
  const b = match.perks ?? NEUTRAL_MODS;
  return {
    demand: a.demand * b.demand,
    snow: a.snow + b.snow,
    wait: a.wait * b.wait,
    upkeep: a.upkeep * b.upkeep,
    ticket: a.ticket * b.ticket,
    closed: [...a.closed, ...b.closed],
  };
}

export function nearestStation(state: ResortState, q: number, r: number, max = 2): string | null {
  let best: { id: string; d: number } | null = null;
  for (const l of state.lifts) {
    for (const p of [l.a, l.b]) {
      const d = hexDistance(p, { q, r });
      if (d <= max && (!best || d < best.d)) best = { id: l.id, d };
    }
  }
  return best?.id ?? null;
}

export function worldElev(dem: Dem, q: number, r: number): number {
  const w = hexToWorld(q, r);
  return dem.sample(w.x, w.z);
}
