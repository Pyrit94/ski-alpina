import { Html } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getHeightmap, surfaceY, type Heightmap } from "@/lib/game/alpine";
import { HEX_SIZE, hexToWorld } from "@/lib/game/hex";
import { GRADE_COLOR, isSkiRun, pisteStartAt, usePisteEditor } from "@/lib/game/piste-editor";
import { useResortLinks } from "@/lib/game/links";
import { useGame } from "@/lib/game/store";
import { getDem, pisteLinks, type Axial, type PlacedPiste } from "@ski/shared";
import { draftColors } from "./piste-draft";
import { makeHexGeometry, slopeQuaternion } from "./geometry";
import { useStableGame } from "./use-stable-game";

const COLOR_BLOCKED = new THREE.Color("#E24B4A");
const COLOR_SNAP = new THREE.Color("#34A853");
const COLOR_LINKED = new THREE.Color("#34A853");
/** Open end: grey, not alarming — the run is simply not joined there yet. */
const COLOR_LOOSE = new THREE.Color("#9AA5B1");
/** A point the player set along the way («Punkt für Punkt»). */
const COLOR_WAYPOINT = new THREE.Color("#2F6FED");
const MAX_PINS = 3 + 30;
const TMP = new THREE.Object3D();
const TMP_COLOR = new THREE.Color();
/** Draft hexes, the blocked hex and the snap preview share one instanced mesh. */
const MAX_CELLS = 52;

/**
 * The draft as the ground sees it: hexes coloured by grade, the hex the line
 * could not reach in red, where the start will snap to, and start and end
 * markers that are green when joined to the network and orange when not.
 *
 * Two draw calls however long the run: one instanced hex mesh, one instanced
 * marker mesh.
 */
export function PisteDraftMarks() {
  const draft = useGame((s) => s.pisteDraft);
  const phase = useGame((s) => s.phase);
  const hover = useGame((s) => s.hover);
  const buildItem = useGame((s) => s.buildItem);
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const buildings = useStableGame((s) => s.buildings);
  const blocked = usePisteEditor((s) => s.blocked);
  const strokes = usePisteEditor((s) => s.strokes);
  const hm = getHeightmap();
  const cells = useRef<THREE.InstancedMesh>(null);
  const pins = useRef<THREE.InstancedMesh>(null);
  const hexGeo = useMemo(() => makeHexGeometry(HEX_SIZE * 0.86), []);
  const pinGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.34, 0.08, 2.2, 10);
    g.translate(0, 1.1, 0);
    return g;
  }, []);
  const drawing = phase === "piste";

  const snap = useMemo(() => {
    if (!drawing || draft.length > 0 || !hover || !isSkiRun(buildItem)) return null;
    const s = pisteStartAt(hover);
    return "error" in s || !s.snapped ? null : s.hex;
    // Lifts and runs move the anchors, so they are dependencies too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, draft.length, hover, buildItem, lifts, pistes]);

  const joined = useResortLinks();
  const links = useMemo(() => {
    if (!drawing || draft.length === 0 || !isSkiRun(buildItem)) return null;
    const deadEnds = new Set([...joined].filter(([, v]) => v === "dead-end").map(([k]) => k));
    return pisteLinks({ ...useGame.getState(), lifts, pistes, buildings }, getDem(), draft, deadEnds);
  }, [drawing, draft, buildItem, lifts, pistes, buildings, joined]);

  useLayoutEffect(() => {
    const inst = cells.current;
    if (!inst) return;
    const colors = draftColors(draft, buildItem);
    let n = 0;
    const put = (h: Axial, c: THREE.Color, lift: number, scale = 1) => {
      if (n >= MAX_CELLS) return;
      const { x, z } = hexToWorld(h.q, h.r);
      TMP.position.set(x, surfaceY(hm, x, z) + lift, z);
      TMP.scale.set(scale, 1, scale);
      // Laid onto the slope, not level over it.
      slopeQuaternion((px, pz) => surfaceY(hm, px, pz), x, z, TMP.quaternion);
      TMP.updateMatrix();
      inst.setMatrixAt(n, TMP.matrix);
      inst.setColorAt(n, c);
      n++;
    };
    draft.forEach((h, i) => put(h, colors[i]!, 0.11));
    if (blocked && drawing) put(blocked.hex, COLOR_BLOCKED, 0.13, 0.92);
    if (snap) put(snap, COLOR_SNAP, 0.13, 1.04);
    // Where the end joins: the station, village or run it will count as
    // reaching, lit green so the player sees the join before tapping «Bauen».
    if (links?.end && draft.length > 1) put(links.end.hex, COLOR_SNAP, 0.14, 1.08);
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [draft, blocked, snap, hm, buildItem, drawing, links]);

  useLayoutEffect(() => {
    const inst = pins.current;
    if (!inst) return;
    let n = 0;
    const pin = (h: Axial, linked: boolean) => {
      const { x, z } = hexToWorld(h.q, h.r);
      TMP.position.set(x, surfaceY(hm, x, z), z);
      TMP.scale.setScalar(1);
      TMP.rotation.set(0, 0, 0);
      TMP.updateMatrix();
      inst.setMatrixAt(n, TMP.matrix);
      TMP_COLOR.copy(linked ? COLOR_LINKED : COLOR_LOOSE);
      inst.setColorAt(n, TMP_COLOR);
      n++;
    };
    if (draft.length > 0) pin(draft[0]!, !links || links.start !== null);
    if (draft.length > 1) pin(draft[draft.length - 1]!, !links || links.end !== null);
    if (snap) pin(snap, true);
    // The points set on the way, small and blue: where each straight piece ended.
    for (const len of strokes) {
      if (n >= MAX_PINS || len <= 1 || len >= draft.length) continue;
      const h = draft[len - 1]!;
      const { x, z } = hexToWorld(h.q, h.r);
      TMP.position.set(x, surfaceY(hm, x, z), z);
      TMP.scale.setScalar(0.6);
      TMP.rotation.set(0, 0, 0);
      TMP.updateMatrix();
      inst.setMatrixAt(n, TMP.matrix);
      inst.setColorAt(n, COLOR_WAYPOINT);
      n++;
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [draft, links, snap, hm, strokes]);

  useEffect(
    () => () => {
      hexGeo.dispose();
      pinGeo.dispose();
    },
    [hexGeo, pinGeo],
  );

  return (
    <group visible={drawing}>
      <instancedMesh ref={cells} args={[hexGeo, undefined, MAX_CELLS]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.55} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={pins} args={[pinGeo, undefined, MAX_PINS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
    </group>
  );
}

function midpoint(p: Pick<PlacedPiste, "hexes">, hm: Heightmap): [number, number, number] {
  const h = p.hexes[Math.floor(p.hexes.length / 2)]!;
  const { x, z } = hexToWorld(h.q, h.r);
  return [x, surfaceY(hm, x, z) + 1.6, z];
}

/**
 * The name of the run under the pointer, or of the selected one.
 *
 * At most one label, so it costs one DOM node. Selection works by tap too, so
 * nothing here depends on hover; hover only adds a preview on desktop.
 */
export function PisteNameLabel() {
  const selectedId = useGame((s) => s.selectedId);
  const hover = useGame((s) => s.hover);
  const phase = useGame((s) => s.phase);
  const layer = useGame((s) => s.layer);
  const pistes = useStableGame((s) => s.pistes);
  const hm = getHeightmap();
  const piste = useMemo(() => {
    const selected = pistes.find((p) => p.id === selectedId);
    if (selected) return selected;
    if (phase !== "idle" || !hover) return null;
    return pistes.find((p) => p.difficulty !== "road" && p.hexes.some((h) => h.q === hover.q && h.r === hover.r)) ?? null;
  }, [pistes, selectedId, hover, phase]);
  if (!piste || layer === "height") return null;
  const grade = piste.difficulty === "blue" || piste.difficulty === "red" || piste.difficulty === "black" ? piste.difficulty : null;
  return (
    <Html position={midpoint(piste, hm)} center distanceFactor={80} zIndexRange={[6, 0]}>
      <div className="pointer-events-none flex items-center gap-1.5 whitespace-nowrap rounded-full bg-panel/95 px-2.5 py-1 text-[11px] font-semibold text-navy shadow-[var(--shadow-chip)]">
        <span className="size-2.5 rounded-full" style={{ background: grade ? GRADE_COLOR[grade] : "#7C8DA6" }} />
        {piste.name || "Piste ohne Namen"}
      </div>
    </Html>
  );
}
