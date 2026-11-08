import { useMemo } from "react";
import { getHeightmap } from "@/lib/game/alpine";
import { useGame } from "@/lib/game/store";
import { isGreenSeason, quantiseLook, seasonLook, type SeasonLook, type VisualSeason } from "./season-look";

/**
 * The season's look for the scene, from the day, the clock and the weather.
 *
 * The clock moves the look through the day, but the selector returns a
 * quantised key, so a component re-renders only when something it would draw
 * differently has changed — a few times a day in the thaw, not every second.
 */
export function useSeasonLook(): SeasonLook {
  const key = useGame((s) => {
    const look = quantiseLook(seasonLook(s.day + s.timeOfDay, s.weather.snowQuality, getHeightmap().region.offset));
    return `${look.season}|${look.snowLineM}|${look.autumn}|${look.straw}`;
  });
  return useMemo(() => {
    const [season, line, autumn, straw] = key.split("|");
    return { season: season as VisualSeason, snowLineM: Number(line), autumn: Number(autumn), straw: Number(straw) };
  }, [key]);
}

/** True while skiing is over (see isGreenSeason). */
export function useGreenSeason(): boolean {
  return useGame((s) => isGreenSeason(s.day));
}
