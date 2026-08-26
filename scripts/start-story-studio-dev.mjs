import { spawn } from "node:child_process";
import { verifyStoryStudioCanonicalPreflight } from "./verify-story-studio-canonical.mjs";

verifyStoryStudioCanonicalPreflight();

const children = [
  spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "apps/story-studio/vite.config.ts", "--host", "127.0.0.1"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  })
];

let shuttingDown = false;

function stop(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode == null && child.signalCode == null) child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop();
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      process.exitCode = code ?? (signal ? 1 : 0);
      stop();
    }
  });
}

await Promise.all(children.map((child) => new Promise((resolve) => child.once("close", resolve))));
