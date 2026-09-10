export interface QuestDef {
  id: string;
  title: string;
  hint: string;
  xp: number;
  coins: number;
  gems: number;
  target: number;
  metric: "tbar" | "blue" | "restaurant" | "visitorsTotal" | "hotel" | "lifts" | "pisteSeg" | "satisfaction" | "gondola" | "visitorsToday";
}

export const QUEST_DEFS: QuestDef[] = [
  { id: "q1", title: "Erster Schlepplift", hint: "Verbinde zwei Haenge mit einem Schlepplift.", xp: 40, coins: 2500, gems: 10, target: 1, metric: "tbar" },
  { id: "q2", title: "Blaue Abfahrt", hint: "Zeichne eine blaue Piste den Hang hinunter.", xp: 30, coins: 1800, gems: 8, target: 1, metric: "blue" },
  { id: "q3", title: "Einkehrschwung", hint: "Baue ein Restaurant an der Piste.", xp: 35, coins: 2200, gems: 8, target: 1, metric: "restaurant" },
  { id: "q4", title: "Talabfahrt", hint: "Befoerdere 1.000 Skifahrer.", xp: 50, coins: 4000, gems: 15, target: 1000, metric: "visitorsTotal" },
  { id: "q5", title: "Uebernachten", hint: "Errichte ein Hotel im Dorf.", xp: 55, coins: 6000, gems: 20, target: 1, metric: "hotel" },
  { id: "q6", title: "Drei Bahnen", hint: "Baue 3 Lifte oder Bahnen.", xp: 70, coins: 8000, gems: 25, target: 3, metric: "lifts" },
  { id: "q7", title: "Pistennetz", hint: "Lege 8 Pistensegmente an.", xp: 60, coins: 5000, gems: 12, target: 8, metric: "pisteSeg" },
  { id: "q8", title: "Zufriedenheit", hint: "Erreiche 80 % Zufriedenheit.", xp: 80, coins: 9000, gems: 30, target: 80, metric: "satisfaction" },
  { id: "q9", title: "Gondel in die Höhe", hint: "Baue eine Gondelbahn.", xp: 90, coins: 12000, gems: 35, target: 1, metric: "gondola" },
  { id: "q10", title: "Tagestouristen", hint: "5.000 Personen an einem Tag.", xp: 100, coins: 15000, gems: 40, target: 5000, metric: "visitorsToday" },
];
