import { createHash } from "node:crypto";
import { readFileSync, readSync, realpathSync } from "node:fs";
import path from "node:path";

import { publishFileNoReplace, type AtomicFileBoundary } from "../../src/storyControlSurface/atomicNoReplaceFile.ts";
import {
  readNuwaRunPack,
  writeNuwaPredictionBundle
} from "../../src/storyIntelligence/nuwaRunPack.ts";
import type { StoryPredictionBundle } from "../../src/storyIntelligence/storyIntelligenceTypes.ts";

const [command, workspacePath, runId, bundlePath, publicationMode, workerId, attemptId] = process.argv.slice(2);
let atomicSequence = 0;

try {
  if (command === "publish") {
    const bundle = JSON.parse(readFileSync(required(bundlePath), "utf8")) as StoryPredictionBundle;
    const record = writeNuwaPredictionBundle({
      workspacePath: required(workspacePath),
      runId: required(runId),
      bundle,
      onBeforePublish: waitAtPublicationBarrier
    });
    console.log(JSON.stringify({
      ok: true,
      runId: record.runId,
      status: record.status,
      authorGoal: bundle.authorGoal
    }));
  } else if (command === "atomic-publish") {
    const publication = publishFileNoReplace({
      rootPath: required(workspacePath),
      targetPath: required(runId),
      content: readFileSync(required(bundlePath)),
      onBoundary: observeAtomicBoundary,
      onDirectoryFsync: observeDirectoryFsync
    });
    emitAtomicEvent("result", atomicTargetDirectory(), { ok: true, publication });
  } else if (command === "inspect") {
    const loaded = readNuwaRunPack(required(workspacePath), required(runId));
    const bytes = readFileSync(required(bundlePath), "utf8");
    console.log(JSON.stringify({
      ok: true,
      runId: loaded.run.runId,
      status: loaded.run.status,
      authorGoal: loaded.bundle?.authorGoal ?? null,
      bundleSha256: createHash("sha256").update(bytes).digest("hex")
    }));
  } else {
    throw new Error("Unknown Nuwa prediction-bundle race worker command.");
  }
} catch (error) {
  const failure = { ok: false, message: error instanceof Error ? error.message : String(error) };
  if (command === "atomic-publish") {
    emitAtomicEvent("result", atomicTargetDirectory(), failure);
  } else {
    console.log(JSON.stringify(failure));
  }
}

function waitAtPublicationBarrier(): void {
  process.stdout.write("READY\n");
  waitForCommand("GO");
}

function observeAtomicBoundary(boundary: AtomicFileBoundary): void {
  emitAtomicEvent(boundary.replaceAll("-", "_"), atomicTargetDirectory());
  if (publicationMode !== "block-boundaries") return;
  if (boundary === "temporary-durable") waitForCommand("GO_LINK");
  if (boundary === "final-published") waitForCommand("GO_FSYNC");
}

function observeDirectoryFsync(boundary: string, directory: string): void {
  emitAtomicEvent(boundary.replaceAll("-", "_"), directory);
}

function emitAtomicEvent(eventType: string, targetDirectory: string, details: Record<string, unknown> = {}): void {
  process.stdout.write(`${JSON.stringify({
    workerId: required(workerId),
    attemptId: required(attemptId),
    targetDirectory,
    localSequence: ++atomicSequence,
    eventType,
    ...details
  })}\n`);
}

function atomicTargetDirectory(): string {
  return realpathSync(path.dirname(path.resolve(required(runId))));
}

function waitForCommand(expected: string): void {
  let command = "";
  const buffer = Buffer.alloc(16);
  while (!command.includes(expected)) {
    const count = readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) throw new Error(`Publication barrier closed before ${expected}.`);
    command += buffer.toString("utf8", 0, count);
  }
}

function required(value: string | undefined): string {
  if (!value) throw new Error("Nuwa race worker argument is required.");
  return value;
}
