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
  // Give the socket its moment to write the last save before the container
  // goes. It exits on its own once that is done.
  const deadline = setTimeout(() => process.exit(code), 8000);
  Promise.all(children.map((c) => (c.exitCode !== null || c.signalCode !== null ? null : new Promise((r) => c.once("exit", r))))).then(() => {
    clearTimeout(deadline);
    process.exit(code);
  });
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

/**
 * Apply `migrations/*.sql` before anything opens the database.
 *
 * `npm run build` migrates too, but an image build has no database to reach:
 * Coolify builds before the compose stack's Postgres is up and without the
 * runtime variables. Without this the socket's `resorts` table never existed
 * and every save failed quietly every few seconds. Retried, because on a cold
 * start the database container is usually still initialising.
 */
async function migrate() {
  if (!process.env.DATABASE_URL?.trim()) return;
  const attempts = Number(process.env.MIGRATE_ATTEMPTS || 30);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const code = await new Promise((resolve) => {
      const child = spawn("node", ["scripts/migrate.mjs"], { stdio: "inherit" });
      child.on("error", () => resolve(1));
      child.on("exit", (c) => resolve(c ?? 1));
    });
    if (code === 0) return;
    if (attempt < attempts) {
      console.warn(`[serve] migration attempt ${attempt}/${attempts} failed, retrying in 2 s`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error("[serve] database never became ready — giving up");
  process.exit(1);
}

await migrate();

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
