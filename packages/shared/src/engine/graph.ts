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

/**
 * Whether a lift is joined into the resort, by the layout alone.
 *
 * - "ok": guests can reach its valley station, and from its top station a run
 *   leads to a valley station or the village.
 * - "no-descent": nothing leads down from its top station yet.
 * - "no-access": its top is fine, but no guest can get to its valley station.
 */
export type LiftLink = "ok" | "no-descent" | "no-access";

/**
 * Whether a run is joined into the resort, by the layout alone.
 *
 * - "ok": a lift (or another run) brings guests onto it, and its end leads on.
 * - "dead-end": its end lands nowhere guests can go on from.
 * - "unreached": nothing brings guests onto it.
 */
export type PisteLink = "ok" | "dead-end" | "unreached";

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
  link: LiftLink;
}

export interface PisteEdge {
  piste: PlacedPiste;
  /**
   * Metered edges, top to bottom, one per stretch between junctions. A run
   * that nothing joins mid-way is a single stretch.
   */
  segments: number[];
  capacity: number;
  top: Axial;
  bottom: Axial;
  km: number;
  link: PisteLink;
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
  /**
   * After the solves: let guests already on the mountain ride extra laps, up
   * to `perLift` people per hour on each lift, where a run leads back to that
   * lift's own valley station. Max-flow alone ends every guest's day at the
   * first valley station they reach, which would leave a lift whose runs
   * feed it from another lift standing empty. Laps are cycles, so the guests
   * served stay exactly what they were.
   */
  addLaps: (perLift: number) => void;
}

/** Guests on a run after a solve: its busiest stretch. */
export function pisteUse(net: FlowNetwork, piste: PisteEdge): number {
  let used = 0;
  for (const seg of piste.segments) used = Math.max(used, net.flowOn(seg));
  return used;
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
  /** Multiplier on a lift's throughput, e.g. from research. */
  liftCapacityScale?: (lift: PlacedLift) => number;
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
 * Where along a run other things join it, as indices into its hexes (top to
 * bottom), interior only. A place within the link radius of the run's own
 * ends already joins it there and needs no split.
 */
export function junctionsOn(hexes: readonly Axial[], anchors: readonly Axial[], radius = FLOW.linkRadius): number[] {
  if (hexes.length < 3) return [];
  const top = hexes[0]!;
  const bottom = hexes[hexes.length - 1]!;
  const out = new Set<number>();
  for (const a of anchors) {
    if (hexDistance(a, top) <= radius || hexDistance(a, bottom) <= radius) continue;
    let best = -1;
    let bestD = radius + 1;
    for (let k = 1; k < hexes.length - 1; k++) {
      const d = hexDistance(hexes[k]!, a);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) continue;
    // A split right beside the run's own end would only make a stretch of
    // nothing; the end already joins whatever is that close.
    if (hexDistance(hexes[best]!, top) <= radius || hexDistance(hexes[best]!, bottom) <= radius) continue;
    out.add(best);
  }
  return [...out].sort((x, y) => x - y);
}

/** Whether the village reaches a valley station by itself, without a road. */
export function villageReaches(dem: Dem, base: Axial): boolean {
  if (hexDistance(base, VILLAGE_HEX) > FLOW.villageAccessRadius) return false;
  return elevationAt(dem, base) - elevationAt(dem, VILLAGE_HEX) <= FLOW.villageAccessRise;
}

/**
 * Build the people-per-hour network for a resort.
 *
 * Three layers per place: `ground` is a guest who has not ridden anything yet,
 * `up` one who has ridden a lift but not skied, and `down` one who has skied
 * at least one run. Lifts lead from ground or down to up; runs lead from up or
 * down to down. A guest's day can end in the village, at a door (car park,
 * bus, hotel) or at any valley station — but only in the down layer, so a
 * served guest is one who rode up and skied down.
 *
 * Consequences that fall out of the topology rather than a special case:
 * a lift with no run from its top carries nobody; a run that lands nowhere
 * carries nobody; a lift whose valley station no guest can reach — not from
 * the village, a door, a road or another run — carries nobody. A run ending
 * on another run, or on any valley station, is joined: not every lift needs
 * its own way back to the village.
 */
export function buildResortGraph(input: GraphInput): ResortGraph {
  const { lifts, pistes, demands, exits, dem, pisteCapacityScale, liftCapacityScale } = input;

  const ports: Axial[] = [];
  const addPort = (hex: Axial): number => ports.push(hex) - 1;

  const villagePort = addPort(VILLAGE_HEX);
  const liftPorts = lifts.map((lift) => {
    const [base, top] = byElevation(dem, lift.a, lift.b);
    return { lift, base, top, basePort: addPort(base), topPort: addPort(top) };
  });
  const runs = pistes.filter((p) => p.difficulty !== "road");
  const roads = pistes.filter((p) => p.difficulty === "road");
  const roadPorts = roads.map((road) => ({
    a: addPort(road.hexes[0]!),
    b: addPort(road.hexes[road.hexes.length - 1]!),
    capacity: BY_ID[road.itemId].capacity ?? 0,
  }));
  const demandPorts = demands.map((d) => ({ demand: d, port: addPort(d.hex) }));
  const exitPorts = exits.map((hex) => addPort(hex));

  // Every run, top first, with the places along it where something joins.
  const oriented = runs.map((piste) => {
    const first = piste.hexes[0]!;
    const last = piste.hexes[piste.hexes.length - 1]!;
    const [, top] = byElevation(dem, first, last);
    const hexes = top === first ? piste.hexes : [...piste.hexes].reverse();
    return { piste, hexes };
  });
  const runEnds = oriented.flatMap((o) => [o.hexes[0]!, o.hexes[o.hexes.length - 1]!]);
  const fixed = [
    VILLAGE_HEX,
    ...liftPorts.flatMap((p) => [p.base, p.top]),
    ...runEnds,
    ...demands.map((d) => d.hex),
    ...exits,
  ];
  const pistePorts = oriented.map(({ piste, hexes }) => {
    const anchors = fixed.filter((h) => h !== hexes[0] && h !== hexes[hexes.length - 1]);
    const cuts = [0, ...junctionsOn(hexes, anchors), hexes.length - 1];
    return {
      piste,
      top: hexes[0]!,
      bottom: hexes[hexes.length - 1]!,
      nodes: cuts.map((k) => addPort(hexes[k]!)),
    };
  });

  const cluster = clusterPorts(ports, FLOW.linkRadius);
  const clusterCount = cluster.length === 0 ? 0 : Math.max(...cluster) + 1;

  const SOURCE = 0;
  const SINK = 1;
  const ground = (c: number) => 2 + c * 3;
  const up = (c: number) => 3 + c * 3;
  const down = (c: number) => 4 + c * 3;
  // Metered edges sit between a private pair of nodes, so a guest arriving in
  // either layer shares one capacity instead of each layer getting its own.
  let nodes = 2 + clusterCount * 3;
  const gadget = () => {
    const at = nodes;
    nodes += 2;
    return { into: at, out: at + 1 };
  };
  const liftGadgets = liftPorts.map(() => gadget());
  const descentGadgets = liftPorts.map(() => gadget());
  const segmentGadgets = pistePorts.map((p) => p.nodes.slice(1).map(() => gadget()));

  const net = new FlowNetwork(nodes);

  let offered = 0;
  for (const { demand, port } of demandPorts) {
    const perHour = Math.max(0, Math.round(demand.perHour));
    if (perHour <= 0) continue;
    net.addEdge(SOURCE, ground(cluster[port]!), perHour);
    offered += perHour;
  }

  // A guest's day ends in the village, at a door, or at any valley station —
  // having skied at least once.
  const homes = new Set<number>([villagePort, ...exitPorts].map((p) => cluster[p]!));
  for (const p of liftPorts) homes.add(cluster[p.basePort]!);
  for (const c of homes) net.addEdge(down(c), SINK, UNCAPPED);

  // Valley stations near the village need no road: guests walk or take the bus.
  const villageCluster = cluster[villagePort]!;
  const served = new Set<number>([villageCluster]);
  for (const p of liftPorts) {
    const c = cluster[p.basePort]!;
    if (served.has(c) || !villageReaches(dem, p.base)) continue;
    served.add(c);
    net.addEdge(ground(villageCluster), ground(c), UNCAPPED);
  }

  const pendingDescents: { edge: LiftEdge; gadget: { into: number; out: number }; capacity: number }[] = [];
  const liftEdges: LiftEdge[] = liftPorts.map((p, i) => {
    const item = BY_ID[p.lift.itemId];
    const capacity = Math.round(liftThroughput(item, p.lift.upgrades) * (liftCapacityScale?.(p.lift) ?? 1));
    const baseCluster = cluster[p.basePort]!;
    const topCluster = cluster[p.topPort]!;
    const g = liftGadgets[i]!;
    // Arriving and lapping guests share the same hourly capacity.
    net.addEdge(ground(baseCluster), g.into, UNCAPPED);
    net.addEdge(up(baseCluster), g.into, UNCAPPED);
    net.addEdge(down(baseCluster), g.into, UNCAPPED);
    const uphill = net.addEdge(g.into, g.out, capacity);
    net.addEdge(g.out, up(topCluster), UNCAPPED);
    const edge: LiftEdge = {
      lift: p.lift,
      uphill,
      downhill: null,
      capacity,
      base: p.base,
      top: p.top,
      rise: Math.round(elevationAt(dem, p.top) - elevationAt(dem, p.base)),
      link: "ok",
    };
    const share = item.downhillShare ?? 0;
    if (share > 0) {
      const d = descentGadgets[i]!;
      net.addEdge(up(topCluster), d.into, UNCAPPED);
      net.addEdge(down(topCluster), d.into, UNCAPPED);
      net.addEdge(d.out, down(baseCluster), UNCAPPED);
      pendingDescents.push({ edge, gadget: d, capacity: Math.round(capacity * share) });
    }
    return edge;
  });

  const pisteEdges: PisteEdge[] = pistePorts.map((p, i) => {
    // Capacity follows the grade the ground gave this run, not the catalogue
    // entry: a steep black carries far fewer people than a gentle blue, and
    // both are the same item now.
    const base = pisteCapacity(p.piste);
    const scale = pisteCapacityScale?.(p.piste, { top: p.top, bottom: p.bottom }) ?? 1;
    const capacity = Math.max(0, Math.round(base * scale));
    const segments = segmentGadgets[i]!.map((g, k) => {
      const from = cluster[p.nodes[k]!]!;
      const to = cluster[p.nodes[k + 1]!]!;
      net.addEdge(up(from), g.into, UNCAPPED);
      net.addEdge(down(from), g.into, UNCAPPED);
      const metered = net.addEdge(g.into, g.out, capacity);
      net.addEdge(g.out, down(to), UNCAPPED);
      return metered;
    });
    return {
      piste: p.piste,
      segments,
      capacity,
      top: p.top,
      bottom: p.bottom,
      km: Math.max(0, p.piste.hexes.length - 1) * FLOW.kmPerSegment,
      link: "ok",
    };
  });

  // Roads carry people, not skiers: they link places in every layer and both
  // directions, which is how a car park reaches a far valley station.
  for (const road of roadPorts) {
    const a = cluster[road.a]!;
    const b = cluster[road.b]!;
    for (const layer of [ground, up, down]) {
      net.addEdge(layer(a), layer(b), road.capacity);
      net.addEdge(layer(b), layer(a), road.capacity);
    }
  }

  // How the layout is joined, before any guest is placed. Cabin descents are
  // not edges yet, so a gondola with no run counts as having no way down —
  // which is the point: skiers want a run.
  const fromSource = net.reach([SOURCE]);
  const toSink = net.reach([SINK], true);
  liftEdges.forEach((edge, i) => {
    const g = liftGadgets[i]!;
    if (!toSink[g.out]) edge.link = "no-descent";
    else if (!fromSource[g.into]) edge.link = "no-access";
  });
  pisteEdges.forEach((edge, i) => {
    const gs = segmentGadgets[i]!;
    if (gs.length === 0) return;
    if (!toSink[gs[gs.length - 1]!.into]) edge.link = "dead-end";
    else if (!gs.some((g) => fromSource[g.into])) edge.link = "unreached";
  });

  const openDescents = () => {
    for (const d of pendingDescents) {
      if (d.edge.downhill !== null) continue;
      d.edge.downhill = net.addEdge(d.gadget.into, d.gadget.out, d.capacity);
    }
  };

  const addLaps = (perLift: number) => {
    if (perLift <= 0) return;
    // Empty lifts first: they are the ones a player would otherwise read as
    // broken.
    const order = liftEdges
      .map((edge, i) => ({ edge, i, used: net.flowOn(edge.uphill) }))
      .sort((a, b) => a.used - b.used);
    for (const { edge, i } of order) {
      if (edge.link !== "ok") continue;
      const room = edge.capacity - net.flowOn(edge.uphill);
      if (room <= 0) continue;
      const g = liftGadgets[i]!;
      const lapped = net.maxFlow(g.out, g.into, Math.min(room, perLift), edge.uphill);
      if (lapped > 0) net.addFlow(edge.uphill, lapped);
    }
    // Max-flow also fills one run before it touches the next, so a second run
    // into the first would stand empty beside it. Guests spread out: every
    // joined run that is still empty gets its own laps.
    pisteEdges.forEach((edge, i) => {
      if (edge.link !== "ok" || pisteUse(net, edge) > 0) return;
      for (const [k, seg] of edge.segments.entries()) {
        const room = edge.capacity - net.flowOn(seg);
        if (room <= 0) continue;
        const g = segmentGadgets[i]![k]!;
        const lapped = net.maxFlow(g.out, g.into, Math.min(room, perLift), seg);
        if (lapped <= 0) continue;
        net.addFlow(seg, lapped);
        break;
      }
    });
  };

  return {
    net,
    source: SOURCE,
    sink: SINK,
    lifts: liftEdges,
    pistes: pisteEdges,
    offered,
    openDescents,
    addLaps,
  };
}
