import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createNoise2D } from "simplex-noise";
import { metersToWorldY, surfaceY, type Heightmap, type ScatterPoint } from "@/lib/game/alpine";
import { worldToHex } from "@/lib/game/hex";
import { mulberry32, seedFromString } from "@/lib/game/rng";
import type { MapLayer } from "@/lib/game/types";
import { bakeOcclusion, groundAlbedo, type Rgb } from "./terrain-shading";

/**
 * The ground, the land beyond it, and what grows on it.
 *
 * Split from the scene so the expensive parts can be built once: the ground's
 * shape and occlusion depend only on the DEM, and only its colour depends on
 * game state (snow line, overlay). A snow-line change now rewrites one colour
 * buffer instead of rebuilding the whole mesh and recomputing its normals.
 */

/** Metres per world unit of height, from `metersToWorldY`. */
const WORLD_Y_PER_M = 0.0215;
const BASE_M = 1560;

interface GroundBase {
  geometry: THREE.BufferGeometry;
  /** Per-vertex inputs for recolouring, so a recolour samples nothing. */
  elevM: Float32Array;
  slope: Float32Array;
  village: Float32Array;
  water: Uint8Array;
  x: Float32Array;
  z: Float32Array;
}

const groundCache = new WeakMap<Heightmap, GroundBase>();

/**
 * The ground mesh, minus its colour. Built once per heightmap and shared.
 *
 * Vertices sit exactly on the DEM grid (the plane has n-1 segments over the
 * same extent), so the occlusion bake can work on the grid directly.
 */
export function groundBase(hm: Heightmap): GroundBase {
  const hit = groundCache.get(hm);
  if (hit) return hit;
  const geo = new THREE.PlaneGeometry(hm.world, hm.world, hm.n - 1, hm.n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position!;
  const count = pos.count;
  const elevM = new Float32Array(count);
  const slope = new Float32Array(count);
  const village = new Float32Array(count);
  const water = new Uint8Array(count);
  const xs = new Float32Array(count);
  const zs = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, surfaceY(hm, x, z));
    xs[i] = x;
    zs[i] = z;
    elevM[i] = hm.sample(x, z);
    slope[i] = hm.slope(x, z);
    village[i] = Math.hypot(x - hm.region.village.x, z - hm.region.village.z);
    water[i] = hm.isWater(x, z) ? 1 : 0;
  }
  geo.computeVertexNormals();

  // PlaneGeometry rows run from -z to +z after the rotation, matching the DEM
  // grid's row order, so the bake lines up index for index.
  const metresPerCell = (hm.world / (hm.n - 1)) * 92;
  const ao = bakeOcclusion(hm.elev, hm.n, metresPerCell);
  geo.setAttribute("skiAO", new THREE.BufferAttribute(ao.length === count ? ao : new Float32Array(count).fill(1), 1));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));

  const base = { geometry: geo, elevM, slope, village, water, x: xs, z: zs };
  groundCache.set(hm, base);
  return base;
}

const scratch: Rgb = [0, 0, 0];
const tmp = new THREE.Color();

/**
 * Write the ground colour for the current layer into the shared geometry.
 *
 * `heat` maps `"q,r"` hex keys to 0..1 piste density and is only read on the
 * heat layer.
 */
export function paintGround(
  base: GroundBase,
  layer: MapLayer,
  snowLineM: number,
  heat: Map<string, number> | null,
) {
  const attr = base.geometry.attributes.color as THREE.BufferAttribute;
  const out = attr.array as Float32Array;
  const n = base.elevM.length;
  for (let i = 0; i < n; i++) {
    const m = base.elevM[i]!;
    if (layer === "height") {
      const t = Math.min(1, Math.max(0, (m - 1580) / 2800));
      tmp.setHSL(0.58 - t * 0.45, 0.45, 0.35 + t * 0.45);
      out[i * 3] = tmp.r;
      out[i * 3 + 1] = tmp.g;
      out[i * 3 + 2] = tmp.b;
      continue;
    }
    if (layer === "heat" && heat) {
      const { q, r } = worldToHex(base.x[i]!, base.z[i]!);
      const h = heat.get(`${q},${r}`) ?? 0;
      tmp.setRGB(0.2 + h, 0.35 - h * 0.2, 0.85 - h * 0.6);
      out[i * 3] = tmp.r;
      out[i * 3 + 1] = tmp.g;
      out[i * 3 + 2] = tmp.b;
      continue;
    }
    groundAlbedo(m, base.slope[i]!, snowLineM, base.village[i]!, base.water[i] === 1, scratch);
    out[i * 3] = scratch[0];
    out[i * 3 + 1] = scratch[1];
    out[i * 3 + 2] = scratch[2];
  }
  attr.needsUpdate = true;
}

/**
 * The land beyond the map, out to the horizon.
 *
 * The playable square used to end in a rock wall over empty sky, which is
 * what made the world read as a tile floating in space. This continues the
 * ground outward from the map's own edge heights and lifts it into a ring of
 * procedural ranges, so the horizon is mountains and fog does the rest.
 *
 * Inside the square it drops well below the playable ground and is never
 * seen; its edge vertices sit exactly on the map's perimeter at the map's
 * height, so the seam is continuous. One mesh, one draw call, no raycasting.
 */
export function buildFarLand(hm: Heightmap, snowLineM: number, reach = 470): THREE.BufferGeometry {
  const half = hm.world / 2;
  const axis: number[] = [];
  // Fine just outside the seam, coarser toward the horizon.
  const outside: number[] = [];
  let d = 0;
  let step = 3;
  while (d < reach - half) {
    d += step;
    outside.push(half + d);
    step = Math.min(16, step * 1.12);
  }
  for (let i = outside.length - 1; i >= 0; i--) axis.push(-outside[i]!);
  // Inside, at four DEM cells: the rows along the seam must follow the map's
  // edge closely, or a long cell interpolates straight across the rim and
  // draws a taut line over the ground. Cells wholly inside are never indexed.
  const cell = (hm.world / (hm.n - 1)) * 4;
  const inner = Math.round(hm.world / cell);
  for (let i = 0; i <= inner; i++) axis.push(-half + (hm.world * i) / inner);
  for (const o of outside) axis.push(o);

  const noise = createNoise2D(mulberry32(seedFromString("far-ranges")));
  const ridged = (x: number, z: number) => {
    let sum = 0;
    let amp = 1;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < 4; i++) {
      const v = 1 - Math.abs(noise(x * f, z * f));
      sum += v * v * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  };
  // A real map knows what lies around it: the same mountains, coarser, from
  // the region's far grid — so the ranges on the horizon are the real ones and
  // the seam is the same ground on both sides. The classic valley invents
  // ranges instead.
  const real = hm.region.far;
  const sampleFar = real
    ? (x: number, z: number) => {
        const u = (x / real.world + 0.5) * (real.n - 1);
        const v = (z / real.world + 0.5) * (real.n - 1);
        const x0 = Math.max(0, Math.min(real.n - 2, Math.floor(u)));
        const z0 = Math.max(0, Math.min(real.n - 2, Math.floor(v)));
        const tx = Math.min(1, Math.max(0, u - x0));
        const tz = Math.min(1, Math.max(0, v - z0));
        const e = (ix: number, iz: number) => real.elev[iz * real.n + ix]!;
        const m =
          e(x0, z0) * (1 - tx) * (1 - tz) + e(x0 + 1, z0) * tx * (1 - tz) + e(x0, z0 + 1) * (1 - tx) * tz + e(x0 + 1, z0 + 1) * tx * tz;
        return metersToWorldY(m);
      }
    : null;
  const far = (x: number, z: number, out: number) => {
    if (sampleFar) return sampleFar(x, z);
    // Ranges grow with distance, so the nearest land meets the rim gently and
    // the skyline is carried by the far ring.
    const grow = Math.min(1, out / 230);
    const r = ridged(x * 0.0105, z * 0.0105);
    return 6 + r * (26 + grow * 92) + grow * 14;
  };

  const n = axis.length;
  const positions = new Float32Array(n * n * 3);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = axis[ix]!;
      const z = axis[iz]!;
      const out = Math.max(Math.abs(x), Math.abs(z)) - half;
      let y: number;
      if (out < -0.01) {
        y = -40;
      } else {
        const cx = THREE.MathUtils.clamp(x, -half, half);
        const cz = THREE.MathUtils.clamp(z, -half, half);
        const rim = surfaceY(hm, cx, cz);
        // Real ground matches at the seam already; only smooth the step
        // between the fine play grid and the coarse far grid.
        const k = THREE.MathUtils.smoothstep(out, 0, real ? 12 : 46);
        y = rim + (far(x, z, out) - rim) * k;
        // Just below the seam so the map's own edge wins any depth tie, and
        // deep enough that the rim between two seam vertices never dips
        // under the straight line this mesh draws across it.
        if (out < 0.01) y -= 0.35;
      }
      const i = (iz * n + ix) * 3;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
    }
  }
  const index: number[] = [];
  for (let iz = 0; iz < n - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const e = c + 1;
      // Skip cells wholly inside the square: never visible, and they would
      // otherwise catch shadow-map texels under the resort.
      const xa = axis[ix]!;
      const xb = axis[ix + 1]!;
      const za = axis[iz]!;
      const zb = axis[iz + 1]!;
      if (xa >= -half && xb <= half && za >= -half && zb <= half) continue;
      index.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();

  const colors = new Float32Array(n * n * 3);
  const ao = new Float32Array(n * n);
  const normals = geo.attributes.normal!;
  for (let i = 0; i < n * n; i++) {
    const y = positions[i * 3 + 1]!;
    const ny = Math.max(0.05, normals.getY(i));
    // World-space tangent back to a real one: vertical is ~2x exaggerated.
    const slope = Math.sqrt(1 - ny * ny) / ny / 1.98;
    groundAlbedo(y / WORLD_Y_PER_M + BASE_M, slope, snowLineM, 999, false, scratch);
    colors[i * 3] = scratch[0];
    colors[i * 3 + 1] = scratch[1];
    colors[i * 3 + 2] = scratch[2];
    ao[i] = 1;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("skiAO", new THREE.BufferAttribute(ao, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A conifer: three stacked tiers and a stub of trunk, coloured per vertex —
 * dark at the skirts where the branches shade each other, lighter at the tips
 * where they catch the sky. Built once and instanced, so the whole forest is
 * one draw call however many trees it has.
 */
export function makeConiferGeometry(variant: "spruce" | "fir" = "spruce"): THREE.BufferGeometry {
  // A spruce is broad with three heavy tiers; a fir (Arve, Lärche in winter
  // aside) is slimmer and taller with more, tighter tiers.
  const tiers =
    variant === "spruce"
      ? [
          { r: 0.6, h: 0.95, y: 0.25 },
          { r: 0.46, h: 0.8, y: 0.68 },
          { r: 0.3, h: 0.66, y: 1.06 },
        ]
      : [
          { r: 0.42, h: 0.75, y: 0.22 },
          { r: 0.36, h: 0.66, y: 0.6 },
          { r: 0.27, h: 0.58, y: 0.95 },
          { r: 0.17, h: 0.5, y: 1.27 },
        ];
  const deep = new THREE.Color(variant === "spruce" ? "#1c3a27" : "#17301f");
  const tip = new THREE.Color(variant === "spruce" ? "#4f7d4c" : "#3f6b45");
  const bark = new THREE.Color("#4a3426");
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.06, 0.08, 0.32, 5, 1, true).toNonIndexed();
  trunk.translate(0, 0.16, 0);
  paint(trunk, () => bark);
  coverWith(trunk, () => 0);
  parts.push(trunk);
  const top = tiers[tiers.length - 1]!.y + tiers[tiers.length - 1]!.h;
  for (const t of tiers) {
    const cone = new THREE.ConeGeometry(t.r, t.h, 6, 1, true).toNonIndexed();
    cone.translate(0, t.y + t.h / 2, 0);
    const c = new THREE.Color();
    paint(cone, (y) => c.copy(deep).lerp(tip, Math.pow(Math.min(1, Math.max(0, (y - t.y) / t.h)), 1.4) * (0.55 + (0.45 * (t.y + t.h)) / top)));
    // Snow lies in patches on the upper branches of each tier and leaves the
    // skirt, where needles hang down, dark — every other facet, so a tree
    // reads as dark green with white on top rather than as an iced cone.
    coverWith(cone, (x, y, z) => {
      const along = Math.min(1, Math.max(0, (y - t.y) / t.h));
      const sector = Math.floor(((Math.atan2(z, x) / (Math.PI * 2)) + 1) * 6) % 2;
      return (0.25 + 0.55 * sector) * Math.min(1, along * 2.2);
    });
    parts.push(cone);
  }
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  return merged;
}

/** How much snow each vertex of a tree can carry, 0..1, as `treeSnow`. */
function coverWith(geo: THREE.BufferGeometry, at: (x: number, y: number, z: number) => number) {
  const pos = geo.attributes.position!;
  const snow = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) snow[i] = at(pos.getX(i), pos.getY(i), pos.getZ(i));
  geo.setAttribute("treeSnow", new THREE.BufferAttribute(snow, 1));
}

function paint(geo: THREE.BufferGeometry, at: (y: number) => THREE.Color) {
  const pos = geo.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = at(pos.getY(i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** A faceted boulder, deterministic so every client sees the same rocks. */
export function makeBoulderGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.55, 0);
  const pos = geo.attributes.position!;
  const rng = mulberry32(seedFromString("boulder"));
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    // Shared corners must move together or the faces split open.
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) {
      k = 0.78 + rng() * 0.4;
      seen.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.72, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Trees in stands rather than as evenly sprinkled singles.
 *
 * Forest on a mountain grows in clumps with clearings between, and a single
 * cone per point read as a scatter of black dots from the play camera. Each
 * scatter point now seeds a small stand of differently sized trees.
 */
export function clumpTrees(hm: Heightmap, seeds: ScatterPoint[], perClump: number): ScatterPoint[] {
  const rng = mulberry32(seedFromString("tree-clumps"));
  const out: ScatterPoint[] = [];
  for (const p of seeds) {
    for (let j = 0; j < perClump; j++) {
      const a = p.r + j * 2.39996;
      const d = j === 0 ? 0 : 0.55 + rng() * 0.75;
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (hm.isWater(x, z)) continue;
      out.push({
        x,
        y: surfaceY(hm, x, z) - 0.04,
        z,
        s: p.s * (j === 0 ? 1 : 0.62 + rng() * 0.3),
        r: rng() * Math.PI * 2,
      });
    }
  }
  return out;
}
