import type { GameSave, Quest } from "./types";

export function makeQuests(): Quest[] {
  return [
    { id: "q1", title: "Erster Schlepplift", hint: "Verbinde zwei Hänge mit einem Schlepplift.", xp: 40, coins: 2500, gems: 10, progress: 0, target: 1, claimed: false },
    { id: "q2", title: "Blaue Abfahrt", hint: "Zeichne eine blaue Piste den Hang hinunter.", xp: 30, coins: 1800, gems: 8, progress: 0, target: 1, claimed: false },
    { id: "q3", title: "Einkehrschwung", hint: "Baue ein Restaurant an der Piste.", xp: 35, coins: 2200, gems: 8, progress: 0, target: 1, claimed: false },
    { id: "q4", title: "Talabfahrt", hint: "Befördere 1.000 Skifahrer.", xp: 50, coins: 4000, gems: 15, progress: 0, target: 1000, claimed: false },
    { id: "q5", title: "Übernachten", hint: "Errichte ein Hotel im Dorf.", xp: 55, coins: 6000, gems: 20, progress: 0, target: 1, claimed: false },
    { id: "q6", title: "Drei Bahnen", hint: "Baue 3 Lifte oder Bahnen.", xp: 70, coins: 8000, gems: 25, progress: 0, target: 3, claimed: false },
    { id: "q7", title: "Pistennetz", hint: "Lege 8 Pistensegmente an.", xp: 60, coins: 5000, gems: 12, progress: 0, target: 8, claimed: false },
    { id: "q8", title: "Zufriedenheit", hint: "Erreiche 80 % Zufriedenheit.", xp: 80, coins: 9000, gems: 30, progress: 0, target: 80, claimed: false },
    { id: "q9", title: "Gondel in die Höhe", hint: "Baue eine Gondelbahn.", xp: 90, coins: 12000, gems: 35, progress: 0, target: 1, claimed: false },
    { id: "q10", title: "Tagestouristen", hint: "5.000 Personen an einem Tag.", xp: 100, coins: 15000, gems: 40, progress: 0, target: 5000, claimed: false },
  ];
}

export function syncQuestProgress(save: GameSave): Quest[] {
  const lifts = save.lifts.length;
  const tbar = save.lifts.filter((l) => l.itemId === "tbar").length;
  const gondel = save.lifts.filter((l) => l.itemId === "gondola").length;
  const blue = save.pistes.filter((p) => p.difficulty === "blue").length;
  const pisteSeg = save.pistes.reduce((n, p) => n + Math.max(0, p.hexes.length - 1), 0);
  const restaurant = save.buildings.filter((b) => b.itemId === "restaurant" || b.itemId === "hut").length;
  const hotel = save.buildings.filter((b) => b.itemId.startsWith("hotel")).length;

  const map: Record<string, number> = {
    q1: tbar,
    q2: blue,
    q3: restaurant,
    q4: save.stats.visitorsTotal,
    q5: hotel,
    q6: lifts,
    q7: pisteSeg,
    q8: Math.round(save.stats.satisfaction),
    q9: gondel,
    q10: save.stats.visitorsToday,
  };

  return save.quests.map((q) => ({
    ...q,
    progress: Math.min(q.target, map[q.id] ?? q.progress),
  }));
}
