import { ECONOMY } from "../../../config/src/economy.ts";
import { applyIntent } from "../engine/apply.ts";
import { tickResort } from "../engine/tick.ts";
import { validateIntent } from "../engine/validate.ts";
import { emptyResort, migrateResort } from "../engine/state.ts";
import { createId } from "../ids.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import { getDem } from "../terrain/dem.ts";
import type { Axial } from "../hex.ts";
import type { PlayerPresence, PlayerRole, ResortState } from "../types.ts";

export interface RoomPlayer {
  id: string;
  token: string;
  name: string;
  role: PlayerRole;
  lastSeen: number;
  /** The signed-in account, when the socket was authenticated. */
  userId?: string;
  /** Hex this player is pointing at, for the others' benefit. */
  focus?: Axial | null;
  /**
   * Whether they are connected right now.
   *
   * A player who goes quiet is marked offline rather than deleted, so coming
   * back reuses the same id. Deleting them meant a reconnect minted a fresh
   * id, which gave the same person a second row in the contributor list and a
   * different colour on the mountain — their own past work stopped being
   * theirs.
   */
  online: boolean;
}

export interface RoomEvent {
  title: string;
  body: string;
  kind: "ok" | "info" | "warn";
  /** Who caused it, so the other player's screen can say so. */
  actorId: string;
  actorName: string;
}

export class GameRoom {
  state: ResortState;
  players = new Map<string, RoomPlayer>();
  seq = 0;
  readonly dem: Dem;
  private lastTick = Date.now();

  constructor(roomId: string, snapshot?: ResortState, dem?: Dem) {
    this.dem = dem ?? getDem();
    // Every snapshot enters the engine through here, so this is the one place
    // an older save shape has to be reconciled.
    this.state = snapshot ? migrateResort(snapshot, roomId) : emptyResort(roomId);
  }

  /**
   * Attach a socket to a player.
   *
   * An `identity` means the socket was authenticated, and then the account —
   * not a token the client invented — decides who this is. Reconnecting on the
   * same account resumes the same player instead of adding another body to the
   * presence list, which is what made the online count drift upwards.
   */
  join(name: string, token?: string, identity?: { userId: string; name: string }): RoomPlayer {
    // Look across offline players too: the whole point of keeping them is that
    // returning restores the same identity rather than creating a stranger.
    const known = identity
      ? [...this.players.values()].find((p) => p.userId === identity.userId)
      : token
        ? [...this.players.values()].find((p) => p.token === token)
        : undefined;
    if (known) {
      known.lastSeen = Date.now();
      known.online = true;
      known.name = identity ? identity.name : name.slice(0, 24) || known.name;
      return known;
    }
    const player: RoomPlayer = {
      id: createId("pl"),
      token: identity ? createId("tok") : token && token.length >= 8 ? token : createId("tok"),
      name: (identity ? identity.name : name.slice(0, 24)) || "Gast",
      role: "builder",
      lastSeen: Date.now(),
      online: true,
      ...(identity ? { userId: identity.userId } : {}),
    };
    this.players.set(player.id, player);
    return player;
  }

  /** Mark a player as still here. Called on every message they send. */
  touch(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) player.lastSeen = Date.now();
  }

  /**
   * Take quiet players out of the presence list, without forgetting them.
   *
   * Nothing used to remove a player at all, so "1 online" only ever climbed.
   * Deleting them was the other extreme: a reconnect minted a fresh id and the
   * same person picked up a second row in the contributor list. They go offline
   * instead, and are only really forgotten once the roster grows past what any
   * plausible session needs — oldest first, and never one who is still here.
   */
  prunePlayers(now = Date.now()): void {
    for (const player of this.players.values()) {
      if (player.online && now - player.lastSeen > PRESENCE_TIMEOUT_MS) {
        player.online = false;
        player.focus = null;
      }
    }
    if (this.players.size <= MAX_REMEMBERED_PLAYERS) return;
    const forgettable = [...this.players.values()]
      .filter((p) => !p.online)
      .sort((a, b) => a.lastSeen - b.lastSeen);
    let over = this.players.size - MAX_REMEMBERED_PLAYERS;
    for (const player of forgettable) {
      if (over-- <= 0) break;
      this.players.delete(player.id);
    }
  }

  presence(): PlayerPresence[] {
    return [...this.players.values()]
      .filter((p) => p.online)
      .map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        lastSeen: p.lastSeen,
        focus: p.focus ?? null,
      }));
  }

  submit(playerId: string, intent: Intent): { ok: true; event: RoomEvent } | { ok: false; code: string; reason: string } {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, code: "rights", reason: "Nicht verbunden" };
    player.lastSeen = Date.now();
    const now = Date.now();
    const v = validateIntent(this.state, this.dem, intent, player.role, now);
    if (!v.ok) return v;
    const applied = applyIntent(
      this.state,
      intent,
      now,
      { id: player.id, name: player.name },
      this.dem,
    );
    this.state = applied.state;
    this.seq += 1;
    return {
      ok: true,
      event: {
        title: applied.title,
        body: applied.body,
        kind: applied.kind,
        actorId: player.id,
        actorName: player.name,
      },
    };
  }

  /**
   * Note where a player is pointing, for the others to see.
   *
   * Cheap and deliberately unvalidated: it is a hint about attention, not a
   * claim on the hex, so a stale or silly value can only mislabel a marker.
   */
  setFocus(playerId: string, hex: Axial | null): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.lastSeen = Date.now();
    player.focus = hex;
  }

  tick(): void {
    const now = Date.now();
    const dt = Math.min(2.5, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.state = tickResort(this.state, this.dem, dt, now);
    this.seq += 1;
  }

  snapshot(): ResortState {
    return this.state;
  }
}

export const TICK_MS = ECONOMY.simTickMs;
export const PERSIST_MS = ECONOMY.persistMs;
/**
 * How long a silent player stays in the presence list.
 *
 * Long enough to survive a reload or a tunnel dropping, short enough that a
 * closed tab does not haunt the online count.
 */
export const PRESENCE_TIMEOUT_MS = 45_000;
/**
 * How many identities a room keeps, online and offline together.
 *
 * Generous for a resort meant for two people, and bounded so a long-running
 * server cannot accumulate every guest token it has ever seen.
 */
export const MAX_REMEMBERED_PLAYERS = 32;
