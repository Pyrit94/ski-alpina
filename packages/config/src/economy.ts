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
  parkingArrivalsPerHour: 320,
  busArrivalsPerHour: 280,
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
