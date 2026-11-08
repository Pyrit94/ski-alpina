import type { ResortState } from "../types.ts";
import { TUTORIAL_STEPS } from "./state.ts";

/**
 * The tutorial follows what the players do instead of waiting for «Weiter».
 *
 * Step 0 «Lift rauf» is done once a lift stands, step 1 «Piste runter» once a
 * run is drawn, step 2 «Gäste fahren» once guests ride. Returns the first step
 * that is not done yet; TUTORIAL_STEPS when everything is.
 */
export function tutorialGoal(state: ResortState): number {
  if (state.lifts.length === 0) return 0;
  if (!state.pistes.some((p) => p.difficulty !== "road")) return 1;
  if ((state.stats.peoplePerHour ?? 0) <= 0) return 2;
  return TUTORIAL_STEPS;
}

/** Move the open tutorial forward to the first unfinished step; close it when all are done. Never moves back. */
export function followTutorial(state: ResortState): ResortState {
  if (!state.tutorialOpen) return state;
  const goal = tutorialGoal(state);
  if (goal >= TUTORIAL_STEPS) return { ...state, tutorialOpen: false, tutorialStep: TUTORIAL_STEPS - 1 };
  if (goal > state.tutorialStep) return { ...state, tutorialStep: goal };
  return state;
}
