import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { getHeightmap, surfaceY } from "@/lib/game/alpine";
import { hexToWorld } from "@/lib/game/hex";
import { GRADE_COLOR } from "@/lib/game/piste-editor";
import { useGame } from "@/lib/game/store";

/**
 * The runs «Pisten automatisch» would build, dashed in their colour on the
 * ground. One draw call for all of them.
 */
export function AutoPreview() {
  const plans = useGame((s) => s.autoPreview);
  const hm = getHeightmap();
  const lines = useMemo(() => {
    const pts: number[] = [];
    const colors: number[] = [];
    const c = new THREE.Color();
    for (const p of plans) {
      c.set(GRADE_COLOR[p.grade as keyof typeof GRADE_COLOR] ?? "#ffffff");
      for (let i = 1; i < p.hexes.length; i++) {
        for (const h of [p.hexes[i - 1]!, p.hexes[i]!]) {
          const { x, z } = hexToWorld(h.q, h.r);
          pts.push(x, surfaceY(hm, x, z) + 0.45, z);
          colors.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 1.1, gapSize: 0.5, depthTest: false, transparent: true });
    const seg = new THREE.LineSegments(g, mat);
    seg.computeLineDistances();
    seg.renderOrder = 5;
    seg.frustumCulled = false;
    return seg;
  }, [plans, hm]);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    },
    [lines],
  );
  if (plans.length === 0) return null;
  return <primitive object={lines} />;
}
