import { FLOW } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { hexDistance, hexesInRange, hexToWorld, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PlacedLift, ResortState } from "../types.ts";
import { buildResortGraph, type LiftLink, type PisteLink } from "./graph.ts";
import { neighbourAvoid } from "./neighbours.ts";
import { routeToAny, type RouteTarget } from "./piste-route.ts";

/**
 * "Lift rauf, Piste runter": how every lift and run is joined, and the run a
 * lift is still missing. Shared by the HUD, the map and the tests; nothing here
 * decides what the server accepts — a suggested run is submitted as an
 * ordinary `place_piste` and validated like any other.
 */

export type EdgeLink = LiftLink | PisteLink;

const elevAt = (dem: Dem, hex: Axial) => {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.sample(x, z);
};

/** Valley and top station of a lift, by elevation. */
export function liftEnds(dem: Dem, lift: PlacedLift): { base: Axial; top: Axial } {
  return elevAt(dem, lift.a) <= elevAt(dem, lift.b)
    ? { base: lift.a, top: lift.b }
    : { base: lift.b, top: lift.a };
}

/** Car parks, bus stations and hotels: where guests arrive and leave. */
function doors(state: ResortState): Axial[] {
  return state.buildings
    .filter((b) => b.itemId === "parking" || b.itemId === "bus" || b.itemId === "train" || (BY_ID[b.itemId]?.beds ?? 0) > 0)
    .map((b) => ({ q: b.q, r: b.r }));
}

/**
 * How the layout joins each lift and run, by id — everything placed,
 * including what is still being built, so a fresh lift can say at once
 * that it still needs a way down. Same graph and rules as the simulation.
 */
export function resortLinks(state: ResortState, dem: Dem): Map<string, EdgeLink> {
  const exits = doors(state);
  const graph = buildResortGraph({
    lifts: state.lifts,
    pistes: state.pistes,
    demands: [{ hex: dem.region.villageHex, perHour: 1 }, ...exits.map((hex) => ({ hex, perHour: 1 }))],
    exits,
    dem,
  });
  const out = new Map<string, EdgeLink>();
  for (const l of graph.lifts) out.set(l.lift.id, l.link);
  for (const p of graph.pistes) out.set(p.piste.id, p.link);
  return out;
}

/**
 * Every hex a run from `from` could sensibly end on: around any valley
 * station (its own included), the village and the doors, and anywhere on a
 * run that itself leads on. Nothing within the link radius of `from`, which
 * would join the run to the place it starts.
 */
export function descentGoals(
  state: ResortState,
  dem: Dem,
  from: Axial,
  links: Map<string, EdgeLink> = resortLinks(state, dem),
): Axial[] {
  const seen = new Set<string>();
  const out: Axial[] = [];
  // A neighbour's runs and stations are no place for the players' run to end.
  const theirs = neighbourAvoid(state);
  const add = (hex: Axial) => {
    const k = `${hex.q},${hex.r}`;
    if (seen.has(k) || theirs.has(k) || hexDistance(hex, from) <= FLOW.linkRadius) return;
    seen.add(k);
    out.push(hex);
  };
  const places = [...state.lifts.map((l) => liftEnds(dem, l).base), ...doors(state)];
  for (const p of places) for (const h of hexesInRange(p, 1)) add(h);
  // The whole village is a place to end, so a run can come home without a lift there.
  for (const h of hexesInRange(dem.region.villageHex, FLOW.villageRunRadius)) add(h);
  for (const p of state.pistes) {
    if (p.difficulty === "road" || links.get(p.id) === "dead-end") continue;
    for (const h of p.hexes) add(h);
  }
  return out;
}

/**
 * The run a lift is missing: from its top station along the fall line to the
 * nearest place a run counts as joined — a valley station, the village, or a
 * run that leads on. Null when the ground allows no such line.
 */
export function suggestDescent(
  state: ResortState,
  dem: Dem,
  liftId: string,
  target: RouteTarget = "blue",
): Axial[] | null {
  const lift = state.lifts.find((l) => l.id === liftId);
  if (!lift) return null;
  const { top } = liftEnds(dem, lift);
  const goals = descentGoals(state, dem, top);
  // Around the neighbours' runs and stations: the server would refuse them.
  const avoid = neighbourAvoid(state);
  // Graded first; if no line holds the grade, any legal line will do.
  return (
    routeToAny(dem, top, goals, target, { avoid }) ??
    (target === "any" ? null : routeToAny(dem, top, goals, "any", { avoid }))
  );
}
