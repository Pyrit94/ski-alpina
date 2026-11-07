/**
 * A match: a fixed number of rounds with an end and a score.
 *
 * Free play runs on a clock and never finishes, which is fine for tinkering
 * but not for two people who want a game that is over after a few evenings.
 * A round is a stretch of days that only passes once everyone online has
 * pressed "Runde beenden", so nobody misses anything by being away.
 */
export type MatchPresetId = "kurz" | "normal" | "lang";

export interface MatchPresetDef {
  id: MatchPresetId;
  label: string;
  hint: string;
  /** Years ("Saisons") the match lasts. */
  seasons: number;
  startingCoins: number;
}

export const MATCH = {
  /** Days one round covers. */
  daysPerRound: 10,
  /**
   * Days of a match season, counted from the first day of winter.
   *
   * Sixty days are deep winter and the start of the thaw: the part where decisions about
   * snow and capacity matter. The green season after that is skipped as a
   * summer break, because three rounds of an empty mountain were three rounds
   * of watching money drain away with nothing to decide.
   */
  seasonDays: 60,
  /** Hours simulated per day when resolving a round. */
  stepsPerDay: 12,
  presets: [
    { id: "kurz", label: "Kurz", hint: "1 Saison · 6 Runden · ein Abend", seasons: 1, startingCoins: 90000 },
    { id: "normal", label: "Normal", hint: "2 Saisons · 12 Runden", seasons: 2, startingCoins: 85000 },
    { id: "lang", label: "Lang", hint: "3 Saisons · 18 Runden", seasons: 3, startingCoins: 80000 },
  ] as MatchPresetDef[],
  /**
   * Guests over one season needed for each medal, for season 1. Later seasons
   * multiply by `goalGrowth` per season: the resort is expected to grow.
   */
  goals: { bronze: 2800, silber: 5600, gold: 9000 },
  goalGrowth: 2,
  /** Final score: how each part converts into points. */
  score: {
    /** Points per 1'000 CHF of cash, plus `assetShare` of what is built. */
    perThousandChf: 1,
    /**
     * Built things count at half their price, so the last round is a real
     * decision: a lift bought now must earn back half its cost to be worth it.
     */
    assetShare: 0.5,
    /** Points per 100 guests over the whole match. */
    perHundredGuests: 2,
    /** Points per point of average satisfaction. */
    perSatisfaction: 2,
    medal: { gold: 200, silber: 100, bronze: 50 },
  },
  /**
   * Reward when two or more players each built something in a round.
   *
   * A two-person game drifts into one person playing while the other
   * watches. A small, visible bonus for both having a hand in every round
   * nudges against that without punishing anyone.
   */
  teamwork: { coins: 4000, stars: 1 },
  /** How many results the hall of fame keeps. */
  hallOfFameSize: 10,
} as const;

/** Effects an event option puts on one round, or on the rest of the match. */
export interface EventEffect {
  coins?: number;
  stars?: number;
  demand?: number;
  snow?: number;
  wait?: number;
  upkeep?: number;
  ticket?: number;
  closed?: ("blue" | "red" | "black" | "park")[];
  /** Apply for the rest of the match instead of only this round. */
  lasting?: boolean;
}

export interface EventOption {
  label: string;
  detail: string;
  effect: EventEffect;
  /** Option only offered when the resort can pay for it. */
  cost?: number;
}

export interface EventDef {
  id: string;
  title: string;
  body: string;
  /** Only drawn in this part of the year. */
  phase?: "winter" | "spring" | "summer";
  options: [EventOption, EventOption];
}

/**
 * Round events. One is drawn per round (deterministically from the round
 * number, so both players see the same one) and the players pick an option.
 * The second option is always the "do nothing" choice and is what applies if
 * nobody decides before the round ends.
 */
export const EVENTS: EventDef[] = [
  {
    id: "weltcup",
    title: "Weltcup-Anfrage",
    body: "Der Skiverband sucht kurzfristig einen Austragungsort. Das kostet, bringt aber Publikum und Prestige.",
    phase: "winter",
    options: [
      { label: "Zusagen", detail: "−15'000 CHF · +35 % Gäste · +3 Sterne", cost: 15000, effect: { coins: -15000, demand: 1.35, stars: 3 } },
      { label: "Absagen", detail: "Nichts passiert", effect: {} },
    ],
  },
  {
    id: "foehn",
    title: "Föhnsturm angekündigt",
    body: "Warmer Südwind bläst über den Alpenkamm. Ohne Vorbereitung leidet die Piste.",
    phase: "winter",
    options: [
      { label: "Pisten sichern", detail: "−6'000 CHF · Schnee bleibt gut", cost: 6000, effect: { coins: -6000 } },
      { label: "Abwarten", detail: "Schneequalität −30 % diese Runde", effect: { snow: -0.3 } },
    ],
  },
  {
    id: "pistenbully",
    title: "Pistenbully defekt",
    body: "Eine Raupe steht mit Getriebeschaden in der Garage.",
    options: [
      { label: "Sofort reparieren", detail: "−8'000 CHF", cost: 8000, effect: { coins: -8000 } },
      { label: "Warten", detail: "Wartezeiten +35 % diese Runde", effect: { wait: 1.35 } },
    ],
  },
  {
    id: "ferien",
    title: "Ferienbeginn im Unterland",
    body: "Die Sportferien beginnen. Die Hotels sind ausgebucht, die Strassen voll.",
    phase: "winter",
    options: [
      { label: "Preise anheben", detail: "+25 % Gäste · +15 % Ticketeinnahmen · Zufriedenheit leidet", effect: { demand: 1.25, ticket: 1.15, wait: 1.15 } },
      { label: "Preise halten", detail: "+25 % Gäste", effect: { demand: 1.25 } },
    ],
  },
  {
    id: "lawine",
    title: "Lawinengefahr Stufe 4",
    body: "Nach starkem Neuschnee meldet das SLF erhebliche Lawinengefahr im Steilgelände.",
    phase: "winter",
    options: [
      { label: "Sprengen lassen", detail: "−7'000 CHF · alles bleibt offen", cost: 7000, effect: { coins: -7000, snow: 0.1 } },
      { label: "Schwarze Pisten sperren", detail: "Schwarze Pisten diese Runde zu", effect: { closed: ["black"], snow: 0.1 } },
    ],
  },
  {
    id: "strom",
    title: "Strompreise steigen",
    body: "Der Energieversorger erhöht die Tarife für den Rest der Saison.",
    options: [
      { label: "Solaranlage bauen", detail: "−25'000 CHF · Unterhalt −8 % bis Spielende", cost: 25000, effect: { coins: -25000, upkeep: 0.92, lasting: true } },
      { label: "Tarif akzeptieren", detail: "Unterhalt +12 % bis Spielende", effect: { upkeep: 1.12, lasting: true } },
    ],
  },
  {
    id: "influencer",
    title: "Influencerin im Anflug",
    body: "Eine Wintersport-Influencerin will ein Wochenende lang aus dem Gebiet berichten.",
    phase: "winter",
    options: [
      { label: "Einladen", detail: "−4'000 CHF · +15 % Gäste · +1 Stern", cost: 4000, effect: { coins: -4000, demand: 1.15, stars: 1 } },
      { label: "Ablehnen", detail: "Nichts passiert", effect: {} },
    ],
  },
  {
    id: "kanonen",
    title: "Förderprogramm Beschneiung",
    body: "Der Kanton unterstützt technischen Schnee – mit Auflagen beim Wasserverbrauch.",
    options: [
      { label: "Mitmachen", detail: "+12'000 CHF · Schnee −5 % bis Spielende", effect: { coins: 12000, snow: -0.05, lasting: true } },
      { label: "Verzichten", detail: "Nichts passiert", effect: {} },
    ],
  },
  {
    id: "bergfruehling",
    title: "Frühlingsfest",
    body: "Sonne, Sulzschnee und Musik auf der Terrasse – wenn man es organisiert.",
    phase: "spring",
    options: [
      { label: "Fest organisieren", detail: "−5'000 CHF · +20 % Gäste", cost: 5000, effect: { coins: -5000, demand: 1.2 } },
      { label: "Normalbetrieb", detail: "Nichts passiert", effect: {} },
    ],
  },
  {
    id: "wanderer",
    title: "Wandersaison",
    body: "Ein Reiseveranstalter bietet Gruppenreisen an – wenn Bahnen auch im Sommer fahren.",
    phase: "summer",
    options: [
      { label: "Kooperation", detail: "−3'000 CHF · +40 % Sommergäste", cost: 3000, effect: { coins: -3000, demand: 1.4 } },
      { label: "Ablehnen", detail: "Nichts passiert", effect: {} },
    ],
  },
  {
    id: "revision",
    title: "Seilbahn-Revision fällig",
    body: "Das Bundesamt für Verkehr verlangt eine Revision. Jetzt oder mit Auflagen später.",
    options: [
      { label: "Jetzt revidieren", detail: "−10'000 CHF · Unterhalt −5 % bis Spielende", cost: 10000, effect: { coins: -10000, upkeep: 0.95, lasting: true } },
      { label: "Aufschieben", detail: "Wartezeiten +20 % diese Runde", effect: { wait: 1.2 } },
    ],
  },
  {
    id: "neuschnee",
    title: "Ein Meter Neuschnee",
    body: "Über Nacht ist der Winter zurück. Die Pistenbullys laufen heiss.",
    phase: "winter",
    options: [
      { label: "Powder-Day ausrufen", detail: "+20 % Gäste · Schnee +20 %", effect: { demand: 1.2, snow: 0.2 } },
      { label: "Erst präparieren", detail: "Schnee +25 % · Wartezeit −10 %", effect: { snow: 0.25, wait: 0.9 } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Rules you can switch per match (and most of them per round)
// ---------------------------------------------------------------------------

/**
 * Figures a goal or a VIP wish can ask for. The engine knows how to read each
 * one off the resort (`engine/rules.ts`), so new goals are data, not code.
 */
export type RuleMetric =
  | "blackRuns"
  | "redRuns"
  | "blueKm"
  | "pisteKm"
  | "lifts"
  | "cableways"
  | "beds"
  | "hotels3"
  | "foodPlaces"
  | "snowmakers"
  | "parks"
  | "satisfaction"
  | "cash"
  | "guestsLastRound"
  | "verticalPerHour"
  | "spa";

export interface RuleCondition {
  metric: RuleMetric;
  target: number;
}

export interface SecretGoalDef {
  id: string;
  title: string;
  hint: string;
  points: number;
  all: RuleCondition[];
}

/** One secret goal per player when the rule is on. Checked at the end. */
export const SECRET_GOALS: SecretGoalDef[] = [
  { id: "schwarz", title: "Steilhang-Fan", hint: "Mindestens 3 schwarze Pisten", points: 90, all: [{ metric: "blackRuns", target: 3 }] },
  { id: "familien", title: "Familienparadies", hint: "Mindestens 4 km blaue Pisten", points: 80, all: [{ metric: "blueKm", target: 4 }] },
  { id: "betten", title: "Bettenkönig:in", hint: "Mindestens 400 Betten", points: 90, all: [{ metric: "beds", target: 400 }] },
  { id: "schnee", title: "Schneesicher", hint: "Mindestens 4 Beschneiungsanlagen", points: 70, all: [{ metric: "snowmakers", target: 4 }] },
  { id: "bahnen", title: "Seilbahn-Netz", hint: "Mindestens 6 Bahnen, davon 2 Kabinenbahnen", points: 100, all: [{ metric: "lifts", target: 6 }, { metric: "cableways", target: 2 }] },
  { id: "kasse", title: "Sparfuchs", hint: "Am Ende mindestens 250'000 CHF in der Kasse", points: 80, all: [{ metric: "cash", target: 250000 }] },
  { id: "geniesser", title: "Geniesser:in", hint: "5 Restaurants, Hütten oder Après-Ski", points: 70, all: [{ metric: "foodPlaces", target: 5 }] },
  { id: "park", title: "Freestyle", hint: "2 Snowparks und 3 rote Pisten", points: 90, all: [{ metric: "parks", target: 2 }, { metric: "redRuns", target: 3 }] },
  { id: "hoehe", title: "Höhenmeter-Jäger:in", hint: "100'000 Höhenmeter pro Stunde", points: 90, all: [{ metric: "verticalPerHour", target: 100000 }] },
  { id: "zufrieden", title: "Gastgeber:in", hint: "Am Ende mindestens 85 % Zufriedenheit", points: 80, all: [{ metric: "satisfaction", target: 85 }] },
];

export interface VipDef {
  id: string;
  name: string;
  wish: string;
  /** Rounds from the one it appears in, including that round. */
  rounds: number;
  all: RuleCondition[];
  rewardCoins: number;
  rewardStars: number;
}

/** VIP guests with a wish and a deadline. A miss costs a star. */
export const VIPS: VipDef[] = [
  { id: "meier", name: "Familie Meier", wish: "eine Kinderpiste: 2 km blaue Pisten", rounds: 3, all: [{ metric: "blueKm", target: 2 }], rewardCoins: 12000, rewardStars: 2 },
  { id: "racer", name: "Skiclub Zermatt", wish: "2 schwarze Pisten fürs Training", rounds: 3, all: [{ metric: "blackRuns", target: 2 }], rewardCoins: 15000, rewardStars: 2 },
  { id: "hotel", name: "Reisebüro Kuoni", wish: "ein Hotel ★★★ für ihre Gruppen", rounds: 3, all: [{ metric: "hotels3", target: 1 }], rewardCoins: 18000, rewardStars: 2 },
  { id: "gondel", name: "Bergsteiger-Verein", wish: "eine Kabinenbahn auf den Berg", rounds: 4, all: [{ metric: "cableways", target: 1 }], rewardCoins: 20000, rewardStars: 3 },
  { id: "gourmet", name: "Gault-Millau-Testerin", wish: "3 Restaurants und 80 % Zufriedenheit", rounds: 3, all: [{ metric: "foodPlaces", target: 3 }, { metric: "satisfaction", target: 80 }], rewardCoins: 16000, rewardStars: 3 },
  { id: "snow", name: "SRF Meteo", wish: "3 Beschneiungsanlagen für die Live-Schaltung", rounds: 3, all: [{ metric: "snowmakers", target: 3 }], rewardCoins: 14000, rewardStars: 2 },
  { id: "park", name: "Freeski-Crew", wish: "einen Snowpark", rounds: 3, all: [{ metric: "parks", target: 1 }], rewardCoins: 12000, rewardStars: 2 },
  { id: "masse", name: "Firmenausflug Roche", wish: "1'500 Gäste in einer Runde", rounds: 3, all: [{ metric: "guestsLastRound", target: 1500 }], rewardCoins: 20000, rewardStars: 2 },
  { id: "wellness", name: "Wellness-Bloggerin", wish: "ein Berg-Spa", rounds: 4, all: [{ metric: "spa", target: 1 }], rewardCoins: 18000, rewardStars: 2 },
  { id: "betten", name: "Ski-WM-Delegation", wish: "300 Betten im Tal", rounds: 4, all: [{ metric: "beds", target: 300 }], rewardCoins: 25000, rewardStars: 3 },
];

export const RULES = {
  /** Chance that a new VIP turns up in a round without one. */
  vipChance: 0.5,
  /** Stars lost when a VIP wish is missed. */
  vipMissStars: 1,
  /**
   * Item categories each role may build in "roles" mode. The mountain runs
   * the skiing, the valley the stay; the money is shared by `roleSplit`.
   */
  roleCategories: {
    berg: ["lifts", "pistes"],
    tal: ["buildings", "services", "deco"],
  } as Record<"berg" | "tal", string[]>,
  /** Items that belong to the mountain even though their category says valley. */
  bergItems: ["snowmaker", "groomer", "lights", "viewpoint", "clinic"],
  /** Duel: points per 1'000 CHF of own cash and own assets, per 100 own guests. */
  duel: { perThousandChf: 1, assetShare: 0.5, perHundredGuests: 2 },
};
