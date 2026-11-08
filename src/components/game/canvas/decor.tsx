import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getHeightmap, surfaceY } from "@/lib/game/alpine";
import { hexToWorld } from "@/lib/game/hex";
import { PROP_KEYS, type PropKey } from "@/lib/game/model-keys";
import { useGame } from "@/lib/game/store";
import type { PlacedBuilding, PlacedLift, PlacedPiste } from "@/lib/game/types";
import { SOLID } from "./bake";
import { useFilePart, useFileParts } from "./file-parts";
import { useWorldBuildings, useWorldLifts, useWorldPistes } from "./use-world";
import { alongPath, pathLength } from "./valley-road";

/**
 * Small things that only exist as models from files (public/models): props
 * beside huts, stations and runs, and groomers out on the runs at night.
 * Nothing is drawn, and nothing costs a draw call, while the files are
 * missing. Every kind is one instanced mesh with a capped count.
 */

function noRaycast() {
  /* decoration: never a pick target */
}

/** Most of each prop on the map, whatever gets built. */
const PROP_CAP: Record<PropKey, number> = { bench: 48, parasol: 48, flag: 40, sign: 40 };

/** Buildings with a sun terrace. */
const TERRACE = new Set<string>(["restaurant", "hut", "apres", "gastro-hall"]);

interface Spot {
  x: number;
  z: number;
  yaw: number;
}

/** Where every kind of prop stands, from what is built. */
function propSpots(buildings: PlacedBuilding[], lifts: PlacedLift[], pistes: PlacedPiste[]): Record<PropKey, Spot[]> {
  const out: Record<PropKey, Spot[]> = { bench: [], parasol: [], flag: [], sign: [] };
  // A terrace in front (+z) of huts and restaurants: two parasols, a bench beside each.
  for (const b of buildings) {
    if (!TERRACE.has(b.itemId)) continue;
    const { x, z } = hexToWorld(b.q, b.r);
    for (const s of [-1, 1]) {
      out.parasol.push({ x: x + s * 0.6, z: z + 1.3, yaw: 0 });
      out.bench.push({ x: x + s * 0.95, z: z + 1.3, yaw: 0 });
    }
  }
  // A flag beside every station, off to the side of the line.
  for (const l of lifts) {
    const a = hexToWorld(l.a.q, l.a.r);
    const b = hexToWorld(l.b.q, l.b.r);
    const ends: [{ x: number; z: number }, { x: number; z: number }][] = [
      [a, b],
      [b, a],
    ];
    if (l.mid) ends.push([hexToWorld(l.mid.q, l.mid.r), b]);
    for (const [at, to] of ends) {
      const len = Math.hypot(to.x - at.x, to.z - at.z) || 1;
      const dx = (to.x - at.x) / len;
      const dz = (to.z - at.z) / len;
      out.flag.push({ x: at.x + dz * 1.25 - dx * 0.4, z: at.z - dx * 1.25 - dz * 0.4, yaw: Math.atan2(dx, dz) });
    }
  }
  // A sign at the top of every run, beside it, facing back up the slope.
  for (const p of pistes) {
    if (p.difficulty === "road" || p.hexes.length < 2) continue;
    const a = hexToWorld(p.hexes[0]!.q, p.hexes[0]!.r);
    const b = hexToWorld(p.hexes[1]!.q, p.hexes[1]!.r);
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    out.sign.push({ x: a.x + dz * 1.0, z: a.z - dx * 1.0, yaw: Math.atan2(-dx, -dz) });
  }
  for (const k of PROP_KEYS) out[k] = out[k].slice(0, PROP_CAP[k]);
  return out;
}

/** Benches and parasols on the terraces, flags at the stations, signs at the runs. */
export function Props() {
  const files = useFileParts(PROP_KEYS);
  const buildings = useWorldBuildings();
  const lifts = useWorldLifts();
  const pistes = useWorldPistes();
  const spots = useMemo(
    () => (files.length > 0 ? propSpots(buildings, lifts, pistes) : null),
    [files.length, buildings, lifts, pistes],
  );
  if (!spots) return null;
  return (
    <group>
      {files.map(({ key, geometry }) => {
        const list = spots[key as PropKey];
        return list.length > 0 ? <PropBatch key={key} geometry={geometry} spots={list} cap={PROP_CAP[key as PropKey]} /> : null;
      })}
    </group>
  );
}

function PropBatch({ geometry, spots, cap }: { geometry: THREE.BufferGeometry; spots: Spot[]; cap: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const hm = getHeightmap();
  useLayoutEffect(() => {
    const inst = ref.current;
    if (!inst) return;
    const o = new THREE.Object3D();
    spots.forEach((s, i) => {
      o.position.set(s.x, surfaceY(hm, s.x, s.z) - 0.02, s.z);
      o.rotation.set(0, s.yaw, 0);
      o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
    });
    inst.count = spots.length;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  }, [spots, hm]);
  return <instancedMesh ref={ref} args={[geometry, SOLID, cap]} castShadow raycast={noRaycast} />;
}

const GROOMERS = 3;

/**
 * Snow groomers working the longest runs at dusk and at night, slowly up
 * and back down. Only with a "groomer-vehicle" model.
 */
export function Groomers() {
  const geometry = useFilePart("groomer-vehicle");
  const night = useGame((s) => s.timeOfDay < 0.29 || s.timeOfDay > 0.72);
  const pistes = useWorldPistes();
  const hm = getHeightmap();
  const routes = useMemo(() => {
    if (!geometry || !night) return [];
    return pistes
      .filter((p) => p.difficulty !== "road" && p.hexes.length >= 3)
      .map((p) => p.hexes.map((h) => hexToWorld(h.q, h.r)))
      .map((path) => ({ path, length: pathLength(path) }))
      .sort((a, b) => b.length - a.length)
      .slice(0, GROOMERS);
  }, [geometry, night, pistes]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const inst = ref.current;
    if (!inst || routes.length === 0) return;
    const t = performance.now() / 1000;
    routes.forEach((r, i) => {
      // Half a world unit a second, there and back: u in 0..2.
      const u = ((t * 0.5) / r.length + i * 0.37) % 2;
      const back = u > 1;
      const p = alongPath(r.path, (back ? 2 - u : u) * r.length);
      dummy.position.set(p.x, surfaceY(hm, p.x, p.z) + 0.1, p.z);
      dummy.rotation.set(0, p.angle + (back ? Math.PI : 0), 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
  });

  if (!geometry || routes.length === 0) return null;
  return (
    <instancedMesh
      key={routes.length}
      ref={ref}
      args={[geometry, SOLID, routes.length]}
      castShadow
      frustumCulled={false}
      raycast={noRaycast}
    />
  );
}
