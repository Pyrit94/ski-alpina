import { ECONOMY, FLOW } from "../../../config/src/economy.ts";
import { isLift } from "../../../config/src/ids.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexDistance, hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { FlowEdgeViz, ResortState, SimStats } from "../types.ts";
import { buildResortGraph, VILLAGE_HEX, type DemandSource } from "./graph.ts";
import { pisteUpkeep } from "./level.ts";
import { pisteSnowScale, seasonDemandShare, snowLine } from "./season.ts";

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

  const count = (id: string) => buildings.filter((b) => b.itemId === id).length;
  const beds = buildings.reduce((n, b) => n + (BY_ID[b.itemId].beds ?? 0), 0);
  const hasSchool = count("skischool") > 0;
  const hasClinic = count("clinic") > 0;
  const hasLights = count("lights") > 0;
  const snowmakers = count("snowmaker");
  const groomers = count("groomer");
  const tickets = count("ticket");
  // Read off the items rather than off their type, so a bigger restaurant is
  // simply a bigger number and not another branch here.
  const sum = (field: "seatsPerHour" | "retailPerHour" | "satisfactionBonus" | "summerDraw") =>
    buildings.reduce((n, b) => n + (BY_ID[b.itemId][field] ?? 0), 0);
  const seats = sum("seatsPerHour");
  const retailCapacity = sum("retailPerHour");
  const comfort = sum("satisfactionBonus");
  const summerDraw = sum("summerDraw");

  // Everything that scales demand up or down applies to every arrival point.
  const nightLights = hasLights && (state.timeOfDay < 0.3 || state.timeOfDay > 0.7);
  let appetite = hourFactor(state.timeOfDay) * (nightLights ? 1 + ECONOMY.lightsDayExtension : 1);
  appetite *= 0.72 + state.weather.snowQuality * 0.4;
  // Nobody comes to ski a green mountain; sightseeing keeps a fraction, and a
  // museum or a spa claws some of the rest back.
  const inSeason = seasonDemandShare(state.day);
  appetite *= Math.min(1, inSeason + summerDraw * (1 - inSeason));
  // Willingness to pay: 1 at the reference price, falling away either side of
  // it steeply enough that revenue peaks at an interior price.
  appetite *=
    2 / (1 + Math.pow(state.ticketPrice / ECONOMY.ticketReference, ECONOMY.priceElasticity));
  // Reputation from last tick. Queues today cost guests tomorrow.
  const reputation = Math.max(0, Math.min(1, state.stats.satisfaction / 100));
  appetite *= ECONOMY.reputationFloor + (1 - ECONOMY.reputationFloor) * reputation;
  appetite = Math.max(0, appetite);

  // Where the snow actually ends today, snowmaking included.
  const line = snowLine(state.day, state.weather.snowQuality, snowmakers);

  const demands: DemandSource[] = [
    { hex: VILLAGE_HEX, perHour: ECONOMY.walkInPerHour * appetite },
  ];
  const exits: Axial[] = [];
  for (const b of buildings) {
    const item = BY_ID[b.itemId];
    const hex = { q: b.q, r: b.r };
    if (b.itemId === "parking") {
      demands.push({ hex, perHour: ECONOMY.parkingDemandPerHour * appetite });
      exits.push(hex);
    } else if (b.itemId === "bus") {
      demands.push({ hex, perHour: ECONOMY.busDemandPerHour * appetite });
      exits.push(hex);
    } else if (item.beds) {
      demands.push({ hex, perHour: item.beds * ECONOMY.bedOvernightShare * appetite });
      exits.push(hex);
    }
  }

  const graph = buildResortGraph({
    lifts: readyLifts,
    pistes: readyPistes,
    demands,
    exits,
    dem,
    pisteCapacityScale: (piste, ends) => {
      // Snow first: a run standing on bare ground carries nobody, whatever
      // else is built next to it.
      let scale = pisteSnowScale(worldElev(dem, ends.bottom.q, ends.bottom.r), line);
      if (scale <= 0) return 0;
      if (piste.difficulty === "blue" && hasSchool) scale *= 1 + ECONOMY.schoolBonus;
      if (piste.difficulty === "black" && hasClinic) scale *= 1 + ECONOMY.clinicBlackBonus;
      return scale;
    },
  });

  // Skiing first, cabins only for what is left over.
  const skiedDown = graph.net.maxFlow(graph.source, graph.sink);
  graph.openDescents();
  const served = skiedDown + graph.net.maxFlow(graph.source, graph.sink);
  const unserved = Math.max(0, graph.offered - served);

  const liftFlow = graph.lifts.map((l) => ({ edge: l, used: graph.net.flowOn(l.uphill) }));
  const pisteFlow = graph.pistes.map((p) => ({ edge: p, used: graph.net.flowOn(p.edge) }));

  const flow: FlowEdgeViz[] = [
    ...liftFlow.map(({ edge, used }) => ({
      id: edge.lift.id,
      kind: "lift" as const,
      from: edge.base,
      to: edge.top,
      flow: used,
      capacity: edge.capacity,
    })),
    ...pisteFlow.map(({ edge, used }) => ({
      id: edge.piste.id,
      kind: "piste" as const,
      from: edge.top,
      to: edge.bottom,
      flow: used,
      capacity: edge.capacity,
      path: edge.piste.hexes,
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
  const idleLifts = liftFlow.filter(({ used }) => used <= 0).length;
  const idlePistes = pisteFlow.filter(({ used }) => used <= 0).length;

  // Queueing comes from either a saturated edge or demand with nowhere to go.
  // With no lift running there is nothing to queue at: an empty valley is not
  // a half-hour wait, it is simply not a resort yet.
  const overflow = graph.offered > 0 ? unserved / graph.offered : 0;
  const congestion =
    graph.lifts.length === 0 ? 0 : Math.min(1, Math.max(bottleneckUse, overflow));
  const wait = Math.min(
    FLOW.maxWaitMinutes,
    (FLOW.baseWaitMinutes + congestion * FLOW.saturationWaitMinutes) *
      (groomers > 0 ? 1 - ECONOMY.groomerWaitCut : 1),
  );

  const pisteKm = graph.pistes.reduce((n, p) => n + p.km, 0);
  const variety = new Set(graph.pistes.map((p) => p.piste.difficulty)).size;
  let sat: number = ECONOMY.targetSatisfaction;
  sat += variety * ECONOMY.varietyBonus;
  sat -= wait * ECONOMY.waitPenaltyPerMinute;
  sat +=
    Math.min(1, state.weather.snowQuality + snowmakers * ECONOMY.snowmakerQuality) *
    ECONOMY.snowSatisfactionWeight;
  sat += comfort;
  // Guests who came to ski and only got a cabin ride down are not satisfied
  // guests, however smoothly the network moved them.
  const onPistes = pisteFlow.reduce((n, { used }) => n + used, 0);
  const skiedShare = served > 0 ? Math.min(1, onPistes / served) : 1;
  sat -= (1 - skiedShare) * inSeason * ECONOMY.noSkiingPenalty;
  sat -=
    Math.max(0, state.ticketPrice - ECONOMY.ticketReference) * ECONOMY.pricePenaltyPerFranc;
  sat = Math.max(ECONOMY.minSatisfaction, Math.min(ECONOMY.maxSatisfaction, sat));

  // Food and retail are capacity businesses: an unbuilt restaurant sells nothing
  // and one hut cannot feed a whole mountain.
  const occupancy = beds <= 0 ? 0 : Math.min(1, (served * ECONOMY.occupancyPerVisitor) / beds);
  const ticketIncome = served * state.ticketPrice * (1 + tickets * ECONOMY.ticketOfficeIncomeBonus);
  const hotelIncome = beds * occupancy * ECONOMY.hotelRatePerBedPerHour;
  const fb = Math.min(served, seats) * ECONOMY.fbPerVisitor;
  const retail = Math.min(served, retailCapacity) * ECONOMY.shopPerVisitor;
  const revenue = ticketIncome + hotelIncome + fb + retail;

  // Upkeep runs whether or not anyone shows up, which is what makes an
  // over-built resort a mistake rather than merely a slow start. A workshop
  // maintains the cableways, so it only discounts the lifts.
  // Only the best maintenance depot on the mountain counts; two workshops do
  // not halve the bill twice over.
  const bestCut = buildings.reduce((n, b) => Math.max(n, BY_ID[b.itemId].upkeepCut ?? 0), 0);
  const liftUpkeep = readyLifts.reduce((n, l) => n + (BY_ID[l.itemId].upkeep ?? 0), 0) * (1 - bestCut);
  // Placing a lift also records its two stations in `buildings`, so charging
  // every building would bill each cableway three times over.
  const buildingUpkeep = buildings
    .filter((b) => !isLift(b.itemId))
    .reduce((n, b) => n + (BY_ID[b.itemId].upkeep ?? 0), 0);
  // Grooming a steep run costs more than a gentle one, so upkeep follows the
  // grade the ground gave it rather than one catalogue number.
  const runUpkeep = readyPistes.reduce((n, p) => n + pisteUpkeep(p), 0);
  const upkeepPerHour = liftUpkeep + buildingUpkeep + runUpkeep;
  const incomePerHour = revenue - upkeepPerHour;

  const stats: SimStats = {
    peoplePerHour: Math.round(served),
    satisfaction: Math.round(sat),
    incomePerHour: Math.round(incomePerHour),
    revenuePerHour: Math.round(revenue),
    upkeepPerHour: Math.round(upkeepPerHour),
    visitorsToday: state.stats.visitorsToday + served * dtHours,
    visitorsTotal: state.stats.visitorsTotal + served * dtHours,
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
  };

  return { stats, coinsDelta: incomePerHour * dtHours, flow };
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
