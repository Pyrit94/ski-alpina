import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { getHeightmap, surfaceY } from "@/lib/game/alpine";
import { HEX_SIZE, hexToWorld } from "@/lib/game/hex";
import { useGame } from "@/lib/game/store";
import { drapedHexEdges } from "./geometry";

const ARROW = new THREE.Color("#2F6FED");
const TARGET = new THREE.Color("#34A853");

/**
 * The village optimiser's proposal on the map: a line from each building to
 * its new place with an arrow head, and the new place outlined. Two draw calls.
 */
export function VillagePreview() {
  const moves = useGame((s) => s.villagePreview);
  const hm = getHeightmap();
  const objects = useMemo(() => {
    if (moves.length === 0) return null;
    const ground = (x: number, z: number) => surfaceY(hm, x, z);
    const pts: number[] = [];
    for (const m of moves) {
      const a = hexToWorld(m.from.q, m.from.r);
      const b = hexToWorld(m.to.q, m.to.r);
      const ya = ground(a.x, a.z) + 1.4;
      const yb = ground(b.x, b.z) + 1.4;
      pts.push(a.x, ya, a.z, b.x, yb, b.z);
      // Arrow head: two short strokes back from the target.
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      for (const side of [1, -1]) {
        const hx = b.x + (ux * 0.9 - uz * 0.55 * side);
        const hz = b.z + (uz * 0.9 + ux * 0.55 * side);
        pts.push(b.x, yb, b.z, hx, yb + 0.15, hz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const arrows = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: ARROW, depthTest: false, transparent: true }));
    arrows.renderOrder = 6;
    arrows.frustumCulled = false;
    const rings = drapedHexEdges(
      moves.map((m) => hexToWorld(m.to.q, m.to.r)),
      HEX_SIZE * 0.92,
      ground,
      0.14,
    ).geometry;
    const outline = new THREE.LineSegments(rings, new THREE.LineBasicMaterial({ color: TARGET, transparent: true, depthWrite: false }));
    outline.renderOrder = 5;
    outline.frustumCulled = false;
    return { arrows, outline };
  }, [moves, hm]);
  useEffect(
    () => () => {
      if (!objects) return;
      for (const o of [objects.arrows, objects.outline]) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    },
    [objects],
  );
  if (!objects) return null;
  return (
    <group>
      <primitive object={objects.arrows} />
      <primitive object={objects.outline} />
    </group>
  );
}
