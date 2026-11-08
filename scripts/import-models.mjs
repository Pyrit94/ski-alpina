#!/usr/bin/env node
/**
 * Bring 3D models (e.g. from Hunyuan3D, Meshy, Tripo) into the game.
 *
 *   npm run modelle -- <ordner> [--dreiecke 2500] [--ziel public/models]
 *
 * Every .glb/.gltf in the folder is named after what it replaces:
 *   hotel1.glb      → the hotel ★
 *   hotel1-3.glb    → the hotel ★ at expansion level 3
 *   station.glb, station-chair.glb, station-mid.glb, pylon.glb, carrier-cabin.glb, …
 *   house-1.glb … house-6.glb, church.glb, tree-spruce.glb, skier.glb, car.glb, …
 *   (PART_KEYS below; public/models/README.md lists what each one is)
 *
 * For each model the tool
 *   1. merges and welds its meshes and drops what is unused,
 *   2. reduces it to about --dreiecke triangles (meshoptimizer), so the phone
 *      stays fluid,
 *   3. gives a model without any colour (a shape-only export, e.g. Hunyuan3D
 *      without texturing on a small graphics card) simple colours by zone:
 *      roof, walls and base,
 *   4. writes it to public/models and enters it in manifest.json.
 * The game itself centres, grounds and scales every model on load.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { dedup, flatten, join as joinMeshes, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

/**
 * Slots the game reads besides the catalogue's item ids. Mirrors PART_LABEL
 * in src/lib/game/model-keys.ts (a test keeps the two in step). These names
 * are always whole: `house-3` is the third house, not `house` at level 3.
 */
export const PART_KEYS = [
  "station",
  "station-mid",
  "station-tbar",
  "station-chair",
  "station-gondola",
  "station-tram",
  "station-funitel",
  "station-glacier",
  "station-cog",
  "pylon",
  "carrier-chair",
  "carrier-cabin",
  "carrier-tram",
  "carrier-tbar",
  "carrier-train",
  "house-1",
  "house-2",
  "house-3",
  "house-4",
  "house-5",
  "house-6",
  "church",
  "tree-spruce",
  "tree-larch",
  "skier",
  "snowboarder",
  "car",
  "coach",
  "groomer-vehicle",
  "bench",
  "parasol",
  "flag",
  "sign",
];

/** Most triangles a model of this kind keeps (README: «Dreiecke»). */
export function triangleBudget(key) {
  if (key.startsWith("station")) return 2500;
  if (key === "pylon") return 600;
  if (key.startsWith("carrier")) return 800;
  if (key.startsWith("house")) return 1500;
  if (key === "church") return 1500;
  if (key.startsWith("tree")) return 150;
  if (key === "skier" || key === "snowboarder") return 200;
  if (key === "car" || key === "coach") return 800;
  if (key === "groomer-vehicle") return 1000;
  if (["bench", "parasol", "flag", "sign"].includes(key)) return 200;
  return 3000;
}

/** Colours for shape-only models, by what they are: roof, walls, base. */
const ZONES = {
  default: { roof: [0.56, 0.23, 0.18], wall: [0.94, 0.9, 0.84], base: [0.6, 0.58, 0.55] },
  hotel: { roof: [0.35, 0.23, 0.16], wall: [0.95, 0.92, 0.86], base: [0.6, 0.58, 0.55] },
  parking: { roof: [0.42, 0.46, 0.5], wall: [0.79, 0.81, 0.83], base: [0.5, 0.53, 0.56] },
  station: { roof: [0.76, 0.23, 0.2], wall: [0.93, 0.93, 0.9], base: [0.55, 0.55, 0.53] },
  metal: { roof: [0.28, 0.33, 0.37], wall: [0.28, 0.33, 0.37], base: [0.28, 0.33, 0.37] },
  carrier: { roof: [0.2, 0.25, 0.3], wall: [0.18, 0.44, 0.93], base: [0.2, 0.25, 0.3] },
  tree: { roof: [0.24, 0.42, 0.26], wall: [0.16, 0.3, 0.2], base: [0.29, 0.2, 0.15] },
  vehicle: { roof: [0.2, 0.25, 0.3], wall: [0.76, 0.23, 0.2], base: [0.15, 0.15, 0.17] },
  person: { roof: [0.9, 0.8, 0.3], wall: [0.76, 0.23, 0.2], base: [0.2, 0.25, 0.4] },
};

function zonesFor(key) {
  if (key.startsWith("hotel")) return ZONES.hotel;
  if (key === "parking" || key === "bus") return ZONES.parking;
  if (key.startsWith("station")) return ZONES.station;
  if (key === "pylon") return ZONES.metal;
  if (key.startsWith("carrier")) return ZONES.carrier;
  if (key.startsWith("tree")) return ZONES.tree;
  if (["car", "coach", "groomer-vehicle"].includes(key)) return ZONES.vehicle;
  if (key === "skier" || key === "snowboarder") return ZONES.person;
  return ZONES.default;
}

/**
 * "hotel1-3" → { key: "hotel1", level: 3 }; slot names ("carrier-chair",
 * "house-3", "station-mid") stay whole, since a trailing 2–4 there is part of
 * the name, not a level.
 */
export function parseName(stem) {
  if (PART_KEYS.includes(stem)) return { key: stem, level: 1 };
  const m = /^(.+?)-([2-4])$/.exec(stem);
  return m ? { key: m[1], level: Number(m[2]) } : { key: stem, level: 1 };
}

async function knownItemIds(root) {
  try {
    const text = await readFile(join(root, "packages/config/src/ids.ts"), "utf8");
    const block = /ITEM_IDS = \[([\s\S]*?)\]/.exec(text)?.[1] ?? "";
    return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute("POSITION");
      n += Math.floor((idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3);
    }
  }
  return n;
}

/** A primitive with no texture, no vertex colours and a white (or no) base colour. */
function colourless(prim) {
  if (prim.getAttribute("COLOR_0")) return false;
  const mat = prim.getMaterial();
  if (!mat) return true;
  if (mat.getBaseColorTexture()) return false;
  const [r, g, b] = mat.getBaseColorFactor();
  return r > 0.92 && g > 0.92 && b > 0.92;
}

/** Roof on top, walls in between, a stone base at the bottom: by height and facing. */
function paintZones(doc, key) {
  const zones = zonesFor(key);
  let minY = Infinity;
  let maxY = -Infinity;
  const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
  for (const prim of prims) {
    const pos = prim.getAttribute("POSITION");
    if (!pos) continue;
    const el = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, el);
      minY = Math.min(minY, el[1]);
      maxY = Math.max(maxY, el[1]);
    }
  }
  const span = maxY - minY || 1;
  let painted = 0;
  for (const prim of prims) {
    if (!colourless(prim)) continue;
    const pos = prim.getAttribute("POSITION");
    const nor = prim.getAttribute("NORMAL");
    if (!pos) continue;
    const out = new Float32Array(pos.getCount() * 3);
    const p = [0, 0, 0];
    const n = [0, 1, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, p);
      if (nor) nor.getElement(i, n);
      const h = (p[1] - minY) / span;
      const c = h < 0.12 ? zones.base : n[1] > 0.45 && h > 0.45 ? zones.roof : zones.wall;
      out.set(c, i * 3);
    }
    const acc = doc.createAccessor().setType("VEC3").setArray(out);
    const buffer = doc.getRoot().listBuffers()[0];
    if (buffer) acc.setBuffer(buffer);
    prim.setAttribute("COLOR_0", acc);
    const mat = prim.getMaterial();
    if (mat) mat.setBaseColorFactor([1, 1, 1, 1]);
    painted++;
  }
  return painted;
}

/** Process one model file; returns a line for the report. */
export async function importModel(file, outDir, { targetTriangles = 2500 } = {}) {
  await MeshoptSimplifier.ready;
  const io = new NodeIO();
  const doc = await io.read(file);
  const stem = basename(file, extname(file));
  const { key, level } = parseName(stem);
  const before = triangles(doc);
  targetTriangles = Math.min(targetTriangles, triangleBudget(key));
  await doc.transform(dedup(), flatten(), joinMeshes(), weld(), prune());
  // Reduce in steps, allowing a little more error each time, until it fits.
  for (const error of [0.002, 0.01, 0.05]) {
    const now = triangles(doc);
    if (now <= targetTriangles) break;
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: targetTriangles / now, error }), prune());
  }
  const painted = paintZones(doc, key);
  const outName = `${stem}.glb`;
  await mkdir(outDir, { recursive: true });
  await io.write(join(outDir, outName), doc);
  return { key, level, file: outName, before, after: triangles(doc), painted };
}

/** Enter the processed models in manifest.json, keeping what is already there. */
export async function updateManifest(outDir, results) {
  const path = join(outDir, "manifest.json");
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(path, "utf8"));
  } catch {
    manifest = {};
  }
  for (const r of results) {
    const entry = manifest[r.key] ?? {};
    if (r.level === 1) entry.file = r.file;
    else entry.levels = { ...(entry.levels ?? {}), [String(r.level)]: r.file };
    // A level-only model still needs a base file for the game to load.
    if (!entry.file) entry.file = r.file;
    manifest[r.key] = entry;
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function importFolder(dir, { outDir = "public/models", targetTriangles = 2500, root = process.cwd() } = {}) {
  const known = new Set([...(await knownItemIds(root)), ...PART_KEYS]);
  const files = (await readdir(dir)).filter((f) => /\.(glb|gltf)$/i.test(f)).sort();
  const results = [];
  for (const f of files) {
    const r = await importModel(join(dir, f), outDir, { targetTriangles });
    if (known.size > PART_KEYS.length && !known.has(r.key)) r.warning = `unbekannter Name «${r.key}»`;
    results.push(r);
  }
  await updateManifest(outDir, results);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.log("Aufruf: npm run modelle -- <ordner> [--dreiecke 2500] [--ziel public/models]");
    process.exit(1);
  }
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const results = await importFolder(resolve(dir), {
    outDir: resolve(opt("ziel", "public/models")),
    targetTriangles: Number(opt("dreiecke", "2500")),
  });
  for (const r of results) {
    console.log(
      `${r.file.padEnd(24)} ${r.key}${r.level > 1 ? ` Stufe ${r.level}` : ""}: ${r.before} → ${r.after} Dreiecke` +
        `${r.painted ? `, ${r.painted} Teile eingefärbt` : ""}${r.warning ? `  ⚠ ${r.warning}` : ""}`,
    );
  }
  console.log(`${results.length} Modelle eingetragen.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
