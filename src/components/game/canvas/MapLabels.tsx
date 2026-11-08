import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { REGION_BY_ID } from "@ski/config";
import { neighboursOn, regionPoint } from "@ski/shared";
import { getHeightmap, surfaceY, type Heightmap } from "@/lib/game/alpine";
import { hexToWorld } from "@/lib/game/hex";
import { showNeighbour } from "@/lib/game/neighbours";
import { useGame } from "@/lib/game/store";
import { QUALITY } from "./quality";
import { useStableGame } from "./use-stable-game";

/**
 * The map's names — peaks, lakes, the village, the neighbour areas — in ONE
 * DOM layer over the canvas. Each used to be a drei `<Html>`, i.e. its own
 * React root projected on its own every frame; tearing those roots down
 * mid-render warned in dev and cost a root per label. Here the labels are
 * plain children of one layer, and `MapLabelProjector` (inside the Canvas)
 * moves them all in one `useFrame`, writing transforms straight to the DOM.
 */

interface Anchor {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  /** What was last written, so an unmoved label costs no style write. */
  transform: string;
  shown: boolean;
  zIndex: number;
}

const anchors = new Set<Anchor>();

/** Hidden a little past the edge, so a name sliding out is not cut at the border. */
const EDGE = 1.15;

/** Inside the Canvas: projects every label's anchor once a frame. */
export function MapLabelProjector() {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    if (anchors.size === 0) return;
    camera.updateMatrixWorld();
    for (const a of anchors) {
      v.set(a.x, a.y, a.z).applyMatrix4(camera.matrixWorldInverse);
      // Behind the camera: the projection would mirror it onto the screen.
      const ahead = v.z < 0;
      if (ahead) v.applyMatrix4(camera.projectionMatrix);
      const shown = ahead && Math.abs(v.x) < EDGE && Math.abs(v.y) < EDGE;
      if (shown !== a.shown) {
        a.shown = shown;
        a.el.style.display = shown ? "" : "none";
      }
      if (!shown) continue;
      const px = Math.round((v.x + 1) * 0.5 * size.width);
      const py = Math.round((1 - v.y) * 0.5 * size.height);
      const transform = `translate3d(${px}px,${py}px,0) translate(-50%,-50%)`;
      if (transform !== a.transform) {
        a.transform = transform;
        a.el.style.transform = transform;
      }
      // Nearer names on top, as drei's depth-sorted labels did.
      const zIndex = Math.round((1 - v.z) * 500);
      if (zIndex !== a.zIndex) {
        a.zIndex = zIndex;
        a.el.style.zIndex = String(zIndex);
      }
    }
  });
  return null;
}

/** One name, anchored at a world point; hidden until the projector has placed it. */
function Label({ x, y, z, children }: { x: number; y: number; z: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a: Anchor = { el, x, y, z, transform: "", shown: false, zIndex: 0 };
    el.style.display = "none";
    anchors.add(a);
    return () => {
      anchors.delete(a);
    };
  }, [x, y, z]);
  return (
    <div ref={ref} className="absolute left-0 top-0 will-change-transform">
      {children}
    </div>
  );
}

type Lake = { name: string; x: number; z: number };
const lakeCache = new WeakMap<Heightmap, Lake[]>();

/** Lakes the map shows, named where they are (once per ground). */
function lakesOf(hm: Heightmap): Lake[] {
  const hit = lakeCache.get(hm);
  if (hit) return hit;
  const def = REGION_BY_ID[hm.region.id];
  const lakes = (def?.lakes ?? [])
    .map((l) => ({ name: l.name, ...regionPoint(def!, l.lat, l.lon) }))
    .filter((l) => [0, 1.5, -1.5].some((d) => hm.isWater(l.x + d, l.z) || hm.isWater(l.x, l.z + d)));
  lakeCache.set(hm, lakes);
  return lakes;
}

/** Next to the Canvas: the layer the names live in, under the HUD (z-10). */
export function MapLabels() {
  const hm = getHeightmap();
  const layer = useGame((s) => s.layer);
  const quality = useGame((s) => s.quality);
  const stampMode = useGame((s) => s.stampMode);
  const phase = useGame((s) => s.phase);
  const neighbours = useStableGame((s) => neighboursOn(s));
  const hidden = layer === "pistes" || (stampMode && phase !== "idle");
  const compact = QUALITY[quality].compactLabels;
  const { peaks, village } = hm.region;
  const lakes = lakesOf(hm);
  // Fixed screen size, so the names stay readable in the overview, not
  // shrinking to specks when the whole area is in view.
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 5, display: hidden ? "none" : undefined }} aria-hidden={hidden}>
      {peaks.map((p) => (
        <Label key={`p-${p.name}`} x={p.x} y={surfaceY(hm, p.x, p.z) + 3.2} z={p.z}>
          <div className="flex items-center gap-1 whitespace-nowrap rounded-full bg-navy/75 px-2 py-0.5 text-[11px] font-semibold text-snow backdrop-blur-sm">
            <span aria-hidden>▲</span>
            {compact ? p.name : `${p.name} · ${p.elev.toLocaleString("de-CH")} m`}
          </div>
        </Label>
      ))}
      {lakes.map((l) => (
        <Label key={`l-${l.name}`} x={l.x} y={surfaceY(hm, l.x, l.z) + 1.2} z={l.z}>
          <div className="whitespace-nowrap text-[11px] font-semibold italic text-[#1d4f7a] drop-shadow-[0_1px_0_rgba(255,255,255,0.8)]">{l.name}</div>
        </Label>
      ))}
      <Label x={village.x} y={surfaceY(hm, village.x, village.z) + 2.4} z={village.z}>
        <div className="whitespace-nowrap rounded-full bg-panel/95 px-2.5 py-0.5 text-[12px] font-bold text-navy shadow">{village.name}</div>
      </Label>
      {/* The neighbour areas at their valley stations: a tap opens their card. Greyer than the village's own name. */}
      {neighbours.map((n) => {
        const { x, z } = hexToWorld(n.base.q, n.base.r);
        return (
          <Label key={`n-${n.id}`} x={x} y={surfaceY(hm, x, z) + 2.4} z={z}>
            <button
              type="button"
              onClick={() => showNeighbour(n)}
              className="pointer-events-auto flex min-h-8 items-center gap-1 whitespace-nowrap rounded-full bg-[#5b6b7a]/85 px-2.5 text-[11px] font-semibold text-snow shadow backdrop-blur-sm"
            >
              {n.name}
              <span className="font-normal opacity-80">· Nachbar</span>
            </button>
          </Label>
        );
      })}
    </div>
  );
}
