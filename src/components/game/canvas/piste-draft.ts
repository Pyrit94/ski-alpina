import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { hexToWorld } from "@/lib/game/hex";
import { GRADE_COLOR, beginPisteStroke, dragPisteTo, endPisteStroke, usePisteEditor } from "@/lib/game/piste-editor";
import { useGame } from "@/lib/game/store";
import { getDem, segmentGrades, type Axial, type PisteWidth } from "@ski/shared";

const OTHER_COLOR: Record<string, string> = { road: "#5a6570", snowpark: "#e8c04a" };

const slopeAt = (h: Axial) => {
  const { x, z } = hexToWorld(h.q, h.r);
  return getDem().slope(x, z);
};

/** How much wider or narrower a run is drawn than a normal one. Visual only. */
export const RIBBON_SCALE: Record<PisteWidth, number> = { 1: 0.7, 2: 1, 3: 1.45 };

/**
 * Colour per draft hex, by the grade of the segment that reaches it, so the
 * line reads blue/red/black while it is drawn exactly as it will be rated.
 */
export function draftColors(draft: readonly Axial[], itemId: string | null): THREE.Color[] {
  if (itemId && OTHER_COLOR[itemId]) return draft.map(() => new THREE.Color(OTHER_COLOR[itemId]));
  const grades = segmentGrades(draft, slopeAt);
  return draft.map((_, i) => {
    const g = grades[Math.max(0, i - 1)] ?? grades[0] ?? "blue";
    return new THREE.Color(g ? GRADE_COLOR[g] : "#E24B4A");
  });
}

/**
 * Pointer handling for drag drawing, for the ground mesh to call.
 *
 * Desktop only: on a phone a drag pans the map and hexes are stamped under
 * the reticle instead. While a stroke is held the camera controls are off,
 * so the drag draws instead of panning.
 */
export function usePisteStroke() {
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const active = useRef(false);
  const release = useRef<() => void>(() => {});
  release.current = () => {
    if (!active.current) return;
    active.current = false;
    endPisteStroke();
    if (controls) controls.enabled = true;
  };
  useEffect(() => {
    const up = () => release.current();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
  }, []);
  return {
    /** True when the press started a stroke and nothing else should handle it. */
    down(q: number, r: number, button: number): boolean {
      const g = useGame.getState();
      if (button !== 0 || g.stampMode || g.phase !== "piste" || g.tool === "pan") return false;
      if (usePisteEditor.getState().mode !== "draw") return false;
      if (!beginPisteStroke(q, r)) return false;
      active.current = true;
      if (controls) controls.enabled = false;
      return true;
    },
    move(q: number, r: number) {
      if (active.current) dragPisteTo(q, r);
    },
    /** True when this release ended a stroke (so it is not also a click). */
    up(): boolean {
      if (!active.current) return false;
      release.current();
      return true;
    },
  };
}

