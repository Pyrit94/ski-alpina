import { useEffect, useState } from "react";
import * as THREE from "three";

/**
 * Optional photographic detail for the ground, from `public/textures/pbr/`.
 *
 * The files are fetched by `tools/textures/Get-Textures.ps1` (CC0 sources)
 * and listed in `manifest.json`. Everything here is optional: without the
 * manifest, or with a slot missing, the procedural detail in
 * `terrain-material.ts` carries on alone. A failed download can therefore
 * never break the scene — it only makes it plainer.
 */

export type TextureSlot = "snow" | "rock" | "ground";

export interface SlotMaps {
  color: THREE.Texture;
  normal: THREE.Texture | null;
  /**
   * Average luminance of the colour map, 0..1. The shader divides by it, so a
   * texture only adds variation around the vertex colour instead of shifting
   * the whole ground lighter or darker.
   */
  mean: number;
}

export type TexturePack = Partial<Record<TextureSlot, SlotMaps>>;

interface ManifestEntry {
  color?: string;
  normal?: string | null;
}

const BASE = "/textures/pbr/";
const SLOTS: TextureSlot[] = ["snow", "rock", "ground"];

let pending: Promise<TexturePack | null> | null = null;

function meanLuminance(image: CanvasImageSource): number {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 0.5;
    ctx.drawImage(image, 0, 0, 16, 16);
    const { data } = ctx.getImageData(0, 0, 16, 16);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255;
    }
    return Math.max(0.05, sum / (data.length / 4));
  } catch {
    return 0.5;
  }
}

async function loadTexture(loader: THREE.TextureLoader, url: string, color: boolean) {
  const tex = await loader.loadAsync(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Sharp on slopes seen at a grazing angle. Cheap on real GPUs; three clamps
  // it to what the device supports. (Software renderers pay dearly for it,
  // which is what the menu's "Fotostrukturen" switch is for.)
  tex.anisotropy = 4;
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

async function fetchPack(): Promise<TexturePack | null> {
  if (typeof window === "undefined") return null;
  let entries: Record<string, ManifestEntry> = {};
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    const doc = (await res.json()) as { entries?: Record<string, ManifestEntry> };
    entries = doc.entries ?? {};
  } catch {
    return null;
  }
  const loader = new THREE.TextureLoader();
  const pack: TexturePack = {};
  await Promise.all(
    SLOTS.map(async (slot) => {
      const entry = entries[slot];
      if (!entry?.color) return;
      try {
        const color = await loadTexture(loader, BASE + entry.color, true);
        const normal = entry.normal ? await loadTexture(loader, BASE + entry.normal, false).catch(() => null) : null;
        pack[slot] = { color, normal, mean: meanLuminance(color.image as CanvasImageSource) };
      } catch {
        /* this slot stays procedural */
      }
    }),
  );
  return Object.keys(pack).length ? pack : null;
}

/** The texture pack, once loaded; null while loading, when off, or when there is none. */
export function useTexturePack(enabled = true): TexturePack | null {
  const [pack, setPack] = useState<TexturePack | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPack(null);
      return;
    }
    let alive = true;
    pending ??= fetchPack();
    void pending.then((p) => {
      if (alive) setPack(p);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? pack : null;
}
