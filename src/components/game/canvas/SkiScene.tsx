import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  getHeightmap,
  terrainColor,
  LAKE,
  metersToWorldY,
  PEAKS,
  scatterRocks,
  scatterTrees,
  VILLAGE,
  visualRelief,
  type Heightmap,
} from "@/lib/game/alpine";
import { HEX_SIZE, hexToWorld, worldToHex } from "@/lib/game/hex";
import { peerColor } from "@/lib/game/players";
import { mulberry32, seedFromString } from "@/lib/game/rng";
import { useGame } from "@/lib/game/store";
import type { MapLayer, PlacedBuilding, PlacedLift, PlacedPiste } from "@/lib/game/types";
import { BuildingModel, GondolaCabin, ribbonGeometry } from "./models";
import { CenterStamp, HexCursor, HexGhost, HexRaster, StampFlash } from "./HexBuildLayer";

function buildTerrain(hm: Heightmap, layer: MapLayer, heat: Map<string, number>) {
  const geo = new THREE.PlaneGeometry(hm.world, hm.world, hm.n - 1, hm.n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const dummy = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = hm.worldY(x, z) + visualRelief(x, z);
    pos.setY(i, y);
    const m = hm.sample(x, z);
    let c = terrainColor(hm, x, z);
    if (layer === "height") {
      const t = Math.min(1, Math.max(0, (m - 1580) / 2800));
      dummy.setHSL(0.58 - t * 0.45, 0.45, 0.35 + t * 0.45);
      c = [dummy.r, dummy.g, dummy.b];
    } else if (layer === "heat") {
      const h = heat.get(`${Math.round(x / 5)},${Math.round(z / 5)}`) ?? 0;
      dummy.setRGB(0.2 + h, 0.35 - h * 0.2, 0.85 - h * 0.6);
      c = [dummy.r, dummy.g, dummy.b];
    }
    colors[i * 3] = c[0]!;
    colors[i * 3 + 1] = c[1]!;
    colors[i * 3 + 2] = c[2]!;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function Terrain() {
  const hm = getHeightmap();
  const layer = useGame((s) => s.layer);
  const pistes = useGame((s) => s.pistes);
  const heat = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pistes) {
      for (const h of p.hexes) {
        const k = `${Math.round(h.q / 1)},${Math.round(h.r / 1)}`;
        m.set(k, Math.min(1, (m.get(k) ?? 0) + 0.25));
      }
    }
    return m;
  }, [pistes]);
  const geo = useMemo(() => buildTerrain(hm, layer, heat), [hm, layer, heat]);
  const click = useGame((s) => s.clickHex);
  const hover = useGame((s) => s.hoverHex);
  const stampMode = useGame((s) => s.stampMode);
  const phase = useGame((s) => s.phase);
  const down = useRef<THREE.Vector2 | null>(null);
  const stamp = stampMode && phase !== "idle";

  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh
      geometry={geo}
      receiveShadow
      onPointerDown={(e) => {
        down.current = new THREE.Vector2(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (stamp) return;
        e.stopPropagation();
        const { q, r } = worldToHex(e.point.x, e.point.z);
        hover(q, r);
      }}
      onPointerUp={(e) => {
        if (!down.current) return;
        const d = Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y);
        down.current = null;
        if (d > 8) return;
        if (stamp) return;
        e.stopPropagation();
        const { q, r } = worldToHex(e.point.x, e.point.z);
        click(q, r);
      }}
    >
      <meshStandardMaterial vertexColors roughness={0.88} metalness={0.02} />
    </mesh>
  );
}

function Forest({ quality }: { quality: "low" | "high" }) {
  const hm = getHeightmap();
  const trees = useMemo(() => {
    const rng = mulberry32(seedFromString("trees-alpina"));
    return scatterTrees(hm, quality === "low" ? 280 : 720, rng);
  }, [hm, quality]);
  const rocks = useMemo(() => {
    const rng = mulberry32(seedFromString("rocks-alpina"));
    return scatterRocks(hm, quality === "low" ? 80 : 180, rng);
  }, [hm, quality]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    trees.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.r, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [trees, dummy]);

  useEffect(() => {
    if (!rockRef.current) return;
    rocks.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 0.1, t.z);
      dummy.rotation.set(0.2, t.r, 0.1);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      rockRef.current!.setMatrixAt(i, dummy.matrix);
    });
    rockRef.current.instanceMatrix.needsUpdate = true;
  }, [rocks, dummy]);

  return (
    <group>
      <instancedMesh ref={meshRef} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[0.48, 1.7, 6]} />
        <meshStandardMaterial color="#1d3c2c" />
      </instancedMesh>
      <instancedMesh ref={rockRef} args={[undefined, undefined, rocks.length]}>
        <dodecahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color="#6a6762" roughness={0.95} />
      </instancedMesh>
    </group>
  );
}

function Lake() {
  const y = metersToWorldY(LAKE.elev) + 0.12;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LAKE.x, y, LAKE.z]} receiveShadow>
      <circleGeometry args={[LAKE.radius * 0.95, 40]} />
      <meshStandardMaterial color="#b9d7e6" roughness={0.22} metalness={0.18} />
    </mesh>
  );
}

function PeakLabels() {
  const hm = getHeightmap();
  const layer = useGame((s) => s.layer);
  const quality = useGame((s) => s.quality);
  const stampMode = useGame((s) => s.stampMode);
  const phase = useGame((s) => s.phase);
  if (layer === "pistes") return null;
  if (stampMode && phase !== "idle") return null;
  const compact = quality === "low";
  return (
    <>
      {PEAKS.map((p) => (
        <Html key={p.id} position={[p.x, hm.worldY(p.x, p.z) + 3.2, p.z]} center distanceFactor={compact ? 120 : 90}>
          <div className="pointer-events-none whitespace-nowrap rounded-full bg-navy/70 px-2 py-0.5 text-[10px] font-medium text-snow backdrop-blur-sm">
            {compact ? p.name : `${p.name} · ${p.elev.toLocaleString("de-CH")} m`}
          </div>
        </Html>
      ))}
      <Html position={[VILLAGE.x, hm.worldY(VILLAGE.x, VILLAGE.z) + 2.4, VILLAGE.z]} center distanceFactor={compact ? 110 : 80}>
        <div className="pointer-events-none rounded-full bg-panel/90 px-2 py-0.5 text-[10px] font-semibold text-navy">
          {VILLAGE.name}
        </div>
      </Html>
    </>
  );
}

function Structures() {
  const buildings = useGame((s) => s.buildings);
  return (
    <group>
      {buildings.map((b) => (
        <PlacedStructure key={b.id} building={b} />
      ))}
    </group>
  );
}

/**
 * Whether the windows are on.
 *
 * A boolean rather than the raw clock, so it flips twice a day instead of on
 * every frame — a subscription to `timeOfDay` in every building would re-render
 * the whole village continuously.
 */
function useLampsOn(): boolean {
  return useGame((s) => s.timeOfDay < 0.29 || s.timeOfDay > 0.72);
}

function PlacedStructure({ building: b }: { building: PlacedBuilding }) {
  const selectedId = useGame((s) => s.selectedId);
  const selectEntity = useGame((s) => s.selectEntity);
  const lit = useLampsOn();
  const hm = getHeightmap();
  const group = useRef<THREE.Group>(null);
  const { x, z } = hexToWorld(b.q, b.r);
  const baseY = hm.worldY(x, z);

  useFrame(() => {
    if (!group.current) return;
    const now = Date.now();
    const age = Math.max(0, (now - b.builtAt) / 1000);
    const drop = Math.min(1, age / 0.42);
    const ease = 1 - (1 - drop) ** 3;
    const bounce = drop < 1 ? Math.sin(drop * Math.PI) * 0.14 : 0;
    const span = Math.max(1, b.readyAt - b.builtAt);
    const construct = b.readyAt > now ? Math.min(1, (now - b.builtAt) / span) : 1;
    const s = (0.22 + 0.78 * ease) * (0.55 + 0.45 * Math.max(construct, 0.35));
    group.current.scale.setScalar(s);
    group.current.position.y = (1 - ease) * 2.2 + bounce;
  });

  const constructing = b.readyAt > Date.now();
  return (
    <group
      position={[x, baseY, z]}
      onClick={(e) => {
        e.stopPropagation();
        selectEntity(b.id);
      }}
    >
      <group ref={group}>
        <BuildingModel itemId={b.itemId} constructing={constructing} lit={lit} />
        {constructing && <Scaffold />}
      </group>
      {selectedId === b.id && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.4, 1.7, 24]} />
          <meshBasicMaterial color="#1a73e8" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

function Scaffold() {
  return (
    <group>
      <mesh position={[1.1, 1.1, 1.1]}>
        <boxGeometry args={[0.08, 2.2, 0.08]} />
        <meshBasicMaterial color="#c45c2a" />
      </mesh>
      <mesh position={[-1.1, 1.1, 1.1]}>
        <boxGeometry args={[0.08, 2.2, 0.08]} />
        <meshBasicMaterial color="#c45c2a" />
      </mesh>
      <mesh position={[1.1, 1.1, -1.1]}>
        <boxGeometry args={[0.08, 2.2, 0.08]} />
        <meshBasicMaterial color="#c45c2a" />
      </mesh>
      <mesh position={[-1.1, 1.1, -1.1]}>
        <boxGeometry args={[0.08, 2.2, 0.08]} />
        <meshBasicMaterial color="#c45c2a" />
      </mesh>
      <mesh position={[0, 2.15, 0]}>
        <boxGeometry args={[2.3, 0.08, 2.3]} />
        <meshBasicMaterial color="#d9890f" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function liftCurve(l: PlacedLift, hm: Heightmap) {
  const a = hexToWorld(l.a.q, l.a.r);
  const b = hexToWorld(l.b.q, l.b.r);
  const ay = hm.worldY(a.x, a.z) + 1.7;
  const by = hm.worldY(b.x, b.z) + 1.7;
  const mid = new THREE.Vector3((a.x + b.x) / 2, (ay + by) / 2, (a.z + b.z) / 2);
  const span = Math.hypot(a.x - b.x, a.z - b.z);
  mid.y -= Math.min(8, span * 0.08);
  return new THREE.CatmullRomCurve3([new THREE.Vector3(a.x, ay, a.z), mid, new THREE.Vector3(b.x, by, b.z)]);
}

function Lifts() {
  const lifts = useGame((s) => s.lifts);
  const hm = getHeightmap();
  const selectEntity = useGame((s) => s.selectEntity);
  return (
    <group>
      {lifts.map((l) => {
        const curve = liftCurve(l, hm);
        const tube = new THREE.TubeGeometry(curve, 32, 0.035, 5, false);
        return (
          <group
            key={l.id}
            onClick={(e) => {
              e.stopPropagation();
              selectEntity(l.id);
            }}
          >
            <mesh geometry={tube}>
              <meshStandardMaterial color="#2a3540" metalness={0.6} roughness={0.3} />
            </mesh>
            <LiftCabins curve={curve} kind={l.itemId} />
            <Pylons lift={l} hm={hm} />
          </group>
        );
      })}
    </group>
  );
}

function Pylons({ lift, hm }: { lift: PlacedLift; hm: Heightmap }) {
  const a = hexToWorld(lift.a.q, lift.a.r);
  const b = hexToWorld(lift.b.q, lift.b.r);
  const items = [];
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const y = hm.worldY(x, z);
    items.push(
      <mesh key={i} position={[x, y + 1.1, z]}>
        <cylinderGeometry args={[0.08, 0.12, 2.2, 6]} />
        <meshStandardMaterial color="#3a4650" />
      </mesh>,
    );
  }
  return <group>{items}</group>;
}

function LiftCabins({ curve, kind }: { curve: THREE.CatmullRomCurve3; kind: PlacedLift["itemId"] }) {
  const n = kind === "tram" ? 2 : kind === "tbar" ? 4 : 6;
  const refs = useRef<THREE.Group[]>([]);
  useFrame(() => {
    const t0 = (performance.now() / 1000) * (kind === "tram" ? 0.04 : 0.07);
    for (let i = 0; i < n; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const u = (t0 + i / n) % 1;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      g.position.copy(p);
      g.lookAt(p.clone().add(t));
    }
  });
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el;
          }}
        >
          <GondolaCabin />
        </group>
      ))}
    </group>
  );
}

function pistePoints(p: Pick<PlacedPiste, "hexes">, hm: Heightmap) {
  return p.hexes.map((h) => {
    const { x, z } = hexToWorld(h.q, h.r);
    return new THREE.Vector3(x, hm.worldY(x, z) + 0.05, z);
  });
}

function Pistes() {
  const pistes = useGame((s) => s.pistes);
  const draft = useGame((s) => s.pisteDraft);
  const layer = useGame((s) => s.layer);
  const hm = getHeightmap();
  const hide = layer === "height";
  const geos = useMemo(() => {
    return pistes.map((p) => ({
      p,
      geo: ribbonGeometry(pistePoints(p, hm), p.difficulty === "park" ? 1.6 : 1.15),
    }));
  }, [pistes, hm]);
  const draftGeo = useMemo(() => {
    if (draft.length < 2) return null;
    return ribbonGeometry(
      pistePoints({ hexes: draft }, hm),
      1.1,
    );
  }, [draft, hm]);
  if (hide) return null;
  const col: Record<string, string> = { blue: "#2b7de9", red: "#d64545", black: "#222", park: "#e8c04a", road: "#5a6570" };
  return (
    <group>
      {geos.map(({ p, geo }) => (
        <mesh key={p.id} geometry={geo}>
          <meshStandardMaterial color={col[p.difficulty]} roughness={0.7} transparent opacity={layer === "pistes" ? 0.95 : 0.72} />
        </mesh>
      ))}
      {draftGeo && (
        <mesh geometry={draftGeo}>
          <meshStandardMaterial color="#7ec8ff" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

function Skiers() {
  const pistes = useGame((s) => s.pistes);
  const hm = getHeightmap();
  const paths = useMemo(() => pistes.filter((p) => p.hexes.length >= 2).map((p) => pistePoints(p, hm)), [pistes, hm]);
  const count = Math.min(56, Math.max(8, paths.length * 6));
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: 80 }, (_, i) => i * 0.137), []);

  useFrame(() => {
    if (!ref.current || paths.length === 0) return;
    const t = performance.now() / 1000;
    for (let i = 0; i < count; i++) {
      const path = paths[i % paths.length]!;
      const u = (t * 0.08 + seeds[i]!) % 1;
      const idx = u * (path.length - 1);
      const a = path[Math.floor(idx)]!;
      const b = path[Math.min(path.length - 1, Math.floor(idx) + 1)]!;
      const f = idx % 1;
      dummy.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + 0.2, a.z + (b.z - a.z) * f);
      dummy.lookAt(b);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  if (paths.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <capsuleGeometry args={[0.08, 0.22, 3, 6]} />
      <meshStandardMaterial color="#c23b32" />
    </instancedMesh>
  );
}

function Traffic() {
  const hm = getHeightmap();
  const parking = useGame((s) => s.buildings.filter((b) => b.itemId === "parking" || b.itemId === "bus").length);
  const n = Math.min(12, 3 + parking * 2);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    if (!ref.current) return;
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const u = (t * 0.05 + i / n) % 1;
      const x = -28 + u * 48;
      const z = 44 + Math.sin(u * 6 + i) * 1.4;
      dummy.position.set(x, hm.worldY(x, z) + 0.28, z);
      dummy.rotation.set(0, u > 0.5 ? Math.PI : 0, 0);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]}>
      <boxGeometry args={[0.7, 0.32, 0.38]} />
      <meshStandardMaterial color="#1a73e8" />
    </instancedMesh>
  );
}

function Snowfall({ on }: { on: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = 500;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 140;
      arr[i * 3 + 1] = Math.random() * 70;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    if (!ref.current || !on) return;
    const pos = ref.current.geometry.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 6;
      if (y < 0) y = 68;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });
  if (!on) return null;
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#ffffff" size={0.28} transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

/**
 * Where the other builders are pointing.
 *
 * Two people on one mountain could previously only tell they had company from
 * a number in the corner — you could not see what the other was about to do,
 * or walk over to help. A ring under their pointer with their name on it makes
 * the shared map actually shared.
 */
function PeerFocus() {
  const players = useGame((s) => s.players);
  const me = useGame((s) => s.playerId);
  const hm = getHeightmap();
  const ring = useRef<THREE.Group>(null);
  const peers = players.filter((p) => p.id !== me && p.focus);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    // A slow breath, so a stationary marker still reads as someone present.
    const s = 1 + Math.sin(clock.elapsedTime * 2.6) * 0.06;
    for (const child of ring.current.children) child.scale.setScalar(s);
  });

  if (peers.length === 0) return null;
  return (
    <group ref={ring}>
      {peers.map((p) => {
        const hex = p.focus!;
        const { x, z } = hexToWorld(hex.q, hex.r);
        const y = hm.worldY(x, z) + visualRelief(x, z);
        const color = peerColor(p.id);
        return (
          <group key={p.id} position={[x, y + 0.14, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[HEX_SIZE * 0.6, HEX_SIZE * 0.94, 6]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.8}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <Html center distanceFactor={110} position={[0, 2.6, 0]} zIndexRange={[20, 0]}>
              <div
                style={{
                  background: color,
                  color: "#fff",
                  padding: "3px 9px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 8px rgba(11,26,48,.35)",
                  pointerEvents: "none",
                }}
              >
                {p.name}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/**
 * A gradient sky instead of a flat clear colour.
 *
 * The range had nothing to stand against: sky, haze and distant snow were all
 * the same tone, so the peaks dissolved rather than reading as peaks. A
 * horizon behind them is what gives the mountain its silhouette.
 */
function SkyDome() {
  const geo = useMemo(() => new THREE.SphereGeometry(400, 32, 20), []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        // Never fogged: the sky is the thing the fog fades everything else into.
        fog: false,
        uniforms: {
          zenith: { value: new THREE.Color("#3f74b4") },
          horizon: { value: new THREE.Color("#d5e4f0") },
        },
        vertexShader: `
          varying float vHeight;
          void main() {
            vHeight = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 zenith;
          uniform vec3 horizon;
          varying float vHeight;
          void main() {
            float t = clamp(vHeight * 1.25 + 0.1, 0.0, 1.0);
            gl_FragColor = vec4(mix(horizon, zenith, pow(t, 0.8)), 1.0);
          }`,
      }),
    [],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} renderOrder={-1} frustumCulled={false} />;
}

function LightsAndSky() {
  const tod = useGame((s) => s.timeOfDay);
  const quality = useGame((s) => s.quality);
  const hour = tod * 24;
  const sunT = (hour - 6) / 12;
  const elev = Math.sin(Math.max(0.08, Math.min(1, sunT)) * Math.PI);
  const low = quality === "low";
  return (
    <>
      <SkyDome />
      {/*
        Fill light used to total more than the sun (hemisphere 1.05 + ambient
        0.42 against a 1.35 directional), which flattened the mountain into a
        sheet. The sun now dominates and the fill only keeps shadowed faces
        from going black — sky blue from above, bounced snow-light from below.
      */}
      <hemisphereLight args={["#bcd8f5", "#7f8f9c", low ? 0.5 : 0.36]} />
      <ambientLight intensity={low ? 0.16 : 0.1} />
      <directionalLight
        position={[48, 36 + elev * 28, 18]}
        // Strong enough to sculpt, not so strong that the mid-tones blow out
        // to white — which is what a 2.35 sun through ACES was doing to snow.
        intensity={1.55 * (0.55 + elev * 0.5) * (low ? 1.12 : 1)}
        color="#fff2d8"
        castShadow={!low}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={220}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      {/*
        Haze used to start at 120 units, and the Matterhorn stands some 100 to
        150 away — so the fog ate the range the map is named after. It now
        starts past the far peaks and fades into the horizon colour, which
        gives distance without deleting the skyline.
      */}
      <fog attach="fog" args={["#d5e4f0", low ? 170 : 210, low ? 360 : 410]} />
    </>
  );
}

function Controls() {
  const tool = useGame((s) => s.tool);
  const phase = useGame((s) => s.phase);
  const stampMode = useGame((s) => s.stampMode);
  const raster = stampMode && phase !== "idle";
  const { camera } = useThree();
  const ref = useRef<{
    target: THREE.Vector3;
    mouseButtons: { LEFT: number };
    touches: { ONE: number; TWO: number };
    update: () => void;
  } | null>(null);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const spherical = useMemo(() => new THREE.Spherical(), []);

  useEffect(() => {
    camera.up.set(0, 1, 0);
    camera.lookAt(-4, 12, 38);
  }, [camera]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !raster) return;
    const t = c.target;
    camera.position.set(t.x + 6, t.y + 44, t.z + 18);
    camera.lookAt(t.x, t.y, t.z);
    c.update();
  }, [raster, camera]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const d = Math.min(dt, 0.1);
    if (raster || tool === "pan") {
      if (c.mouseButtons) c.mouseButtons.LEFT = THREE.MOUSE.PAN;
      if (c.touches) {
        c.touches.ONE = THREE.TOUCH.PAN;
        c.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      }
    } else {
      if (c.mouseButtons) c.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      if (c.touches) {
        c.touches.ONE = THREE.TOUCH.ROTATE;
        c.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      }
    }
    if (raster) {
      offset.copy(camera.position).sub(c.target);
      spherical.setFromVector3(offset);
      const k = 1 - Math.exp(-4.8 * d);
      spherical.phi += (0.46 - spherical.phi) * k;
      spherical.makeSafe();
      offset.setFromSpherical(spherical);
      camera.position.copy(c.target).add(offset);
    }
  });
  return (
    <MapControls
      ref={ref as never}
      makeDefault
      enableDamping
      dampingFactor={raster ? 0.2 : 0.12}
      minDistance={raster ? 14 : 16}
      // Far enough back to take in the whole range; the map is 196 across.
      maxDistance={raster ? 64 : 250}
      maxPolarAngle={raster ? 0.58 : Math.PI / 2.12}
      minPolarAngle={raster ? 0.34 : stampMode ? 0.36 : 0.28}
      enableRotate={!raster && tool !== "pan"}
      screenSpacePanning
      target={[-4, 12, 38]}
    />
  );
}

function Loop() {
  const tick = useGame((s) => s.tick);
  const persist = useGame((s) => s.persist);
  const acc = useRef(0);
  const saveAcc = useRef(0);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    acc.current += d;
    while (acc.current >= 1 / 20) {
      tick(1 / 20);
      acc.current -= 1 / 20;
    }
    saveAcc.current += d;
    if (saveAcc.current > 5) {
      persist();
      saveAcc.current = 0;
    }
  });
  return null;
}

function VillageSeed() {
  const hm = getHeightmap();
  const lit = useLampsOn();
  const spots = [
    [-6, 12],
    [0, 12],
    [3, 11],
    [-4, 13],
    [2, 13],
  ];
  return (
    <group>
      {spots.map(([q, r], i) => {
        const { x, z } = hexToWorld(q!, r!);
        return (
          <group key={i} position={[x, hm.worldY(x, z), z]} rotation={[0, i * 0.7, 0]}>
            <BuildingModel itemId="hut" lit={lit} />
          </group>
        );
      })}
    </group>
  );
}

export function SkiScene() {
  const quality = useGame((s) => s.quality);
  const weather = useGame((s) => s.weather.kind);
  const mobile = quality === "low";
  return (
    <Canvas
      camera={{
        // Pulled back and pitched lower than before, so the establishing shot
        // includes the skyline rather than only the valley floor the resort
        // starts on.
        position: mobile ? [10, 54, 84] : [22, 50, 108],
        fov: mobile ? 46 : 42,
        near: 0.4,
        far: 460,
      }}
      dpr={mobile ? [1, 1.25] : [1, 1.7]}
      shadows={!mobile}
      gl={{ antialias: !mobile, powerPreference: "high-performance", alpha: false }}
      style={{ touchAction: "none", background: "#bcd2e6" }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor("#bcd2e6", 1);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // The ground carries its own shading now, so less exposure is needed
        // to keep the snow from blowing out to flat white.
        gl.toneMappingExposure = mobile ? 1.1 : 0.98;
        gl.shadowMap.enabled = !mobile;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        camera.lookAt(-4, 12, 38);
      }}
    >
      <LightsAndSky />
      <Controls />
      <Loop />
      <Terrain />
      <Lake />
      <Forest quality={quality} />
      <VillageSeed />
      <Structures />
      <Lifts />
      <Pistes />
      <Skiers />
      <Traffic />
      <HexRaster />
      <HexCursor />
      <HexGhost />
      <CenterStamp />
      <StampFlash />
      <PeerFocus />
      <PeakLabels />
      <Snowfall on={weather === "snow" || weather === "storm"} />
    </Canvas>
  );
}
