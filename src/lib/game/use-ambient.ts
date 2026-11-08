import { useEffect } from "react";
import { useGame } from "./store";
import { armAudio, setAmbientLifts } from "./sound";

/**
 * The mountain bed while a game is on screen: it starts at the first tap (if
 * «Umgebungston» is on), pauses with the page and stops when the game closes.
 * The distant hum is there once a lift runs.
 */
export function useAmbientBed(): void {
  const lifts = useGame((s) => s.lifts.length);
  useEffect(() => armAudio(), []);
  useEffect(() => setAmbientLifts(lifts), [lifts]);
}
