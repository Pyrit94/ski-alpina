import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getHeightmap, surfaceY } from "@/lib/game/alpine";
import { HEX_SIZE, hexDistance, hexToWorld, hexesInRange, worldToHex } from "@/lib/game/hex";
import { useGame } from "@/lib/game/store";
import { isPiste } from "@ski/config";
import { getDem, validateHex } from "@ski/shared";
import { BuildingModel } from "./models";
import { PisteDraftMarks } from "./PisteDraftLayer";
import { drapedHexEdges, drapedHexes, makeHexGeometry, slopeQuaternion } from "./geometry";
import { useStableGame } from "./use-stable-game";

const GRID_RADIUS = 8;
const NDC_STAMP = new THREE.Vector2(0, 0.02);
const COLOR_EMPTY = new THREE.Color("#e7f3ff");
const COLOR_OCC = new THREE.Color("#9bb8d4");
const COLOR_PISTE = new THREE.Color("#7ec8ff");
const COLOR_OK = new THREE.Color("#34A853");
const COLOR_BAD = new THREE.Color("#E24B4A");
const COLOR_NEAR_OK = new THREE.Color("#8fd49a");
const COLOR_NEAR_BAD = new THREE.Color("#cfd6de");
const TMP_COLOR = new THREE.Color();

function sampleRayHex(origin: THREE.Vector3, dir: THREE.Vector3) {
  const hm = getHeightmap();
  let lo = 4;
  let hi = 220;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const y = origin.y + dir.y * mid;
    const x = origin.x + dir.x * mid;
    const z = origin.z + dir.z * mid;
    if (y > surfaceY(hm, x, z) + 0.15) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  return worldToHex(origin.x + dir.x * t, origin.z + dir.z * t);
}

export function CenterStamp() {
  const phase = useGame((s) => s.phase);
  const stampMode = useGame((s) => s.stampMode);
  const hoverHex = useGame((s) => s.hoverHex);
  const { camera } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);

  useFrame(() => {
    if (!stampMode || phase === "idle") return;
    ray.setFromCamera(NDC_STAMP, camera);
    const hex = sampleRayHex(ray.ray.origin, ray.ray.direction);
    hoverHex(hex.q, hex.r);
  });
  return null;
}

/**
 * The build raster: the hexes around the cursor, lying on the ground. Every
 * vertex follows the terrain, so tiles run with the slope instead of standing
 * out of it as flat plates, and the raster fades out towards its rim instead
 * of ending in a hard edge. Two draw calls.
 */
export function HexRaster() {
  const phase = useGame((s) => s.phase);
  const hover = useGame((s) => s.hover);
  const buildItem = useGame((s) => s.buildItem);
  const buildings = useStableGame((s) => s.buildings);
  const lifts = useStableGame((s) => s.lifts);
  const pistes = useStableGame((s) => s.pistes);
  const origin = useRef({ q: 0, r: 9 });
  const hm = getHeightmap();
  const building = phase !== "idle";
  const center = hover ?? { q: 0, r: 9, valid: true, reason: "" };
  if (hexDistance(origin.current, center) > 2) {
    origin.current = { q: center.q, r: center.r };
  }
  const oq = origin.current.q;
  const or_ = origin.current.r;
  const cells = useMemo(() => hexesInRange({ q: oq, r: or_ }, GRID_RADIUS), [oq, or_]);

  const occ = useMemo(() => {
    const s = new Set<string>();
    for (const b of buildings) s.add(`${b.q},${b.r}`);
    for (const l of lifts) {
      s.add(`${l.a.q},${l.a.r}`);
      s.add(`${l.b.q},${l.b.r}`);
    }
    return s;
  }, [buildings, lifts]);

  const pisteSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of pistes) for (const h of p.hexes) s.add(`${h.q},${h.r}`);
    return s;
  }, [pistes]);

  // Built only when the raster moves: the shape follows the ground.
  const draped = useMemo(() => {
    if (!building) return null;
    const ground = (x: number, z: number) => surfaceY(hm, x, z);
    const centers = cells.map((c) => hexToWorld(c.q, c.r));
    const fill = drapedHexes(centers, HEX_SIZE * 0.93, ground, 0.07);
    const edges = drapedHexEdges(centers, HEX_SIZE * 0.97, ground, 0.09);
    fill.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cells.length * fill.perHex * 4), 4));
    edges.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cells.length * edges.perHex * 4), 4));
    return { fill, edges };
  }, [building, cells, hm]);
  useEffect(
    () => () => {
      draped?.fill.geometry.dispose();
      draped?.edges.geometry.dispose();
    },
    [draped],
  );

  // Colours on every hover move: cheap, no geometry rebuilt.
  useLayoutEffect(() => {
    if (!draped) return;
    const state = useGame.getState();
    const fillColor = draped.fill.geometry.getAttribute("color") as THREE.BufferAttribute;
    const edgeColor = draped.edges.geometry.getAttribute("color") as THREE.BufferAttribute;
    const focus = hover ?? cells[0] ?? { q: 0, r: 0 };
    cells.forEach((cell, i) => {
      const key = `${cell.q},${cell.r}`;
      const isHover = hover && cell.q === hover.q && cell.r === hover.r;
      let alpha = 0.3;
      if (isHover) {
        TMP_COLOR.copy(hover.valid ? COLOR_OK : COLOR_BAD);
        alpha = 0.55;
      } else if (occ.has(key)) TMP_COLOR.copy(COLOR_OCC);
      else if (pisteSet.has(key)) TMP_COLOR.copy(COLOR_PISTE);
      else if (hover && buildItem && hexDistance(cell, hover) <= 2) {
        const v = validateHex(state, getDem(), cell.q, cell.r, buildItem);
        TMP_COLOR.copy(v.ok ? COLOR_NEAR_OK : COLOR_NEAR_BAD);
        alpha = 0.42;
      } else TMP_COLOR.copy(COLOR_EMPTY);
      // Soft rim: full near the cursor, gone at the edge of the raster.
      const d = hexDistance(cell, focus) / GRID_RADIUS;
      const fade = Math.max(0, Math.min(1, (1 - d) / 0.45));
      const a = alpha * fade;
      const ea = 0.62 * fade;
      for (let k = 0; k < draped.fill.perHex; k++) fillColor.setXYZW(i * draped.fill.perHex + k, TMP_COLOR.r, TMP_COLOR.g, TMP_COLOR.b, a);
      for (let k = 0; k < draped.edges.perHex; k++) edgeColor.setXYZW(i * draped.edges.perHex + k, 0.96, 0.98, 1, ea);
    });
    fillColor.needsUpdate = true;
    edgeColor.needsUpdate = true;
  }, [draped, cells, hover, occ, pisteSet, buildItem]);

  if (!building || !draped) return null;

  return (
    <group>
      <mesh geometry={draped.fill.geometry} frustumCulled={false} renderOrder={2}>
        <meshBasicMaterial vertexColors transparent toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <lineSegments geometry={draped.edges.geometry} frustumCulled={false} renderOrder={3}>
        <lineBasicMaterial vertexColors transparent depthWrite={false} />
      </lineSegments>
    </group>
  );
}

export function HexCursor() {
  const hover = useGame((s) => s.hover);
  const phase = useGame((s) => s.phase);
  const selectedId = useGame((s) => s.selectedId);
  const buildItem = useGame((s) => s.buildItem);
  const liftStart = useGame((s) => s.liftStart);
  const buildings = useStableGame((s) => s.buildings);
  const lifts = useStableGame((s) => s.lifts);
  const hm = getHeightmap();
  const pulse = useRef(0);
  const snap = useRef(0);
  const lastHex = useRef({ q: 9999, r: 9999 });
  const ghost = useRef<THREE.Group>(null);
  const gpos = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const seeded = useRef(false);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    pulse.current += d;
    snap.current = Math.max(0, snap.current - d * 5.5);
    if (!ghost.current || !hover || phase === "idle") {
      seeded.current = false;
      return;
    }
    const { x, z } = hexToWorld(hover.q, hover.r);
    target.current.set(x, surfaceY(hm, x, z), z);
    if (!seeded.current) {
      gpos.current.copy(target.current);
      seeded.current = true;
    }
    if (lastHex.current.q !== hover.q || lastHex.current.r !== hover.r) {
      snap.current = 1;
      lastHex.current = { q: hover.q, r: hover.r };
    }
    const k = 1 - Math.exp(-16 * d);
    gpos.current.lerp(target.current, k);
    ghost.current.position.set(gpos.current.x, gpos.current.y + Math.sin(pulse.current * 3.4) * 0.1, gpos.current.z);
    const s = 1 + snap.current * 0.1;
    ghost.current.scale.setScalar(s);
  });

  const rings: { q: number; r: number; color: string; opacity: number }[] = [];
  if (hover && phase !== "idle") {
    rings.push({ q: hover.q, r: hover.r, color: hover.valid ? "#34A853" : "#E24B4A", opacity: 0.5 });
  }
  const sel = buildings.find((b) => b.id === selectedId) || lifts.find((l) => l.id === selectedId);
  if (sel && "q" in sel) rings.push({ q: sel.q, r: sel.r, color: "#2F6FED", opacity: 0.32 });
  if (sel && "a" in sel) {
    rings.push({ q: sel.a.q, r: sel.a.r, color: "#2F6FED", opacity: 0.32 });
    rings.push({ q: sel.b.q, r: sel.b.r, color: "#2F6FED", opacity: 0.32 });
  }

  const showGhost = !!(hover && phase !== "idle" && buildItem && !isPiste(buildItem));
  const liftGhost =
    phase === "lift-b" && liftStart && hover
      ? {
          a: hexToWorld(liftStart.q, liftStart.r),
          b: hexToWorld(hover.q, hover.r),
        }
      : null;

  return (
    <group>
      {rings.map((h, i) => (
        <DrapedHex key={`${h.q}:${h.r}:${i}`} q={h.q} r={h.r} size={HEX_SIZE * 0.92} lift={0.1} color={h.color} opacity={h.opacity} />
      ))}
      {hover && phase !== "idle" && (
        <DrapedHex q={hover.q} r={hover.r} size={HEX_SIZE * 0.92} lift={0.14} color={hover.valid ? "#34A853" : "#E24B4A"} opacity={1} outline />
      )}
      {showGhost && buildItem && (
        <group ref={ghost}>
          <BuildingModel itemId={buildItem} constructing />
        </group>
      )}
      {liftGhost && (
        <Line
          points={[
            [liftGhost.a.x, surfaceY(hm, liftGhost.a.x, liftGhost.a.z) + 1.6, liftGhost.a.z],
            [liftGhost.b.x, surfaceY(hm, liftGhost.b.x, liftGhost.b.z) + 1.6, liftGhost.b.z],
          ]}
          color={hover?.valid ? "#2F6FED" : "#E24B4A"}
          lineWidth={2}
        />
      )}
    </group>
  );
}

export function HexGhost() {
  const liftStart = useGame((s) => s.liftStart);
  return (
    <group>
      {/* The piste draft: grade colours, blocked hex, snap and end markers, in two draw calls. */}
      <PisteDraftMarks />
      {liftStart && <DrapedHex q={liftStart.q} r={liftStart.r} size={HEX_SIZE * 0.9} lift={0.1} color="#2F6FED" opacity={0.48} />}
    </group>
  );
}

export function StampFlash() {
  const last = useGame((s) => s.lastStampAt);
  const hex = useGame((s) => s.lastStampHex);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const geo = useMemo(() => makeHexGeometry(HEX_SIZE * 0.95), []);
  const hm = getHeightmap();

  useFrame(() => {
    if (!mesh.current || !mat.current || !hex || !last) {
      if (mesh.current) mesh.current.visible = false;
      return;
    }
    const t = (Date.now() - last) / 420;
    if (t < 0 || t > 1) {
      mesh.current.visible = false;
      return;
    }
    const { x, z } = hexToWorld(hex.q, hex.r);
    mesh.current.visible = true;
    mesh.current.position.set(x, surfaceY(hm, x, z) + 0.2, z);
    slopeQuaternion((px, pz) => surfaceY(hm, px, pz), x, z, mesh.current.quaternion);
    const s = 0.7 + t * 1.35;
    mesh.current.scale.set(s, 1, s);
    mat.current.opacity = 0.5 * (1 - t) * (1 - t);
  });

  return (
    <mesh ref={mesh} geometry={geo} visible={false}>
      <meshBasicMaterial ref={mat} color="#34A853" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** One hexagon lying on the ground: a fill, or its outline. */
function DrapedHex({
  q,
  r,
  size,
  lift,
  color,
  opacity,
  outline = false,
}: {
  q: number;
  r: number;
  size: number;
  lift: number;
  color: string;
  opacity: number;
  outline?: boolean;
}) {
  const hm = getHeightmap();
  const geo = useMemo(() => {
    const ground = (x: number, z: number) => surfaceY(hm, x, z);
    const c = [hexToWorld(q, r)];
    return outline ? drapedHexEdges(c, size, ground, lift).geometry : drapedHexes(c, size, ground, lift).geometry;
  }, [hm, q, r, size, lift, outline]);
  useEffect(() => () => geo.dispose(), [geo]);
  if (outline) {
    return (
      <lineSegments geometry={geo} renderOrder={4}>
        <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </lineSegments>
    );
  }
  return (
    <mesh geometry={geo} renderOrder={4}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} polygonOffset polygonOffsetFactor={-3} />
    </mesh>
  );
}
