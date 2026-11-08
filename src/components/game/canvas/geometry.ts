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

/** Ground height at a world point. */
export type Ground = (x: number, z: number) => number;

const hexCorner = (i: number, t: number) => {
  // Corner i to corner i+1, at fraction t along the edge (point-up hexes).
  const a0 = (Math.PI / 180) * (60 * i - 30);
  const a1 = (Math.PI / 180) * (60 * (i + 1) - 30);
  return { x: Math.cos(a0) * (1 - t) + Math.cos(a1) * t, z: Math.sin(a0) * (1 - t) + Math.sin(a1) * t };
};

/**
 * Hexagons lying on the ground instead of floating flat over it: every vertex
 * sits at the ground's own height, so a tile on a slope follows the slope
 * rather than cutting into the hill on one side and hanging in the air on
 * the other. Each hex is a centre, a ring at half size and the outline, each
 * edge split `sub` times. Returns the merged geometry and how many vertices
 * each hex has, for colouring them one hex at a time.
 */
export function drapedHexes(
  centers: readonly { x: number; z: number }[],
  size: number,
  ground: Ground,
  lift: number,
  sub = 2,
): { geometry: THREE.BufferGeometry; perHex: number } {
  const ring = 6 * sub;
  const perHex = 1 + ring * 2;
  const pos = new Float32Array(centers.length * perHex * 3);
  const index: number[] = [];
  centers.forEach((c, h) => {
    const base = h * perHex;
    let o = base * 3;
    pos[o++] = c.x;
    pos[o++] = ground(c.x, c.z) + lift;
    pos[o++] = c.z;
    for (const scale of [0.5, 1]) {
      for (let k = 0; k < ring; k++) {
        const e = hexCorner(Math.floor(k / sub), (k % sub) / sub);
        const x = c.x + e.x * size * scale;
        const z = c.z + e.z * size * scale;
        pos[o++] = x;
        pos[o++] = ground(x, z) + lift;
        pos[o++] = z;
      }
    }
    for (let k = 0; k < ring; k++) {
      const k1 = (k + 1) % ring;
      const i0 = base + 1 + k;
      const i1 = base + 1 + k1;
      const o0 = base + 1 + ring + k;
      const o1 = base + 1 + ring + k1;
      // Wound so the face points up.
      index.push(base, i1, i0, i0, i1, o1, i0, o1, o0);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  return { geometry, perHex };
}

/** The outlines of `drapedHexes`, as line segments lying on the ground. */
export function drapedHexEdges(
  centers: readonly { x: number; z: number }[],
  size: number,
  ground: Ground,
  lift: number,
  sub = 3,
): { geometry: THREE.BufferGeometry; perHex: number } {
  const perHex = 6 * sub * 2;
  const pos = new Float32Array(centers.length * perHex * 3);
  let o = 0;
  for (const c of centers) {
    for (let k = 0; k < 6 * sub; k++) {
      for (const kk of [k, k + 1]) {
        const e = hexCorner(Math.floor(kk / sub) % 6, (kk % sub) / sub);
        const x = c.x + e.x * size;
        const z = c.z + e.z * size;
        pos[o++] = x;
        pos[o++] = ground(x, z) + lift;
        pos[o++] = z;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return { geometry, perHex };
}

/**
 * The rotation that lays something flat onto the ground at (x, z): its up
 * axis turned to the slope's normal. For markers drawn as instances, where
 * draping every vertex is not possible.
 */
export function slopeQuaternion(ground: Ground, x: number, z: number, out: THREE.Quaternion, d = 0.6): THREE.Quaternion {
  const nx = ground(x - d, z) - ground(x + d, z);
  const nz = ground(x, z - d) - ground(x, z + d);
  const n = new THREE.Vector3(nx, 2 * d, nz).normalize();
  return out.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
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
