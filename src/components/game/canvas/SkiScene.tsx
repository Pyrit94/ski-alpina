import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  getHeightmap,
  LAKE,
  metersToWorldY,
  PEAKS,
  scatterRocks,
  scatterTrees,
  surfaceY,
  VILLAGE,
  type Heightmap,
} from "@/lib/game/alpine";
import { ECONOMY } from "@/lib/game/catalog";
import { HEX_SIZE, hexToWorld, worldToHex } from "@/lib/game/hex";
import { peerColor } from "@/lib/game/players";
import { mulberry32, seedFromString } from "@/lib/game/rng";
import { useGame } from "@/lib/game/store";
import type { ItemId, PlacedBuilding, PlacedLift, PlacedPiste } from "@/lib/game/types";
import { atmosphereAt, createAtmosphere } from "./atmosphere";
import { BuildingInstances, type Placement } from "./baked-buildings";
import { BuildingModel } from "./models";
import { ribbonGeometry } from "./geometry";
import {
  buildFarLand,
  clumpTrees,
  groundBase,
  makeBoulderGeometry,
  makeConiferGeometry,
  paintGround,
} from "./landscape";
import { useTerrainMaterial } from "./terrain-material";
import { useTexturePack } from "./texture-pack";
import { AlbumCapture } from "./AlbumCapture";
import { QUALITY, type QualityTier } from "./quality";
import { useStableGame } from "./use-stable-game";
import { CenterStamp, HexCursor, HexGhost, HexRaster, StampFlash } from "./HexBuildLayer";

/**
 * The playable ground.
 *
 * Shape, normals and occlusion are built once per heightmap (landscape.ts);
 * what changes with the game — snow line, overlay, piste heat — only rewrites
 * the colour buffer. Snapshots that change none of those touch nothing.
 */
function Terrain() {
  const hm = getHeightmap();
  const layer = useGame((s) => s.layer);
  const pistes = useStableGame((s) => s.pistes);
  // Quantised: the raw snow line moves a metre at a time as weather and
  // snowmaking shift. 25 m steps are below what the eye catches on a 130 m
  // blend.
  const snowLineM = useGame((s) => Math.round(s.stats.snowLineM / 25) * 25);
  const base = useMemo(() => groundBase(hm), [hm]);
  // Only the heat layer reads this, so only the heat layer pays for it.
  const heat = useMemo(() => {
    if (layer !== "heat") return null;
    const m = new Map<string, number>();
    for (const p of pistes) {
      for (const h of p.hexes) {
        const k = `${h.q},${h.r}`;
        m.set(k, Math.min(1, (m.get(k) ?? 0) + 0.25));
      }
    }
    return m;
  }, [pistes, layer]);
  useLayoutEffect(() => {
    paintGround(base, layer, snowLineM, heat);
  }, [base, layer, snowLineM, heat]);

  const click = useGame((s) => s.clickHex);
  const hover = useGame((s) => s.hoverHex);
  const stampMode = useGame((s) => s.stampMode);
  const phase = useGame((s) => s.phase);
  const quality = useGame((s) => s.quality);
  const down = useRef<THREE.Vector2 | null>(null);
  const stamp = stampMode && phase !== "idle";
  // Photo detail from public/textures/pbr, when Get-Textures.ps1 has been run.
  const photoTextures = useGame((s) => s.photoTextures);
  const texturePack = useTexturePack(photoTextures);
  const material = useTerrainMaterial(layer === "3d" || layer === "pistes" ? quality : "overlay", texturePack);
  const shadows = QUALITY[quality].shadows;

  return (
    <>
      <mesh
        geometry={base.geometry}
        material={material}
        receiveShadow={shadows}
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
      />
      <FarLand snowLineM={snowLineM} />
    </>
  );
}

/**
 * The world past the edge of the map: see `buildFarLand`. One draw call, no
 * pointer events — a click out there has nothing to build on.
 *
 * Lambert rather than the ground's material: it covers the whole top of the
 * frame, almost all of it under heavy haze, and the procedural detail and PBR
 * terms cannot be seen at that distance but were costing about a sixth of the
 * frame on a software rasteriser.
 */
function FarLand({ snowLineM }: { snowLineM: number }) {
  const hm = getHeightmap();
  // Distant snow follows the season in coarse steps; nobody counts metres at 300 units.
  const coarse = Math.round(snowLineM / 200) * 200;
  const geo = useMemo(() => buildFarLand(hm, coarse), [hm, coarse]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh geometry={geo} material={mat} raycast={noRaycast} />;
}

function noRaycast() {
  /* decoration: never a pick target */
}

/** Conifer stands and boulders: two instanced meshes for the whole map. */
function Forest({ quality }: { quality: "low" | "high" }) {
  const hm = getHeightmap();
  const tier = QUALITY[quality];
  const trees = useMemo(() => {
    const rng = mulberry32(seedFromString("trees-alpina"));
    return clumpTrees(hm, scatterTrees(hm, tier.trees, rng), tier.treesPerClump);
  }, [hm, tier.trees, tier.treesPerClump]);
  const rocks = useMemo(() => {
    const rng = mulberry32(seedFromString("rocks-alpina"));
    return scatterRocks(hm, tier.rocks, rng);
  }, [hm, tier.rocks]);
  const parts = useMemo(
    () => ({
      tree: makeConiferGeometry(),
      boulder: makeBoulderGeometry(),
      treeMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      rockMat: new THREE.MeshStandardMaterial({ color: "#a39484", roughness: 0.95, flatShading: true }),
    }),
    [],
  );
  useEffect(
    () => () => {
      parts.tree.dispose();
      parts.boulder.dispose();
      parts.treeMat.dispose();
      parts.rockMat.dispose();
    },
    [parts],
  );
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const inst = meshRef.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    const rng = mulberry32(seedFromString("tree-tint"));
    trees.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.r, 0);
      // Slightly taller than wide, varied, so stands do not look stamped.
      dummy.scale.set(t.s, t.s * (0.95 + rng() * 0.3), t.s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      // Per-tree tint: some bluer spruce, some warmer larch-dark.
      const v = 0.82 + rng() * 0.36;
      c.setRGB(v * (0.94 + rng() * 0.1), v, v * (0.9 + rng() * 0.14));
      inst.setColorAt(i, c);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
  }, [trees]);

  useLayoutEffect(() => {
    const inst = rockRef.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    const rng = mulberry32(seedFromString("rock-tint"));
    rocks.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 0.05, t.z);
      dummy.rotation.set(0.2, t.r, 0.1);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      const v = 0.8 + rng() * 0.3;
      c.setRGB(v, v * 0.97, v * (0.9 + rng() * 0.08));
      inst.setColorAt(i, c);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
  }, [rocks]);

  return (
    <group>
      <instancedMesh
        key={`t${trees.length}`}
        ref={meshRef}
        args={[parts.tree, parts.treeMat, trees.length]}
        castShadow={tier.shadows}
        raycast={noRaycast}
      />
      <instancedMesh
        key={`r${rocks.length}`}
        ref={rockRef}
        args={[parts.boulder, parts.rockMat, rocks.length]}
        castShadow={tier.shadows}
        receiveShadow={tier.shadows}
        raycast={noRaycast}
      />
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

/**
 * Stacking range for every in-scene HTML label.
 *
 * drei's default is up to 16 777 271, which put peak names on top of the HUD's
 * side panels and top bar. The HUD root sits at z-10, so scene labels stay
 * under it and slide beneath the panels like the rest of the world does.
 */
const LABEL_Z: [number, number] = [5, 0];

function PeakLabels() {
  const hm = getHeightmap();
  const layer = useGame((s) => s.layer);
  const quality = useGame((s) => s.quality);
  const stampMode = useGame((s) => s.stampMode);
  const phase = useGame((s) => s.phase);
  if (layer === "pistes") return null;
  if (stampMode && phase !== "idle") return null;
  const compact = QUALITY[quality].compactLabels;
  return (
    <>
      {PEAKS.map((p) => (
        <Html key={p.id} position={[p.x, surfaceY(hm, p.x, p.z) + 3.2, p.z]} center distanceFactor={compact ? 120 : 90} zIndexRange={LABEL_Z}>
          <div className="pointer-events-none whitespace-nowrap rounded-full bg-navy/70 px-2 py-0.5 text-[10px] font-medium text-snow backdrop-blur-sm">
            {compact ? p.name : `${p.name} · ${p.elev.toLocaleString("de-CH")} m`}
          </div>
        </Html>
      ))}
      <Html position={[VILLAGE.x, surfaceY(hm, VILLAGE.x, VILLAGE.z) + 2.4, VILLAGE.z]} center distanceFactor={compact ? 110 : 80} zIndexRange={LABEL_Z}>
        <div className="pointer-events-none rounded-full bg-panel/90 px-2 py-0.5 text-[10px] font-semibold text-navy">
          {VILLAGE.name}
        </div>
      </Html>
    </>
  );
}

/**
 * The radial falloff a contact patch is painted with.
 *
 * Built once into a canvas rather than shipped as a file: it is a gradient,
 * and a gradient described in six lines of code does not need a network
 * request or a place in the asset pipeline.
 */
function contactTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, "rgba(0,0,0,0.9)");
  grad.addColorStop(0.4, "rgba(0,0,0,0.44)");
  grad.addColorStop(0.72, "rgba(0,0,0,0.13)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The dark patch where a building meets the ground.
 *
 * Not a shadow — the sun already casts those, and it cannot draw this one:
 * occlusion under an object is there at every hour and from every angle. It is
 * the cue that reads as "placed" rather than "pasted on", and screen-space AO
 * is the one thing a phone cannot pay for, so it is faked the way mobile games
 * fake it: one instanced quad per building carrying an alpha falloff. Whole
 * village, one draw call, no shader.
 */
function GroundContact({ buildings }: { buildings: PlacedBuilding[] }) {
  const hm = getHeightmap();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const texture = useMemo(contactTexture, []);
  const flat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    [],
  );
  const scratch = useMemo(
    () => ({ m: new THREE.Matrix4(), at: new THREE.Vector3(), size: new THREE.Vector3() }),
    [],
  );
  // Rebuilding the mesh on every single build would throw the GPU buffer away
  // each time, so capacity grows in blocks and `count` does the rest.
  const capacity = Math.max(8, Math.ceil(buildings.length / 8) * 8);

  useEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const { m, at, size } = scratch;
    buildings.forEach((b, i) => {
      const { x, z } = hexToWorld(b.q, b.r);
      // A hotel occludes more ground than a ticket hut.
      const spread = b.itemId.startsWith("hotel") ? 1.25 : 1;
      at.set(x, surfaceY(hm, x, z) + 0.05, z);
      size.set(spread, spread, 1);
      inst.setMatrixAt(i, m.compose(at, flat, size));
    });
    inst.count = buildings.length;
    inst.instanceMatrix.needsUpdate = true;
  }, [buildings, hm, flat, scratch, capacity]);

  if (buildings.length === 0 || !texture) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, capacity]}
      frustumCulled={false}
      renderOrder={1}
    >
      <planeGeometry args={[3.2, 3.2]} />
      <meshBasicMaterial
        map={texture}
        // A cool grey, not black: occluded snow is lit by the sky, so pure
        // black reads as a hole punched in the mountain.
        color="#41566b"
        transparent
        opacity={0.5}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
      />
    </instancedMesh>
  );
}

/** How long a new building animates in before it can join its instanced kind. */
const DROP_MS = 700;
/** Longest a timer is set for; `readyAt` can be MAX_SAFE_INTEGER during a match's planning round. */
const MAX_WAIT_MS = 60_000;

/** The decoration the village starts with: never selectable, always finished. */
const SEED_HUTS: Array<[number, number]> = [
  [-6, 12],
  [0, 12],
  [3, 11],
  [-4, 13],
  [2, 13],
];

/**
 * Every building on the map.
 *
 * Finished ones are drawn as instances per kind (baked-buildings.tsx); those
 * still dropping in or under construction keep their own meshes, which is
 * what animates and goes translucent. A timer moves a building across when
 * it finishes, so nothing here depends on a snapshot arriving to notice.
 */
function Structures() {
  const buildings = useStableGame((s) => s.buildings);
  const selectEntity = useGame((s) => s.selectEntity);
  const quality = useGame((s) => s.quality);
  const lit = useLampsOn();
  const hm = getHeightmap();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = Date.now();
    let next = Infinity;
    for (const b of buildings) {
      if (b.readyAt > t) next = Math.min(next, b.readyAt);
      else if (b.builtAt + DROP_MS > t) next = Math.min(next, b.builtAt + DROP_MS);
    }
    if (next === Infinity) return;
    const id = window.setTimeout(() => setNow(Date.now()), Math.min(MAX_WAIT_MS, next - t + 30));
    return () => window.clearTimeout(id);
  }, [buildings, now]);

  const { live, kinds } = useMemo(() => {
    const live: PlacedBuilding[] = [];
    const kinds = new Map<ItemId, Placement[]>();
    const add = (itemId: ItemId, pl: Placement) => {
      const list = kinds.get(itemId);
      if (list) list.push(pl);
      else kinds.set(itemId, [pl]);
    };
    SEED_HUTS.forEach(([q, r], i) => {
      const { x, z } = hexToWorld(q, r);
      add("hut", { id: null, x, y: surfaceY(hm, x, z), z, yaw: i * 0.7 });
    });
    for (const b of buildings) {
      if (b.readyAt > now || b.builtAt + DROP_MS > now) {
        live.push(b);
        continue;
      }
      const { x, z } = hexToWorld(b.q, b.r);
      add(b.itemId, { id: b.id, x, y: surfaceY(hm, x, z), z, yaw: 0 });
    }
    return { live, kinds: [...kinds.entries()] };
  }, [buildings, now, hm]);

  return (
    <group>
      <GroundContact buildings={buildings} />
      {kinds.map(([itemId, placements]) => (
        <BuildingInstances
          key={`${itemId}|${lit}`}
          itemId={itemId}
          lit={lit}
          placements={placements}
          shadows={QUALITY[quality].shadows}
          onPick={selectEntity}
        />
      ))}
      {live.map((b) => (
        <PlacedStructure key={b.id} building={b} />
      ))}
      <SelectionRing buildings={buildings} />
    </group>
  );
}

function SelectionRing({ buildings }: { buildings: PlacedBuilding[] }) {
  const selectedId = useGame((s) => s.selectedId);
  const hm = getHeightmap();
  const b = selectedId ? buildings.find((x) => x.id === selectedId) : undefined;
  if (!b) return null;
  const { x, z } = hexToWorld(b.q, b.r);
  return (
    <mesh position={[x, surfaceY(hm, x, z) + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.4, 1.7, 24]} />
      <meshBasicMaterial color="#1a73e8" transparent opacity={0.7} />
    </mesh>
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
  const selectEntity = useGame((s) => s.selectEntity);
  const lit = useLampsOn();
  const hm = getHeightmap();
  const group = useRef<THREE.Group>(null);
  const { x, z } = hexToWorld(b.q, b.r);
  const baseY = surfaceY(hm, x, z);

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

/** How tall a tower stands above the ground it is planted in. */
const PYLON_HEIGHT = 3.2;
/** Roughly one tower per this many world units of span. */
const PYLON_SPACING = 7;

interface LiftLine {
  /** Ground positions of the two stations. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** Tower feet, in order from the valley station. */
  towers: THREE.Vector3[];
  /** The line the cable actually follows: station top, tower tops, station top. */
  tops: THREE.Vector3[];
  /** Sideways unit vector, for offsetting the up-line from the down-line. */
  side: THREE.Vector3;
  span: number;
}

/**
 * Where a cableway's towers stand and how high the cable runs.
 *
 * The old version drew one long arc from station to station and put three
 * cylinders under it at fixed fractions — so the towers floated, touched
 * nothing, and the cable sagged straight through the mountain on a steep span.
 * Towers are now placed along the span, planted on the ground they actually
 * stand on, and the cable is hung from their tops.
 */
function liftLine(l: PlacedLift, hm: Heightmap): LiftLine {
  const aw = hexToWorld(l.a.q, l.a.r);
  const bw = hexToWorld(l.b.q, l.b.r);
  const a = new THREE.Vector3(aw.x, surfaceY(hm, aw.x, aw.z), aw.z);
  const b = new THREE.Vector3(bw.x, surfaceY(hm, bw.x, bw.z), bw.z);
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const count = Math.max(1, Math.round(span / PYLON_SPACING) - 1);
  const towers: THREE.Vector3[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    towers.push(new THREE.Vector3(x, surfaceY(hm, x, z), z));
  }
  const stationTop = 1.6;
  const tops = [
    new THREE.Vector3(a.x, a.y + stationTop, a.z),
    ...towers.map((t) => new THREE.Vector3(t.x, t.y + PYLON_HEIGHT, t.z)),
    new THREE.Vector3(b.x, b.y + stationTop, b.z),
  ];
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  return { a, b, towers, tops, side, span };
}

/**
 * The cable, sagging between supports rather than in one arc end to end.
 *
 * A rope over towers dips in each bay and is pulled back up at every tower.
 * One arc across the whole span is what made a long lift look like a
 * washing line.
 */
function cableCurve(tops: THREE.Vector3[], offset: THREE.Vector3): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < tops.length; i++) {
    const here = tops[i]!.clone().add(offset);
    pts.push(here);
    const next = tops[i + 1];
    if (!next) continue;
    const to = next.clone().add(offset);
    const bay = here.distanceTo(to);
    const mid = here.clone().lerp(to, 0.5);
    mid.y -= Math.min(0.9, bay * 0.06);
    pts.push(mid);
  }
  return new THREE.CatmullRomCurve3(pts);
}

/**
 * How many carriers one lift may show, given how many lifts exist.
 *
 * Visible cabins are decoration — the sim counts nobody by looking at them —
 * so they answer to a fixed budget rather than to how many lifts get built.
 * Without this, a large resort quietly multiplies its way past the draw-call
 * budget, one perfectly reasonable-looking lift at a time.
 */
function carrierBudget(liftCount: number): number {
  const perDirection = ECONOMY.maxVisualGondolas / Math.max(1, liftCount * 2);
  return Math.max(2, Math.min(8, Math.floor(perDirection)));
}

type CarrierKind = "cabin" | "chair" | "tbar";

function carrierKindOf(itemId: PlacedLift["itemId"]): CarrierKind {
  if (itemId === "tbar") return "tbar";
  if (itemId === "chair") return "chair";
  return "cabin";
}

/** How the three kinds of carrier behave on the rope. */
const CARRIER_RIG: Record<CarrierKind, { hang: number; speed: number }> = {
  cabin: { hang: 0.55, speed: 0.06 },
  chair: { hang: 0.72, speed: 0.075 },
  // A bar is dragged along the ground rather than hung from the rope.
  tbar: { hang: 1.9, speed: 0.075 },
};

interface Rig {
  lift: PlacedLift;
  line: LiftLine;
  up: THREE.CatmullRomCurve3;
  down: THREE.CatmullRomCurve3;
  cables: THREE.TubeGeometry[];
  kind: CarrierKind;
  riders: number;
}

/**
 * One rider on a rope: which curve, where along it, and which way round.
 *
 * Flattened across every lift so all carriers of one kind can be drawn as a
 * single instanced mesh. Per-lift meshes multiplied out to well over a
 * thousand draw calls on a large resort, which is exactly what the project's
 * performance budget forbids.
 */
interface Rider {
  curve: THREE.CatmullRomCurve3;
  /** Position along the curve at time zero, 0..1. */
  phase: number;
  speed: number;
  hang: number;
  /** Return side runs the other way, so one rope reads as circulating. */
  reverse: boolean;
}

function Lifts() {
  const lifts = useStableGame((s) => s.lifts);
  const hm = getHeightmap();
  const selectEntity = useGame((s) => s.selectEntity);
  const budget = carrierBudget(lifts.length);

  const rigs = useMemo<Rig[]>(
    () =>
      lifts.map((lift) => {
        const line = liftLine(lift, hm);
        const kind = carrierKindOf(lift.itemId);
        // Two lines side by side: one going up, one coming back. A single
        // cable is the tell that a lift was drawn rather than modelled.
        const gap = kind === "tbar" ? 0.24 : 0.38;
        const up = cableCurve(line.tops, line.side.clone().multiplyScalar(gap));
        const down = cableCurve(line.tops, line.side.clone().multiplyScalar(-gap));
        const segments = Math.max(24, line.tops.length * 8);
        return {
          lift,
          line,
          up,
          down,
          kind,
          // A tram has two cars by definition; the rest take what they are given.
          riders: lift.itemId === "tram" ? Math.min(2, budget) : budget,
          cables: [
            new THREE.TubeGeometry(up, segments, 0.045, 5, false),
            new THREE.TubeGeometry(down, segments, 0.045, 5, false),
          ],
        };
      }),
    [lifts, hm, budget],
  );

  useEffect(
    () => () => {
      for (const rig of rigs) for (const c of rig.cables) c.dispose();
    },
    [rigs],
  );

  return (
    <group>
      {/* Cables stay per-lift: each is a unique curve, and they are what a
          player clicks to select the installation. */}
      {rigs.map((rig) => (
        <group
          key={rig.lift.id}
          onClick={(e) => {
            e.stopPropagation();
            selectEntity(rig.lift.id);
          }}
        >
          {rig.cables.map((geo, i) => (
            <mesh key={i} geometry={geo}>
              <meshStandardMaterial color="#26323d" metalness={0.55} roughness={0.35} />
            </mesh>
          ))}
        </group>
      ))}
      <PylonField rigs={rigs} />
      <CarrierField rigs={rigs} />
    </group>
  );
}

/**
 * Every tower on the mountain, in three draw calls.
 *
 * Mast, crossarm and sheaves are separate instanced meshes because they are
 * different shapes and colours; all three share one transform per tower.
 */
function PylonField({ rigs }: { rigs: Rig[] }) {
  const towers = useMemo(() => {
    const out: { at: THREE.Vector3; yaw: number }[] = [];
    for (const rig of rigs) {
      const yaw = Math.atan2(rig.line.side.x, rig.line.side.z);
      for (const at of rig.line.towers) out.push({ at, yaw });
    }
    return out;
  }, [rigs]);

  const mast = useRef<THREE.InstancedMesh>(null);
  const arm = useRef<THREE.InstancedMesh>(null);
  const sheave = useRef<THREE.InstancedMesh>(null);

  const parts = useMemo(
    () => ({
      mast: offsetGeometry(
        new THREE.CylinderGeometry(0.09, 0.16, PYLON_HEIGHT, 6),
        PYLON_HEIGHT / 2,
      ),
      arm: offsetGeometry(new THREE.BoxGeometry(1.05, 0.1, 0.12), PYLON_HEIGHT),
      // One wide, flat cylinder reads as the pair of sheaves at the distance
      // this game is played at, and costs one instance instead of two.
      sheave: offsetGeometry(
        new THREE.CylinderGeometry(0.09, 0.09, 0.86, 10),
        PYLON_HEIGHT + 0.08,
        Math.PI / 2,
      ),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const g of Object.values(parts)) g.dispose();
    },
    [parts],
  );

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const at = new THREE.Vector3();
    towers.forEach((t, i) => {
      q.setFromAxisAngle(up, t.yaw);
      // Each part's offset is baked into its geometry, so one transform per
      // tower positions all three.
      m.compose(at.copy(t.at), q, one);
      mast.current?.setMatrixAt(i, m);
      arm.current?.setMatrixAt(i, m);
      sheave.current?.setMatrixAt(i, m);
    });
    for (const ref of [mast, arm, sheave]) {
      if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    }
  }, [towers]);

  if (towers.length === 0) return null;
  return (
    <group>
      <instancedMesh
        ref={mast}
        args={[parts.mast, undefined, towers.length]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#48555f" metalness={0.35} roughness={0.6} />
      </instancedMesh>
      <instancedMesh
        ref={arm}
        args={[parts.arm, undefined, towers.length]}
        castShadow
        frustumCulled={false}
      >
        <meshStandardMaterial color="#3b4750" metalness={0.4} roughness={0.55} />
      </instancedMesh>
      <instancedMesh
        ref={sheave}
        args={[parts.sheave, undefined, towers.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial color="#d9890f" metalness={0.3} roughness={0.5} />
      </instancedMesh>
    </group>
  );
}

/**
 * Bake an offset into a geometry so an instance needs no child node.
 *
 * Built once in a memo rather than through R3F's `onUpdate`: that hook can
 * fire more than once, and `translate` is cumulative, so the part would
 * silently drift further from its tower on every re-render.
 */
function offsetGeometry<T extends THREE.BufferGeometry>(geo: T, y: number, rotateZ = 0): T {
  if (rotateZ) geo.rotateZ(rotateZ);
  geo.translate(0, y, 0);
  return geo;
}

/**
 * Every carrier on the mountain, animated as instances.
 *
 * Two draw calls per kind — body and detail — sharing one transform each, plus
 * one for the hangers. A resort with twenty lifts therefore costs the same
 * handful of calls as one with a single lift.
 */
function CarrierField({ rigs }: { rigs: Rig[] }) {
  const byKind = useMemo(() => {
    const out: Record<CarrierKind, Rider[]> = { cabin: [], chair: [], tbar: [] };
    for (const rig of rigs) {
      const { hang, speed } = CARRIER_RIG[rig.kind];
      for (let i = 0; i < rig.riders; i++) {
        const phase = i / rig.riders;
        out[rig.kind].push({ curve: rig.up, phase, speed, hang, reverse: false });
        out[rig.kind].push({ curve: rig.down, phase, speed, hang, reverse: true });
      }
    }
    return out;
  }, [rigs]);

  return (
    <group>
      {(["cabin", "chair", "tbar"] as const).map((kind) => (
        <CarrierInstances key={kind} kind={kind} riders={byKind[kind]} />
      ))}
    </group>
  );
}

function CarrierInstances({ kind, riders }: { kind: CarrierKind; riders: Rider[] }) {
  const body = useRef<THREE.InstancedMesh>(null);
  const detail = useRef<THREE.InstancedMesh>(null);
  const rope = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      one: new THREE.Vector3(1, 1, 1),
    }),
    [],
  );
  const parts = useMemo(() => carrierParts(kind), [kind]);
  useEffect(
    () => () => {
      parts.rope.dispose();
      parts.body.dispose();
      parts.detail.dispose();
    },
    [parts],
  );

  useFrame(() => {
    if (riders.length === 0) return;
    const now = performance.now() / 1000;
    const { m, p, q, one } = scratch;
    for (let i = 0; i < riders.length; i++) {
      const r = riders[i]!;
      const t = (now * r.speed + r.phase) % 1;
      r.curve.getPointAt(r.reverse ? 1 - t : t, p);
      p.y -= r.hang;
      m.compose(p, q, one);
      body.current?.setMatrixAt(i, m);
      detail.current?.setMatrixAt(i, m);
      rope.current?.setMatrixAt(i, m);
    }
    for (const ref of [body, detail, rope]) {
      if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (riders.length === 0) return null;
  const n = riders.length;
  return (
    <group>
      {/* The arm back up to the rope. Without it, carriers float. */}
      <instancedMesh ref={rope} args={[parts.rope, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial color="#33414d" metalness={0.5} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={body} args={[parts.body, undefined, n]} castShadow frustumCulled={false}>
        <meshStandardMaterial {...parts.bodyMaterial} />
      </instancedMesh>
      <instancedMesh ref={detail} args={[parts.detail, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial {...parts.detailMaterial} />
      </instancedMesh>
    </group>
  );
}

/** Geometry and colours for one kind of carrier, built once. */
function carrierParts(kind: CarrierKind) {
  const hang = CARRIER_RIG[kind].hang;
  const rope = offsetGeometry(new THREE.CylinderGeometry(0.025, 0.025, hang, 5), hang / 2);
  if (kind === "cabin") {
    const detail = new THREE.BoxGeometry(0.3, 0.2, 0.03);
    detail.translate(0, 0.06, 0.18);
    return {
      rope,
      body: new THREE.BoxGeometry(0.42, 0.44, 0.34),
      detail,
      bodyMaterial: { color: "#c23b32", metalness: 0.25, roughness: 0.42 },
      detailMaterial: { color: "#c9e7f7", emissive: "#c9e7f7", emissiveIntensity: 0.25 },
    };
  }
  if (kind === "chair") {
    const back = new THREE.BoxGeometry(0.62, 0.4, 0.06);
    back.translate(0, 0.22, -0.15);
    return {
      rope,
      body: new THREE.BoxGeometry(0.62, 0.07, 0.3),
      detail: back,
      bodyMaterial: { color: "#2f6fed", metalness: 0.2, roughness: 0.5 },
      detailMaterial: { color: "#2f6fed", metalness: 0.2, roughness: 0.5 },
    };
  }
  return {
    rope,
    body: new THREE.BoxGeometry(0.42, 0.06, 0.06),
    detail: offsetGeometry(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 5), 0.16),
    bodyMaterial: { color: "#d9890f", roughness: 0.6 },
    detailMaterial: { color: "#33414d" },
  };
}

function pistePoints(p: Pick<PlacedPiste, "hexes">, hm: Heightmap) {
  return p.hexes.map((h) => {
    const { x, z } = hexToWorld(h.q, h.r);
    return new THREE.Vector3(x, surfaceY(hm, x, z) + 0.05, z);
  });
}

const PISTE_COLOR: Record<string, string> = {
  blue: "#2b7de9",
  red: "#d64545",
  black: "#1c1c1c",
  park: "#e8c04a",
  road: "#5a6570",
};

/**
 * Runs as groomed snow with a coloured edge, rather than a coloured stripe.
 *
 * A blue piste is not blue ground — it is white corduroy with blue markers
 * down the side. Two strips do the job: a wider one in the difficulty colour
 * and a narrower white one floating just above it, which leaves the colour
 * showing as a border. That reads as both "this is snow" and "this is a blue
 * run" at the same time, where a flat tinted band read as neither.
 *
 * Roads keep a single grey strip: they are not pistes and should not pretend.
 */
function Pistes() {
  const pistes = useStableGame((s) => s.pistes);
  const draft = useGame((s) => s.pisteDraft);
  const layer = useGame((s) => s.layer);
  const hm = getHeightmap();
  const hide = layer === "height";

  // Every run in two draw calls: all coloured edges in one vertex-coloured
  // mesh, all groomed centres in another. One mesh pair per run used to cost
  // two calls (and two more transparent sorts) for every piste built.
  const geos = useMemo(() => {
    const edges: THREE.BufferGeometry[] = [];
    const snows: THREE.BufferGeometry[] = [];
    const tint = new THREE.Color();
    for (const p of pistes) {
      if (p.hexes.length < 2) continue;
      const pts = pistePoints(p, hm);
      const w = p.difficulty === "park" ? 1.7 : p.difficulty === "road" ? 1.0 : 1.25;
      const edge = ribbonGeometry(pts, w + 0.34, 0.07);
      tint.set(PISTE_COLOR[p.difficulty] ?? "#2b7de9");
      const n = edge.attributes.position!.count;
      const colours = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        colours[i * 3] = tint.r;
        colours[i * 3 + 1] = tint.g;
        colours[i * 3 + 2] = tint.b;
      }
      edge.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      edges.push(edge);
      if (p.difficulty !== "road") snows.push(ribbonGeometry(pts, w, 0.1));
    }
    const merge = (parts: THREE.BufferGeometry[]) => {
      if (parts.length === 0) return null;
      const g = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      return g;
    };
    return { edge: merge(edges), snow: merge(snows) };
  }, [pistes, hm]);

  const draftGeo = useMemo(
    () => (draft.length < 2 ? null : ribbonGeometry(pistePoints({ hexes: draft }, hm), 1.2, 0.12)),
    [draft, hm],
  );

  useEffect(
    () => () => {
      geos.edge?.dispose();
      geos.snow?.dispose();
    },
    [geos],
  );
  useEffect(() => () => draftGeo?.dispose(), [draftGeo]);

  if (hide) return null;
  const emphasis = layer === "pistes";
  return (
    <group>
      {geos.edge && (
        <mesh geometry={geos.edge} raycast={noRaycast}>
          <meshStandardMaterial
            vertexColors
            roughness={0.72}
            transparent
            opacity={emphasis ? 0.98 : 0.9}
          />
        </mesh>
      )}
      {geos.snow && (
        <mesh geometry={geos.snow} receiveShadow raycast={noRaycast}>
          <meshStandardMaterial
            // Slightly blue-white and smoother than the terrain: groomed
            // snow catches the light differently from the open mountain.
            color="#eef5fd"
            roughness={0.5}
            transparent
            opacity={emphasis ? 0.55 : 0.95}
          />
        </mesh>
      )}
      {draftGeo && (
        <mesh geometry={draftGeo}>
          <meshStandardMaterial color="#7ec8ff" transparent opacity={0.75} />
        </mesh>
      )}
    </group>
  );
}

function Skiers() {
  const pistes = useStableGame((s) => s.pistes);
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
      dummy.position.set(x, surfaceY(hm, x, z) + 0.28, z);
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

const MARK_STYLE: Record<"look" | "build" | "warn", { icon: string; label: string }> = {
  look: { icon: "👀", label: "Schau mal" },
  build: { icon: "🏗️", label: "Hier bauen?" },
  warn: { icon: "⚠️", label: "Problem" },
};

/**
 * "Look here" markers players leave for each other.
 *
 * A pin that bobs, in the player's colour, with what they meant. Presence
 * only carries a mark while it is fresh, so they clear themselves.
 */
function MapMarks() {
  const players = useGame((s) => s.players);
  const hm = getHeightmap();
  const pins = useRef<THREE.Group>(null);
  const marked = players.filter((p) => p.mark);

  useFrame(({ clock }) => {
    if (!pins.current) return;
    const t = clock.elapsedTime;
    pins.current.children.forEach((child, i) => {
      child.position.y = (child.userData.baseY as number) + Math.abs(Math.sin(t * 3 + i)) * 0.9;
    });
  });

  if (marked.length === 0) return null;
  return (
    <group ref={pins}>
      {marked.map((p) => {
        const mark = p.mark!;
        const { x, z } = hexToWorld(mark.hex.q, mark.hex.r);
        const y = surfaceY(hm, x, z) + 1.2;
        const color = peerColor(p.id);
        const style = MARK_STYLE[mark.kind];
        return (
          <group key={p.id} position={[x, y, z]} userData={{ baseY: y }}>
            <mesh position={[0, 0.9, 0]}>
              <coneGeometry args={[0.55, 1.8, 12]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <Html center distanceFactor={110} position={[0, 4, 0]} zIndexRange={LABEL_Z}>
              <div
                style={{
                  background: "#fff",
                  color: "#16305C",
                  border: `2px solid ${color}`,
                  padding: "3px 9px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  boxShadow: "0 3px 10px rgba(11,26,48,.35)",
                  pointerEvents: "none",
                }}
              >
                {style.icon} {style.label} · {p.name}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
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
        const y = surfaceY(hm, x, z);
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
            <Html center distanceFactor={110} position={[0, 2.6, 0]} zIndexRange={LABEL_Z}>
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

/** Sky dome radius; the camera's far plane is set past it. */
const SKY_RADIUS = 900;

/**
 * A gradient sky with the sun's glow in it.
 *
 * The range had nothing to stand against: sky, haze and distant snow were all
 * the same tone, so the peaks dissolved rather than reading as peaks. A
 * horizon behind them is what gives the mountain its silhouette. Colours and
 * the glow are driven per frame from `atmosphereAt` by `Daylight`.
 */
function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    // Never fogged: the sky is the thing the fog fades everything else into.
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color("#3a6fb5") },
      horizon: { value: new THREE.Color("#c4d8ec") },
      haze: { value: new THREE.Color("#a4c0dc") },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color("#fff1dc") },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 haze;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y * 1.6 + 0.04, 0.0, 1.0);
        vec3 col = mix(horizon, zenith, pow(up, 0.7));
        // Below the skyline the dome shows only through gaps in the far
        // ranges; there it should be the fog, so the land fades into it.
        col = mix(col, haze, smoothstep(0.02, -0.08, d.y));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 6.0) * 0.22 + pow(s, 180.0) * 0.9) * (1.0 - up * 0.5);
        gl_FragColor = vec4(col, 1.0);
        // No tone mapping, on purpose: three applies fog after tone mapping,
        // so an untoned sky is what matches the fogged land at the horizon.
        #include <colorspace_fragment>
      }`,
  });
}

/** How far up the sun sits from whatever it is aimed at. */
const SUN_DISTANCE = 150;
/** Shadow map edge, desktop. The box below is sized against this. */
const SHADOW_MAP = 2048;
/** Peak sun intensity at noon on the desktop tier. */
const SUN_NOON = 2.4;

/**
 * The sun, sky, fill light and haze, driven by the time of day.
 *
 * Everything is set imperatively in one frame callback from scratch objects:
 * the clock changes every frame, and routing it through React would re-render
 * the lights sixty times a second. The server only sends the clock once a
 * second, so between snapshots it is advanced locally at the game's own rate
 * — a 90-second day moves the sun four degrees per snapshot, which jerked the
 * shadows when it was applied raw.
 *
 * The shadow box tracks the orbit target and scales with zoom, tight enough
 * for a crisp contact edge up close and wide enough to hold the range when
 * pulled back.
 */
function Daylight({ tier }: { tier: QualityTier }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useMemo(
    () => ({ geo: new THREE.SphereGeometry(SKY_RADIUS, 32, 16), mat: makeSkyMaterial() }),
    [],
  );
  useEffect(
    () => () => {
      sky.geo.dispose();
      sky.mat.dispose();
    },
    [sky],
  );
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target?: THREE.Vector3 } | null;
  const scratch = useMemo(
    () => ({
      at: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      fallback: new THREE.Vector3(-23, 10, -8.5),
      air: createAtmosphere(),
      clock: { raw: -1, at: 0 },
    }),
    [],
  );

  useFrame(() => {
    const { at, dir, fallback, air, clock } = scratch;
    // Local clock: hold the last snapshot's time and run it forward, capped
    // so a dropped connection does not spin the sun round.
    const raw = useGame.getState().timeOfDay;
    const nowMs = performance.now();
    if (raw !== clock.raw) {
      clock.raw = raw;
      clock.at = nowMs;
    }
    const ahead = Math.min(2.5, (nowMs - clock.at) / 1000) / ECONOMY.daySecondsReal;
    atmosphereAt(raw + ahead, air);

    const fog = scene.fog as THREE.Fog | null;
    if (fog) fog.color.setRGB(air.fog[0], air.fog[1], air.fog[2], THREE.SRGBColorSpace);
    const u = sky.mat.uniforms;
    (u.zenith!.value as THREE.Color).setRGB(air.zenith[0], air.zenith[1], air.zenith[2], THREE.SRGBColorSpace);
    (u.horizon!.value as THREE.Color).setRGB(air.horizon[0], air.horizon[1], air.horizon[2], THREE.SRGBColorSpace);
    (u.haze!.value as THREE.Color).setRGB(air.fog[0], air.fog[1], air.fog[2], THREE.SRGBColorSpace);
    (u.sunColor!.value as THREE.Color).setRGB(air.sunColor[0], air.sunColor[1], air.sunColor[2], THREE.SRGBColorSpace);
    (u.sunDir!.value as THREE.Vector3).set(air.sunDir[0], air.sunDir[1], air.sunDir[2]);

    const h = hemi.current;
    if (h) {
      h.color.setRGB(air.hemiSky[0], air.hemiSky[1], air.hemiSky[2], THREE.SRGBColorSpace);
      h.groundColor.setRGB(air.hemiGround[0], air.hemiGround[1], air.hemiGround[2], THREE.SRGBColorSpace);
      h.intensity = tier.hemisphere * 2.2 * air.hemiIntensity;
    }

    const l = light.current;
    if (!l) return;
    l.color.setRGB(air.sunColor[0], air.sunColor[1], air.sunColor[2], THREE.SRGBColorSpace);
    l.intensity = SUN_NOON * air.sunIntensity * tier.sunBoost;

    at.copy(controls?.target ?? fallback);
    const span = camera.position.distanceTo(at);
    const radius = THREE.MathUtils.clamp(span * 0.5, 22, 110);
    // Snap the centre to the shadow map's own texel grid. Without this the
    // whole map crawls with shimmer whenever the camera drifts.
    const texel = (radius * 2) / SHADOW_MAP;
    at.x = Math.round(at.x / texel) * texel;
    at.z = Math.round(at.z / texel) * texel;

    dir.set(air.sunDir[0], air.sunDir[1], air.sunDir[2]);
    l.position.copy(at).addScaledVector(dir, SUN_DISTANCE);
    // `target` is not in the scene graph, so three only reads its world
    // matrix — updating it by hand is enough and saves adding a node.
    l.target.position.copy(at);
    l.target.updateMatrixWorld();

    const cam = l.shadow.camera;
    if (Math.abs(cam.right - radius) > 0.25) {
      cam.left = -radius;
      cam.right = radius;
      cam.top = radius;
      cam.bottom = -radius;
      cam.updateProjectionMatrix();
    }
  });

  return (
    <>
      <mesh geometry={sky.geo} material={sky.mat} renderOrder={-1} frustumCulled={false} raycast={noRaycast} />
      {/*
        Cool sky from above, a bluish snow bounce from below: shaded snow is
        lit by the sky, so it goes blue rather than grey, and the warm sun
        against it is what gives the slopes their form.
      */}
      <hemisphereLight ref={hemi} args={["#9cc4f2", "#b8c8da", tier.hemisphere * 2.2]} />
      <ambientLight intensity={tier.ambient * 0.5} />
      <directionalLight
        ref={light}
        position={[48, 60, 18]}
        intensity={SUN_NOON * tier.sunBoost}
        color="#fff1dc"
        castShadow={tier.shadows}
        shadow-mapSize-width={SHADOW_MAP}
        shadow-mapSize-height={SHADOW_MAP}
        shadow-camera-near={SUN_DISTANCE * 0.25}
        shadow-camera-far={SUN_DISTANCE * 2.2}
        // normalBias offsets along the surface normal, which is what cures the
        // shadow acne a tight box brings on.
        shadow-normalBias={0.04}
        shadow-bias={-0.0003}
      />
      {/*
        Aerial perspective, not a fog bank: a long shallow ramp that lays far
        ridges behind near ones and fades the far ranges into the horizon.
        Its colour follows the sky through the day.
      */}
      <fog attach="fog" args={["#a4c0dc", tier.fogNear, tier.fogFar]} />
    </>
  );
}

function LightsAndSky() {
  const quality = useGame((s) => s.quality);
  return <Daylight tier={QUALITY[quality]} />;
}

/**
 * Keeps the camera over the world.
 *
 * The orbit target stays inside the map. The camera itself may stand a little
 * past the edge, because the far land now continues the ground to the
 * horizon: outside the square there is terrain under you, not the underside
 * of a floating tile. Not much further, though — the DEM raises a rim along
 * the map edge, and from well outside it that rim becomes a wall in the
 * foreground. Never below the ground it is over.
 *
 * Applied after `MapControls` has had its say, so damping and inertia still
 * feel free right up to the limit instead of fighting a hard stop.
 */
function keepCameraInWorld(camera: THREE.Camera, target: THREE.Vector3) {
  const hm = getHeightmap();
  const edge = (hm.world / 2) * 0.94;
  const outer = (hm.world / 2) * 1.14;

  target.x = THREE.MathUtils.clamp(target.x, -edge, edge);
  target.z = THREE.MathUtils.clamp(target.z, -edge, edge);
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -outer, outer);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -outer, outer);

  // Above the ground it is standing over (the map's edge height when outside
  // it, which is what the far land meets), with enough clearance that a ridge
  // between camera and target does not fill the frame.
  const floor = surfaceY(hm, camera.position.x, camera.position.z) + 6;
  if (camera.position.y < floor) camera.position.y = floor;
}

function Controls() {
  const quality = useGame((s) => s.quality);
  const home = QUALITY[quality].cameraTarget;
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
    camera.lookAt(home[0], home[1], home[2]);
    // Only on mount: the opening framing, not a leash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    keepCameraInWorld(camera, c.target);
  });
  return (
    <MapControls
      ref={ref as never}
      makeDefault
      enableDamping
      dampingFactor={raster ? 0.2 : 0.12}
      minDistance={raster ? 14 : 16}
      // Far enough back to take in the whole range; the map is 196 across.
      maxDistance={raster ? 64 : 230}
      maxPolarAngle={raster ? 0.58 : Math.PI / 2.12}
      minPolarAngle={raster ? 0.34 : stampMode ? 0.36 : 0.28}
      enableRotate={!raster && tool !== "pan"}
      screenSpacePanning
      target={home}
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

/**
 * Puts the renderer on `window.__ski` in dev.
 *
 * Render work cannot be judged from the source: draw calls, the shadow box, a
 * light's resolved intensity and the tone-mapping exposure are all runtime
 * values, and the alternative to reading them is guessing at a screenshot.
 * Dev-only, so nothing reaches the deployed bundle.
 */
function RenderProbe() {
  const state = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __ski?: unknown };
    // The store comes along so a render pass can be judged at a fixed hour and
    // camera instead of at whatever dusk the save happened to be paused at.
    w.__ski = { ...state, store: useGame };
    return () => {
      delete w.__ski;
    };
  }, [state]);
  return null;
}

/**
 * Pixel ratio that follows the frame rate.
 *
 * The tier sets a ceiling; this walks the actual ratio down a step when the
 * average frame over a window runs slower than the tier allows, and back up
 * when there is plenty of headroom. Fill rate is what a phone runs out of
 * first on a full-screen mountain, and pixel ratio is the cheapest lever on
 * it — 1.25 to 1.0 is a third fewer fragments. Hysteresis (step up only well
 * under budget, and only after several calm windows) keeps it from hunting.
 */
function AdaptiveResolution({ tier }: { tier: QualityTier }) {
  const setDpr = useThree((s) => s.setDpr);
  const gl = useThree((s) => s.gl);
  const acc = useRef({ sum: 0, frames: 0, calm: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    // Ignore hitches (tab switches, shader compiles): they are not load.
    if (dt > 0.25) return;
    a.sum += dt * 1000;
    a.frames += 1;
    if (a.frames < 90) return;
    const avg = a.sum / a.frames;
    a.sum = 0;
    a.frames = 0;
    const [lo, hi] = tier.dpr;
    const ceiling = Math.min(hi, typeof window === "undefined" ? hi : window.devicePixelRatio || 1);
    const now = gl.getPixelRatio();
    if (avg > tier.slowFrameMs && now > lo) {
      a.calm = 0;
      setDpr(Math.max(lo, Math.round((now - 0.25) * 4) / 4));
    } else if (avg < tier.slowFrameMs * 0.6 && now < ceiling) {
      a.calm += 1;
      if (a.calm >= 4) {
        a.calm = 0;
        setDpr(Math.min(ceiling, now + 0.25));
      }
    } else {
      a.calm = 0;
    }
  });
  return null;
}

export function SkiScene() {
  const quality = useGame((s) => s.quality);
  const weather = useGame((s) => s.weather.kind);
  const tier = QUALITY[quality];
  return (
    <Canvas
      camera={{
        // Oblique, from behind the village looking up-valley at the peaks:
        // the village in the lower third, the Matterhorn against the sky.
        position: tier.cameraAt,
        fov: tier.fov,
        near: 0.5,
        // Past the sky dome from anywhere the camera may stand.
        far: SKY_RADIUS + 260,
      }}
      dpr={tier.dpr}
      shadows={tier.shadows}
      gl={{ antialias: tier.antialias, powerPreference: "high-performance", alpha: false }}
      style={{ touchAction: "none", background: "#bcd2e6" }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor("#bcd2e6", 1);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // The ground carries its own shading now, so less exposure is needed
        // to keep the snow from blowing out to flat white.
        gl.toneMappingExposure = tier.exposure;
        gl.shadowMap.enabled = tier.shadows;
        // PCFSoft is gone in r18x and falls back to this anyway, with a warning.
        gl.shadowMap.type = THREE.PCFShadowMap;
        camera.lookAt(tier.cameraTarget[0], tier.cameraTarget[1], tier.cameraTarget[2]);
      }}
    >
      <RenderProbe />
      <AdaptiveResolution tier={tier} />
      <LightsAndSky />
      <Controls />
      <Loop />
      <Terrain />
      <Lake />
      <Forest quality={quality} />
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
      <MapMarks />
      <AlbumCapture />
      <PeakLabels />
      <Snowfall on={weather === "snow" || weather === "storm"} />
    </Canvas>
  );
}
