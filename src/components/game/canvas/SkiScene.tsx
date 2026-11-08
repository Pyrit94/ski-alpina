import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, MapControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  getHeightmap,
  metersToWorldY,
  scatterRocks,
  scatterTrees,
  surfaceY,
  type Heightmap,
} from "@/lib/game/alpine";
import { ECONOMY, isLift } from "@/lib/game/catalog";
import { HEX_SIZE, hexDistance, hexLine, hexToWorld, worldToHex } from "@/lib/game/hex";
import { FLOW } from "@ski/config";
import { neighbourOf, relaxLine } from "@ski/shared";
import { peerColor } from "@/lib/game/players";
import { mulberry32, seedFromString } from "@/lib/game/rng";
import { useGame } from "@/lib/game/store";
import type { ItemId, PlacedBuilding, PlacedLift, PlacedPiste } from "@/lib/game/types";
import { applyWeather, atmosphereAt, createAtmosphere, easeWeather, WEATHER_LOOK } from "./atmosphere";
import { BuildingInstances, type Placement } from "./baked-buildings";
import { BuildingModel } from "./models";
import { hasModel, loadModelLibrary, useModelLibrary } from "@/lib/game/model-library";
import { modelKeyFor } from "@/lib/game/model-keys";
import { SOLID } from "./bake";
import { useFilePart, withTreeSnow } from "./file-parts";
import { Groomers, Props } from "./decor";
import { AutoPreview } from "./AutoPreview";
import { VillagePreview } from "./VillagePreview";
import { VillageHouses } from "./village";
import { ribbonGeometry } from "./geometry";
import { makeTreeMaterial, SEASON_UNIFORMS } from "./snow-shaders";
import { isGreenSeason, snowCoverAt } from "./season-look";
import { useGreenSeason, useSeasonLook } from "./use-season";
import { STATION_CABLE_Y, cableGap, stationYaw } from "./station";
import { drapedRibbon, joinRun, makePisteMaterial, markerPoles, mergeRibbons, smoothPath, snowPlaza, type Pole, type RunLine } from "./piste-mesh";
import {
  buildFarLand,
  clumpTrees,
  groundBase,
  makeBoulderGeometry,
  makeConiferGeometry,
  paintFarLand,
  paintGround,
  type GroundLook,
} from "./landscape";
import { useTerrainMaterial } from "./terrain-material";
import { useTexturePack } from "./texture-pack";
import { AlbumCapture } from "./AlbumCapture";
import { QUALITY, type QualityTier } from "./quality";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useStableGame } from "./use-stable-game";
import { MapLabelProjector, MapLabels } from "./MapLabels";
import { useWorldBuildings, useWorldLifts, useWorldPistes } from "./use-world";
import { openingView } from "./view";
import { alongPath, cachedValleyRoad, pathLength } from "./valley-road";
import { CenterStamp, HexCursor, HexGhost, HexRaster, StampFlash } from "./HexBuildLayer";
import { PisteNameLabel } from "./PisteDraftLayer";
import { LinkHints } from "./LinkHints";
import { RIBBON_SCALE, draftColors, usePisteStroke } from "./piste-draft";
import { usePisteEditor } from "@/lib/game/piste-editor";
import { LAND_S, SETTLE_S, landing } from "@/lib/game/juice";
import { BuildBursts } from "./BuildBursts";

/**
 * The playable ground.
 *
 * Shape, normals and occlusion are built once per heightmap (landscape.ts);
 * what changes with the game — the season, overlay, piste heat — only
 * rewrites the colour buffer. Snapshots that change none of those touch
 * nothing.
 */
function Terrain() {
  const hm = getHeightmap();
  const layer = useGame((s) => s.layer);
  const pistes = useStableGame((s) => s.pistes);
  // Quantised in useSeasonLook: the line in 25 m steps, below what the eye
  // catches on a 130 m blend, so the clock does not repaint every second.
  const look = useSeasonLook();
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
    paintGround(base, layer, look, heat);
  }, [base, layer, look, heat]);

  const click = useGame((s) => s.clickHex);
  const hover = useGame((s) => s.hoverHex);
  const stampMode = useGame((s) => s.stampMode);
  const phase = useGame((s) => s.phase);
  const quality = useGame((s) => s.quality);
  const down = useRef<THREE.Vector2 | null>(null);
  const stroke = usePisteStroke();
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
          // Desktop piste drawing: press and drag down the slope.
          const { q, r } = worldToHex(e.point.x, e.point.z);
          if (!stamp && stroke.down(q, r, e.button)) e.stopPropagation();
        }}
        onPointerMove={(e) => {
          if (stamp) return;
          e.stopPropagation();
          const { q, r } = worldToHex(e.point.x, e.point.z);
          hover(q, r);
          stroke.move(q, r);
        }}
        onPointerUp={(e) => {
          if (stroke.up()) {
            down.current = null;
            return;
          }
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
      <FarLand look={look} />
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
function FarLand({ look }: { look: GroundLook }) {
  const hm = getHeightmap();
  const geo = useMemo(() => buildFarLand(hm), [hm]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  // Distant snow follows the season in coarse steps; nobody counts metres at
  // 300 units. Only the colours are rewritten, never the mesh.
  const coarse = Math.round(look.snowLineM / 100) * 100;
  const { autumn, straw } = look;
  useLayoutEffect(() => {
    paintFarLand(geo, { snowLineM: coarse, autumn, straw });
  }, [geo, coarse, autumn, straw]);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh geometry={geo} material={mat} raycast={noRaycast} />;
}

function noRaycast() {
  /* decoration: never a pick target */
}

/**
 * Keeps the shared season uniforms (snow-shaders.ts) current: the snow line
 * the trees and roofs hold to, the line the runs stay white above, and how
 * far the larches have turned. Writes numbers only; nothing is rebuilt.
 */
function SeasonDriver() {
  const look = useSeasonLook();
  const runLineM = useGame((s) => Math.round(s.stats.snowLineM / 25) * 25);
  useLayoutEffect(() => {
    SEASON_UNIFORMS.uSnowLineY.value = metersToWorldY(look.snowLineM);
    SEASON_UNIFORMS.uRunLineY.value = metersToWorldY(runLineM);
    SEASON_UNIFORMS.uAutumn.value = look.autumn;
    SEASON_UNIFORMS.uBare.value = look.straw;
  }, [look, runLineM]);
  return null;
}

/** Position, size and tint every tree of one kind. */
function placeTrees(inst: THREE.InstancedMesh | null, trees: { x: number; y: number; z: number; r: number; s: number }[], seed: string) {
  if (!inst) return;
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  const rng = mulberry32(seedFromString(seed));
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
}

/** Conifer stands (two kinds) and boulders: three instanced meshes for the whole map. */
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
      tree: makeConiferGeometry("spruce"),
      fir: makeConiferGeometry("fir"),
      boulder: makeBoulderGeometry(),
      rockMat: new THREE.MeshStandardMaterial({ color: "#a39484", roughness: 0.95, flatShading: true }),
    }),
    [],
  );
  useEffect(
    () => () => {
      parts.tree.dispose();
      parts.fir.dispose();
      parts.boulder.dispose();
      parts.rockMat.dispose();
    },
    [parts],
  );
  // Snow on the branches and the larches' colour follow the season through
  // shared uniforms (SeasonDriver), so the materials are built once.
  const treeMats = useMemo(() => ({ spruce: makeTreeMaterial(), larch: makeTreeMaterial(true) }), []);
  useEffect(
    () => () => {
      treeMats.spruce.dispose();
      treeMats.larch.dispose();
    },
    [treeMats],
  );
  // Runs and lift lines are cut through the forest, as on a real mountain:
  // no tree stands on a hex a run or a cable crosses.
  const pistes = useStableGame((s) => s.pistes);
  const lifts = useStableGame((s) => s.lifts);
  const cleared = useMemo(() => {
    const out = new Set<string>();
    for (const p of pistes) for (const h of p.hexes) out.add(`${h.q},${h.r}`);
    for (const l of lifts) for (const h of hexLine(l.a, l.b)) out.add(`${h.q},${h.r}`);
    return out;
  }, [pistes, lifts]);
  // Two kinds of conifer, every third stand a fir: one more draw call for a
  // forest that no longer looks stamped from a single tree.
  const kinds = useMemo(() => {
    const spruce: typeof trees = [];
    const fir: typeof trees = [];
    trees.forEach((t, i) => {
      const h = worldToHex(t.x, t.z);
      if (cleared.has(`${h.q},${h.r}`)) return;
      (Math.floor(i / Math.max(1, tier.treesPerClump)) % 3 === 2 ? fir : spruce).push(t);
    });
    return { spruce, fir };
  }, [trees, tier.treesPerClump, cleared]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const firRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  // Trees from files, when there are any: the spruce stands and the slimmer
  // ones (built-in fir, file larch). Same counts, same snow, same draw calls.
  const spruceFile = useFilePart("tree-spruce");
  const larchFile = useFilePart("tree-larch");
  const spruceGeo = spruceFile ? withTreeSnow(spruceFile) : parts.tree;
  const firGeo = larchFile ? withTreeSnow(larchFile) : parts.fir;

  useLayoutEffect(() => {
    placeTrees(meshRef.current, kinds.spruce, "tree-tint");
    placeTrees(firRef.current, kinds.fir, "fir-tint");
  }, [kinds, spruceGeo, firGeo]);

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
        key={`t${kinds.spruce.length}${spruceFile ? "f" : ""}`}
        ref={meshRef}
        // The material is a prop, not an argument: a new material must not
        // rebuild the mesh and drop every tree back to the origin.
        args={[spruceGeo, undefined, kinds.spruce.length]}
        material={treeMats.spruce}
        castShadow={tier.shadows}
        raycast={noRaycast}
      />
      <instancedMesh
        key={`f${kinds.fir.length}${larchFile ? "f" : ""}`}
        ref={firRef}
        args={[firGeo, undefined, kinds.fir.length]}
        material={treeMats.larch}
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

const LAKE_ICE = new THREE.Color("#b9d7e6");
const LAKE_WATER = new THREE.Color("#4f86a6");

/** A mountain lake: frozen and snowed over while the snow lies at its shore, open water once it melts out. */
function Lake() {
  const lake = getHeightmap().region.lake;
  const look = useSeasonLook();
  const frozen = lake ? snowCoverAt(lake.elev, look.snowLineM) : 1;
  const color = `#${LAKE_WATER.clone().lerp(LAKE_ICE, frozen).getHexString()}`;
  if (!lake) return null;
  const y = metersToWorldY(lake.elev) + 0.12;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lake.x, y, lake.z]} receiveShadow>
      <circleGeometry args={[lake.radius * 0.95, 40]} />
      <meshStandardMaterial color={color} roughness={0.22 - 0.12 * (1 - frozen)} metalness={0.18} />
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
/** Rough footprint of each model, in world units across. */
const FOOTPRINT: Partial<Record<ItemId, number>> = {
  "hotel-resort": 3,
  hotel5: 2.6,
  hotel3: 2.3,
  hotel1: 2,
  parking: 2.5,
  bus: 2.4,
  "gastro-hall": 2.7,
  spa: 2.1,
};

/**
 * Where a building stands on a slope. Set on its centre's ground, its
 * uphill side would be buried and its downhill side would hang in the air;
 * set on the highest point under its footprint, with a stone plinth down to
 * the lowest, it stands on a terrace cut into the hill, as buildings in the
 * Alps do. Lift stations stay where their cables expect them.
 */
function seatOf(hm: Heightmap, itemId: ItemId, x: number, z: number): { y: number; lo: number; width: number } {
  const centre = surfaceY(hm, x, z);
  if (isLift(itemId)) return { y: centre, lo: centre, width: 0 };
  const width = FOOTPRINT[itemId] ?? 2.1;
  const r = width * 0.5;
  let lo = centre;
  let hi = centre;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const g = surfaceY(hm, x + Math.cos(a) * r, z + Math.sin(a) * r);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  return { y: hi, lo, width };
}

/** Stone plinths under buildings on a slope, all in one instanced mesh. */
function Foundations({ buildings, yaws }: { buildings: PlacedBuilding[]; yaws: Map<string, number> }) {
  const hm = getHeightmap();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const plinths = useMemo(() => {
    const out: { x: number; z: number; lo: number; hi: number; width: number; yaw: number }[] = [];
    for (const b of buildings) {
      const { x, z } = hexToWorld(b.q, b.r);
      const seat = seatOf(hm, b.itemId, x, z);
      if (seat.width === 0 || seat.y - seat.lo < 0.06) continue;
      out.push({ x, z, lo: seat.lo, hi: seat.y, width: seat.width, yaw: yaws.get(b.id) ?? 0 });
    }
    return out;
  }, [buildings, hm, yaws]);
  const capacity = Math.max(8, Math.ceil(plinths.length / 8) * 8);
  useLayoutEffect(() => {
    const inst = mesh.current;
    if (!inst) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    plinths.forEach((p, i) => {
      // Down past the lowest ground, so no gap shows on the valley side.
      const bottom = p.lo - 0.4;
      q.setFromAxisAngle(up, p.yaw);
      m.compose(new THREE.Vector3(p.x, (p.hi + bottom) / 2, p.z), q, new THREE.Vector3(p.width * 0.92, p.hi - bottom, p.width * 0.92));
      inst.setMatrixAt(i, m);
    });
    inst.count = plinths.length;
    inst.instanceMatrix.needsUpdate = true;
    inst.boundingSphere = null;
    inst.computeBoundingSphere();
  }, [plinths, capacity]);
  if (plinths.length === 0) return null;
  return (
    <instancedMesh key={capacity} ref={mesh} args={[undefined, undefined, capacity]} castShadow receiveShadow raycast={noRaycast}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#9a958c" roughness={0.95} />
    </instancedMesh>
  );
}

function GroundContact({ buildings }: { buildings: PlacedBuilding[] }) {
  const hm = getHeightmap();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const texture = useMemo(() => contactTexture(), []);
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
const DROP_MS = (LAND_S + SETTLE_S) * 1000;
/** Longest a timer is set for; `readyAt` can be MAX_SAFE_INTEGER during a match's planning round. */
const MAX_WAIT_MS = 60_000;

/**
 * The decoration the village starts with: never selectable, always finished.
 * As hex offsets from the village, kept where the ground is fit for a house.
 */
const SEED_HUTS: Array<[number, number]> = [
  [-1, 3],
  [5, 3],
  [8, 2],
  [1, 4],
  [7, 4],
  [-3, 1],
  [2, -2],
];

function seedHuts(hm: Heightmap): Array<[number, number]> {
  const v = hm.region.villageHex;
  return SEED_HUTS.map(([dq, dr]) => [v.q + dq, v.r + dr] as [number, number])
    .filter(([q, r]) => {
      const { x, z } = hexToWorld(q, r);
      return Math.abs(x) < hm.world / 2 - 4 && Math.abs(z) < hm.world / 2 - 4 && hm.slope(x, z) < 0.32;
    })
    .slice(0, 5);
}

/**
 * Every building on the map.
 *
 * Finished ones are drawn as instances per kind (baked-buildings.tsx); those
 * still dropping in or under construction keep their own meshes, which is
 * what animates and goes translucent. A timer moves a building across when
 * it finishes, so nothing here depends on a snapshot arriving to notice.
 */
function Structures() {
  const buildings = useWorldBuildings();
  // Models from files arrive after the scene: bake again when they do.
  const modelVersion = useModelLibrary((s) => s.version);
  useEffect(() => {
    void loadModelLibrary();
  }, []);
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

  // Lift stations face along their line, open side toward the other end.
  const lifts = useWorldLifts();
  const yaws = useMemo(() => {
    const out = new Map<string, number>();
    for (const l of lifts) {
      const a = hexToWorld(l.a.q, l.a.r);
      const b = hexToWorld(l.b.q, l.b.r);
      out.set(l.stationA, stationYaw(a, b));
      out.set(l.stationB, stationYaw(b, a));
      if (l.stationMid) out.set(l.stationMid, stationYaw(a, b));
    }
    return out;
  }, [lifts]);
  // Mid stations may be drawn from their own model ("station-mid").
  const mids = useMemo(() => new Set(lifts.flatMap((l) => (l.stationMid ? [l.stationMid] : []))), [lifts]);
  const { live, kinds } = useMemo(() => {
    const live: PlacedBuilding[] = [];
    // One instanced batch per model: item and level, since a hotel wing or
    // a car park deck is a different shape, and mid stations apart.
    const kinds = new Map<string, { itemId: ItemId; level: number; mid: boolean; placements: Placement[] }>();
    const add = (itemId: ItemId, level: number, pl: Placement, mid = false) => {
      const k = `${itemId}:${level}${mid ? ":mid" : ""}`;
      const batch = kinds.get(k);
      if (batch) batch.placements.push(pl);
      else kinds.set(k, { itemId, level, mid, placements: [pl] });
    };
    seedHuts(hm).forEach(([q, r], i) => {
      const { x, z } = hexToWorld(q, r);
      add("hut", 1, { id: null, x, y: seatOf(hm, "hut", x, z).y, z, yaw: i * 0.7 });
    });
    for (const b of buildings) {
      if (b.readyAt > now || b.builtAt + DROP_MS > now) {
        live.push(b);
        continue;
      }
      const { x, z } = hexToWorld(b.q, b.r);
      add(b.itemId, b.level ?? 1, { id: b.id, x, y: seatOf(hm, b.itemId, x, z).y, z, yaw: yaws.get(b.id) ?? 0 }, mids.has(b.id));
    }
    return { live, kinds: [...kinds.entries()] };
  }, [buildings, now, hm, yaws, mids]);

  return (
    <group>
      <GroundContact buildings={buildings} />
      <Foundations buildings={buildings} yaws={yaws} />
      {kinds.map(([k, { itemId, level, mid, placements }]) => (
        <BuildingInstances
          key={`${k}|${lit}|${modelVersion}`}
          itemId={itemId}
          level={level}
          mid={mid}
          lit={lit}
          placements={placements}
          shadows={QUALITY[quality].shadows}
          onPick={selectEntity}
        />
      ))}
      {live.map((b) => (
        <PlacedStructure key={b.id} building={b} yaw={yaws.get(b.id) ?? 0} mid={mids.has(b.id)} />
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

function PlacedStructure({ building: b, yaw, mid }: { building: PlacedBuilding; yaw: number; mid: boolean }) {
  const selectEntity = useGame((s) => s.selectEntity);
  const lit = useLampsOn();
  const hm = getHeightmap();
  const group = useRef<THREE.Group>(null);
  const { x, z } = hexToWorld(b.q, b.r);
  const baseY = seatOf(hm, b.itemId, x, z).y;

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    [],
  );
  useFrame(() => {
    if (!group.current) return;
    const now = Date.now();
    const age = Math.max(0, (now - b.builtAt) / 1000);
    // Falls a little, lands with a squash and settles (juice.ts); the dust
    // ring is BuildBursts'.
    const land = landing(age, reduced);
    const span = Math.max(1, b.readyAt - b.builtAt);
    const construct = b.readyAt > now ? Math.min(1, (now - b.builtAt) / span) : 1;
    const s = 0.55 + 0.45 * Math.max(construct, 0.35);
    group.current.scale.set(s * land.sxz, s * land.sy, s * land.sxz);
    group.current.position.y = land.lift;
  });

  const constructing = b.readyAt > Date.now();
  return (
    <group
      position={[x, baseY, z]}
      rotation={[0, yaw, 0]}
      onClick={(e) => {
        e.stopPropagation();
        selectEntity(b.id);
      }}
    >
      <group ref={group}>
        <BuildingModel itemId={b.itemId} constructing={constructing} lit={lit} level={b.level} mid={mid} />
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
  const stationTop = STATION_CABLE_Y;
  // Towers between two points, planted on the ground beneath.
  const between = (p: THREE.Vector3, q: THREE.Vector3) => {
    const bay = Math.hypot(q.x - p.x, q.z - p.z);
    const count = Math.max(1, Math.round(bay / PYLON_SPACING) - 1);
    const out: THREE.Vector3[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const x = p.x + (q.x - p.x) * t;
      const z = p.z + (q.z - p.z) * t;
      out.push(new THREE.Vector3(x, surfaceY(hm, x, z), z));
    }
    return out;
  };
  const top = (v: THREE.Vector3) => new THREE.Vector3(v.x, v.y + stationTop, v.z);
  const mast = (t: THREE.Vector3) => new THREE.Vector3(t.x, t.y + PYLON_HEIGHT, t.z);
  let towers: THREE.Vector3[];
  let tops: THREE.Vector3[];
  if (l.mid) {
    // The rope runs through the middle station like through the others.
    const mw = hexToWorld(l.mid.q, l.mid.r);
    const m = new THREE.Vector3(mw.x, surfaceY(hm, mw.x, mw.z), mw.z);
    const lower = between(a, m);
    const upper = between(m, b);
    towers = [...lower, ...upper];
    tops = [top(a), ...lower.map(mast), top(m), ...upper.map(mast), top(b)];
  } else {
    towers = between(a, b);
    tops = [top(a), ...towers.map(mast), top(b)];
  }
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

type CarrierKind = "cabin" | "chair" | "tbar" | "train" | "tram";
const CARRIER_KINDS: readonly CarrierKind[] = ["cabin", "chair", "tbar", "train", "tram"];

/** A lift of each carrier kind, to look up its model chain (model-keys.ts). */
const KIND_LIFT: Record<CarrierKind, ItemId> = { cabin: "gondola", chair: "chair", tbar: "tbar", train: "cog", tram: "tram" };

/**
 * Tram cabins ride with the gondolas' unless there is a tram cabin model:
 * no extra draw calls for a kind that would look the same.
 */
function carrierKindOf(itemId: PlacedLift["itemId"], ownTram: boolean): CarrierKind {
  if (itemId === "tram" && ownTram) return "tram";
  if (itemId === "cog") return "train";
  if (itemId === "tbar") return "tbar";
  if (itemId === "chair") return "chair";
  return "cabin";
}

/** How the three kinds of carrier behave on the rope. */
const CARRIER_RIG: Record<CarrierKind, { hang: number; speed: number }> = {
  cabin: { hang: 0.55, speed: 0.06 },
  tram: { hang: 0.55, speed: 0.06 },
  chair: { hang: 0.72, speed: 0.075 },
  // A bar is dragged along the ground rather than hung from the rope.
  tbar: { hang: 1.9, speed: 0.075 },
  // A cog train rides on its rails, a little above the ground line.
  train: { hang: -0.05, speed: 0.035 },
};

/** A rail line on the ground from station to station, sampled densely so it follows every bump. */
function trackCurve(line: LiftLine, hm: Heightmap, offset: THREE.Vector3): THREE.CatmullRomCurve3 {
  const steps = Math.max(8, Math.round(line.span / 1.6));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = line.a.x + (line.b.x - line.a.x) * t + offset.x;
    const z = line.a.z + (line.b.z - line.a.z) * t + offset.z;
    pts.push(new THREE.Vector3(x, surfaceY(hm, x, z) + 0.14, z));
  }
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

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
  const lifts = useWorldLifts();
  const hm = getHeightmap();
  const selectEntity = useGame((s) => s.selectEntity);
  const budget = carrierBudget(lifts.length);
  const ownTram = useModelLibrary(() => hasModel("carrier-tram"));

  const rigs = useMemo<Rig[]>(
    () =>
      lifts.map((lift) => {
        const line = liftLine(lift, hm);
        const kind = carrierKindOf(lift.itemId, ownTram);
        if (kind === "train") {
          // Rails, not rope: two tracks on the ground, no towers.
          const up = trackCurve(line, hm, line.side.clone().multiplyScalar(0.36));
          const down = trackCurve(line, hm, line.side.clone().multiplyScalar(-0.36));
          const segments = Math.max(24, Math.round(line.span * 2));
          return {
            lift,
            line: { ...line, towers: [] },
            up,
            down,
            kind,
            riders: Math.min(2, budget),
            cables: [
              new THREE.TubeGeometry(up, segments, 0.07, 4, false),
              new THREE.TubeGeometry(down, segments, 0.07, 4, false),
            ],
          };
        }
        // Two lines side by side: one going up, one coming back. A single
        // cable is the tell that a lift was drawn rather than modelled.
        const gap = cableGap(lift.itemId);
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
    [lifts, hm, budget, ownTram],
  );

  // Every cable on the map in one mesh: two draw calls per lift added up
  // fast (and neighbours bring theirs). A tap finds its lift by which run of
  // triangles it hit.
  const cables = useMemo(() => {
    const parts = rigs.flatMap((r) => r.cables);
    if (parts.length === 0) return null;
    const ranges: { end: number; id: string }[] = [];
    let tris = 0;
    for (const rig of rigs) {
      for (const c of rig.cables) {
        tris += (c.index ? c.index.count : c.attributes.position!.count) / 3;
        ranges.push({ end: tris, id: rig.lift.id });
      }
    }
    const geo = mergeGeometries(parts, false);
    return geo ? { geo, ranges } : null;
  }, [rigs]);

  useEffect(
    () => () => {
      for (const rig of rigs) for (const c of rig.cables) c.dispose();
      cables?.geo.dispose();
    },
    [rigs, cables],
  );

  return (
    <group>
      {cables && (
        <mesh
          geometry={cables.geo}
          onClick={(e) => {
            e.stopPropagation();
            const face = e.faceIndex ?? -1;
            const hit = cables.ranges.find((r) => face < r.end);
            if (hit) selectEntity(hit.id);
          }}
        >
          <meshStandardMaterial color="#26323d" metalness={0.55} roughness={0.35} />
        </mesh>
      )}
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
  const filePylon = useFilePart("pylon");

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
  }, [towers, filePylon]);

  if (towers.length === 0) return null;
  if (filePylon) {
    return (
      <instancedMesh key="file" ref={mast} args={[filePylon, SOLID, towers.length]} castShadow frustumCulled={false} />
    );
  }
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
    const out: Record<CarrierKind, Rider[]> = { cabin: [], chair: [], tbar: [], train: [], tram: [] };
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
      {CARRIER_KINDS.map((kind) => (
        <CarrierInstances key={kind} kind={kind} riders={byKind[kind]} />
      ))}
    </group>
  );
}

function CarrierInstances({ kind, riders }: { kind: CarrierKind; riders: Rider[] }) {
  // The first model along the kind's chain: a tram cabin falls back to the gondola's.
  const fileKey = useModelLibrary(() => modelKeyFor("carrier", KIND_LIFT[kind], hasModel));
  const filePart = useFilePart(fileKey ?? "");
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
      {filePart ? (
        // A carrier from a file: one instanced mesh, hung from its top.
        <instancedMesh key="file" ref={body} args={[filePart, SOLID, n]} castShadow frustumCulled={false} />
      ) : (
        <>
          <instancedMesh ref={body} args={[parts.body, undefined, n]} castShadow frustumCulled={false}>
            <meshStandardMaterial {...parts.bodyMaterial} />
          </instancedMesh>
          <instancedMesh ref={detail} args={[parts.detail, undefined, n]} frustumCulled={false}>
            <meshStandardMaterial {...parts.detailMaterial} />
          </instancedMesh>
        </>
      )}
    </group>
  );
}

/** Geometry and colours for one kind of carrier, built once. */
function carrierParts(kind: CarrierKind) {
  const hang = CARRIER_RIG[kind].hang;
  if (kind === "train") {
    // A red railcar standing on its track: body, then a band of windows.
    const body = new THREE.BoxGeometry(0.52, 0.42, 1.25);
    body.translate(0, 0.25, 0);
    const windows = new THREE.BoxGeometry(0.54, 0.14, 1.05);
    windows.translate(0, 0.33, 0);
    return {
      rope: new THREE.BoxGeometry(0.001, 0.001, 0.001),
      body,
      detail: windows,
      bodyMaterial: { color: "#b3262d", metalness: 0.2, roughness: 0.45 },
      detailMaterial: { color: "#c9e7f7", emissive: "#c9e7f7", emissiveIntensity: 0.2 },
    };
  }
  const rope = offsetGeometry(new THREE.CylinderGeometry(0.025, 0.025, hang, 5), hang / 2);
  if (kind === "cabin" || kind === "tram") {
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

/** What a neighbour's run colours are mixed toward. */
const NEIGHBOUR_TINT = new THREE.Color("#c9d3dc");

const PISTE_COLOR: Record<string, string> = {
  blue: "#2b7de9",
  red: "#d64545",
  black: "#1c1c1c",
  park: "#e8c04a",
  road: "#5a6570",
};

/** Drawn width of a run, in world units, before the width setting. Visual only. */
const RUN_WIDTH = 2.3;
const PARK_WIDTH = 3;
const ROAD_WIDTH = 1.3;

/**
 * Runs as groomed snow lying on the mountain: see piste-mesh.ts. One draped,
 * smoothed strip per run, all merged into a single mesh, and the grade on
 * marker poles in one instanced mesh — two draw calls for every run built,
 * the same as the two flat strips they replace.
 */
function Pistes() {
  const pistes = useWorldPistes();
  const lifts = useWorldLifts();
  const draft = useGame((s) => s.pisteDraft);
  const layer = useGame((s) => s.layer);
  const quality = useGame((s) => s.quality);
  const tier = QUALITY[quality];
  const hm = getHeightmap();
  const hide = layer === "height";

  const material = useMemo(
    () => makePisteMaterial(tier.pisteRibs, layer === "pistes" ? 1 : 0.97, layer === "pistes"),
    [tier.pisteRibs, layer],
  );
  useEffect(() => () => material.dispose(), [material]);

  const built = useMemo(() => {
    const ground = (x: number, z: number) => surfaceY(hm, x, z);
    const strips: THREE.BufferGeometry[] = [];
    const poles: Pole[] = [];
    // Every run's line, relaxed off the hex zigzag into the curve a skier
    // would carve; roads keep their own line.
    const lines = new Map<string, RunLine>();
    for (const p of pistes) {
      if (p.hexes.length < 2) continue;
      const centres = p.hexes.map((h) => hexToWorld(h.q, h.r));
      lines.set(p.id, { hexes: p.hexes, points: p.difficulty === "road" ? centres : relaxLine(centres, 2) });
    }
    const runLines = pistes.filter((p) => p.difficulty !== "road" && lines.has(p.id)).map((p) => lines.get(p.id)!);
    // Lift stations a run may start or end beside, in world units.
    const stations = lifts.flatMap((l) => [l.a, l.b, ...(l.mid ? [l.mid] : [])]);
    const stationNear = (hex: { q: number; r: number }) => {
      let best: { q: number; r: number } | null = null;
      let bestD = Infinity;
      for (const st of stations) {
        const d = hexDistance(st, hex);
        if (d > 0 && d <= FLOW.linkRadius && d < bestD) {
          bestD = d;
          best = st;
        }
      }
      return best ? hexToWorld(best.q, best.r) : null;
    };
    const near = (a: { q: number; r: number }, b: { q: number; r: number }) => hexDistance(a, b) <= 1;
    for (const p of pistes) {
      const line = lines.get(p.id);
      if (!line) continue;
      const road = p.difficulty === "road";
      const width =
        p.difficulty === "park" ? PARK_WIDTH : road ? ROAD_WIDTH : RUN_WIDTH * RIBBON_SCALE[p.width ?? 2];
      const color = new THREE.Color(PISTE_COLOR[p.difficulty] ?? "#2b7de9");
      // A neighbour's runs in paler colours: theirs, not yours.
      if (neighbourOf(p.id)) color.lerp(NEIGHBOUR_TINT, 0.45);
      // Where it branches off or flows into another run, it meets it
      // tangentially and melts into it.
      const joined = road ? { points: line.points, fadeIn: 0, fadeOut: 0 } : joinRun(line, runLines, near);
      // A run that starts or ends beside a station goes all the way to it,
      // instead of stopping a hex or two short on the snow.
      if (!road) {
        const first = p.hexes[0]!;
        const last = p.hexes[p.hexes.length - 1]!;
        const startAt = joined.fadeIn === 0 ? stationNear(first) : null;
        const endAt = joined.fadeOut === 0 ? stationNear(last) : null;
        if (startAt) joined.points = [startAt, ...joined.points];
        if (endAt) joined.points = [...joined.points, endAt];
      }
      const path = smoothPath(joined.points, 4);
      // Roads ride above the snow, so a run meeting a road stops at its edge
      // instead of painting over it.
      strips.push(
        drapedRibbon(path, { width, color, road, lift: road ? 0.2 : 0.12, fadeIn: joined.fadeIn, fadeOut: joined.fadeOut }, ground),
      );
      if (!road) poles.push(...markerPoles(smoothPath(line.points, 4), width, color, ground, tier.poleSpacing));
    }
    // A groomed round at every lift station a run starts or ends at, so the
    // runs there merge into one patch of snow.
    for (const l of lifts) {
      for (const st of [l.a, l.b]) {
        const served = pistes.some(
          (p) =>
            p.difficulty !== "road" &&
            p.hexes.length > 1 &&
            (hexDistance(p.hexes[0]!, st) <= FLOW.linkRadius || hexDistance(p.hexes[p.hexes.length - 1]!, st) <= FLOW.linkRadius),
        );
        if (!served) continue;
        const w = hexToWorld(st.q, st.r);
        strips.push(snowPlaza(w.x, w.z, HEX_SIZE * 1.15, ground));
      }
    }
    // The road into the valley rides in the same mesh: asphalt, no extra draw call.
    const road = cachedValleyRoad(hm);
    if (road.length > 1) {
      strips.push(drapedRibbon(road, { width: ROAD_WIDTH * 1.15, color: new THREE.Color(PISTE_COLOR.road), road: true, lift: 0.22 }, ground));
    }
    return { geo: mergeRibbons(strips), poles: poles.slice(0, tier.poles) };
  }, [pistes, lifts, hm, tier.poleSpacing, tier.poles]);
  useEffect(() => () => built.geo?.dispose(), [built]);

  // The draft ribbon is as wide as the run will be and coloured per segment
  // by the grade the ground gives it.
  const draftWidth = usePisteEditor((s) => s.width);
  const draftItem = useGame((s) => s.buildItem);
  const draftGeo = useMemo(() => {
    if (draft.length < 2) return null;
    const scale = draftItem === "piste" ? RIBBON_SCALE[draftWidth] : 1;
    const g = ribbonGeometry(pistePoints({ hexes: draft }, hm), 1.2 * scale, 0.12);
    const colours = new Float32Array(draft.length * 6);
    draftColors(draft, draftItem).forEach((c, i) => {
      colours.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    return g;
  }, [draft, hm, draftWidth, draftItem]);

  useEffect(() => () => draftGeo?.dispose(), [draftGeo]);

  if (hide) return null;
  return (
    <group>
      {built.geo && <mesh geometry={built.geo} material={material} receiveShadow={tier.shadows} raycast={noRaycast} />}
      <MarkerPoles poles={built.poles} />
      {draftGeo && (
        <mesh geometry={draftGeo} raycast={noRaycast}>
          <meshStandardMaterial vertexColors transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

/** Every marker pole on the mountain in one instanced mesh, tinted by grade. */
function MarkerPoles({ poles }: { poles: Pole[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.03, 0.04, 0.7, 5);
    geo.translate(0, 0.35, 0);
    return { geo, mat: new THREE.MeshLambertMaterial() };
  }, []);
  useEffect(
    () => () => {
      parts.geo.dispose();
      parts.mat.dispose();
    },
    [parts],
  );
  const capacity = Math.max(1, poles.length);
  useLayoutEffect(() => {
    const inst = ref.current;
    if (!inst) return;
    poles.forEach((p, i) => {
      TMP_POLE.position.set(p.x, p.y, p.z);
      TMP_POLE.updateMatrix();
      inst.setMatrixAt(i, TMP_POLE.matrix);
      inst.setColorAt(i, p.color);
    });
    inst.count = poles.length;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
  }, [poles]);
  if (poles.length === 0) return null;
  return <instancedMesh key={capacity} ref={ref} args={[parts.geo, parts.mat, capacity]} raycast={noRaycast} />;
}
const TMP_POLE = new THREE.Object3D();

/** Hikers' jackets: the colours a summer trail is made of. */
const HIKER_COLOURS = ["#c23b32", "#2f6fed", "#e0a020", "#3a8a4a", "#7a3fa0"].map((c) => new THREE.Color(c));

/** In the green season a few hikers walk the runs, slowly and mostly uphill. */
function Skiers() {
  const green = useGreenSeason();
  return green ? <Hikers /> : <Skiing />;
}

function Hikers() {
  const pistes = useWorldPistes();
  const hm = getHeightmap();
  const paths = useMemo(
    () => pistes.filter((p) => p.difficulty !== "road" && p.hexes.length >= 2).map((p) => pistePoints(p, hm)),
    [pistes, hm],
  );
  const count = Math.min(14, paths.length * 2);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const inst = ref.current;
    if (!inst) return;
    for (let i = 0; i < count; i++) inst.setColorAt(i, HIKER_COLOURS[i % HIKER_COLOURS.length]!);
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [count]);
  useFrame(() => {
    const inst = ref.current;
    if (!inst || paths.length === 0) return;
    const t = performance.now() / 1000;
    for (let i = 0; i < count; i++) {
      const path = paths[i % paths.length]!;
      // A tenth of a skier's pace; two in three walk up, the rest come down.
      const up = i % 3 !== 2;
      const raw = (t * 0.008 + i * 0.29) % 1;
      const u = up ? 1 - raw : raw;
      const idx = u * (path.length - 1);
      const a = path[Math.floor(idx)]!;
      const b = path[Math.min(path.length - 1, Math.floor(idx) + 1)]!;
      const f = idx % 1;
      // Walking side by side with the trail, not on its centre line.
      const side = ((i % 4) - 1.5) * 0.18;
      dummy.position.set(a.x + (b.x - a.x) * f + side, a.y + (b.y - a.y) * f + 0.17, a.z + (b.z - a.z) * f);
      dummy.lookAt(up ? a : b);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  if (count === 0) return null;
  return (
    <instancedMesh key={count} ref={ref} args={[undefined, undefined, count]} raycast={noRaycast}>
      <capsuleGeometry args={[0.07, 0.2, 3, 6]} />
      <meshStandardMaterial color="#ffffff" />
    </instancedMesh>
  );
}

function Skiing() {
  const pistes = useWorldPistes();
  const hm = getHeightmap();
  const paths = useMemo(() => pistes.filter((p) => p.hexes.length >= 2).map((p) => pistePoints(p, hm)), [pistes, hm]);
  const count = Math.min(56, Math.max(8, paths.length * 6));
  const ref = useRef<THREE.InstancedMesh>(null);
  const boardRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: 80 }, (_, i) => i * 0.137), []);
  // Models from files: skiers, and every fifth one on a snowboard. Without
  // a snowboarder file they all ski; without any file, the capsules stay.
  const skierFile = useFilePart("skier");
  const boardFile = useFilePart("snowboarder");
  const boards = boardFile ? Math.floor(count / 5) : 0;
  const skiers = count - boards;
  // A model stands on the snow; the capsule hangs centred above it.
  const lift = skierFile ? 0 : 0.2;

  useFrame(() => {
    if (!ref.current || paths.length === 0) return;
    const t = performance.now() / 1000;
    let s = 0;
    let bd = 0;
    for (let i = 0; i < count; i++) {
      const path = paths[i % paths.length]!;
      const u = (t * 0.08 + seeds[i]!) % 1;
      const idx = u * (path.length - 1);
      const a = path[Math.floor(idx)]!;
      const b = path[Math.min(path.length - 1, Math.floor(idx) + 1)]!;
      const f = idx % 1;
      const board = boardRef.current && i % 5 === 4 && bd < boards;
      dummy.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + (board ? 0 : lift), a.z + (b.z - a.z) * f);
      dummy.lookAt(b);
      dummy.updateMatrix();
      if (board) boardRef.current!.setMatrixAt(bd++, dummy.matrix);
      else if (s < skiers) ref.current.setMatrixAt(s++, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (boardRef.current) boardRef.current.instanceMatrix.needsUpdate = true;
  });

  if (paths.length === 0) return null;
  return (
    <group>
      {skierFile ? (
        <instancedMesh key="file" ref={ref} args={[skierFile, SOLID, skiers]} raycast={noRaycast} />
      ) : (
        <instancedMesh ref={ref} args={[undefined, undefined, skiers]}>
          <capsuleGeometry args={[0.08, 0.22, 3, 6]} />
          <meshStandardMaterial color="#c23b32" />
        </instancedMesh>
      )}
      {boardFile && boards > 0 && (
        <instancedMesh key={`b${boards}`} ref={boardRef} args={[boardFile, SOLID, boards]} raycast={noRaycast} />
      )}
    </group>
  );
}

/**
 * Cars on the road into the valley: half driving in, half driving out, more
 * of them the more car parks and bus stations there are to fill.
 */
function Traffic() {
  const hm = getHeightmap();
  const parking = useGame((s) => s.buildings.filter((b) => b.itemId === "parking" || b.itemId === "bus" || b.itemId === "train").length);
  const n = Math.min(14, 4 + parking * 2);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const road = useMemo(() => cachedValleyRoad(hm), [hm]);
  const length = useMemo(() => pathLength(road), [road]);
  // Models from files: cars, and every fourth vehicle a coach when there is one.
  const carFile = useFilePart("car");
  const coachFile = useFilePart("coach");
  const coachRef = useRef<THREE.InstancedMesh>(null);
  const coaches = coachFile ? Math.floor(n / 4) : 0;
  const cars = n - coaches;
  useFrame(() => {
    if (!ref.current || length <= 0) return;
    const t = performance.now() / 1000;
    let c = 0;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const inbound = i % 2 === 0;
      const u = (t * (2.4 / length) + i / n) % 1;
      // Keep right: inbound and outbound cars a little to either side.
      const p = alongPath(road, (inbound ? u : 1 - u) * length);
      const side = inbound ? 0.22 : -0.22;
      const x = p.x + Math.cos(p.angle) * side;
      const z = p.z - Math.sin(p.angle) * side;
      const coach = coachRef.current && i % 4 === 3 && k < coaches;
      const model = coach || carFile;
      // The built-in box is centred and long along x; a model stands on the
      // road (0.2 above the ground) and faces +z, a quarter turn on.
      dummy.position.set(x, surfaceY(hm, x, z) + (model ? 0.2 : 0.26), z);
      dummy.rotation.set(0, p.angle + (inbound ? 0 : Math.PI) - Math.PI / 2 + (model ? Math.PI / 2 : 0), 0);
      dummy.updateMatrix();
      if (coach) coachRef.current!.setMatrixAt(k++, dummy.matrix);
      else if (c < cars) ref.current.setMatrixAt(c++, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (coachRef.current) coachRef.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      {carFile ? (
        <instancedMesh key={`car${cars}`} ref={ref} args={[carFile, SOLID, cars]} raycast={noRaycast} />
      ) : (
        <instancedMesh ref={ref} args={[undefined, undefined, cars]}>
          <boxGeometry args={[0.7, 0.32, 0.38]} />
          <meshStandardMaterial color="#1a73e8" />
        </instancedMesh>
      )}
      {coachFile && coaches > 0 && (
        <instancedMesh key={`coach${coaches}`} ref={coachRef} args={[coachFile, SOLID, coaches]} raycast={noRaycast} />
      )}
    </group>
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
      look: { ...WEATHER_LOOK.sun },
      lastMs: 0,
    }),
    [],
  );

  useFrame(() => {
    const { at, dir, fallback, air, clock, look } = scratch;
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
    // The weather drifts in over a few seconds rather than switching.
    const dt = scratch.lastMs ? Math.min(0.25, (nowMs - scratch.lastMs) / 1000) : 1;
    scratch.lastMs = nowMs;
    const kind = useGame.getState().weather.kind;
    easeWeather(look, WEATHER_LOOK[kind] ?? WEATHER_LOOK.sun, Math.min(1, dt * 0.6));
    applyWeather(air, look);

    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.setRGB(air.fog[0], air.fog[1], air.fog[2], THREE.SRGBColorSpace);
      fog.near = tier.fogNear * look.haze;
      fog.far = tier.fogFar * look.haze;
    }
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
  const home = openingView(getHeightmap(), QUALITY[quality]).target;
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
  // A glide to something just built or picked: the target eases over and the
  // camera comes along, closing in if it was far out.
  const glide = useMemo(() => ({ goal: new THREE.Vector3(), id: 0, active: false, step: new THREE.Vector3() }), []);
  // «Übersicht»: rise over the middle of the map until the whole area is in view.
  const overview = useMemo(() => ({ id: 0, active: false, target: new THREE.Vector3(), eye: new THREE.Vector3() }), []);

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
    // Like a map app: one finger or the left button pans, two fingers pinch
    // and turn, the right button turns. No mode to switch, and the view can
    // always be turned to line up a lift. Drawing a run takes the one-finger
    // drag itself (see piste-draft.ts) before the controls see it.
    if (c.mouseButtons) c.mouseButtons.LEFT = THREE.MOUSE.PAN;
    if (c.touches) {
      c.touches.ONE = THREE.TOUCH.PAN;
      c.touches.TWO = raster ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE;
    }
    const focus = useGame.getState().cameraFocus;
    if (focus && focus.id !== glide.id) {
      glide.id = focus.id;
      glide.goal.set(focus.x, surfaceY(getHeightmap(), focus.x, focus.z), focus.z);
      glide.active = true;
    }
    const ov = useGame.getState().overviewAt;
    if (ov && ov !== overview.id) {
      overview.id = ov;
      overview.active = true;
      glide.active = false;
      const hm = getHeightmap();
      overview.target.set(0, surfaceY(hm, 0, 0), 0);
      overview.eye.set(0, overview.target.y + 205, 82);
    }
    if (overview.active) {
      const k = 1 - Math.exp(-2.6 * d);
      c.target.lerp(overview.target, k);
      camera.position.lerp(overview.eye, k);
      if (camera.position.distanceTo(overview.eye) < 0.8) overview.active = false;
    }
    if (focus && glide.active) overview.active = false;
    if (glide.active) {
      const k = 1 - Math.exp(-3.2 * d);
      glide.step.copy(glide.goal).sub(c.target).multiplyScalar(k);
      c.target.add(glide.step);
      camera.position.add(glide.step);
      offset.copy(camera.position).sub(c.target);
      const far = offset.length();
      if (far > 70) camera.position.copy(c.target).add(offset.multiplyScalar(1 - (1 - 70 / far) * k));
      if (c.target.distanceTo(glide.goal) < 0.2) glide.active = false;
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
      enableRotate={!raster}
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
  // Levelled ground changes the heightmap: redraw everything that stands on it.
  useGame((s) => s.terrainVersion);
  const weather = useGame((s) => s.weather.kind);
  // A summer storm is a thunderstorm: no snow out of it.
  const green = useGame((s) => isGreenSeason(s.day));
  const tier = QUALITY[quality];
  // Computed once per map: the opening framing, not a leash.
  const view = useMemo(() => openingView(getHeightmap(), tier), [tier]);
  return (
    <>
      <Canvas
        camera={{
          // Oblique, from behind the village looking up-valley at the peaks:
          // the village in the lower third, the Matterhorn against the sky.
          position: view.at,
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
          camera.lookAt(view.target[0], view.target[1], view.target[2]);
        }}
      >
        <RenderProbe />
        <AdaptiveResolution tier={tier} />
        <LightsAndSky />
        <Controls />
        <Loop />
        <SeasonDriver />
        <Terrain />
        <Lake />
        <Forest quality={quality} />
        <VillageHouses />
        <Structures />
        <Lifts />
        <Pistes />
        <BuildBursts />
        <Skiers />
        <Traffic />
        {!green && <Groomers />}
        <Props />
        <HexRaster />
        <HexCursor />
        <HexGhost />
        <PisteNameLabel />
        <LinkHints />
        <AutoPreview />
        <VillagePreview />
        <CenterStamp />
        <StampFlash />
        <PeerFocus />
        <MapMarks />
        <AlbumCapture />
        <MapLabelProjector />
        <Snowfall on={!green && (weather === "snow" || weather === "storm")} />
      </Canvas>
      {/* The map's names, one DOM layer over the canvas, moved by MapLabelProjector. */}
      <MapLabels />
    </>
  );
}
