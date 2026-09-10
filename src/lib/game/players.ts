/**
 * A colour per player, derived from their id.
 *
 * Deterministic so the ring under someone's pointer on the mountain, the chip
 * in the player list and the dot beside their name in the log are all the same
 * colour — without the server having to hand out palette slots, and without a
 * reconnect changing who is which colour.
 *
 * Its own module because both the HUD and the 3D scene need it, and the HUD
 * must not pull three.js into its graph to get it.
 */
export function peerColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  // Saturated mid-lightness reads on both the snow and the panels.
  return `hsl(${h % 360} 76% 56%)`;
}
