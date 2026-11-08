/** Which «Saisonbilanz» a player has already seen, per device (see store.ts). */

const seenKey = (roomId: string, playerId: string) => `ski-alpina-bilanz:${roomId}:${playerId}`;

/** The last season whose «Saisonbilanz» this player has seen on this device; 0 for none. */
export function readSeenSeason(roomId: string, playerId: string): number {
  try {
    const v = typeof window === "undefined" ? null : localStorage.getItem(seenKey(roomId, playerId));
    const n = v === null ? 0 : Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function writeSeenSeason(roomId: string, playerId: string, season: number): void {
  try {
    if (season > readSeenSeason(roomId, playerId)) localStorage.setItem(seenKey(roomId, playerId), String(season));
  } catch {
    /* private mode: the card may come back, nothing worse */
  }
}
