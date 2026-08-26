import process from "node:process";

import {
  createCrashSafeApplyFixture,
  inspectCrashSafeApplyFixture,
  openCrashSafeApplyFixture
} from "./authorChangeSetCrashFixture.ts";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";

const [command, root, projectId, changeSetId, faultPoint] = process.argv.slice(2);

try {
  if (command === "init") {
    console.log(JSON.stringify(await createCrashSafeApplyFixture(required(root))));
  } else if (command === "inspect") {
    console.log(JSON.stringify(inspectCrashSafeApplyFixture(required(root), required(projectId), required(changeSetId))));
  } else if (command === "apply" || command === "apply-wait") {
    if (command === "apply-wait") {
      process.stdout.write("READY\n");
      await waitForGo();
    }
    const fixture = openCrashSafeApplyFixture(required(root), required(projectId));
    const control = createStoryStudioAuthorControl({
      rootPath: fixture.rootPath,
      stateFilePath: fixture.stateFilePath,
      ...(faultPoint ? {
        faultInjector(point) {
          if (point === faultPoint) process.kill(process.pid, "SIGKILL");
        }
      } : {})
    });
    const applied = control.applyAuthorChangeSet({
      projectId: required(projectId),
      changeSetId: required(changeSetId)
    });
    console.log(JSON.stringify(applied));
  } else {
    throw new Error("Unknown crash harness command.");
  }
} catch (error) {
  const value = error as Error & { code?: string };
  process.stderr.write(`${JSON.stringify({ code: value.code || "UNEXPECTED", message: value.message })}\n`);
  process.exitCode = 2;
}

function required(value: string | undefined): string {
  if (!value) throw new Error("Crash harness argument is required.");
  return value;
}

async function waitForGo(): Promise<void> {
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    if (String(chunk).includes("GO")) return;
  }
  throw new Error("Crash harness barrier closed before GO.");
}
