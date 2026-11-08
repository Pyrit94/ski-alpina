import { Html } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { getDem, liftEnds, suggestDescent, type Axial } from "@ski/shared";
import { getHeightmap, surfaceY } from "@/lib/game/alpine";
import { hexToWorld } from "@/lib/game/hex";
import { LIFT_LINK_TEXT, proposeDescent, useResortLinks } from "@/lib/game/links";
import { useGame } from "@/lib/game/store";
import { useStableGame } from "./use-stable-game";

/** At most this many chips on the map at once: each one is a DOM node. */
const MAX_CHIPS = 6;
const LINE_COLOR = "#E8A23A";

/**
 * What is still missing, drawn where it is missing.
 *
 * For every lift with no way down, the run «Abfahrt anlegen» would build is
 * shown as a dashed line from its top station, and a chip at the top station
 * names the problem and builds that run on a tap. One draw call for all the
 * lines; the chips are bounded.
 */
export function LinkHints() {
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const phase = useGame((s) => s.phase);
  const layer = useGame((s) => s.layer);
  const autoOpen = useGame((s) => s.autoPistes !== null);
  const links = useResortLinks();
  const hm = getHeightmap();

  const missing = useMemo(() => {
    const dem = getDem();
    const state = { ...useGame.getState(), lifts, pistes, buildings };
    return lifts
      .filter((l) => {
        const link = links.get(l.id);
        return link === "no-descent" || link === "no-access";
      })
      .slice(0, MAX_CHIPS)
      .map((l) => {
        const link = links.get(l.id) as "no-descent" | "no-access";
        const { top } = liftEnds(dem, l);
        const route = link === "no-descent" ? suggestDescent(state, dem, l.id) : null;
        return { id: l.id, link, top, route };
      });
  }, [lifts, pistes, buildings, links]);

  const geometry = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const at = (h: Axial) => {
      const { x, z } = hexToWorld(h.q, h.r);
      return new THREE.Vector3(x, surfaceY(hm, x, z) + 0.35, z);
    };
    for (const m of missing) {
      if (!m.route) continue;
      for (let i = 1; i < m.route.length; i++) pts.push(at(m.route[i - 1]!), at(m.route[i]!));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    return g;
  }, [missing, hm]);
  const lines = useMemo(() => {
    const mat = new THREE.LineDashedMaterial({
      color: LINE_COLOR,
      dashSize: 0.9,
      gapSize: 0.6,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const seg = new THREE.LineSegments(geometry, mat);
    seg.computeLineDistances();
    seg.renderOrder = 4;
    seg.frustumCulled = false;
    return seg;
  }, [geometry]);
  useEffect(
    () => () => {
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    },
    [lines],
  );

  // While «Pisten automatisch» shows its own plan, these would only repeat it.
  const busy = phase !== "idle" || layer === "height" || autoOpen;
  if (missing.length === 0) return null;
  return (
    <group>
      <primitive object={lines} visible={!busy} />
      {missing.map((m) => {
        const { x, z } = hexToWorld(m.top.q, m.top.r);
        const text = LIFT_LINK_TEXT[m.link];
        return (
          // Kept mounted while building and only hidden: unmounting an Html
          // from inside its own click handler tears the DOM out from under
          // React.
          <Html
            key={m.id}
            position={[x, surfaceY(hm, x, z) + 3.2, z]}
            center
            distanceFactor={80}
            zIndexRange={[7, 0]}
            style={{ visibility: busy ? "hidden" : "visible" }}
          >
            {m.link === "no-descent" && m.route ? (
              <button
                type="button"
                onClick={() => requestAnimationFrame(() => proposeDescent(m.id))}
                className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-panel/95 px-3 text-[12px] font-semibold text-navy shadow-[var(--shadow-chip)]"
              >
                <span className="size-2.5 rounded-full" style={{ background: LINE_COLOR }} />
                {text.chip} · <span className="text-accent">Abfahrt anlegen</span>
              </button>
            ) : (
              <div className="pointer-events-none flex items-center gap-1.5 whitespace-nowrap rounded-full bg-panel/95 px-2.5 py-1 text-[11px] font-semibold text-warn shadow-[var(--shadow-chip)]">
                {text.chip}
              </div>
            )}
          </Html>
        );
      })}
    </group>
  );
}
