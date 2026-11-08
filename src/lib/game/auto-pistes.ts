import { useGame } from "./store";

/** Open «Pisten automatisch», for some lifts or (null) the whole area. */
export function openAutoPistes(liftIds: string[] | null) {
  useGame.setState({ autoPistes: { liftIds, mix: "mixed" }, selectedId: null, sheet: "none" });
}
