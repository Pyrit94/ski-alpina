#!/usr/bin/env node
/**
 * DEM pipeline: bake Terrain-RGB + dem.bin for the Zermatt window.
 * Gameplay uses the same generateDem() as runtime (Copernicus GLO-30 control points).
 * Drop a GeoTIFF in tools/terrain/cache/source.tif later to replace the raster.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const demUrl = pathToFileURL(join(root, "packages/shared/src/terrain/dem.ts")).href;

const { generateDem, encodeTerrainRgb } = await import(demUrl);
const dem = generateDem();
const outDir = join(root, "public/terrain");
mkdirSync(join(outDir, "0/0"), { recursive: true });
writeFileSync(join(outDir, "dem.bin"), Buffer.from(dem.elev.buffer));
writeFileSync(join(outDir, "0/0/0.rgb"), Buffer.from(encodeTerrainRgb(dem)));
writeFileSync(
  join(outDir, "meta.json"),
  JSON.stringify(
    {
      n: dem.n,
      world: dem.world,
      source: "Copernicus DEM GLO-30 (modified control-point raster)",
      attribution: "Enthaelt modifizierte Copernicus-Daten (DEM GLO-30), © European Union / ESA",
    },
    null,
    2,
  ),
);
console.info("wrote", outDir, dem.n, "x", dem.n);
