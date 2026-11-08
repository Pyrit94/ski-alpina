import { hexToWorld, type Neighbour } from "@ski/shared";
import { useGame } from "./store";

/** Fly to a neighbour area and open its card. */
export function showNeighbour(n: Pick<Neighbour, "id" | "base">) {
  const { x, z } = hexToWorld(n.base.q, n.base.r);
  useGame.getState().focusOn(x, z);
  useGame.getState().openHelper({ id: "neighbour", neighbourId: n.id });
}
