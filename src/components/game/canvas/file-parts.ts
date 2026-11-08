import { useMemo } from "react";
import * as THREE from "three";
import { modelFor, useModelLibrary } from "@/lib/game/model-library";
import { bake, bakedCache } from "./bake";

/**
 * Models from public/models flattened into one geometry each, colours baked
 * into the vertices, so whatever they replace can be drawn as instances —
 * lift parts, village houses, trees, skiers, cars, props. A key without a
 * file gives null and the caller keeps its built-in look.
 */

function bakedPart(key: string, version: number): THREE.BufferGeometry | null {
  const group = modelFor(key);
  if (!group) return null;
  const cacheKey = `part:${key}:${version}`;
  const cached = bakedCache.get(cacheKey);
  if (cached) return cached.solid;
  const baked = bake(group);
  bakedCache.set(cacheKey, baked);
  return baked.solid;
}

/** One part from a file, or null. */
export function useFilePart(key: string): THREE.BufferGeometry | null {
  const version = useModelLibrary((s) => s.version);
  return useMemo(() => bakedPart(key, version), [key, version]);
}

/** Several parts at once: only the keys that have a file, in the given order. */
export function useFileParts(keys: readonly string[]): { key: string; geometry: THREE.BufferGeometry }[] {
  const version = useModelLibrary((s) => s.version);
  const joined = keys.join("|");
  return useMemo(() => {
    const out: { key: string; geometry: THREE.BufferGeometry }[] = [];
    for (const key of joined.split("|")) {
      const geometry = key ? bakedPart(key, version) : null;
      if (geometry) out.push({ key, geometry });
    }
    return out;
  }, [joined, version]);
}

const snowy = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/**
 * A tree from a file, ready for the forest's snow shader (snow-shaders.ts):
 * branches facing up carry snow, more toward the top, the trunk none.
 */
export function withTreeSnow(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const done = snowy.get(geo);
  if (done) return done;
  const out = geo.clone();
  const pos = out.getAttribute("position");
  const nor = out.getAttribute("normal");
  out.computeBoundingBox();
  const minY = out.boundingBox?.min.y ?? 0;
  const span = (out.boundingBox?.max.y ?? 1) - minY || 1;
  const snow = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const up = nor ? nor.getY(i) : 0.5;
    const h = (pos.getY(i) - minY) / span;
    snow[i] = h < 0.15 ? 0 : Math.max(0, Math.min(1, (up - 0.15) / 0.5)) * Math.min(1, h * 1.6);
  }
  out.setAttribute("treeSnow", new THREE.BufferAttribute(snow, 1));
  snowy.set(geo, out);
  return out;
}
