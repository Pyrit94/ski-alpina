import { useMemo } from "react";
import * as THREE from "three";

/**
 * Geometry the scene builds by hand.
 *
 * Its own module because `models.tsx` exports components: mixing plain
 * functions in with them breaks Fast Refresh for the whole file, so editing a
 * chalet would force a full reload instead of a hot swap.
 */

/** A flat hexagon lying in the ground plane, point-up. */
export function makeHexGeometry(size: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = size * Math.cos(a);
    const y = size * Math.sin(a);
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function useHexGeometry(size: number) {
  return useMemo(() => makeHexGeometry(size), [size]);
}

/**
 * A flat strip laid along a path.
 *
 * `lift` is how far above the ground it floats. It is a parameter because a
 * piste is drawn as two strips — a wider coloured one for the edge and a
 * narrower white one on top — and they need different heights or they z-fight
 * into a shimmering mess.
 */
export function ribbonGeometry(points: THREE.Vector3[], width: number, lift = 0.08) {
  if (points.length < 2) return new THREE.BufferGeometry();
  const verts: number[] = [];
  const norms: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dir = next.clone().sub(prev);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(up, dir).normalize().multiplyScalar(width * 0.5);
    const a = p.clone().add(side);
    const b = p.clone().sub(side);
    a.y += lift;
    b.y += lift;
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    norms.push(0, 1, 0, 0, 1, 0);
  }
  const idx: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const i0 = i * 2;
    idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  geo.setIndex(idx);
  return geo;
}
