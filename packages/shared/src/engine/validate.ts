import { BY_ID } from "../../../config/src/items.ts";
import { ECONOMY, UPGRADES } from "../../../config/src/economy.ts";
import { isLift, isPiste, type ItemId } from "../../../config/src/ids.ts";
import { hexDistance, hexToWorld } from "../hex.ts";
import type { Dem } from "../terrain/dem.ts";
import type { Intent } from "../protocol/intents.ts";
import type { IntentResult, PlayerRole, ResortState } from "../types.ts";
import { occupiedSet } from "./state.ts";
import { levelFromXp } from "./level.ts";

export function validateHex(
  state: ResortState,
  dem: Dem,
  q: number,
  r: number,
  itemId: ItemId,
): IntentResult {
  const item = BY_ID[itemId];
  if (!item) return { ok: false, code: "invalid", reason: "Unbekanntes Objekt" };
  const { x, z } = hexToWorld(q, r);
  if (Math.abs(x) > 92 || Math.abs(z) > 92) {
    return { ok: false, code: "terrain", reason: "Ausserhalb des Gebiets" };
  }
  if (dem.isWater(x, z)) return { ok: false, code: "terrain", reason: "Auf dem See" };
  const elev = dem.sample(x, z);
  const slope = dem.slope(x, z);
  if (elev < item.minElev || elev > item.maxElev) {
    return { ok: false, code: "terrain", reason: "Falsche Höhe" };
  }
  if (slope > item.maxSlope) return { ok: false, code: "slope", reason: "Zu steil" };
  const occ = occupiedSet(state);
  if (occ.has(`${q},${r}`) && !isPiste(itemId)) {
    return { ok: false, code: "collision", reason: "Belegt" };
  }
  return { ok: true };
}

export function validateIntent(
  state: ResortState,
  dem: Dem,
  intent: Intent,
  role: PlayerRole,
  now: number,
): IntentResult {
  if (role !== "builder") return { ok: false, code: "rights", reason: "Keine Baurechte" };

  if (intent.type === "place_building") {
    const item = BY_ID[intent.itemId];
    if (!item || isLift(intent.itemId) || isPiste(intent.itemId)) {
      return { ok: false, code: "invalid", reason: "Kein Gebäude" };
    }
    if (levelFromXp(state.xp) < item.unlockLevel) {
      return { ok: false, code: "locked", reason: `Level ${item.unlockLevel} nötig` };
    }
    if (state.coins < item.cost) return { ok: false, code: "budget", reason: "Zu teuer" };
    if ((item.gemCost ?? 0) > state.gems) return { ok: false, code: "budget", reason: "Zu wenig Edelsteine" };
    return validateHex(state, dem, intent.q, intent.r, intent.itemId);
  }

  if (intent.type === "place_lift") {
    const item = BY_ID[intent.itemId];
    if (!item || !isLift(intent.itemId)) return { ok: false, code: "invalid", reason: "Kein Lift" };
    if (levelFromXp(state.xp) < item.unlockLevel) {
      return { ok: false, code: "locked", reason: `Level ${item.unlockLevel} nötig` };
    }
    if (state.coins < item.cost) return { ok: false, code: "budget", reason: "Zu teuer" };
    if ((item.gemCost ?? 0) > state.gems) return { ok: false, code: "budget", reason: "Zu wenig Edelsteine" };
    const a = validateHex(state, dem, intent.a.q, intent.a.r, intent.itemId);
    if (!a.ok) return a;
    const b = validateHex(state, dem, intent.b.q, intent.b.r, intent.itemId);
    if (!b.ok) return b;
    const dist = hexDistance(intent.a, intent.b);
    if (dist < (item.minSpan ?? 4)) return { ok: false, code: "invalid", reason: "Zu kurz" };
    if (dist > (item.maxSpan ?? 24)) return { ok: false, code: "invalid", reason: "Zu weit" };
    return { ok: true };
  }

  if (intent.type === "place_piste") {
    const item = BY_ID[intent.itemId];
    if (!item || !isPiste(intent.itemId)) return { ok: false, code: "invalid", reason: "Keine Piste" };
    if (levelFromXp(state.xp) < item.unlockLevel) {
      return { ok: false, code: "locked", reason: `Level ${item.unlockLevel} nötig` };
    }
    const segs = Math.max(1, intent.hexes.length - 1);
    const cost = item.cost * segs;
    if (state.coins < cost) return { ok: false, code: "budget", reason: "Zu teuer" };
    if (intent.itemId !== "road") {
      for (let i = 1; i < intent.hexes.length; i++) {
        const prev = intent.hexes[i - 1]!;
        const cur = intent.hexes[i]!;
        const a = hexToWorld(prev.q, prev.r);
        const b = hexToWorld(cur.q, cur.r);
        if (dem.sample(b.x, b.z) > dem.sample(a.x, a.z) + 18) {
          return { ok: false, code: "slope", reason: "Piste muss talwärts" };
        }
      }
    }
    return { ok: true };
  }

  if (intent.type === "upgrade") {
    const def = UPGRADES.find((u) => u.key === intent.key);
    if (!def) return { ok: false, code: "invalid", reason: "Kein Upgrade" };
    const target =
      state.lifts.find((l) => l.id === intent.entityId) ??
      state.buildings.find((b) => b.id === intent.entityId);
    if (!target) return { ok: false, code: "invalid", reason: "Objekt fehlt" };
    if (now < target.readyAt) return { ok: false, code: "locked", reason: "Noch im Bau" };
    const cur = target.upgrades[intent.key];
    if (cur >= def.max) return { ok: false, code: "locked", reason: "Maximalstufe" };
    const cost = def.cost[cur] ?? 999999;
    if (state.coins < cost) return { ok: false, code: "budget", reason: "Zu teuer" };
    return { ok: true };
  }

  if (intent.type === "claim_quest") {
    const q = state.quests.find((x) => x.id === intent.questId);
    if (!q) return { ok: false, code: "invalid", reason: "Quest fehlt" };
    if (q.claimed) return { ok: false, code: "locked", reason: "Schon abgeholt" };
    if (q.progress < q.target) return { ok: false, code: "locked", reason: "Noch nicht fertig" };
    return { ok: true };
  }

  if (intent.type === "set_ticket_price") {
    if (intent.chf < ECONOMY.ticketMin || intent.chf > ECONOMY.ticketMax) {
      return { ok: false, code: "invalid", reason: "Preis ausserhalb" };
    }
    return { ok: true };
  }

  if (intent.type === "rename") {
    if (!intent.name.trim()) return { ok: false, code: "invalid", reason: "Name leer" };
    return { ok: true };
  }

  return { ok: true };
}
