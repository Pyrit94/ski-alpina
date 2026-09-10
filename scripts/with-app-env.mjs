#!/usr/bin/env node
/**
 * Run a command with `.grok/app-env.json` merged into its environment.
 *
 * `dev`, `build` and `preview` all route through this wrapper, so the dev
 * server, the built bundle and the preview server can never disagree about
 * `VITE_AUTH_ENABLED` — a divergence that only shows up as a built-output
 * mismatch long after the fact. Anything that starts Vite directly bypasses it.
 *
 * Only `VITE_`-prefixed keys are honored: the file is a build flag carrier, not
 * a secret store, and only `VITE_` vars reach the browser anyway. A real
 * `process.env` entry always wins, so an explicit override still works.
 *
 * That precedence also means the file governs this workspace only. A deployed
 * build runs with the provider's project env, where the deployer sets
 * `VITE_AUTH_ENABLED` itself (today unconditionally `"true"`), so the deployed
 * flag is the platform's, not this file's.
 *
 * Vite picks the values up because `loadEnv` prefix-matches entries already in
 * `process.env`, which is why the merge has to happen before Vite starts.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { dirname, join, win32 } from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ENV_REL_PATH = ".grok/app-env.json";

const VITE_PREFIX = "VITE_";

/** PATHEXT entries CreateProcess can exec directly, in lookup order. */
const WIN_EXEC_EXT = [".exe", ".com"];
/** PATHEXT entries only cmd.exe can run. */
const WIN_BATCH_EXT = [".cmd", ".bat"];

/**
 * Parse an app-env document, keeping only `VITE_`-prefixed string entries.
 * Anything unparseable is an empty environment — a workspace without the file
 * must behave exactly like today (auth on, no overrides).
 */
export function parseAppEnv(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const env = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!key.startsWith(VITE_PREFIX)) continue;
    if (typeof value !== "string") continue;
    env[key] = value;
  }
  return env;
}

/** The app env recorded under `root`, or `{}` when the file is absent. */
export function readAppEnv(root) {
  try {
    return parseAppEnv(readFileSync(join(root, APP_ENV_REL_PATH), "utf8"));
  } catch {
    return {};
  }
}

/** File values under the process environment: an explicit override wins. */
export function mergeAppEnv(appEnv, processEnv) {
  return { ...appEnv, ...processEnv };
}

/**
 * Translate a child's `exit` `(code, signal)` into this process's exit status.
 *
 * Do not re-raise the signal with `process.kill(process.pid, signal)`: under
 * qemu-user (amd64 image builds on an arm host) a self-directed signal is
 * routinely delivered as SIGSEGV to the wrong process, which takes down the
 * test worker and fails the image build. `128 + signo` is what a shell reports
 * for a signal-killed command, so a cancelled `vite build` is still a failure.
 */
export function exitStatusFromChild(code, signal) {
  if (signal) {
    const signo = osConstants.signals[signal];
    return 128 + (typeof signo === "number" ? signo : 1);
  }
  return code ?? 1;
}

/**
 * How to spawn `command` on this platform: `{ command, shell }` for `spawn`.
 *
 * On Windows `npm run` puts `node_modules/.bin` on PATH, and a package binary
 * there is a `.cmd` shim. CreateProcess cannot exec a batch file, so plain
 * `spawn("vite", …)` fails with ENOENT — only cmd.exe does the PATHEXT lookup.
 * Real executables must keep spawning without a shell: routing them through
 * cmd.exe re-parses their arguments, which mangles any `-e "…"` payload.
 *
 * `platform` and `exists` are injectable so the Windows branch is covered by
 * the Linux CI run too — otherwise the only machine that tests it is the one
 * that already reproduced the bug.
 */
export function resolveSpawn(
  command,
  env = process.env,
  { platform = process.platform, exists = existsSync } = {},
) {
  if (platform !== "win32") return { command, shell: false };
  // Past this point everything is Windows path semantics, which the ambient
  // `node:path` does not provide when this runs on Linux CI.
  if (WIN_BATCH_EXT.includes(win32.extname(command).toLowerCase())) {
    return { command: `"${command}"`, shell: true };
  }
  // An explicit path is the caller's business; only bare names hit PATH.
  if (win32.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return { command, shell: false };
  }
  const dirs = (env.PATH ?? env.Path ?? "").split(win32.delimiter).filter(Boolean);
  for (const dir of dirs) {
    // PATHEXT order: a real executable next to a shim of the same name wins.
    for (const ext of WIN_EXEC_EXT) {
      if (exists(win32.join(dir, command + ext))) return { command, shell: false };
    }
    for (const ext of WIN_BATCH_EXT) {
      const full = win32.join(dir, command + ext);
      if (exists(full)) return { command: `"${full}"`, shell: true };
    }
  }
  return { command, shell: false };
}

/**
 * Quote one argv entry for cmd.exe.
 *
 * Only reached on the batch-shim path, where node hands the whole command line
 * to `cmd /d /s /c` unquoted. Without this, `--mode development` survives but
 * anything carrying a space or a metacharacter would be re-split.
 */
export function quoteForShell(arg) {
  if (arg === "") return '""';
  return /[\s&|<>^()"]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/** The workspace root (this file lives in `<root>/scripts/`). */
export function projectRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

/**
 * Whether `moduleUrl` is the script node was asked to run.
 *
 * Both sides are resolved through symlinks: node realpaths `import.meta.url`
 * but leaves `process.argv[1]` as typed, so comparing them raw makes a CLI
 * launched through a symlinked path (`/tmp` on macOS) a silent no-op.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("usage: node scripts/with-app-env.mjs <command> [args…]");
    process.exit(2);
  }
  const env = mergeAppEnv(readAppEnv(projectRoot()), process.env);
  const run = resolveSpawn(command, env);
  // DEP0190: an argv array alongside `shell: true` is deprecated because node
  // concatenates it without escaping. On the shim path we do the quoting and
  // hand over one command line; everywhere else argv stays a real argv.
  const child = run.shell
    ? spawn([run.command, ...args.map(quoteForShell)].join(" "), {
        stdio: "inherit",
        env,
        shell: true,
      })
    : spawn(run.command, args, { stdio: "inherit", env });
  // The dev server is long-running and is stopped by signalling this wrapper.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (err) => {
    console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(exitStatusFromChild(code, signal));
  });
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
