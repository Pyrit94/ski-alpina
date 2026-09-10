import { FLOW } from "../../../config/src/economy.ts";
import { BY_ID } from "../../../config/src/items.ts";
import { VILLAGE } from "../../../config/src/terrain.ts";
import { hexDistance, hexToWorld, worldToHex, type Axial } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { PlacedLift, PlacedPiste } from "../types.ts";
import { liftThroughput, pisteCapacity } from "./level.ts";
import { FlowNetwork, UNCAPPED } from "./maxflow.ts";

/** Where guests enter the valley. Always a node, always a way out. */
export const VILLAGE_HEX: Axial = worldToHex(VILLAGE.x, VILLAGE.z);

export interface DemandSource {
  hex: Axial;
  /** People per hour this place offers to the mountain. */
  perHour: number;
}

export interface LiftEdge {
  lift: PlacedLift;
  /** Metered edge for the ride up. */
  uphill: number;
  /**
   * Metered edge for the ride down, once descents are open. Null until then,
   * and null for a lift whose guests can only ride it uphill.
   */
  downhill: number | null;
  capacity: number;
  base: Axial;
  top: Axial;
  /** Vertical gained, in metres. */
  rise: number;
}

export interface PisteEdge {
  piste: PlacedPiste;
  edge: number;
  capacity: number;
  top: Axial;
  bottom: Axial;
  km: number;
}

export interface ResortGraph {
  net: FlowNetwork;
  source: number;
  sink: number;
  lifts: LiftEdge[];
  pistes: PisteEdge[];
  /** People per hour offered at the source, after clustering. */
  offered: number;
  /**
   * Add the ride-down edges, then solve again to place the rest of the demand.
   *
   * Guests would rather ski, and max-flow has no preferences: it takes whatever
   * augmenting path it finds first, so the order edges happen to be added
   * decided whether a gondola or a piste carried the resort. Solving once
   * without descents and once with them states the preference exactly — ski if
   * you can, ride down if you must — and costs one extra solve on a tiny graph.
   */
  openDescents: () => void;
}

export interface GraphInput {
  /** Ready lifts only. */
  lifts: PlacedLift[];
  /** Ready pistes only, roads included. */
  pistes: PlacedPiste[];
  demands: DemandSource[];
  /** Places a guest can leave from, besides the village. */
  exits: Axial[];
  dem: Dem;
  /**
   * Multiplier on a piste's carrying capacity, for effects that widen or close
   * a run — a ski school on the easy slopes, mountain rescue on the steep
   * ones, bare ground under the snow line. Kept as a callback so no economy
   * number has to reach this module; the ends come along because snow cover
   * depends on how high the run sits.
   */
  pisteCapacityScale?: (piste: PlacedPiste, ends: { top: Axial; bottom: Axial }) => number;
}

function elevationAt(dem: Dem, hex: Axial): number {
  const { x, z } = hexToWorld(hex.q, hex.r);
  return dem.sample(x, z);
}

/** The pair as (lower, higher). Which end the player drew first is irrelevant. */
function byElevation(dem: Dem, a: Axial, b: Axial): [Axial, Axial] {
  return elevationAt(dem, a) <= elevationAt(dem, b) ? [a, b] : [b, a];
}

/**
 * Group ports that are close enough to count as the same place.
 *
 * A piste ending two hexes from a lift's base station is, to a guest, the same
 * spot. Union-find over pairwise hex distance; the port count is small enough
 * that the quadratic scan never shows up in a tick.
 */
export function clusterPorts(ports: Axial[], radius: number): number[] {
  const parent = ports.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const up = parent[i]!;
      parent[i] = root;
      i = up;
    }
    return root;
  };
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      if (hexDistance(ports[i]!, ports[j]!) > radius) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[b] = a;
    }
  }
  // Renumber roots to a dense 0..n-1 so they can index the node array.
  const dense = new Map<number, number>();
  return ports.map((_, i) => {
    const root = find(i);
    let id = dense.get(root);
    if (id === undefined) {
      id = dense.size;
      dense.set(root, id);
    }
    return id;
  });
}

/**
 * Build the people-per-hour network for a resort.
 *
 * Two layers per place: `ground` is a guest who has not ridden anything yet,
 * `ski` is one who is already on the mountain. Lifts are the only way across,
 * which is what makes a served guest one who actually used the resort — a
 * parking lot wired straight to the exit would otherwise book phantom visitors.
 *
 * Consequences that fall out of the topology rather than a special case: a lift
 * with nothing at its top carries nothing, a piste that lands nowhere near a
 * station or the village carries nothing, and a resort with no way back down to
 * an exit serves nobody.
 */
export function buildResortGraph(input: GraphInput): ResortGraph {
  const { lifts, pistes, demands, exits, dem, pisteCapacityScale } = input;

  const ports: Axial[] = [];
  const addPort = (hex: Axial): number => ports.push(hex) - 1;

  const villagePort = addPort(VILLAGE_HEX);
  const liftPorts = lifts.map((lift) => {
    const [base, top] = byElevation(dem, lift.a, lift.b);
    return { lift, base, top, basePort: addPort(base), topPort: addPort(top) };
  });
  const runs = pistes.filter((p) => p.difficulty !== "road");
  const roads = pistes.filter((p) => p.difficulty === "road");
  const pistePorts = runs.map((piste) => {
    const ends = [piste.hexes[0]!, piste.hexes[piste.hexes.length - 1]!] as const;
    const [bottom, top] = byElevation(dem, ends[0], ends[1]);
    return { piste, top, bottom, topPort: addPort(top), bottomPort: addPort(bottom) };
  });
  const roadPorts = roads.map((road) => ({
    a: addPort(road.hexes[0]!),
    b: addPort(road.hexes[road.hexes.length - 1]!),
    capacity: BY_ID[road.itemId].capacity ?? 0,
  }));
  const demandPorts = demands.map((d) => ({ demand: d, port: addPort(d.hex) }));
  const exitPorts = exits.map((hex) => addPort(hex));

  const cluster = clusterPorts(ports, FLOW.linkRadius);
  const clusterCount = cluster.length === 0 ? 0 : Math.max(...cluster) + 1;

  const SOURCE = 0;
  const SINK = 1;
  const ground = (c: number) => 2 + c * 2;
  const ski = (c: number) => 3 + c * 2;
  const liftBase = 2 + clusterCount * 2;
  const liftIn = (i: number) => liftBase + i * 2;
  const liftOut = (i: number) => liftBase + i * 2 + 1;

  const net = new FlowNetwork(liftBase + lifts.length * 2);

  let offered = 0;
  for (const { demand, port } of demandPorts) {
    const perHour = Math.max(0, Math.round(demand.perHour));
    if (perHour <= 0) continue;
    net.addEdge(SOURCE, ground(cluster[port]!), perHour);
    offered += perHour;
  }

  // The village is always a way out; anything else is a place guests can leave.
  for (const port of [villagePort, ...exitPorts]) {
    net.addEdge(ski(cluster[port]!), SINK, UNCAPPED);
  }

  const pendingDescents: { edge: LiftEdge; from: number; to: number; capacity: number }[] = [];
  const liftEdges: LiftEdge[] = liftPorts.map((p, i) => {
    const item = BY_ID[p.lift.itemId];
    const capacity = liftThroughput(item, p.lift.upgrades);
    const baseCluster = cluster[p.basePort]!;
    const topCluster = cluster[p.topPort]!;
    // Both queues feed one gadget edge, so arriving and lapping guests share
    // the same hourly capacity rather than each getting their own.
    net.addEdge(ground(baseCluster), liftIn(i), UNCAPPED);
    net.addEdge(ski(baseCluster), liftIn(i), UNCAPPED);
    const uphill = net.addEdge(liftIn(i), liftOut(i), capacity);
    net.addEdge(liftOut(i), ski(topCluster), UNCAPPED);
    const edge: LiftEdge = {
      lift: p.lift,
      uphill,
      downhill: null,
      capacity,
      base: p.base,
      top: p.top,
      rise: Math.round(elevationAt(dem, p.top) - elevationAt(dem, p.base)),
    };
    const share = item.downhillShare ?? 0;
    if (share > 0) {
      pendingDescents.push({
        edge,
        from: ski(topCluster),
        to: ski(baseCluster),
        capacity: Math.round(capacity * share),
      });
    }
    return edge;
  });

  const pisteEdges: PisteEdge[] = pistePorts.map((p) => {
    // Capacity follows the grade the ground gave this run, not the catalogue
    // entry: a steep black carries far fewer people than a gentle blue, and
    // both are the same item now.
    const base = pisteCapacity(p.piste);
    const scale = pisteCapacityScale?.(p.piste, { top: p.top, bottom: p.bottom }) ?? 1;
    const capacity = Math.max(0, Math.round(base * scale));
    return {
      piste: p.piste,
      edge: net.addEdge(ski(cluster[p.topPort]!), ski(cluster[p.bottomPort]!), capacity),
      capacity,
      top: p.top,
      bottom: p.bottom,
      km: Math.max(0, p.piste.hexes.length - 1) * FLOW.kmPerSegment,
    };
  });

  // Roads carry people, not skiers: they link places in both layers and both
  // directions, which is how a car park reaches a valley station at all.
  for (const road of roadPorts) {
    const a = cluster[road.a]!;
    const b = cluster[road.b]!;
    for (const layer of [ground, ski]) {
      net.addEdge(layer(a), layer(b), road.capacity);
      net.addEdge(layer(b), layer(a), road.capacity);
    }
  }

  const openDescents = () => {
    for (const d of pendingDescents) {
      if (d.edge.downhill !== null) continue;
      d.edge.downhill = net.addEdge(d.from, d.to, d.capacity);
    }
  };

  return {
    net,
    source: SOURCE,
    sink: SINK,
    lifts: liftEdges,
    pistes: pisteEdges,
    offered,
    openDescents,
  };
}
