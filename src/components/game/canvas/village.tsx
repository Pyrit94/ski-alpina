import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LANDSCAPE, REGION_BY_ID } from "@ski/config";
import { getHeightmap, realHeight, surfaceY } from "@/lib/game/alpine";
import { hexKey, worldToHex } from "@/lib/game/hex";
import { mulberry32, seedFromString } from "@/lib/game/rng";
import { HOUSE_KEYS, houseVariant } from "@/lib/game/model-keys";
import { SOLID } from "./bake";
import { withRoofSnow } from "./snow-shaders";
import { useFilePart, useFileParts } from "./file-parts";
import { useStableGame } from "./use-stable-game";

/** A chalet: white walls, a dark timber roof with snow on it. One geometry, coloured per vertex. */
function makeHouseGeometry(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, hex: number, snow = 0) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position!.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    // The roof's snow goes with the season (snow-shaders.ts).
    g.setAttribute("roofSnow", new THREE.BufferAttribute(new Float32Array(n).fill(snow), 1));
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
  const roofSnow = paint(roof.toNonIndexed(), 0xe6edf4, 1);
  const merged = mergeGeometries([body, base, roofSnow])!;
  merged.computeVertexNormals();
  return merged;
}

const MAX_HOUSES = 140;

/**
 * The village itself: chalets around the centre, more in a town like Davos
 * than in Andermatt (`houses` in config/regions.ts). They stand on gentle
 * ground near the village height, keep their distance from each other, and
 * give way to anything the players build. One instanced mesh per kind of
 * house: the built-in chalet, or each house model in public/models.
 */
export function VillageHouses() {
  const hm = getHeightmap();
  const buildings = useStableGame((s) => s.buildings);
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const geometry = useMemo(() => makeHouseGeometry(), []);
  const material = useMemo(
    () => withRoofSnow(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), "chalet"),
    [],
  );
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

  // Houses from files (house-1..6), picked per house so the same house keeps
  // its look, and the church once, on the free spot nearest the centre.
  const houseFiles = useFileParts(HOUSE_KEYS);
  const churchFile = useFilePart("church");
  const batches = useMemo(() => {
    const available = houseFiles.map((f) => f.key);
    const out = new Map<string, HousePlacement[]>([["", []]]);
    const free = (p: { x: number; z: number }) => {
      const h = worldToHex(p.x, p.z);
      return !taken.has(hexKey(h.q, h.r));
    };
    let church = -1;
    if (churchFile) {
      const v = hm.region.village;
      let best = Infinity;
      spots.forEach((p, i) => {
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        if (d < best && free(p)) {
          best = d;
          church = i;
        }
      });
    }
    const o = new THREE.Object3D();
    const rng = mulberry32(seedFromString("village-tint"));
    spots.forEach((p, i) => {
      if (!free(p)) return;
      const key = i === church ? "church" : (houseVariant(i, available) ?? "");
      o.position.set(p.x, surfaceY(hm, p.x, p.z) - 0.05, p.z);
      o.rotation.set(0, p.r, 0);
      // A church model comes at its own size; houses grow like the chalets.
      o.scale.setScalar(key === "church" ? 1 : p.s);
      o.updateMatrix();
      const k = 0.86 + rng() * 0.14;
      const colour = new THREE.Color(k, k * (0.97 + rng() * 0.03), k * 0.95);
      const list = out.get(key) ?? [];
      list.push({ matrix: o.matrix.clone(), colour });
      out.set(key, list);
    });
    return out;
  }, [spots, taken, hm, houseFiles, churchFile]);

  return (
    <group>
      {houseFiles.length === 0 && <HouseBatch geometry={geometry} material={material} items={batches.get("") ?? []} />}
      {houseFiles.map(({ key, geometry: g }) =>
        batches.get(key)?.length ? <HouseBatch key={key} geometry={g} material={SOLID} items={batches.get(key)!} /> : null,
      )}
      {churchFile && batches.get("church")?.length ? (
        <HouseBatch key="church" geometry={churchFile} material={SOLID} items={batches.get("church")!} />
      ) : null}
    </group>
  );
}

interface HousePlacement {
  matrix: THREE.Matrix4;
  colour: THREE.Color;
}

/** One kind of house, every one of it in one instanced mesh. */
function HouseBatch({ geometry, material, items }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: HousePlacement[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    items.forEach((it, i) => {
      m.setMatrixAt(i, it.matrix);
      m.setColorAt(i, it.colour);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={mesh} args={[geometry, material, MAX_HOUSES]} castShadow receiveShadow frustumCulled={false} />;
}
