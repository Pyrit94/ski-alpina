import { BY_ID } from "../../../config/src/items.ts";
import { ECONOMY } from "../../../config/src/economy.ts";
import { isHotel } from "../../../config/src/ids.ts";
import { hexDistance, hexToWorld } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { FlowEdgeViz, ResortState, SimStats } from "../types.ts";
import { liftThroughput } from "./level.ts";

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

export function tickFlow(state: ResortState, dem: Dem, dtHours: number, now: number): FlowTick {
  const readyLifts = state.lifts.filter((l) => l.readyAt <= now);
  const readyPistes = state.pistes.filter((p) => p.readyAt <= now && p.difficulty !== "road");
  const buildings = state.buildings.filter((b) => b.readyAt <= now);

  const count = (id: string) => buildings.filter((b) => b.itemId === id).length;
  const beds = buildings.reduce((n, b) => n + (BY_ID[b.itemId].beds ?? 0), 0);
  const parking = count("parking");
  const bus = count("bus");
  const hasSchool = count("skischool") > 0;
  const hasSpa = count("spa") > 0;
  const hasLights = count("lights") > 0;
  const snowmakers = count("snowmaker");
  const groomers = count("groomer");
  const tickets = count("ticket");
  const restaurants = count("restaurant") + count("hut") + count("apres");
  const shops = count("shop");

  const liftCap = readyLifts.reduce((n, l) => n + liftThroughput(BY_ID[l.itemId], l.upgrades), 0);
  let demand =
    ECONOMY.walkInPerHour +
    parking * ECONOMY.parkingDemandPerHour +
    bus * ECONOMY.busDemandPerHour +
    beds * ECONOMY.bedOvernightShare * 1.1;
  demand *= hourFactor(state.timeOfDay) * (hasLights && (state.timeOfDay < 0.3 || state.timeOfDay > 0.7) ? 1 + ECONOMY.lightsDayExtension : 1);
  demand *= 0.72 + state.weather.snowQuality * 0.4;
  if (state.ticketPrice > 90) demand *= 1 - (state.ticketPrice - 90) / 280;

  const liftEdges: FlowEdgeViz[] = readyLifts.map((l) => {
    const cap = liftThroughput(BY_ID[l.itemId], l.upgrades);
    return { id: l.id, kind: "lift" as const, from: l.a, to: l.b, flow: 0, capacity: cap };
  });

  const pisteEdges: FlowEdgeViz[] = readyPistes.map((p) => {
    const start = p.hexes[0]!;
    const end = p.hexes[p.hexes.length - 1]!;
    const km = Math.max(0.2, (p.hexes.length - 1) * 0.12);
    const cap = p.difficulty === "black" ? 700 : p.difficulty === "red" ? 1100 : 1500;
    return {
      id: p.id,
      kind: "piste" as const,
      from: start,
      to: end,
      flow: 0,
      capacity: cap,
      path: p.hexes,
      km,
    } as FlowEdgeViz & { km: number };
  });

  let remaining = demand;
  let queued = 0;
  let throughput = 0;
  if (liftEdges.length === 0) {
    queued = demand * 0.2;
  } else {
    const share = remaining / liftEdges.length;
    for (const e of liftEdges) {
      const served = Math.min(e.capacity, share);
      e.flow = served;
      throughput += served;
      queued += Math.max(0, share - e.capacity);
    }
  }

  if (pisteEdges.length && throughput > 0) {
    const share = throughput / pisteEdges.length;
    for (const e of pisteEdges) {
      e.flow = Math.min(e.capacity, share * (hasSchool && e.id.startsWith("p") ? 1.05 : 1));
    }
  } else if (liftEdges.length && pisteEdges.length === 0) {
    queued += throughput * 0.35;
    throughput *= 0.65;
  }

  const wait = Math.min(28, 2.2 + queued / Math.max(80, liftCap) * 18 * (groomers ? 1 - ECONOMY.groomerWaitCut : 1));
  const pisteKm = readyPistes.reduce((n, p) => n + Math.max(0, p.hexes.length - 1) * 0.12, 0);
  const variety = new Set(readyPistes.map((p) => p.difficulty)).size;
  let sat: number = ECONOMY.targetSatisfaction;
  sat += variety * ECONOMY.varietyBonus;
  sat -= wait * ECONOMY.waitPenaltyPerMinute * 0.35;
  sat += (state.weather.snowQuality + snowmakers * ECONOMY.snowmakerQuality) * 12;
  sat += restaurants * 1.4 + shops * 1.1 + (hasSpa ? ECONOMY.spaBonus * 100 : 0);
  sat += tickets * 0.8;
  sat = Math.max(28, Math.min(99, sat));

  const visitorsHour = throughput;
  const occupancy = beds <= 0 ? 0 : Math.min(1, (visitorsHour * 0.15) / beds);
  const ticketIncome = visitorsHour * state.ticketPrice * (1 + tickets * 0.08);
  const hotelIncome = beds * occupancy * ECONOMY.hotelRatePerBedPerHour;
  const fb = visitorsHour * ECONOMY.fbPerVisitor * Math.max(1, restaurants);
  const shopInc = visitorsHour * ECONOMY.shopPerVisitor * Math.max(0.4, shops);
  const incomePerHour = ticketIncome + hotelIncome + fb + shopInc;
  const coinsDelta = incomePerHour * dtHours;

  const stats: SimStats = {
    peoplePerHour: Math.round(visitorsHour),
    satisfaction: Math.round(sat),
    incomePerHour: Math.round(incomePerHour),
    visitorsToday: state.stats.visitorsToday + visitorsHour * dtHours,
    visitorsTotal: state.stats.visitorsTotal + visitorsHour * dtHours,
    occupancy,
    waitMinutes: Math.round(wait * 10) / 10,
    pisteKm: Math.round(pisteKm * 10) / 10,
    beds,
    liftCapacity: liftCap,
    queued: Math.round(queued),
  };

  return { stats, coinsDelta, flow: [...liftEdges, ...pisteEdges] };
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
