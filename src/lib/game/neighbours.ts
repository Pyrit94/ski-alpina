import { hexToWorld, type Neighbour } from "@ski/shared";
import { useGame } from "./store";

/** Fly to a neighbour area and open its card. */
export function showNeighbour(n: Neighbour) {
  const { x, z } = hexToWorld(n.base.q, n.base.r);
  useGame.getState().focusOn(x, z);
  useGame.setState({ neighbourOpen: n.id, selectedId: null, sheet: "none" });
}
