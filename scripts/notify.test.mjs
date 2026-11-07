import assert from "node:assert/strict";
import { test } from "node:test";
import { createNotifier, offlinePlayers, parseNtfyUrl } from "./notify.mjs";

function room({ online = [true, false], phase = "plan", history = [] } = {}) {
  const players = new Map(
    online.map((on, i) => [`p${i}`, { id: `p${i}`, userId: `u${i}`, name: `P${i}`, online: on }]),
  );
  return {
    players,
    state: {
      roomId: "zermatt",
      resortName: "Alpina",
      match: { mode: "match", phase, round: 3, startedAt: 1, score: 1234, history },
    },
  };
}

function recorder() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  };
  return { calls, fetchImpl };
}

test("the topic URL is split into server and topic", () => {
  assert.deepEqual(parseNtfyUrl("https://ntfy.sh/ski-geheim"), { server: "https://ntfy.sh", topic: "ski-geheim" });
  assert.equal(parseNtfyUrl("https://ntfy.sh/"), null);
  assert.equal(parseNtfyUrl("nonsense"), null);
  assert.equal(parseNtfyUrl(undefined), null);
});

test("without NTFY_URL nothing is sent", async () => {
  const { calls, fetchImpl } = recorder();
  const n = createNotifier({ url: "", fetchImpl });
  assert.equal(n.enabled, false);
  assert.equal(await n.readyWaiting(room(), "Michael"), false);
  assert.equal(calls.length, 0);
});

test("a ready player pings the one who is away, once per round", async () => {
  const { calls, fetchImpl } = recorder();
  const n = createNotifier({ url: "https://ntfy.sh/topic", publicUrl: "https://ski.rasselbande.work", fetchImpl });
  assert.equal(await n.readyWaiting(room(), "Michael"), true);
  assert.equal(await n.readyWaiting(room(), "Michael"), false, "the same round does not ping twice");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://ntfy.sh");
  assert.equal(calls[0].body.topic, "topic");
  assert.match(calls[0].body.message, /Michael hat Runde 3 beendet/);
  assert.equal(calls[0].body.click, "https://ski.rasselbande.work");
});

test("nobody away, nobody pinged", async () => {
  const { calls, fetchImpl } = recorder();
  const n = createNotifier({ url: "https://ntfy.sh/topic", fetchImpl });
  assert.equal(await n.readyWaiting(room({ online: [true, true] }), "Michael"), false);
  assert.equal(calls.length, 0);
  assert.equal(offlinePlayers(room({ online: [true, true] })).length, 0);
});

test("a played round reports guests and money to whoever missed it", async () => {
  const { calls, fetchImpl } = recorder();
  const n = createNotifier({ url: "https://ntfy.sh/topic", fetchImpl });
  const r = room({ history: [{ round: 2, season: 1, guests: 1500, net: -2500, medal: "silber" }] });
  assert.equal(await n.roundPlayed(r), true);
  assert.match(calls[0].body.title, /Runde 2 gespielt/);
  assert.match(calls[0].body.message, /1.500 Gäste, −2.500 CHF\. Saison 1: Silber!/);
});

test("chat pushes are throttled", async () => {
  const { calls, fetchImpl } = recorder();
  let t = 0;
  const n = createNotifier({ url: "https://ntfy.sh/topic", fetchImpl, now: () => t });
  await n.chat(room(), { actorName: "Michael", text: "Schau mal!" });
  t = 60_000;
  await n.chat(room(), { actorName: "Michael", text: "Hallo?" });
  t = 200_000;
  await n.chat(room(), { actorName: "Michael", text: "Jetzt" });
  assert.equal(calls.length, 2);
});
