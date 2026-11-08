import assert from "node:assert/strict";
import { test } from "node:test";
import { headersFor } from "./serve-headers.mjs";

test("hashed build files are cached for a year, the page never", () => {
  assert.match(headersFor("/assets/index-abc123.js", {})["cache-control"], /immutable/);
  assert.equal(headersFor("/", {})["cache-control"], undefined);
  assert.equal(headersFor("/regions/davos.png", {})["cache-control"], "public, max-age=86400");
  assert.equal(headersFor("/models/manifest.json", {})["cache-control"], "public, max-age=3600");
});

test("every response is hardened; framing is refused only on a self-hosted deployment", () => {
  const local = headersFor("/", {});
  assert.equal(local["x-content-type-options"], "nosniff");
  assert.equal(local["content-security-policy"], undefined);
  const hosted = headersFor("/", { DOCKER_PREVIEW: "1", BETTER_AUTH_URL: "https://ski.example.test" });
  assert.equal(hosted["content-security-policy"], "frame-ancestors 'self'");
  assert.equal(hosted["x-frame-options"], "SAMEORIGIN");
});
