import type { ServerMessage } from "../protocol/intents.ts";
import type { PlayerPresence, ResortState } from "../types.ts";

/**
 * Smaller updates: send each room only what changed.
 *
 * A resort is some 20 KB of JSON, and most of it — the buildings, lifts and
 * pistes — sits still for minutes while the clock, the guests and the money
 * move every second. So the server remembers, per room, a signature of each
 * top-level field as last sent, and the next update carries only the fields
 * whose signature differs (a `patch`). A full `snapshot` still goes out on
 * joining, when a client asks (`resync`, e.g. after it missed a patch), and
 * every `FULL_EVERY` updates as a safety net.
 *
 * Every socket in a room receives the same stream, so the signatures are
 * computed once per room and update, never per socket. `seq` counts the
 * room's updates: a patch applies onto exactly the state of `seq - 1`, and a
 * client holding anything else asks for a fresh snapshot instead of guessing.
 */

/** Every how many updates the whole state goes out anyway. */
export const FULL_EVERY = 30;

export interface RoomStream {
  /** Number of the last update sent (snapshot or patch). */
  seq: number;
  /** Signature of each top-level field as last sent; null before the first. */
  sigs: Map<string, string> | null;
  /** Patches sent since the last full snapshot went to everyone. */
  patches: number;
}

export function newStream(): RoomStream {
  return { seq: 0, sigs: null, patches: 0 };
}

/** One signature per top-level field. JSON: the server writes keys in a stable order. */
export function fieldSigs(state: ResortState): Map<string, string> {
  const sigs = new Map<string, string>();
  for (const [k, v] of Object.entries(state)) {
    if (v === undefined) continue;
    sigs.set(k, JSON.stringify(v));
  }
  return sigs;
}

/**
 * The next update for a room, and the stream moved on to it.
 *
 * `full` forces a snapshot (e.g. after a save was loaded). Otherwise it is a
 * patch of the fields that changed since the last update, unless this is the
 * first update or `FULL_EVERY` patches have gone out since the last snapshot.
 */
export function nextUpdate(
  stream: RoomStream,
  state: ResortState,
  players: PlayerPresence[],
  opts: { full?: boolean } = {},
): ServerMessage {
  const sigs = fieldSigs(state);
  const prev = stream.sigs;
  stream.sigs = sigs;
  stream.seq += 1;
  if (opts.full || !prev || stream.patches >= FULL_EVERY) {
    stream.patches = 0;
    return { type: "snapshot", seq: stream.seq, state, players };
  }
  stream.patches += 1;
  const fields: Record<string, unknown> = {};
  for (const [k, sig] of sigs) {
    if (prev.get(k) !== sig) fields[k] = (state as unknown as Record<string, unknown>)[k];
  }
  const removed = [...prev.keys()].filter((k) => !sigs.has(k));
  return {
    type: "patch",
    seq: stream.seq,
    fields,
    ...(removed.length > 0 ? { removed } : {}),
    players,
  };
}

/** A whole state as of the stream's last update, for one socket that needs it. */
export function currentSnapshot(stream: RoomStream, state: ResortState, players: PlayerPresence[]): ServerMessage {
  return { type: "snapshot", seq: stream.seq, state, players };
}

/** A patch put onto the state it was made against. Unchanged fields keep their objects. */
export function applyPatch(state: ResortState, fields: Record<string, unknown>, removed: readonly string[] = []): ResortState {
  const next: Record<string, unknown> = { ...state, ...fields };
  for (const k of removed) delete next[k];
  return next as unknown as ResortState;
}

/**
 * The client's side of the stream: holds the last full state, applies
 * patches in order, and says when it has lost the thread.
 */
export class StreamReceiver {
  private state: ResortState | null = null;
  private seq = 0;
  /** Asked for a snapshot and still waiting, since when (0: not waiting). */
  private askedAt = 0;

  /** A new socket: nothing held is trusted until its first snapshot. */
  reset(now = Date.now()): void {
    this.state = null;
    this.seq = 0;
    // The join brings a snapshot of its own; nothing to ask for.
    this.askedAt = now;
  }

  /**
   * Take one update. Returns the resulting state to show, or `resync` when a
   * snapshot must be asked for, or null when there is nothing to do.
   */
  receive(
    msg: Extract<ServerMessage, { type: "snapshot" | "patch" }>,
    now = Date.now(),
  ): { state: ResortState; seq: number } | "resync" | null {
    if (msg.type === "snapshot") {
      this.state = msg.state as ResortState;
      this.seq = msg.seq;
      this.askedAt = 0;
      return { state: this.state, seq: this.seq };
    }
    if (!this.state || msg.seq !== this.seq + 1) {
      // Already asked: wait for the answer rather than asking on every patch,
      // but not for ever — an answer can be lost to a reconnect.
      if (this.askedAt && now - this.askedAt < RESYNC_WAIT_MS) return null;
      this.state = null;
      this.askedAt = now;
      return "resync";
    }
    this.state = applyPatch(this.state, msg.fields, msg.removed);
    this.seq = msg.seq;
    return { state: this.state, seq: this.seq };
  }
}

/** How long a client waits for the snapshot it asked for before asking again. */
export const RESYNC_WAIT_MS = 3000;
