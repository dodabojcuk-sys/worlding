import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  terminateChildProcess,
  waitForChildExit,
  waitForCleanup
} from "../../apps/story-studio/scripts/bounded-process-teardown.mjs";

test("bounded teardown escalates an unresponsive child and removes exit listeners", async () => {
  const child = spawn(process.execPath, [
    "-e",
    "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"
  ], { stdio: ["ignore", "pipe", "ignore"] });
  await new Promise<void>((resolve) => child.stdout.once("data", () => resolve()));
  const baselineExitListeners = child.listenerCount("exit");

  const result = await terminateChildProcess(child, {
    label: "unresponsive fixture",
    gracefulTimeoutMs: 25,
    forceTimeoutMs: 1_000
  });

  assert.equal(result.stage, "forced");
  assert.equal(result.signalCode, "SIGKILL");
  assert.equal(child.listenerCount("exit"), baselineExitListeners);
});

test("bounded teardown accepts graceful and already-exited children", async () => {
  const graceful = spawn(process.execPath, [
    "-e",
    "process.on('SIGTERM', () => process.exit(0)); process.stdout.write('ready\\n'); setInterval(() => {}, 1000);"
  ], { stdio: ["ignore", "pipe", "ignore"] });
  await new Promise<void>((resolve) => graceful.stdout.once("data", () => resolve()));
  const gracefulResult = await terminateChildProcess(graceful, { gracefulTimeoutMs: 1_000 });
  assert.equal(gracefulResult.stage, "graceful");

  const exited = spawn(process.execPath, ["-e", "process.exit(7)"], { stdio: "ignore" });
  await waitForChildExit(exited, 1_000);
  const exitedResult = await terminateChildProcess(exited);
  assert.equal(exitedResult.stage, "already-exited");
  assert.equal(exitedResult.exitCode, 7);
});

test("generic cleanup wait rejects within its bound", async () => {
  await assert.rejects(
    waitForCleanup(new Promise(() => {}), { label: "stuck browser", timeoutMs: 20 }),
    /stuck browser exceeded its bounded teardown timeout/
  );
});
