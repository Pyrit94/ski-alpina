import type { AutoMix } from "@ski/shared";
import { useGame } from "./store";

/** Open «Pisten automatisch», for some lifts or (null) the whole area. */
export function openAutoPistes(liftIds: string[] | null) {
  useGame.setState({ autoPistes: { liftIds, mix: useGame.getState().pisteMix }, selectedId: null, sheet: "none" });
}

/** The grade choices the assistant offers, also used for a new station's runs. */
export const MIXES: { id: AutoMix; label: string }[] = [
  { id: "mixed", label: "Gemischt" },
  { id: "blue", label: "Blau" },
  { id: "red", label: "Rot" },
  { id: "black", label: "Schwarz" },
];
