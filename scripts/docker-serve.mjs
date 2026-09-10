#!/usr/bin/env node
import { spawn } from "node:child_process";

const port = process.env.PORT || "8080";
process.env.DOCKER_PREVIEW = "1";
process.env.PORT = port;

const child = spawn(
  "node",
  ["scripts/with-app-env.mjs", "vite", "preview", "--host", "0.0.0.0", "--port", port],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
