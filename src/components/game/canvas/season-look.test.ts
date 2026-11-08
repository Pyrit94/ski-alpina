import assert from "node:assert/strict";
import { test } from "node:test";
import { SEASON } from "../../../../packages/config/src/economy.ts";
import { naturalSnowLine } from "../../../../packages/shared/src/engine/season.ts";
import {
  AUTUMN_FROM,
  isGreenSeason,
  quantiseLook,
  seasonGuestNote,
  seasonLabel,
  seasonLook,
  snowCoverAt,
  visualSeason,
  type SeasonLook,
} from "./season-look.ts";
import { groundAlbedo, PALETTE } from "./terrain-shading.ts";

/** Grindelwald: village at 1'034 m real, 1'600 m gameplay. */
const OFFSET = 566;
const YEAR = SEASON.daysPerYear;
/** A fair day: what most of the year's weather looks like. */
const FAIR = 0.85;
const dayAt = (share: number) => 1 + share * YEAR;

/** The valley floor and the high peaks, gameplay metres. */
const VALLEY = 1450;
const PEAK = 3950 + OFFSET;
const MID = 2400;

test("deep winter is white down to the valley floor, whatever the weather", () => {
  for (const day of [1, 10, 30, 50]) {
    for (const q of [0, 0.5, 1]) {
      const look = seasonLook(day, q, OFFSET);
      assert.equal(look.season, "winter");
      assert.ok(snowCoverAt(VALLEY, look.snowLineM) > 0.99, `day ${day} q ${q}: valley under snow (line ${look.snowLineM})`);
    }
  }
});

test("spring: the snow retreats upward, the valley melts out first", () => {
  const early = seasonLook(dayAt(SEASON.winterShare + 0.04), FAIR, OFFSET);
  const late = seasonLook(dayAt(SEASON.winterShare + SEASON.springShare - 0.03), FAIR, OFFSET);
  assert.equal(early.season, "spring");
  assert.equal(late.season, "spring");
  assert.ok(late.snowLineM > early.snowLineM + 800, "the line climbs through the thaw");
  assert.ok(snowCoverAt(VALLEY, late.snowLineM) < 0.01, "late spring: the valley is green");
  assert.ok(snowCoverAt(PEAK, late.snowLineM) > 0.99, "late spring: the peaks are still white");
  // Once caught up, the eye's line is the simulation's (below the firn line).
  const mid = dayAt(SEASON.winterShare + SEASON.springShare * 0.5);
  assert.equal(Math.round(seasonLook(mid, 1, OFFSET).snowLineM), Math.round(naturalSnowLine(mid)));
});

test("summer: green meadows, only glaciers and high peaks white", () => {
  const look = seasonLook(dayAt((SEASON.winterShare + SEASON.springShare + AUTUMN_FROM) / 2), 0.2, OFFSET);
  assert.equal(look.season, "summer");
  assert.ok(snowCoverAt(MID, look.snowLineM) < 0.01, "the ski area is bare");
  assert.ok(snowCoverAt(PEAK, look.snowLineM) > 0.99, "the 4000ers keep their snow");
  assert.equal(look.autumn, 0);
  assert.equal(look.straw, 0);
  // The summer line sits at the same real height on every map.
  const high = seasonLook(dayAt(0.86), 0.2, -200);
  assert.ok(Math.abs(look.snowLineM - OFFSET - (high.snowLineM + 200)) < 1);
});

test("autumn: the grass turns gold, then the first snow creeps down", () => {
  const golden = seasonLook(dayAt(AUTUMN_FROM + (1 - AUTUMN_FROM) * 0.4), 0.2, OFFSET);
  const late = seasonLook(dayAt(AUTUMN_FROM + (1 - AUTUMN_FROM) * 0.7), 0.2, OFFSET);
  const summer = seasonLook(dayAt(0.86), 0.2, OFFSET);
  assert.equal(golden.season, "autumn");
  assert.ok(golden.autumn > 0.9, "gold in mid autumn");
  assert.ok(late.snowLineM < summer.snowLineM - 1000, "first snow well down the mountain");
  assert.ok(snowCoverAt(VALLEY, late.snowLineM) < 0.01, "not yet in the valley");
  assert.ok(snowCoverAt(MID, late.snowLineM) > 0.9, "but on the upper runs");
  assert.ok(late.straw > golden.straw, "the frost takes the colour out");
});

test("the weather moves the line: a poor snow day lifts it", () => {
  const day = dayAt(SEASON.winterShare + SEASON.springShare * 0.6);
  assert.ok(seasonLook(day, 0.2, OFFSET).snowLineM > seasonLook(day, 0.9, OFFSET).snowLineM + 50);
});

/** The largest change between two moments, in what a viewer would see. */
function jump(a: SeasonLook, b: SeasonLook): { line: number; tint: number } {
  return { line: Math.abs(a.snowLineM - b.snowLineM), tint: Math.max(Math.abs(a.autumn - b.autumn), Math.abs(a.straw - b.straw)) };
}

test("no visual jumps: the look creeps through the year, the new year included", () => {
  const step = 0.05;
  for (let d = 1; d < YEAR + 1; d += step) {
    const j = jump(seasonLook(d, FAIR, OFFSET), seasonLook(d + step, FAIR, OFFSET));
    // The fastest the line ever moves is the autumn snowfall: under 50 m an hour of game time.
    assert.ok(j.line < 50, `day ${d.toFixed(2)}: line jumps ${j.line.toFixed(0)} m`);
    assert.ok(j.tint < 0.05, `day ${d.toFixed(2)}: tint jumps ${j.tint.toFixed(3)}`);
  }
  // Midnight of the last day is the first morning of the next winter.
  const wrap = jump(seasonLook(YEAR + 0.9999, FAIR, OFFSET), seasonLook(1, FAIR, OFFSET));
  assert.ok(wrap.line < 1 && wrap.tint < 0.01, "the year closes on itself");
});

test("no visual jumps between days, whatever the weather does overnight", () => {
  for (let day = 1; day <= YEAR; day++) {
    // Worst case: the best snow day followed by the worst.
    const j = jump(seasonLook(day + 0.999, 1, OFFSET), seasonLook(day + 1, 0, OFFSET));
    assert.ok(j.line < 140, `day ${day}: the weather moves the line ${j.line.toFixed(0)} m overnight`);
  }
});

test("quantised looks change only in visible steps", () => {
  const q = quantiseLook({ season: "spring", snowLineM: 2012, autumn: 0.123, straw: 0.5 });
  assert.equal(q.snowLineM, 2000);
  assert.equal(q.autumn, 0.1);
});

test("the ground's colour follows the look: white, green, gold", () => {
  const at = (look: SeasonLook) => groundAlbedo(1800, 0.2, look.snowLineM, 99, false, [0, 0, 0], OFFSET, 0.2, look);
  const winter = at(seasonLook(20, FAIR, OFFSET));
  const summer = at(seasonLook(dayAt(0.86), 0.2, OFFSET));
  const autumn = at(seasonLook(dayAt(AUTUMN_FROM + (1 - AUTUMN_FROM) * 0.4), 0.2, OFFSET));
  assert.ok(winter[0] > 0.7 && winter[2] > 0.7, "winter: snow");
  assert.ok(summer[1] > summer[0] && summer[1] > summer[2], "summer: green");
  assert.ok(autumn[0] > autumn[1] && autumn[1] > autumn[2] * 2, "autumn: golden brown");
  assert.ok(Math.abs(summer[1] - PALETTE.meadow[1]) < 0.02, "summer meadow is the palette's");
});

test("south faces melt out first", () => {
  const line = 2000;
  const south = groundAlbedo(2050, 0.5, line, 99, false, [0, 0, 0], OFFSET, 0.2, undefined, 1);
  const north = groundAlbedo(2050, 0.5, line, 99, false, [0, 0, 0], OFFSET, 0.2, undefined, -1);
  assert.ok(north[2] > south[2] + 0.2, "the north face still carries snow");
});

test("the HUD names the season and the day", () => {
  assert.equal(seasonLabel(34), "Winter · Tag 34");
  assert.equal(seasonLabel(60), "Frühling · Tag 60");
  assert.equal(seasonLabel(78), "Sommer · Tag 78");
  assert.equal(seasonLabel(88), "Herbst · Tag 88");
  assert.equal(visualSeason(1), "winter");
  assert.equal(visualSeason(YEAR), "autumn");
  for (let day = 1; day <= YEAR; day++) {
    assert.ok(!seasonLabel(day).includes("ß"));
    assert.ok(seasonGuestNote(day).length > 20);
  }
  assert.match(seasonGuestNote(78), /talwärts/);
});

test("skiing stops with the simulation's green season", () => {
  assert.equal(isGreenSeason(30), false);
  assert.equal(isGreenSeason(60), false);
  assert.equal(isGreenSeason(78), true);
  assert.equal(isGreenSeason(88), true);
});
