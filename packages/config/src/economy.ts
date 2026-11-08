/** All balancing numbers. Import these — never copy the literals into engine code. */
export const ECONOMY = {
  startingCoins: 85000,
  startingGems: 40,
  startingStars: 0,
  ticketMin: 39,
  ticketMax: 149,
  ticketDefault: 74,
  /** Price at which guests are exactly as willing to come as not. */
  ticketReference: 74,
  /**
   * How sharply demand falls as the price rises past the reference.
   *
   * Demand is `2 / (1 + (price / reference) ^ elasticity)`, so revenue peaks at
   * an interior price rather than at the cap. Above 1 the curve has a maximum;
   * at 2.4 it sits near 64 CHF, and the satisfaction penalty pulls it lower
   * still. The old rule only bit above 90 CHF, which made 90 strictly optimal
   * and the whole slider free money.
   */
  priceElasticity: 2.4,
  /** Satisfaction points lost per franc charged above the reference price. */
  pricePenaltyPerFranc: 0.12,
  /**
   * Share of demand that shows up regardless of reputation.
   *
   * The rest scales with last tick's satisfaction, which is what closes the
   * loop: long queues cost guests tomorrow, not just points today. Lagging by
   * a tick keeps it stable and self-correcting instead of a death spiral.
   */
  reputationFloor: 0.45,
  /**
   * Lift rides one guest takes in a day.
   *
   * The flow network counts trips, not people: a skier who laps the same chair
   * six times is one ticket. Paying per trip made every franc of turnover six
   * to eight times too large, so a starter resort paid itself back in minutes
   * and money stopped mattering after the first season.
   */
  ridesPerGuest: 5,
  /** Daily room rate per occupied bed. */
  hotelRatePerBed: 40,
  /** Share of the day's guests who want a bed for the night. */
  overnightShare: 0.35,
  /** Spend per guest in a restaurant or hut, while there are seats. */
  fbPerGuest: 22,
  /** Spend per guest in a shop, while there is shop space. */
  shopPerGuest: 12,
  /** Extra capacity a ski school gives the easy runs. */
  schoolBonus: 0.08,
  /** Extra capacity mountain rescue gives the steep runs. */
  clinicBlackBonus: 0.07,
  lightsDayExtension: 0.12,
  snowmakerQuality: 0.12,
  groomerWaitCut: 0.18,
  /**
   * Share of the build price paid back on demolition.
   *
   * Under half, so tearing down and rebuilding is a correction with a cost
   * rather than a free way to shuffle a resort around. XP and stars already
   * earned are kept: the work was done.
   */
  demolishRefund: 0.45,
  /**
   * «Rückgängig»: for this many seconds after building, the builder can take
   * it back for the full price. A mis-tap on a phone should not cost money.
   * In a match, everything planned for the round counts as still undoable.
   */
  undoSeconds: 30,
  /** Moving a building costs this share of its price. */
  moveCostShare: 0.1,
  /** Free-play speeds: pause, normal, fast. */
  speeds: [0, 1, 3] as readonly number[],
  /** Days of history kept for the charts in Betrieb. */
  historyDays: 30,
  /**
   * Guests per hour that one weighted kilometre of open piste draws.
   *
   * Demand comes from what the mountain offers, not from how many car parks
   * sit in the valley. Car parks, buses and hotels are only the doors guests
   * come in through. The old rule offered a fixed stream per car park, so the
   * winning move was a valley paved with parking and a single T-bar.
   */
  demandPerKm: 300,
  /** How much a kilometre of each grade draws, relative to a blue run. */
  gradeDraw: { blue: 1, red: 1.15, black: 1.25, park: 1.4 } as Record<string, number>,
  /** A snowpark counts as this many kilometres of piste. */
  parkKmEquivalent: 0.6,
  /** Extra demand for each further grade on offer, beyond the first. */
  varietyDemandStep: 0.12,
  /** Extra demand per comfort point (restaurants, huts, spa …), capped. */
  comfortDemandPerPoint: 0.02,
  comfortDemandCap: 0.4,
  /** Extra demand per star of prestige, capped. */
  prestigePerStar: 0.01,
  prestigeCap: 0.4,
  /** Sightseers per hour a cableway that runs both ways draws once the snow is gone. */
  sightseersPerCableway: 120,
  /** Sightseers per hour per point of `summerDraw`. */
  summerDrawScale: 3000,
  /** Guests per hour who can arrive on foot from the village. */
  villageArrivalsPerHour: 120,
  /**
   * Opening season: a new resort is news, and more people come to look than
   * its size alone would draw — the first lift and run already pay. Demand is
   * multiplied by `openingDemand` on day 1 of the first season, fading to 1 by
   * day `openingDays`.
   */
  openingDays: 20,
  openingDemand: 1.6,
  parkingArrivalsPerHour: 320,
  busArrivalsPerHour: 280,
  /** A station brings a whole train of day guests. */
  trainArrivalsPerHour: 520,
  /** Arrivals per hour per hotel bed: hotel guests are already here. */
  bedArrivalsPerHour: 1.2,
  /** Ticket revenue uplift per ticket office. */
  ticketOfficeIncomeBonus: 0.08,
  /** Satisfaction points lost per minute of queueing. */
  waitPenaltyPerMinute: 1.19,
  /** Satisfaction per distinct grade that guests actually ski. */
  varietyBonus: 5,
  targetSatisfaction: 72,
  /** Satisfaction points from a full-quality snowpack. */
  snowSatisfactionWeight: 12,
  /**
   * Satisfaction lost when guests who came to ski had to ride back down.
   *
   * Max-flow cannot tell a run from a cabin ride, so without this a resort
   * with no open piste at all looks perfectly well served — which made pistes
   * optional next to one gondola, and snowmaking pointless with it. Scaled by
   * how much of the year is ski season, so a green-season sightseer is not
   * disappointed by the absence of snow.
   */
  noSkiingPenalty: 26,
  minSatisfaction: 28,
  maxSatisfaction: 99,
  daySecondsReal: 90,
  simTickMs: 1000,
  persistMs: 4000,
  maxVisualSkiers: 56,
  maxVisualGondolas: 22,
  maxTreesHigh: 720,
  maxTreesLow: 260,
} as const;

/**
 * Shape of the transport graph the sim routes guests through.
 *
 * Everything here decides *whether* a layout works, as opposed to how much it
 * earns — those numbers stay in ECONOMY.
 */
export const FLOW = {
  /**
   * Stations and piste ends within this many hexes count as the same place.
   * Raising it forgives sloppy layouts; lowering it demands precise joins.
   */
  linkRadius: 2,
  /** Guests must ride at least one lift before they count as served. */
  requireLift: true,
  /**
   * Valley stations the village reaches on its own — on foot or by ski bus —
   * without a road: within this many hexes of the village…
   */
  villageAccessRadius: 9,
  /**
   * A run ending anywhere within this many hexes of the village centre ends
   * in the village: guests ski home and walk or take the bus to the lifts.
   */
  villageRunRadius: 4,
  /** …and no more than this many metres above it. */
  villageAccessRise: 260,
  /**
   * Extra laps guests ride, as a share of everyone served, on lifts whose runs
   * lead back to their own valley station. Shown on the map and in the lift's
   * panel; takings and queues still follow the guests who came in.
   */
  lapShare: 0.5,
  /** Ceiling on how much wait a saturated edge can add, in minutes. */
  maxWaitMinutes: 28,
  /** Wait added when the busiest edge on the mountain is fully saturated. */
  saturationWaitMinutes: 22,
  /** Baseline wait even on a completely empty lift. */
  baseWaitMinutes: 2.2,
  /** An edge at or above this share of capacity is reported as a bottleneck. */
  bottleneckThreshold: 0.92,
  /** Hex length of one piste segment, in kilometres. */
  kmPerSegment: 0.12,
  /**
   * Metres a run may climb from one hex to the next.
   *
   * Real pistes roll: a short counter-slope is normal, a sustained climb is
   * not. Zero would make almost any hand-drawn line illegal.
   */
  pisteRiseTolerance: 18,
} as const;

/**
 * The year, and the snow line that runs it.
 *
 * Elevation is the one thing a player cannot change about a slope, so tying
 * snow cover to it turns "how high did you build" into a real decision rather
 * than flavour. A run whose bottom sits under the snow line loses the part of
 * itself that is bare; in the green season everything closes and only the
 * cableways that carry guests both ways still earn.
 */
export const SEASON = {
  /** Days in a full year. One day is `daySecondsReal` of real time. */
  daysPerYear: 90,
  /** Share of the year that is deep winter, counted from day 1. */
  winterShare: 0.58,
  /**
   * Share of the year the thaw takes, after winter.
   *
   * Long enough that snowmaking is a real decision. At 0.17 the line climbed
   * some 180 m a day and a full battery of cannons bought about four days,
   * which made them pure cost in winter and too late in spring.
   */
  springShare: 0.24,
  /** Snow line in metres in deep winter: below every piste in the game. */
  winterSnowLine: 1500,
  /** Snow line in metres at the height of summer: above every piste. */
  summerSnowLine: 4200,
  /** Metres of snow line one snow cannon buys back. */
  snowmakerDrop: 140,
  /** Ceiling on that, however many cannons get built. */
  maxSnowmakerDrop: 1200,
  /**
   * Metres below the line over which a run fades out instead of shutting.
   *
   * Wide enough that a partly bare run still carries reduced traffic, so the
   * end of the season is a decline rather than a cliff.
   */
  fadeMetres: 400,
  /** How far a full swing in snow quality moves the line, in metres. */
  weatherSwingMetres: 300,
  /** Demand left in the green season, when nobody is coming to ski. */
  summerDemandShare: 0.45,
} as const;

export const LEVEL = {
  base: 90,
  exponent: 1.65,
  max: 40,
} as const;

export const UPGRADES = [
  { key: "speed" as const, label: "Geschwindigkeit", max: 3, cost: [1500, 4200, 9000] },
  { key: "cabins" as const, label: "Kabinen", max: 3, cost: [2200, 5600, 12000] },
  { key: "capacity" as const, label: "Kapazität", max: 3, cost: [1800, 5000, 11000] },
];

export type UpgradeKey = (typeof UPGRADES)[number]["key"];

/**
 * Every building grows instead of multiplying: another deck, another bus
 * line, another wing, more seats. One building does the work of several, so
 * the valley floor is not paved over with copies.
 *
 * A building starts at level 1 and goes up to `maxLevel`. Going from level n
 * to n + 1 costs `costShare[n - 1]` of the building's price — a little less
 * than a second building at first, a little more at the top, since the land is
 * free. Each level adds `upkeepPerLevel` of the base upkeep and, by effect:
 * - capacity (arrivals, seats, shop customers): `capacityPerLevel` of level 1;
 * - hotel beds: `bedsPerLevel` (beds stay the reason to build a better hotel);
 * - bonuses (comfort, summer draw, ticket office, snowmaking, ski school,
 *   rescue, lights, grooming): `bonusPerLevel`;
 * - a workshop's upkeep cut: `cutPerLevel` (the depot stays the bigger one).
 * Decoration that only stands there (trees, rocks) does not grow, and lift
 * stations grow with their lift (see UPGRADES).
 */
export const BUILDING_LEVELS = {
  maxLevel: 4,
  costShare: [0.8, 1.0, 1.2],
  upkeepPerLevel: 0.8,
  capacityPerLevel: 1,
  bedsPerLevel: 0.5,
  bonusPerLevel: 0.5,
  cutPerLevel: 0.25,
  fixed: ["tree", "rock"] as readonly string[],
  /** What a level is called, for items with their own words. Others: "Stufe n". */
  labels: {
    parking: ["Ein Deck", "Zwei Decks", "Drei Decks", "Vier Decks"],
    bus: ["Eine Linie", "Zwei Linien", "Dichter Takt", "Drehkreuz"],
    hotel1: ["Stammhaus", "Anbau", "Neuer Flügel", "Ganzes Quartier"],
    hotel3: ["Stammhaus", "Anbau", "Neuer Flügel", "Ganzes Quartier"],
    hotel5: ["Stammhaus", "Anbau", "Neuer Flügel", "Ganzes Quartier"],
    "hotel-resort": ["Stammhaus", "Anbau", "Neuer Flügel", "Ganzes Quartier"],
    restaurant: ["Gaststube", "Terrasse", "Zweiter Saal", "Grossrestaurant"],
    hut: ["Stube", "Terrasse", "Anbau", "Berghaus"],
    apres: ["Bar", "Zelt", "Dancefloor", "Kultlokal"],
    "gastro-hall": ["Halle", "Zweite Ausgabe", "Galerie", "Food Court"],
    shop: ["Laden", "Verleih", "Testcenter", "Flagship"],
    ticket: ["Schalter", "Automaten", "Drive-in", "Online-Kasse"],
    snowmaker: ["Lanzen", "Kanonen", "Speichersee", "Vollautomatik"],
    groomer: ["Eine Raupe", "Zwei Raupen", "Winden-Raupe", "Flotte"],
  } as Record<string, string[]>,
} as const;

/**
 * Runs grow too: snow guns along them, a better grooming plan, a race
 * course. Level 1 is a plain groomed run; levels 2–4 add in order:
 * - Beschneit: the run counts `snowmakingMetres` higher against the snow
 *   line, so it opens earlier and stays open longer in the thaw;
 * - Gepflegt and Rennpiste: more guests per hour (`capacity`) and more
 *   reason to come (`draw`), both as factors of a level-1 run.
 * Each step costs `costPerSegment[n - 1]` per segment; upkeep rises by
 * `upkeepPerLevel` of the base per level. Roads stay roads.
 */
export const PISTE_LEVELS = {
  maxLevel: 4,
  costPerSegment: [900, 700, 1100],
  upkeepPerLevel: 0.5,
  snowmakingMetres: 300,
  capacity: [1, 1, 1.25, 1.4],
  draw: [1, 1, 1.1, 1.25],
  labels: ["Präpariert", "Beschneit", "Gepflegt", "Rennpiste"],
  effects: ["", "Länger Schnee, auch unter der Schneegrenze", "+25 % Gäste/h, +10 % Anziehung", "+40 % Gäste/h, +25 % Anziehung"],
} as const;

/**
 * How picky «Pisten automatisch» is about runs beyond the missing descents.
 * It builds an extra run only if the simulation says it pays for itself
 * within `paybackDays` of good winter days, at most `maxExtraRuns` per plan,
 * considering up to `candidateLimit` lines per round. Not balancing: these
 * shape what the planner proposes, never what anything costs or earns.
 */
export const PISTE_PLANNER = {
  paybackDays: 30,
  maxExtraRuns: 6,
  candidateLimit: 72,
  /** A new run may share at most this much of its line with existing ones. */
  maxOverlap: 0.4,
} as const;

/**
 * Where a building stands.
 *
 * Every building that serves guests has a location factor, 1 at an ordinary
 * spot, that scales what it does: a restaurant's seats, a shop's customers,
 * a hotel's room rate, a ticket office's takings, the ski school's bonus.
 * Deliberately mild, as in a real resort: a good spot is worth about a tenth
 * more, a poor one costs up to a quarter. Placement matters without turning
 * the valley into a puzzle.
 */
export const SITE = {
  /** Bounds of the factor. */
  min: 0.75,
  max: 1.2,
  /** "Next to" a run or a station: within this many hexes. */
  near: 2,

  // Food (restaurants, huts, après-ski): lives off the skiers passing by.
  /** Next to a run or a lift station. */
  foodOnRun: 0.05,
  /** At a meeting point: this many runs and lifts within `near`… */
  junctionCount: 3,
  /** …adds this on top. */
  foodJunction: 0.05,
  /** Farther than this from any run or station… */
  foodFar: 4,
  /** …it sees only the few who walk there. */
  foodRemote: -0.25,
  /** Another food place right next door shares the same passers-by. */
  foodRival: -0.08,
  /** At most this many rivals count. */
  maxRivals: 2,

  // Trade (shop, ski school, ticket office): where guests start their day.
  /** Within this many hexes of a valley station or the village… */
  tradeReach: 3,
  /** …it does a little better. */
  tradeNear: 0.08,
  /** Farther than this, few guests find it. */
  tradeFar: 6,
  tradeRemote: -0.2,

  // Hotels: the room rate.
  /** Within this many hexes of a run: ski-in, ski-out. */
  skiInReach: 1,
  bedsSkiIn: 0.1,
  /** Within this many hexes of the village centre. */
  villageReach: 3,
  bedsVillage: 0.05,
  /** Per noisy neighbour within one hex (car park, bus, workshop, depot, groomers). */
  noise: -0.06,
  maxNoise: 3,
  noisy: ["parking", "bus", "train", "workshop", "depot", "groomer"],
  /** Per stone pine within one hex. */
  quiet: 0.02,
  maxQuiet: 3,
  /** A spa within this many hexes lifts the rate. */
  spaReach: 2,
  bedsSpa: 0.05,

  // The village optimiser (proposes moves, never forced).
  /** How far from the village and the valley stations it looks for places. */
  villageRadius: 7,
  stationRadius: 4,
  /** A move must lift the building's own factor-weighted value by at least this share. */
  minGain: 0.03,
  /** At most this many moves per proposal. */
  maxMoves: 12,
} as const;

/**
 * Playing together: which actions wait for the partner's yes, and when
 * coming back shows what happened in the meantime.
 */
export const TEAMPLAY = {
  /**
   * Default: an action that costs more than this becomes a proposal the other
   * player confirms. 0 switches proposals off. The village optimiser always
   * asks, because it moves the other player's buildings too.
   */
  proposalLimit: 50_000,
  /** The choices offered in the menu. */
  proposalLimits: [0, 20_000, 50_000, 100_000],
  maxOpenProposals: 5,
  maxProposalIntents: 16,
  /** Away at least this long, coming back shows a summary. */
  awayMinutes: 10,
} as const;

/**
 * How good a run is to ski: up to 100 points from its drop, its length, its
 * turns and how its pitch changes. Points give XP when it is built and draw
 * a few more guests — a flowing, varied run is worth more than a straight
 * chute of the same length, but not so much that the map is about points.
 */
export const PISTE_SCORE = {
  /** Shares of the 100 points. */
  weights: { drop: 25, length: 20, turns: 30, variety: 25 },
  /** Full marks at this many metres of drop… */
  fullDrop: 650,
  /** …this many hexes… */
  fullLength: 26,
  /** …this many swings (left-right changes of direction)… */
  fullTurns: 4,
  /** …and this many changes of pitch along the way. */
  fullChanges: 3,
  /** A swing counts once the line has turned this far, in radians. */
  swingAngle: 0.35,
  /** XP per point when built. */
  xpPerPoint: 0.6,
  /** Extra draw per point: 100 points = +15 % for that run. */
  drawPerPoint: 0.0015,
  /** The auto planner values a point this much against its money gain (share of the gain per 100 points). */
  plannerWeight: 0.3,
  /** Reshaping a run: the old line's grooming counts this much against the new one's price. */
  reshapeCredit: 0.5,
  /** A new line must be at least this many points better to be offered. */
  reshapeMinGain: 8,
} as const;

/**
 * Where a building may stand. In the valley, along a road or in the village
 * streets; on the mountain, beside a run or a lift station — nobody builds a
 * hotel in the middle of a meadow or a hut where no skier passes. Some, like
 * a restaurant, work in either place. Buildings already standing keep their
 * place when the rules change.
 */
export const ACCESS = {
  /** Within this many hexes of a road (or the village streets) counts as on it. */
  roadReach: 1,
  /** The village's own streets: this many hexes around its centre. */
  villageStreets: 4,
  /** Within this many hexes of a run or a lift station counts as beside it. */
  pisteReach: 1,
  road: [
    "hotel1", "hotel3", "hotel5", "hotel-resort", "shop", "skischool", "ticket", "spa",
    "parking", "bus", "train", "workshop", "depot", "cablecar-museum",
  ] as string[],
  piste: ["hut", "viewpoint", "snowmaker", "lights"] as string[],
  either: ["restaurant", "apres", "gastro-hall", "groomer", "clinic"] as string[],
};
