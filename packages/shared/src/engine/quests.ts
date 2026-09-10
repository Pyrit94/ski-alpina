import { isHotel } from "../../../config/src/ids.ts";
import { QUEST_DEFS } from "../../../config/src/quests.ts";
import type { ResortState } from "../types.ts";

export function syncQuestProgress(state: ResortState): ResortState {
  const lifts = state.lifts.length;
  const tbar = state.lifts.filter((l) => l.itemId === "tbar").length;
  const gondola = state.lifts.filter((l) => l.itemId === "gondola").length;
  const blue = state.pistes.filter((p) => p.difficulty === "blue").length;
  const pisteSeg = state.pistes.reduce((n, p) => n + Math.max(0, p.hexes.length - 1), 0);
  const restaurant = state.buildings.filter((b) => b.itemId === "restaurant" || b.itemId === "hut").length;
  const hotel = state.buildings.filter((b) => isHotel(b.itemId)).length;
  const map: Record<string, number> = {
    tbar,
    blue,
    restaurant,
    visitorsTotal: state.stats.visitorsTotal,
    hotel,
    lifts,
    pisteSeg,
    satisfaction: Math.round(state.stats.satisfaction),
    gondola,
    visitorsToday: state.stats.visitorsToday,
  };
  const quests = state.quests.map((q) => {
    const def = QUEST_DEFS.find((d) => d.id === q.id);
    const progress = def ? Math.min(q.target, map[def.metric] ?? q.progress) : q.progress;
    return { ...q, progress };
  });
  return { ...state, quests };
}
