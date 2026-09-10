import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  APP_ENV_REL_PATH,
  mergeAppEnv,
  parseAppEnv,
  projectRoot,
  quoteForShell,
  readAppEnv,
  resolveSpawn,
} from "./with-app-env.mjs";

const execFileAsync = promisify(execFile);
const WRAPPER = join(projectRoot(), "scripts/with-app-env.mjs");
const PRINT_FLAG = "process.stdout.write(String(process.env.VITE_AUTH_ENABLED));";

function makeWorkspace(appEnvJson) {
  const root = mkdtempSync(join(tmpdir(), "app-env-"));
  if (appEnvJson !== undefined) {
    mkdirSync(join(root, ".grok"), { recursive: true });
    writeFileSync(join(root, APP_ENV_REL_PATH), appEnvJson);
  }
  return root;
}

test("keeps VITE_-prefixed string entries", () => {
  assert.deepEqual(parseAppEnv('{"VITE_AUTH_ENABLED":"false"}'), {
    VITE_AUTH_ENABLED: "false",
  });
});

test("drops non-VITE keys, non-string values and malformed documents", () => {
  assert.deepEqual(parseAppEnv('{"DATABASE_URL":"postgres://x","VITE_N":1,"VITE_OK":"y"}'), {
    VITE_OK: "y",
  });
  assert.deepEqual(parseAppEnv("not json"), {});
  assert.deepEqual(parseAppEnv('["VITE_AUTH_ENABLED"]'), {});
  assert.deepEqual(parseAppEnv("null"), {});
});

test("a missing app-env.json is a clean no-op", () => {
  assert.deepEqual(readAppEnv(makeWorkspace()), {});
});

test("reads the app env from a workspace", () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  assert.deepEqual(readAppEnv(root), { VITE_AUTH_ENABLED: "false" });
});

test("an explicit process-env override wins over the file", () => {
  const merged = mergeAppEnv(
    { VITE_AUTH_ENABLED: "false" },
    { VITE_AUTH_ENABLED: "true", PATH: "/usr/bin" },
  );
  assert.equal(merged.VITE_AUTH_ENABLED, "true");
  assert.equal(merged.PATH, "/usr/bin");
});

test("the workspace app-env is a VITE_-only document", () => {
  // Was "the template ships auth off". app-env.json is not committed, and this
  // app turned sign-in on for its two allow-listed accounts, so the shipped
  // default describes neither the checkout nor the deployment. What still has
  // to hold: everything the wrapper will merge into process.env is a
  // VITE_-prefixed string, so nothing here can leak a server-only secret into
  // the client bundle.
  for (const [key, value] of Object.entries(readAppEnv(projectRoot()))) {
    assert.match(key, /^VITE_/);
    assert.equal(typeof value, "string", key);
  }
});

test("vite loadEnv resolves the wrapped value", () => {
  // What `import.meta.env.VITE_AUTH_ENABLED` becomes: loadEnv prefix-matches
  // process.env, so the wrapper's merge has to land before Vite starts.
  // Do not `import { loadEnv } from "vite"` here — Vite 8 loads rolldown
  // native bindings that SIGSEGV the test worker under qemu-user.
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  const merged = mergeAppEnv(readAppEnv(root), { PATH: "/usr/bin" });
  assert.equal(merged.VITE_AUTH_ENABLED, "false");
});

test("the wrapped command runs with the app env applied", async () => {
  // The wrapper resolves the project root from its own path, so this exercises
  // the real workspace rather than a fixture: whatever app-env.json holds is
  // what the child sees. An absent file means an unset variable, which is the
  // no-op the test above pins.
  const expected = readAppEnv(projectRoot()).VITE_AUTH_ENABLED ?? "undefined";
  const { stdout } = await execFileAsync(process.execPath, [
    WRAPPER,
    process.execPath,
    "-e",
    PRINT_FLAG,
  ]);
  assert.equal(stdout, expected);
});

test("the wrapped command sees an explicit override, not the file value", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [WRAPPER, process.execPath, "-e", PRINT_FLAG],
    { env: { ...process.env, VITE_AUTH_ENABLED: "true" } },
  );
  assert.equal(stdout, "true");
});

test("the wrapper propagates the command's exit code", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [WRAPPER, process.execPath, "-e", "process.exit(3)"]),
    (err) => err.code === 3,
  );
});

test("a signal-killed command is never reported as success", async () => {
  // The wrapper's own SIGTERM handler must not swallow the re-raised signal:
  // a cancelled build reporting exit 0 is a silently passing gate.
  await assert.rejects(
    execFileAsync(process.execPath, [
      WRAPPER,
      process.execPath,
      "-e",
      "process.kill(process.pid, 'SIGTERM');setTimeout(() => {}, 1000);",
    ]),
    (err) => err.signal === "SIGTERM" || err.code !== 0,
  );
});

// The Windows branch is exercised with an injected platform and PATH so the
// Linux CI run covers it. `npm run dev` on Windows resolves `vite` to a `.cmd`
// shim, which CreateProcess cannot exec — the symptom was `spawn vite ENOENT`.
const WIN_PATH = "C:\\repo\\node_modules\\.bin;C:\\Windows\\system32";
const winResolve = (command, present) =>
  resolveSpawn(command, { PATH: WIN_PATH }, { platform: "win32", exists: (p) => present.has(p) });

test("a bare name that is only a .cmd shim goes through the shell, fully pathed", () => {
  const shim = "C:\\repo\\node_modules\\.bin\\vite.cmd";
  assert.deepEqual(winResolve("vite", new Set([shim])), {
    command: `"${shim}"`,
    shell: true,
  });
});

test("a real executable on PATH never goes through the shell", () => {
  // cmd.exe would re-split the argv of a `node -e "…"` payload.
  const exe = "C:\\Windows\\system32\\where.exe";
  assert.deepEqual(winResolve("where", new Set([exe])), { command: "where", shell: false });
});

test("an executable wins over a shim of the same name in the same directory", () => {
  const dir = "C:\\repo\\node_modules\\.bin\\";
  const present = new Set([`${dir}tool.exe`, `${dir}tool.cmd`]);
  assert.deepEqual(winResolve("tool", present), { command: "tool", shell: false });
});

test("an absolute path is spawned as given, shell only for a batch file", () => {
  assert.deepEqual(winResolve("C:\\Program Files\\nodejs\\node.exe", new Set()), {
    command: "C:\\Program Files\\nodejs\\node.exe",
    shell: false,
  });
  assert.deepEqual(winResolve("C:\\repo\\go.cmd", new Set()), {
    command: '"C:\\repo\\go.cmd"',
    shell: true,
  });
});

test("an unresolvable name keeps the plain spawn, so the ENOENT still surfaces", () => {
  assert.deepEqual(winResolve("nope", new Set()), { command: "nope", shell: false });
});

test("posix spawns directly whatever the name looks like", () => {
  const onPosix = (command) =>
    resolveSpawn(command, { PATH: "/usr/bin" }, { platform: "linux", exists: () => true });
  assert.deepEqual(onPosix("vite"), { command: "vite", shell: false });
  assert.deepEqual(onPosix("go.cmd"), { command: "go.cmd", shell: false });
});

test("shell quoting protects spaces and metacharacters, and doubles quotes", () => {
  assert.equal(quoteForShell("--port"), "--port");
  assert.equal(quoteForShell("8080"), "8080");
  assert.equal(quoteForShell("a b"), '"a b"');
  assert.equal(quoteForShell("a&b"), '"a&b"');
  assert.equal(quoteForShell(""), '""');
  assert.equal(quoteForShell('say "hi"'), '"say ""hi"""');
});

/**
 * Windows creates symlinks only under Developer Mode or elevation, so an EPERM
 * here is the platform talking, not the code under test.
 */
function trySymlink(target, path) {
  try {
    symlinkSync(target, path);
    return true;
  } catch (err) {
    if (err?.code === "EPERM" || err?.code === "EACCES") return false;
    throw err;
  }
}

test("the CLI still runs when invoked through a symlinked path", async (t) => {
  // node realpaths import.meta.url but not process.argv[1], so a raw comparison
  // turns the wrapper into a no-op that exits 0 without starting anything.
  const link = join(mkdtempSync(join(tmpdir(), "app-env-link-")), "scripts");
  if (!trySymlink(join(projectRoot(), "scripts"), link)) {
    return t.skip("this platform does not permit creating symlinks");
  }
  const { stdout } = await execFileAsync(process.execPath, [
    join(link, "with-app-env.mjs"),
    process.execPath,
    "-e",
    PRINT_FLAG,
  ]);
  assert.equal(stdout, readAppEnv(projectRoot()).VITE_AUTH_ENABLED ?? "undefined");
});
