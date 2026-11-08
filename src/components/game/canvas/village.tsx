import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LANDSCAPE, REGION_BY_ID } from "@ski/config";
import { getHeightmap, realHeight, surfaceY } from "@/lib/game/alpine";
import { hexKey, worldToHex } from "@/lib/game/hex";
import { mulberry32, seedFromString } from "@/lib/game/rng";
import { useStableGame } from "./use-stable-game";

/** A chalet: white walls, a dark timber roof with snow on it. One geometry, coloured per vertex. */
function makeHouseGeometry(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  };
  const body = paint(new THREE.BoxGeometry(1, 0.62, 0.78).translate(0, 0.31, 0).toNonIndexed(), 0xefe8dc);
  const base = paint(new THREE.BoxGeometry(1.02, 0.18, 0.8).translate(0, 0.09, 0).toNonIndexed(), 0x8a6a4a);
  // Gable roof: a triangular prism along x.
  const shape = new THREE.Shape();
  shape.moveTo(-0.52, 0);
  shape.lineTo(0.52, 0);
  shape.lineTo(0, 0.38);
  shape.lineTo(-0.52, 0);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: 1.14, bevelEnabled: false });
  roof.rotateY(Math.PI / 2);
  roof.translate(-0.57, 0.62, 0);
  const roofSnow = paint(roof.toNonIndexed(), 0xe6edf4);
  const merged = mergeGeometries([body, base, roofSnow])!;
  merged.computeVertexNormals();
  return merged;
}

const MAX_HOUSES = 140;

/**
 * The village itself: chalets around the centre, more in a town like Davos
 * than in Andermatt (`houses` in config/regions.ts). They stand on gentle
 * ground near the village height, keep their distance from each other, and
 * give way to anything the players build. One instanced mesh.
 */
export function VillageHouses() {
  const hm = getHeightmap();
  const buildings = useStableGame((s) => s.buildings);
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const geometry = useMemo(() => makeHouseGeometry(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // Where houses could stand: worked out once per map.
  const spots = useMemo(() => {
    const want = Math.min(MAX_HOUSES, REGION_BY_ID[hm.region.id]?.houses ?? LANDSCAPE.houses);
    const rng = mulberry32(seedFromString(`village-${hm.region.id}`));
    const v = hm.region.village;
    const villageReal = realHeight(hm, hm.sample(v.x, v.z));
    const reach = 5 + Math.sqrt(want) * 1.1;
    const out: { x: number; z: number; s: number; r: number }[] = [];
    let guard = 0;
    while (out.length < want && guard < want * 40) {
      guard++;
      // Denser towards the centre.
      const d = 1.2 + Math.pow(rng(), 0.8) * reach;
      const a = rng() * Math.PI * 2;
      const x = v.x + Math.cos(a) * d;
      const z = v.z + Math.sin(a) * d;
      if (Math.abs(x) > hm.world / 2 - 2 || Math.abs(z) > hm.world / 2 - 2) continue;
      if (hm.isWater(x, z) || hm.slope(x, z) > 0.22) continue;
      if (Math.abs(realHeight(hm, hm.sample(x, z)) - villageReal) > 140) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 1.15)) continue;
      // Bigger houses — hotels, the church — near the middle.
      const central = d < reach * 0.3;
      out.push({ x, z, s: (central ? 1.1 : 0.8) + rng() * (central ? 0.9 : 0.5), r: Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3 });
    }
    return out;
  }, [hm]);

  // Hexes the players use: houses there step aside.
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const b of buildings) set.add(hexKey(b.q, b.r));
    for (const l of lifts) {
      set.add(hexKey(l.a.q, l.a.r));
      set.add(hexKey(l.b.q, l.b.r));
    }
    for (const p of pistes) for (const h of p.hexes) set.add(hexKey(h.q, h.r));
    return set;
  }, [buildings, lifts, pistes]);

  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const tint = new THREE.Color();
    const rng = mulberry32(seedFromString("village-tint"));
    let i = 0;
    for (const p of spots) {
      const h = worldToHex(p.x, p.z);
      if (taken.has(hexKey(h.q, h.r))) continue;
      o.position.set(p.x, surfaceY(hm, p.x, p.z) - 0.05, p.z);
      o.rotation.set(0, p.r, 0);
      o.scale.setScalar(p.s);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      const k = 0.86 + rng() * 0.14;
      m.setColorAt(i, tint.setRGB(k, k * (0.97 + rng() * 0.03), k * 0.95));
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [spots, taken, hm]);

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_HOUSES]} castShadow receiveShadow frustumCulled={false} />;
}
