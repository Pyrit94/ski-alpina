import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getHeightmap } from "@/lib/game/alpine";
import { HEX_SIZE, hexDistance, hexToWorld, hexesInRange, worldToHex } from "@/lib/game/hex";
import { useGame } from "@/lib/game/store";
import { isPiste } from "@ski/config";
import { getDem, validateHex } from "@ski/shared";
import { BuildingModel, makeHexGeometry } from "./models";

const GRID_RADIUS = 12;
const NDC_STAMP = new THREE.Vector2(0, 0.02);
const COLOR_EMPTY = new THREE.Color("#e7f3ff");
const COLOR_OCC = new THREE.Color("#9bb8d4");
const COLOR_PISTE = new THREE.Color("#7ec8ff");
const COLOR_OK = new THREE.Color("#34A853");
const COLOR_BAD = new THREE.Color("#E24B4A");
const COLOR_NEAR_OK = new THREE.Color("#8fd49a");
const COLOR_NEAR_BAD = new THREE.Color("#cfd6de");
const TMP_COLOR = new THREE.Color();
const TMP_DUMMY = new THREE.Object3D();

function sampleRayHex(origin: THREE.Vector3, dir: THREE.Vector3) {
  const hm = getHeightmap();
  let lo = 4;
  let hi = 220;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const y = origin.y + dir.y * mid;
    const x = origin.x + dir.x * mid;
    const z = origin.z + dir.z * mid;
    if (y > hm.worldY(x, z) + 0.15) lo = mid;
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

export function HexRaster() {
  const phase = useGame((s) => s.phase);
  const hover = useGame((s) => s.hover);
  const buildItem = useGame((s) => s.buildItem);
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const pistes = useGame((s) => s.pistes);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const origin = useRef({ q: 0, r: 9 });
  const geo = useMemo(() => makeHexGeometry(HEX_SIZE * 0.93), []);
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

  const lineGeo = useMemo(() => {
    const positions: number[] = [];
    for (const cell of cells) {
      const { x, z } = hexToWorld(cell.q, cell.r);
      const y = hm.worldY(x, z) + 0.08;
      const s = HEX_SIZE * 0.97;
      for (let i = 0; i < 6; i++) {
        const a0 = (Math.PI / 180) * (60 * i - 30);
        const a1 = (Math.PI / 180) * (60 * (i + 1) - 30);
        positions.push(x + s * Math.cos(a0), y, z + s * Math.sin(a0), x + s * Math.cos(a1), y, z + s * Math.sin(a1));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, [cells, hm]);

  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const state = useGame.getState();
    cells.forEach((cell, i) => {
      const { x, z } = hexToWorld(cell.q, cell.r);
      TMP_DUMMY.position.set(x, hm.worldY(x, z) + 0.055, z);
      TMP_DUMMY.scale.set(1, 1, 1);
      TMP_DUMMY.rotation.set(0, 0, 0);
      TMP_DUMMY.updateMatrix();
      inst.setMatrixAt(i, TMP_DUMMY.matrix);
      const key = `${cell.q},${cell.r}`;
      const isHover = hover && cell.q === hover.q && cell.r === hover.r;
      if (isHover) TMP_COLOR.copy(hover.valid ? COLOR_OK : COLOR_BAD);
      else if (occ.has(key)) TMP_COLOR.copy(COLOR_OCC);
      else if (pisteSet.has(key)) TMP_COLOR.copy(COLOR_PISTE);
      else if (hover && buildItem && hexDistance(cell, hover) <= 2) {
        const v = validateHex(state, getDem(), cell.q, cell.r, buildItem);
        TMP_COLOR.copy(v.ok ? COLOR_NEAR_OK : COLOR_NEAR_BAD);
      } else TMP_COLOR.copy(COLOR_EMPTY);
      inst.setColorAt(i, TMP_COLOR);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [cells, hover, occ, pisteSet, hm, buildItem]);

  if (!building) return null;

  return (
    <group>
      <instancedMesh ref={mesh} args={[geo, undefined, cells.length]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.34} vertexColors toneMapped={false} depthWrite={false} />
      </instancedMesh>
      <lineSegments geometry={lineGeo} frustumCulled={false}>
        <lineBasicMaterial color="#f4fbff" transparent opacity={0.62} depthWrite={false} />
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
  const buildings = useGame((s) => s.buildings);
  const lifts = useGame((s) => s.lifts);
  const geo = useMemo(() => makeHexGeometry(HEX_SIZE * 0.92), []);
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
    target.current.set(x, hm.worldY(x, z), z);
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
      {rings.map((h, i) => {
        const { x, z } = hexToWorld(h.q, h.r);
        const y = hm.worldY(x, z) + 0.12;
        return (
          <mesh key={`${h.q}:${h.r}:${i}`} geometry={geo} position={[x, y, z]}>
            <meshBasicMaterial color={h.color} transparent opacity={h.opacity} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        );
      })}
      {hover && phase !== "idle" && (
        <lineSegments
          position={[
            hexToWorld(hover.q, hover.r).x,
            hm.worldY(hexToWorld(hover.q, hover.r).x, hexToWorld(hover.q, hover.r).z) + 0.18,
            hexToWorld(hover.q, hover.r).z,
          ]}
        >
          <edgesGeometry args={[geo]} />
          <lineBasicMaterial color={hover.valid ? "#34A853" : "#E24B4A"} />
        </lineSegments>
      )}
      {showGhost && buildItem && (
        <group ref={ghost}>
          <BuildingModel itemId={buildItem} constructing />
        </group>
      )}
      {liftGhost && (
        <Line
          points={[
            [liftGhost.a.x, hm.worldY(liftGhost.a.x, liftGhost.a.z) + 1.6, liftGhost.a.z],
            [liftGhost.b.x, hm.worldY(liftGhost.b.x, liftGhost.b.z) + 1.6, liftGhost.b.z],
          ]}
          color={hover?.valid ? "#2F6FED" : "#E24B4A"}
          lineWidth={2}
        />
      )}
    </group>
  );
}

export function HexGhost() {
  const draft = useGame((s) => s.pisteDraft);
  const liftStart = useGame((s) => s.liftStart);
  const hm = getHeightmap();
  const geo = useMemo(() => makeHexGeometry(HEX_SIZE * 0.9), []);
  return (
    <group>
      {draft.map((h) => {
        const { x, z } = hexToWorld(h.q, h.r);
        return (
          <mesh key={`${h.q}:${h.r}`} geometry={geo} position={[x, hm.worldY(x, z) + 0.1, z]}>
            <meshBasicMaterial color="#7ec8ff" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        );
      })}
      {liftStart && (
        <mesh
          geometry={geo}
          position={[
            hexToWorld(liftStart.q, liftStart.r).x,
            hm.worldY(hexToWorld(liftStart.q, liftStart.r).x, hexToWorld(liftStart.q, liftStart.r).z) + 0.12,
            hexToWorld(liftStart.q, liftStart.r).z,
          ]}
        >
          <meshBasicMaterial color="#2F6FED" transparent opacity={0.48} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
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
    mesh.current.position.set(x, hm.worldY(x, z) + 0.2, z);
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
