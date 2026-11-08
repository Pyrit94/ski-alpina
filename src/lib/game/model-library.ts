import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { create } from "zustand";
import type { ItemId } from "./types";

/**
 * Building models from files, to replace the hand-built ones one by one.
 *
 * Put a glTF binary in `public/models/` and name it in
 * `public/models/manifest.json`:
 *
 *   { "hotel1": { "file": "hotel1.glb" },
 *     "parking": { "file": "parking.glb", "levels": { "3": "parking-3.glb" } } }
 *
 * Every model is fitted to the hex on load: centred, standing on y = 0 and
 * scaled so its wider side spans `footprint` world units (default 2.1). An
 * item or level without a file keeps its built-in model, so the switch can
 * happen one building at a time. See public/models/README.md.
 */

export interface ModelEntry {
  file: string;
  /** Width the model is fitted to, in world units. */
  footprint?: number;
  /** Turn on load, in degrees, when a model faces the wrong way. */
  yaw?: number;
  /** Other files for higher expansion levels, by level. */
  levels?: Record<string, string>;
}

const library = new Map<string, THREE.Group>();

/** Bumped when models arrive, so baked buildings are baked again. */
export const useModelLibrary = create<{ version: number }>(() => ({ version: 0 }));

const key = (itemId: string, level: number) => `${itemId}:${level}`;

/** The file model for an item at a level: that level's own, else the nearest below. */
export function modelFor(itemId: ItemId, level = 1): THREE.Group | null {
  for (let l = level; l >= 1; l--) {
    const m = library.get(key(itemId, l));
    if (m) return m;
  }
  return null;
}

/** Centre a model on the hex, stand it on the ground, scale it to fit. */
export function fitModel(root: THREE.Object3D, footprint = 2.1, yawDeg = 0): THREE.Group {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(root);
  inner.rotation.y = (yawDeg * Math.PI) / 180;
  group.add(inner);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const wide = Math.max(size.x, size.z) || 1;
  const s = footprint / wide;
  const centre = box.getCenter(new THREE.Vector3());
  inner.position.set(-centre.x * s, -box.min.y * s, -centre.z * s);
  inner.scale.setScalar(s);
  group.updateMatrixWorld(true);
  return group;
}

/** Parse one glTF binary and file it under an item and level. */
export async function addModel(itemId: string, level: number, data: ArrayBuffer, entry: Partial<ModelEntry> = {}): Promise<void> {
  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(data, "/models/");
  library.set(key(itemId, level), fitModel(gltf.scene, entry.footprint, entry.yaw));
  useModelLibrary.setState((s) => ({ version: s.version + 1 }));
}

let loading: Promise<void> | null = null;

/**
 * Load everything the manifest names. Safe to call more than once; a missing
 * manifest or a broken file only means that item keeps its built-in model.
 */
export function loadModelLibrary(base = "/models/"): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    let manifest: Record<string, ModelEntry> = {};
    try {
      const res = await fetch(`${base}manifest.json`, { cache: "no-cache" });
      if (!res.ok) return;
      manifest = (await res.json()) as Record<string, ModelEntry>;
    } catch {
      return;
    }
    const jobs: Promise<void>[] = [];
    for (const [itemId, entry] of Object.entries(manifest)) {
      if (!entry || typeof entry.file !== "string") continue;
      const files: [number, string][] = [[1, entry.file], ...Object.entries(entry.levels ?? {}).map(([l, f]) => [Number(l), f] as [number, string])];
      for (const [level, file] of files) {
        jobs.push(
          fetch(`${base}${file}`)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${file}: ${r.status}`))))
            .then((buf) => addModel(itemId, level, buf, entry))
            .catch((err: unknown) => console.warn("[models]", itemId, err)),
        );
      }
    }
    await Promise.all(jobs);
  })();
  return loading;
}
