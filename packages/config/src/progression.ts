/**
 * Progression across seasons in free play: the resort's rank, the season
 * report, and the long-term goals. Matches keep their own medals (see
 * match.ts). All numbers here; the engine is `engine/progression.ts`.
 */

export interface ProgressReward {
  coins: number;
  gems: number;
  /** Prestige stars: each one draws `ECONOMY.prestigePerStar` more guests. */
  stars: number;
}

export type RankFactorId = "guests" | "satisfaction" | "pisteKm" | "pistePoints" | "variety" | "beds" | "share";

export interface RankFactorDef {
  id: RankFactorId;
  /** Shown in the breakdown. */
  label: string;
  /** Shown as «Am meisten hilft: …» when this factor has the most points left. */
  hint: string;
  /** Points of the 100 this factor is worth. */
  weight: number;
  /** Counts only in proportion to the area's size (see RANK.gateKm). */
  gated?: boolean;
  /** Value that earns nothing… */
  from: number;
  /** …and value that earns the full weight; linear in between. */
  full: number;
}

export interface RankTierDef {
  id: string;
  name: string;
  /** Score (0 … 100) at which the tier starts. */
  min: number;
  /** Paid once, the first time the tier is reached. */
  reward: ProgressReward;
}

export const RANK = {
  /**
   * What makes a resort a big name, weighted to 100 points. Guests per season
   * counts the better of the season so far and the last finished one, so a
   * new season does not knock the rank back on its first morning.
   */
  factors: [
    { id: "guests", label: "Gäste pro Saison", hint: "Mehr Gäste pro Saison", weight: 25, from: 0, full: 120_000 },
    { id: "satisfaction", label: "Zufriedenheit", hint: "Zufriedenheit", weight: 15, gated: true, from: 55, full: 90 },
    { id: "pisteKm", label: "Pisten-km", hint: "Mehr Pisten-km", weight: 15, from: 0, full: 30 },
    { id: "pistePoints", label: "Pistenqualität", hint: "Bessere Pisten (Punkte)", weight: 10, gated: true, from: 0, full: 80 },
    { id: "variety", label: "Abwechslung", hint: "Mehr Abwechslung (Blau, Rot, Schwarz, Park)", weight: 10, from: 1, full: 4 },
    { id: "beds", label: "Betten", hint: "Mehr Hotelbetten", weight: 10, from: 0, full: 3000 },
    { id: "share", label: "Marktanteil", hint: "Marktanteil gegen die Nachbarn", weight: 15, gated: true, from: 0.6, full: 1 },
  ] as readonly RankFactorDef[],
  /**
   * Km of run at which the `gated` factors (satisfaction, run quality, market
   * share) count in full; below it they count in proportion. Happy guests on
   * one short T-bar run are not yet a famous resort.
   */
  gateKm: 8,
  /** Satisfaction is read as the mean of this many finished days, not the moment. */
  satisfactionDays: 7,
  /** Ordered, first one starts at 0. Stars shown = index + 1. */
  tiers: [
    { id: "dorflift", name: "Dorflift", min: 0, reward: { coins: 0, gems: 0, stars: 0 } },
    { id: "familie", name: "Familiengebiet", min: 25, reward: { coins: 20_000, gems: 10, stars: 1 } },
    { id: "regional", name: "Regionales Skigebiet", min: 45, reward: { coins: 50_000, gems: 20, stars: 2 } },
    { id: "bekannt", name: "Bekanntes Skigebiet", min: 65, reward: { coins: 120_000, gems: 40, stars: 3 } },
    { id: "weltklasse", name: "Weltklasse", min: 85, reward: { coins: 300_000, gems: 80, stars: 5 } },
  ] as readonly RankTierDef[],
  /** «Am meisten hilft»: this many factors, those with the most points left. */
  hints: 2,
} as const;

/** The season report («Saisonbilanz»). */
export const SEASON_REPORT = {
  /** Finished seasons kept in the save, oldest dropped first. */
  historySeasons: 12,
} as const;

export type LongGoalMetric =
  /** Longest black run, km. */
  | "blackRunKm"
  /** Best points of a black run at least `WELTCUP.raceKm` long. */
  | "raceRunPoints"
  /** Highest lift station, real metres above sea level. */
  | "topStationM"
  | "beds"
  /** Neighbour areas neither bought nor in a «Tarifverbund»; done at 0. */
  | "neighboursOpen"
  /** Guests in the best season, the running one included. */
  | "seasonGuests";

export interface LongGoalNeed {
  metric: LongGoalMetric;
  target: number;
  label: string;
}

export interface LongGoalDef {
  id: string;
  title: string;
  hint: string;
  needs: LongGoalNeed[];
  reward: ProgressReward;
  /** A one-off event the goal unlocks when it is met. */
  event?: "weltcup";
}

/** The Weltcup race day that «Weltcup-Rennen ausrichten» unlocks. */
export const WELTCUP = {
  /** The race run: black, at least this long, km. */
  raceKm: 2,
  /** Days after the goal is met that the race is held (1 = the next day). */
  leadDays: 1,
  /** Demand on race day, as a multiple. */
  demand: 2.5,
  /** Prestige stars when the race has been held. */
  stars: 3,
  /** Takings bonus paid when the race has been held (TV rights, sponsors). */
  coins: 60_000,
} as const;

export const LONG_GOALS: LongGoalDef[] = [
  {
    id: "weltcup",
    title: "Weltcup-Rennen ausrichten",
    hint: "Eine lange, anspruchsvolle schwarze Piste, eine Bahn hoch hinauf und genug Betten für Teams und Fans.",
    needs: [
      { metric: "blackRunKm", target: WELTCUP.raceKm, label: `Schwarze Piste ab ${WELTCUP.raceKm} km` },
      { metric: "raceRunPoints", target: 65, label: "Rennpiste mit 65 Punkten" },
      { metric: "topStationM", target: 2600, label: "Bahn auf 2'600 m" },
      { metric: "beds", target: 1200, label: "1'200 Betten" },
    ],
    reward: { coins: 150_000, gems: 50, stars: 2 },
    event: "weltcup",
  },
  {
    id: "gletscher",
    title: "Gletscherbahn auf über 3'000 m",
    hint: "Eine Bergstation über 3'000 m: Schnee bis in den Frühsommer.",
    needs: [{ metric: "topStationM", target: 3000, label: "Bergstation über 3'000 m" }],
    reward: { coins: 100_000, gems: 40, stars: 2 },
  },
  {
    id: "tarifverbund",
    title: "Alle Nachbarn im Tarifverbund oder gekauft",
    hint: "Kein Nachbar nimmt euch mehr Gäste weg. Braucht Nachbarn (Menü).",
    needs: [{ metric: "neighboursOpen", target: 0, label: "Eigenständige Nachbarn" }],
    reward: { coins: 80_000, gems: 30, stars: 2 },
  },
  {
    id: "hunderttausend",
    title: "100'000 Gäste in einer Saison",
    hint: "Eine ganze Saison lang volle Pisten.",
    needs: [{ metric: "seasonGuests", target: 100_000, label: "Gäste in einer Saison" }],
    reward: { coins: 200_000, gems: 60, stars: 3 },
  },
];
