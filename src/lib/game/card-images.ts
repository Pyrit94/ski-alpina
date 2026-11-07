import { useEffect, useState } from "react";

/**
 * Photos for the build cards, from `public/textures/cards/` (see
 * `tools/textures/Get-Textures.ps1`). Optional: an item without a photo keeps
 * its icon, and a photo that fails to load falls back to it as well.
 */
export interface CardImage {
  url: string;
  title?: string;
  creator?: string;
}

const BASE = "/textures/cards/";
let pending: Promise<Record<string, CardImage>> | null = null;

async function load(): Promise<Record<string, CardImage>> {
  try {
    const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" });
    if (!res.ok) return {};
    const doc = (await res.json()) as { entries?: Record<string, { file?: string; title?: string; creator?: string }> };
    const out: Record<string, CardImage> = {};
    for (const [id, e] of Object.entries(doc.entries ?? {})) {
      if (e.file) out[id] = { url: BASE + e.file, title: e.title, creator: e.creator };
    }
    return out;
  } catch {
    return {};
  }
}

export function useCardImages(): Record<string, CardImage> {
  const [images, setImages] = useState<Record<string, CardImage>>({});
  useEffect(() => {
    let alive = true;
    pending ??= load();
    void pending.then((m) => {
      if (alive) setImages(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return images;
}
