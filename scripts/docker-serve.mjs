#!/usr/bin/env node
/**
 * Container entrypoint: the app on `$PORT`, the game socket beside it.
 *
 * Two processes because the socket cannot live inside the Vite config (see
 * `scripts/ws-server.mjs`). `preview.proxy` forwards `/ws` to the socket, so
 * from the browser's side there is one origin and the session cookie rides the
 * upgrade. If either process dies the container dies with it, which is what
 * lets the orchestrator restart a broken half.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Vite's own entry script, by path rather than by PATH lookup or resolution.
 *
 * The container's CMD is `node scripts/docker-serve.mjs`, so nothing put
 * `node_modules/.bin` on PATH the way `npm run` does — spawning a bare `vite`
 * died with ENOENT before serving a single request. `require.resolve` is no
 * help either: Vite's `exports` map does not expose `bin/vite.js`.
 */
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
if (!existsSync(viteBin)) {
  console.error(`[serve] vite not found at ${viteBin} — were dependencies installed?`);
  process.exit(1);
}

const port = process.env.PORT || "8080";
const wsPort = process.env.WS_PORT || "8788";
process.env.DOCKER_PREVIEW = "1";
process.env.PORT = port;
process.env.WS_PORT = wsPort;

const children = [];
let shuttingDown = false;

/** Take the whole container down when any half stops. */
function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}

function start(label, args) {
  const child = spawn("node", args, { stdio: "inherit" });
  children.push(child);
  child.on("error", (err) => {
    console.error(`[serve] ${label} could not start:`, err.message);
    stopAll(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[serve] ${label} exited (${signal ?? `code ${code}`})`);
    stopAll(code ?? 1);
  });
  return child;
}

start("game socket", ["--experimental-strip-types", "scripts/ws-server.mjs"]);
start("app", [
  "scripts/with-app-env.mjs",
  process.execPath,
  viteBin,
  "preview",
  "--host",
  "0.0.0.0",
  "--port",
  port,
]);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopAll(0));
}
