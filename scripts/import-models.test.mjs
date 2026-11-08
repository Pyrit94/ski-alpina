import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { PART_KEYS, importFolder, parseName, triangleBudget } from "./import-models.mjs";

/** A dense, colourless "building": a box made of many small triangles. */
async function writeDenseBox(path, n = 60) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = [];
  const nor = [];
  const quad = (a, b, c, d, normal) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(...v);
      nor.push(...normal);
    }
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = i / n, x1 = (i + 1) / n, z0 = j / n, z1 = (j + 1) / n;
      quad([x0, 1, z0], [x0, 1, z1], [x1, 1, z1], [x1, 1, z0], [0, 1, 0]); // roof
      quad([x0, z0, 0], [x1, z0, 0], [x1, z1, 0], [x0, z1, 0], [0, 0, -1]); // a wall
    }
  }
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(nor)).setBuffer(buffer))
    .setMaterial(doc.createMaterial().setBaseColorFactor([1, 1, 1, 1]));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  await new NodeIO().write(path, doc);
  return (pos.length / 9) | 0;
}

test("names map to items, levels and lift parts", () => {
  assert.deepEqual(parseName("hotel1"), { key: "hotel1", level: 1 });
  assert.deepEqual(parseName("hotel1-3"), { key: "hotel1", level: 3 });
  assert.deepEqual(parseName("carrier-chair"), { key: "carrier-chair", level: 1 });
});

test("slot names stay whole, even when they end in a number", () => {
  for (const n of [1, 2, 3, 4, 5, 6]) assert.deepEqual(parseName(`house-${n}`), { key: `house-${n}`, level: 1 });
  for (const key of ["station-mid", "station-chair", "station-cog", "carrier-tram", "church", "tree-spruce", "tree-larch",
    "skier", "snowboarder", "car", "coach", "groomer-vehicle", "bench", "parasol", "flag", "sign"]) {
    assert.ok(PART_KEYS.includes(key), key);
    assert.deepEqual(parseName(key), { key, level: 1 });
  }
  // A level of a slot still parses as a level.
  assert.deepEqual(parseName("station-mid-2"), { key: "station-mid", level: 2 });
  assert.deepEqual(parseName("hotel5-4"), { key: "hotel5", level: 4 });
});

test("the slot list matches the game's (src/lib/game/model-keys.ts)", async () => {
  const text = await readFile(new URL("../src/lib/game/model-keys.ts", import.meta.url), "utf8");
  const block = /PART_LABEL[^=]*= \{([\s\S]*?)\n\};/.exec(text)?.[1] ?? "";
  const keys = [...block.matchAll(/^\s*"?([a-z0-9-]+)"?:/gm)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), [...PART_KEYS].sort());
});

test("each kind has its triangle budget", () => {
  assert.equal(triangleBudget("tree-spruce"), 150);
  assert.equal(triangleBudget("skier"), 200);
  assert.equal(triangleBudget("sign"), 200);
  assert.equal(triangleBudget("house-4"), 1500);
  assert.equal(triangleBudget("station-tram"), 2500);
  assert.equal(triangleBudget("hotel1"), 3000);
});

test("a dense, colourless model is reduced, coloured and entered in the manifest", async () => {
  const src = await mkdtemp(join(tmpdir(), "models-in-"));
  const out = await mkdtemp(join(tmpdir(), "models-out-"));
  const tris = await writeDenseBox(join(src, "restaurant.glb"));
  await writeDenseBox(join(src, "restaurant-2.glb"), 10);
  const results = await importFolder(src, { outDir: out, targetTriangles: 1000, root: process.cwd() });
  const main = results.find((r) => r.level === 1);
  assert.ok(main.before >= tris);
  assert.ok(main.after <= 1000, `${main.after} triangles`);
  assert.ok(main.painted > 0);
  assert.ok(!main.warning);
  const manifest = JSON.parse(await readFile(join(out, "manifest.json"), "utf8"));
  assert.equal(manifest.restaurant.file, "restaurant.glb");
  assert.equal(manifest.restaurant.levels["2"], "restaurant-2.glb");
  assert.ok((await readdir(out)).includes("restaurant.glb"));
  // Colours were written as vertex colours.
  const doc = await new NodeIO().read(join(out, "restaurant.glb"));
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  assert.ok(prim.getAttribute("COLOR_0"));
});
