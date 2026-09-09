import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Nuwa real API runner is an explicit zero-call gate by default", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-nuwa-api-runner-"));
  try {
    const output = execFileSync(process.execPath, ["scripts/tianyan-nuwa-real-api-runner-r0.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, TIANYAN_NUWA_API_TEST_OUTPUT: path.join(root, "result.json") },
      encoding: "utf8"
    });
    const result = JSON.parse(output) as { status: string; providerDispatches: number; exitCode: number };
    assert.equal(result.status, "not-started-confirmation-required");
    assert.equal(result.providerDispatches, 0);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
