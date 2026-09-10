import { ECONOMY } from "../../../config/src/economy.ts";
import { applyIntent } from "../engine/apply.ts";
import { tickResort } from "../engine/tick.ts";
import { validateIntent } from "../engine/validate.ts";
import { emptyResort, migrateResort } from "../engine/state.ts";
import { createId } from "../ids.ts";
import type { Intent } from "../protocol/intents.ts";
import type { Dem } from "../terrain/dem.ts";
import { getDem } from "../terrain/dem.ts";
import type { PlayerPresence, PlayerRole, ResortState } from "../types.ts";

export interface RoomPlayer {
  id: string;
  token: string;
  name: string;
  role: PlayerRole;
  lastSeen: number;
}

export interface RoomEvent {
  title: string;
  body: string;
  kind: "ok" | "info" | "warn";
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

  join(name: string, token?: string): RoomPlayer {
    const existing = token ? [...this.players.values()].find((p) => p.token === token) : undefined;
    if (existing) {
      existing.lastSeen = Date.now();
      existing.name = name.slice(0, 24);
      return existing;
    }
    const player: RoomPlayer = {
      id: createId("pl"),
      token: token && token.length >= 8 ? token : createId("tok"),
      name: name.slice(0, 24) || "Gast",
      role: "builder",
      lastSeen: Date.now(),
    };
    this.players.set(player.id, player);
    return player;
  }

  presence(): PlayerPresence[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      lastSeen: p.lastSeen,
    }));
  }

  submit(playerId: string, intent: Intent): { ok: true; event: RoomEvent } | { ok: false; code: string; reason: string } {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, code: "rights", reason: "Nicht verbunden" };
    player.lastSeen = Date.now();
    const now = Date.now();
    const v = validateIntent(this.state, this.dem, intent, player.role, now);
    if (!v.ok) return v;
    const applied = applyIntent(this.state, intent, now);
    this.state = applied.state;
    this.seq += 1;
    return { ok: true, event: { title: applied.title, body: applied.body, kind: applied.kind } };
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
