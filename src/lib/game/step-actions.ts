import { getDem, hexToWorld, liftEnds } from "@ski/shared";
import { proposeDescent } from "./links";
import type { StepAction } from "./next-step";
import { buildAtBest } from "./placement";
import { usePisteEditor } from "./piste-editor";
import { useGame } from "./store";

/** Do what a tip offers: open the run, pick the item, show the place. */
export function runStepAction(action: StepAction) {
  const g = useGame.getState();
  const focusLift = (id: string) => {
    const l = g.lifts.find((x) => x.id === id);
    if (!l) return;
    const a = hexToWorld(l.a.q, l.a.r);
    const b = hexToWorld(l.b.q, l.b.r);
    g.focusOn((a.x + b.x) / 2, (a.z + b.z) / 2);
  };
  if (action.kind === "descent") {
    focusLift(action.liftId);
    proposeDescent(action.liftId);
  } else if (action.kind === "research") {
    useGame.setState({ researchFocus: action.nodeId, sheet: "research", selectedId: null });
  } else if (action.kind === "build") {
    // Pick it and glide to the best spot for it, ghost already standing there.
    buildAtBest(action.itemId);
  } else if (action.kind === "select") {
    g.selectEntity(action.id);
    const lift = g.lifts.find((l) => l.id === action.id);
    const piste = g.pistes.find((p) => p.id === action.id);
    if (lift) focusLift(lift.id);
    else if (piste) {
      const mid = piste.hexes[Math.floor(piste.hexes.length / 2)]!;
      const w = hexToWorld(mid.q, mid.r);
      g.focusOn(w.x, w.z);
    }
  } else if (action.kind === "piste-from") {
    const lift = g.lifts.find((l) => l.id === action.liftId);
    if (!lift) return;
    const { top } = liftEnds(getDem(), lift);
    g.setBuildItem("piste");
    // Start at the top station, in route mode: one tap down the slope is a run.
    usePisteEditor.setState({ mode: "route", strokes: [], blocked: null });
    useGame.setState({ pisteDraft: [top] });
    const w = hexToWorld(top.q, top.r);
    g.focusOn(w.x, w.z);
    g.pushNote("Neue Abfahrt", "Tippe weiter unten ans Ziel – die Route folgt dem Hang.", "info");
  }
}
