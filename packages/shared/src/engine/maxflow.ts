/**
 * Dinic max-flow over a small residual network.
 *
 * The resort economy is a stationary people-per-hour flow through a directed
 * graph, so "how many guests can this layout actually serve" is a max-flow
 * question, not a division. Sizes here are tiny (a few hundred edges) and the
 * solve runs once per sim tick.
 *
 * Capacities are whole people per hour. Keep them integral: Dinic on floats
 * can chase vanishing augmentations instead of terminating.
 */

/** Stand-in for an uncapped edge. Finite so augmentation cannot pick Infinity. */
export const UNCAPPED = 1_000_000;

export class FlowNetwork {
  /** Edge `i` and `i ^ 1` are a forward/residual pair. */
  private readonly target: number[] = [];
  private readonly residual: number[] = [];
  private readonly capacity: number[] = [];
  private readonly adjacency: number[][];

  constructor(nodeCount: number) {
    this.adjacency = Array.from({ length: nodeCount }, () => []);
  }

  get nodeCount(): number {
    return this.adjacency.length;
  }

  /** Add a directed edge and return its id, for reading the flow back later. */
  addEdge(from: number, to: number, capacity: number): number {
    const id = this.target.length;
    this.target.push(to);
    this.capacity.push(capacity);
    this.residual.push(capacity);
    this.adjacency[from]!.push(id);
    this.target.push(from);
    this.capacity.push(0);
    this.residual.push(0);
    this.adjacency[to]!.push(id + 1);
    return id;
  }

  /** Flow carried by `edgeId` after a solve: what its residual pair absorbed. */
  flowOn(edgeId: number): number {
    return this.residual[edgeId ^ 1]!;
  }

  capacityOf(edgeId: number): number {
    return this.capacity[edgeId]!;
  }

  /**
   * Nodes reachable from `starts` along the edges as built, ignoring how much
   * they carry. This is the layout's shape — what is joined to what — rather
   * than what a solve made of it, so a run closed for want of snow still
   * counts as joined. `reverse` walks the edges backwards: "who can get here".
   */
  reach(starts: readonly number[], reverse = false): Uint8Array {
    const seen = new Uint8Array(this.nodeCount);
    const queue: number[] = [];
    for (const s of starts) {
      if (seen[s]) continue;
      seen[s] = 1;
      queue.push(s);
    }
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head]!;
      for (const edge of this.adjacency[node]!) {
        // Forward edges are even; their residual twins (odd) point backwards.
        if ((edge & 1) !== (reverse ? 1 : 0)) continue;
        const next = this.target[edge]!;
        if (seen[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    return seen;
  }

  /**
   * Push as much as fits from `source` to `sink` on top of what already flows.
   *
   * `limit` stops early once that much has been pushed; `skip` leaves one
   * edge (and its residual twin) out of the search, which is how a lap around
   * a lift is found without simply undoing the lift's own flow.
   */
  maxFlow(source: number, sink: number, limit = UNCAPPED, skip = -1): number {
    if (source === sink || limit <= 0) return 0;
    this.skip = skip < 0 ? -1 : skip | 1;
    let total = 0;
    try {
      while (total < limit) {
        const level = this.levelGraph(source, sink);
        if (level === null) break;
        // Per-node cursor: an edge exhausted in this phase is never retried.
        const cursor = new Array<number>(this.nodeCount).fill(0);
        while (total < limit) {
          const pushed = this.augment(source, sink, Math.min(UNCAPPED, limit - total), level, cursor);
          if (pushed <= 0) break;
          total += pushed;
        }
      }
    } finally {
      this.skip = -1;
    }
    return total;
  }

  /** Put `amount` more on `edgeId` directly, e.g. to close a found cycle. */
  addFlow(edgeId: number, amount: number): void {
    this.residual[edgeId]! -= amount;
    this.residual[edgeId ^ 1]! += amount;
  }

  /** Edge pair left out of the current solve, as its odd id; -1 for none. */
  private skip = -1;

  /** BFS distances over residual edges, or null when the sink is unreachable. */
  private levelGraph(source: number, sink: number): Int32Array | null {
    const level = new Int32Array(this.nodeCount).fill(-1);
    level[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head]!;
      for (const edge of this.adjacency[node]!) {
        if (this.residual[edge]! <= 0 || (edge | 1) === this.skip) continue;
        const next = this.target[edge]!;
        if (level[next] !== -1) continue;
        level[next] = level[node]! + 1;
        queue.push(next);
      }
    }
    return level[sink] === -1 ? null : level;
  }

  private augment(
    node: number,
    sink: number,
    limit: number,
    level: Int32Array,
    cursor: number[],
  ): number {
    if (node === sink) return limit;
    while (cursor[node]! < this.adjacency[node]!.length) {
      const edge = this.adjacency[node]![cursor[node]!]!;
      const next = this.target[edge]!;
      // Only ever descend one level: that is what bounds Dinic's phases.
      if (this.residual[edge]! > 0 && (edge | 1) !== this.skip && level[next] === level[node]! + 1) {
        const pushed = this.augment(
          next,
          sink,
          Math.min(limit, this.residual[edge]!),
          level,
          cursor,
        );
        if (pushed > 0) {
          this.residual[edge]! -= pushed;
          this.residual[edge ^ 1]! += pushed;
          return pushed;
        }
      }
      cursor[node]! += 1;
    }
    return 0;
  }
}
