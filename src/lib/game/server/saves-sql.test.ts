import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { emptyResort } from "../../../../packages/shared/src/engine/state.ts";
import { SqlSaveStore, summarize } from "../../../../packages/shared/src/runtime/saves.ts";

const migration = (name: string) => readFileSync(new URL(`../../../../migrations/${name}`, import.meta.url), "utf8");

test("save points round-trip through Postgres, after the migration", async () => {
  const db = new PGlite();
  await db.exec(migration("0002_ski_builder.sql"));
  // An "Eigenes Gebiet" from before: becomes an own game.
  await db.query("insert into resorts (id, name, snapshot) values ('resort-abc123', 'Alt', '{}'::jsonb), ('zermatt', 'Alpina', '{}'::jsonb)");
  await db.exec(migration("0003_saves.sql"));
  const kinds = await db.query<{ id: string; kind: string }>("select id, kind from resorts order by id");
  assert.deepEqual(kinds.rows, [
    { id: "resort-abc123", kind: "own" },
    { id: "zermatt", kind: "shared" },
  ]);

  const store = new SqlSaveStore(async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[]);
  const snapshot = { ...emptyResort("zermatt"), coins: 1234 };
  const at = Date.UTC(2026, 10, 7, 20, 30);
  await store.insert({
    id: "sv_1",
    gameId: "zermatt",
    name: "Samstagabend",
    createdAt: at,
    createdBy: "u1",
    createdByName: "Michael",
    summary: summarize(snapshot),
    snapshot,
  });
  await store.insert({ ...(await store.get("sv_1"))!, id: "sv_2", name: "Später", createdAt: at + 60_000 });

  const list = await store.list(["zermatt", "other"]);
  assert.deepEqual(list.map((s) => s.name), ["Später", "Samstagabend"], "newest first");
  assert.equal(list[1]!.createdAt, at);
  assert.equal(list[1]!.summary.coins, 1234);

  const got = await store.get("sv_1");
  assert.equal(got?.snapshot.coins, 1234);
  assert.equal(got?.createdByName, "Michael");

  await store.remove("sv_1");
  assert.deepEqual((await store.list(["zermatt"])).map((s) => s.id), ["sv_2"]);
  assert.deepEqual(await store.list([]), []);
  await db.close();
});
