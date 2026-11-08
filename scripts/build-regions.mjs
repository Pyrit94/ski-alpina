#!/usr/bin/env node
/**
 * Bake the real ground of every region into the repository.
 *
 *   node --experimental-strip-types scripts/build-regions.mjs [regionId …]
 *
 * Downloads elevation tiles from the AWS Terrain Tiles open dataset
 * ("terrarium" PNGs, Copernicus/SRTM-derived, s3.amazonaws.com/elevation-tiles-prod),
 * resamples them onto the game grid and writes, per region:
 *
 * - packages/shared/src/terrain/regions/<id>.ts — the play window (160×160, real
 *   metres as Int16) and the far land around it (for the horizon), base64;
 * - public/regions/<id>.png — a small shaded-relief preview for the picker;
 *
 * and once public/regions/alpen.png, the overview map the picker draws its
 * markers on. Run it again only to add or change a region: the output is
 * committed, so neither the game nor the server needs the network.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";
import { ALPS_MAP, REGION_FAR_KM, REGIONS } from "../packages/config/src/regions.ts";
import { TERRAIN } from "../packages/config/src/terrain.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_TS = join(ROOT, "packages/shared/src/terrain/regions");
const OUT_IMG = join(ROOT, "public/regions");
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const NEAR_N = TERRAIN.resolution;
const NEAR_WORLD = TERRAIN.worldSize;
const MPU = TERRAIN.metresPerWorldUnit;
const FAR_N = 128;
const FAR_WORLD = Math.round((REGION_FAR_KM * 1000) / MPU);
const NEAR_ZOOM = 12;
const FAR_ZOOM = 9;

// ---------------------------------------------------------------- PNG in/out

/** Decode an 8-bit, non-interlaced RGB(A) PNG. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let channels = 3;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported PNG");
      channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
      if (!channels) throw new Error(`PNG colour type ${colorType} unsupported`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, channels, data: out };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
/** Encode RGB pixels as a PNG. */
function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ tiles & sampling

const tileCache = new Map();
async function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!tileCache.has(key)) {
    tileCache.set(
      key,
      (async () => {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const res = await fetch(TILE_URL(z, x, y));
            if (!res.ok) throw new Error(`${res.status} for ${key}`);
            const png = decodePng(Buffer.from(await res.arrayBuffer()));
            const elev = new Float32Array(png.width * png.height);
            for (let i = 0; i < elev.length; i++) {
              const r = png.data[i * png.channels];
              const g = png.data[i * png.channels + 1];
              const b = png.data[i * png.channels + 2];
              elev[i] = r * 256 + g + b / 256 - 32768;
            }
            return { size: png.width, elev };
          } catch (err) {
            if (attempt === 3) throw err;
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
        }
      })(),
    );
  }
  return tileCache.get(key);
}

/** Web-Mercator tile coordinates (fractional) of a lat/lon at zoom z. */
function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

async function elevationAt(lat, lon, z) {
  const { x, y } = tileXY(lat, lon, z);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const t = await tile(z, tx, ty);
  const px = (x - tx) * t.size - 0.5;
  const py = (y - ty) * t.size - 0.5;
  const x0 = Math.max(0, Math.min(t.size - 2, Math.floor(px)));
  const y0 = Math.max(0, Math.min(t.size - 2, Math.floor(py)));
  const fx = Math.min(1, Math.max(0, px - x0));
  const fy = Math.min(1, Math.max(0, py - y0));
  const e = (ix, iy) => t.elev[iy * t.size + ix];
  return (
    e(x0, y0) * (1 - fx) * (1 - fy) +
    e(x0 + 1, y0) * fx * (1 - fy) +
    e(x0, y0 + 1) * (1 - fx) * fy +
    e(x0 + 1, y0 + 1) * fx * fy
  );
}

/**
 * Lat/lon of a world point: +x east, +z south (so the default camera, which
 * looks toward −z, looks north with east on its right — not mirrored).
 */
function latLon(center, x, z) {
  const east = x * MPU;
  const north = -z * MPU;
  return {
    lat: center.lat + north / 110574,
    lon: center.lon + east / (111320 * Math.cos((center.lat * Math.PI) / 180)),
  };
}

async function grid(center, n, world, zoom) {
  const out = new Int16Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = (ix / (n - 1) - 0.5) * world;
      const z = (iz / (n - 1) - 0.5) * world;
      const { lat, lon } = latLon(center, x, z);
      out[iz * n + ix] = Math.round(await elevationAt(lat, lon, zoom));
    }
  }
  return out;
}

// ------------------------------------------------------------- shaded relief

function relief(elev, n, size, opts = {}) {
  const rgb = new Uint8Array(size * size * 3);
  const at = (u, v) => {
    const x = Math.max(0, Math.min(n - 1, u));
    const y = Math.max(0, Math.min(n - 1, v));
    return elev[Math.round(y) * n + Math.round(x)];
  };
  const cell = opts.cellMetres ?? 100;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = (px / (size - 1)) * (n - 1);
      const v = (py / (size - 1)) * (n - 1);
      const h = at(u, v);
      const dx = (at(u + 1, v) - at(u - 1, v)) / (2 * cell);
      const dy = (at(u, v + 1) - at(u, v - 1)) / (2 * cell);
      // Light from the north-west, the cartographer's convention.
      const nx = -dx;
      const ny = -dy;
      const len = Math.hypot(nx, ny, 1);
      const shade = Math.max(0, (nx * -0.6 + ny * -0.6 + 1 * 0.55) / len / 1.0);
      const snow = h > 2300 ? Math.min(1, (h - 2300) / 500) : 0;
      const low = Math.min(1, Math.max(0, (h - 400) / 1600));
      const base = [
        (1 - snow) * (120 + low * 60) + snow * 236,
        (1 - snow) * (150 + low * 40) + snow * 242,
        (1 - snow) * (110 + low * 50) + snow * 250,
      ];
      const k = 0.55 + shade * 0.75;
      const i = (py * size + px) * 3;
      rgb[i] = Math.min(255, base[0] * k);
      rgb[i + 1] = Math.min(255, base[1] * k);
      rgb[i + 2] = Math.min(255, base[2] * k);
    }
  }
  return rgb;
}

// ----------------------------------------------------------------------- main

const b64 = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");

async function buildRegion(region) {
  const t0 = Date.now();
  const near = await grid(region.center, NEAR_N, NEAR_WORLD, NEAR_ZOOM);
  const far = await grid(region.center, FAR_N, FAR_WORLD, FAR_ZOOM);
  const ts = `// Generated by scripts/build-regions.mjs — do not edit.
// Elevation: AWS Terrain Tiles (Copernicus DEM / SRTM), real metres as little-endian Int16.
export const near = { n: ${NEAR_N}, world: ${NEAR_WORLD}, b64: "${b64(near)}" };
export const far = { n: ${FAR_N}, world: ${FAR_WORLD}, b64: "${b64(far)}" };
`;
  await writeFile(join(OUT_TS, `${region.id}.ts`), ts);
  const size = 160;
  await writeFile(join(OUT_IMG, `${region.id}.png`), encodePng(size, size, relief(near, NEAR_N, size, { cellMetres: MPU * (NEAR_WORLD / (NEAR_N - 1)) })));
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of near) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  console.log(`[regions] ${region.id}: ${lo}–${hi} m, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

/** The overview: the Alps from Chamonix to the Arlberg, for the picker's markers. */
const ALPS = ALPS_MAP;
async function buildOverview() {
  const w = 640;
  const h = Math.round((w * (ALPS.north - ALPS.south) * 1.45) / (ALPS.east - ALPS.west));
  const n = 320;
  const elev = new Int16Array(n * n);
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const lon = ALPS.west + (ix / (n - 1)) * (ALPS.east - ALPS.west);
      const lat = ALPS.north - (iy / (n - 1)) * (ALPS.north - ALPS.south);
      elev[iy * n + ix] = Math.round(await elevationAt(lat, lon, 8));
    }
  }
  // Square relief, then squeezed to the map's aspect by sampling.
  const sq = relief(elev, n, Math.max(w, h), { cellMetres: ((ALPS.east - ALPS.west) * 76000) / n });
  const side = Math.max(w, h);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.round((x / (w - 1)) * (side - 1));
      const sy = Math.round((y / (h - 1)) * (side - 1));
      for (let c = 0; c < 3; c++) rgb[(y * w + x) * 3 + c] = sq[(sy * side + sx) * 3 + c];
    }
  }
  await writeFile(join(OUT_IMG, "alpen.png"), encodePng(w, h, rgb));
  console.log(`[regions] overview ${w}×${h}`);
}

await mkdir(OUT_TS, { recursive: true });
await mkdir(OUT_IMG, { recursive: true });
const only = new Set(process.argv.slice(2));
for (const region of REGIONS) {
  if (only.size && !only.has(region.id)) continue;
  await buildRegion(region);
}
if (!only.size || only.has("overview")) await buildOverview();
