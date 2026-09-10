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

  maxFlow(source: number, sink: number): number {
    if (source === sink) return 0;
    let total = 0;
    for (;;) {
      const level = this.levelGraph(source, sink);
      if (level === null) break;
      // Per-node cursor: an edge exhausted in this phase is never retried.
      const cursor = new Array<number>(this.nodeCount).fill(0);
      for (;;) {
        const pushed = this.augment(source, sink, UNCAPPED, level, cursor);
        if (pushed <= 0) break;
        total += pushed;
      }
    }
    return total;
  }

  /** BFS distances over residual edges, or null when the sink is unreachable. */
  private levelGraph(source: number, sink: number): Int32Array | null {
    const level = new Int32Array(this.nodeCount).fill(-1);
    level[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head]!;
      for (const edge of this.adjacency[node]!) {
        if (this.residual[edge]! <= 0) continue;
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
      if (this.residual[edge]! > 0 && level[next] === level[node]! + 1) {
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
