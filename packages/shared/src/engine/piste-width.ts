import { DEFAULT_PISTE_WIDTH, PISTE_WIDTHS } from "../../../config/src/terrain.ts";
import type { PisteWidth } from "../types.ts";

export type PisteWidthDef = (typeof PISTE_WIDTHS)[number];

/** The width a run has; older saves have none, which means normal. */
export function widthOf(piste: { width?: PisteWidth }): PisteWidth {
  return piste.width ?? DEFAULT_PISTE_WIDTH;
}

export function widthDef(width: PisteWidth | undefined): PisteWidthDef {
  const w = width ?? DEFAULT_PISTE_WIDTH;
  return PISTE_WIDTHS.find((d) => d.width === w) ?? PISTE_WIDTHS[1]!;
}

/**
 * How much a run's kilometres draw guests because of its width.
 *
 * A wide run is more pleasant for everyone; a wide gentle one is where
 * beginners go, so it gets a little more on top.
 */
export function pisteWidthDraw(piste: { width?: PisteWidth; difficulty: string }): number {
  const def = widthDef(piste.width);
  return def.draw * (piste.difficulty === "blue" ? def.beginnerDraw : 1);
}
