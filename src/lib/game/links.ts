import { useMemo } from "react";
import { getDem, resortLinks, suggestDescent, type EdgeLink } from "@ski/shared";
import { useStableGame } from "@/components/game/canvas/use-stable-game";
import { usePisteEditor } from "./piste-editor";
import { play } from "./sound";
import { useGame } from "./store";

/**
 * How every lift and run is joined, by id — computed here from the layout
 * rather than read from the last tick, so a lift still being built already
 * says that it needs a way down.
 */
export function useResortLinks(): Map<string, EdgeLink> {
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  return useMemo(
    () => resortLinks({ ...useGame.getState(), lifts, pistes, buildings }, getDem()),
    [lifts, pistes, buildings],
  );
}

/** What a lift's link means, in one short sentence for the player. */
export const LIFT_LINK_TEXT: Record<
  "ok" | "no-descent" | "no-access",
  { chip: string; why: string }
> = {
  ok: {
    chip: "Verbunden ✓",
    why: "Von der Bergstation führt eine Piste zu einer Talstation oder ins Dorf.",
  },
  "no-descent": {
    chip: "Noch keine Abfahrt",
    why: "Von der Bergstation führt noch keine Piste hinunter. Ohne Abfahrt fährt hier niemand.",
  },
  "no-access": {
    chip: "Kein Zugang",
    why: "Die Talstation ist zu weit vom Dorf. Führ eine Piste von einem anderen Lift hierher oder bau ein Parkhaus daneben.",
  },
};

export const PISTE_LINK_TEXT: Record<
  "ok" | "dead-end" | "unreached",
  { chip: string; why: string }
> = {
  ok: { chip: "Verbunden ✓", why: "Gäste kommen oben an und unten weiter." },
  "dead-end": {
    chip: "Endet im Nichts",
    why: "Das Ende liegt bei keiner Talstation, keinem Dorf und keiner anderen Piste. Zieh sie bis dorthin.",
  },
  unreached: {
    chip: "Kein Lift oben",
    why: "Oben bringt kein Lift Gäste hin. Beginne die Piste bei einer Bergstation oder auf einer anderen Piste.",
  },
};

/**
 * «Abfahrt anlegen»: open the piste editor with the run this lift is missing
 * already drawn — from its top station along the fall line to the nearest
 * valley station, village or run — so «Bauen» is the only tap left. «Zurück»
 * and drawing on from there still work as for any draft.
 */
export function proposeDescent(liftId: string): boolean {
  const g = useGame.getState();
  const target = usePisteEditor.getState().target;
  const hexes = suggestDescent(g, getDem(), liftId, target);
  if (!hexes || hexes.length < 2) {
    play("error");
    g.pushNote(
      "Keine Abfahrt gefunden",
      "Von dieser Bergstation führt kein befahrbarer Hang zu einer Talstation, ins Dorf oder auf eine Piste. Zeichne selbst oder verschiebe die Bahn.",
      "warn",
    );
    return false;
  }
  g.setBuildItem("piste");
  if (useGame.getState().buildItem !== "piste") return false;
  usePisteEditor.setState({ mode: "draw", strokes: [1], blocked: null });
  useGame.setState({
    pisteDraft: hexes,
    selectedId: null,
    lastStampAt: Date.now(),
    lastStampHex: hexes[hexes.length - 1]!,
  });
  return true;
}
