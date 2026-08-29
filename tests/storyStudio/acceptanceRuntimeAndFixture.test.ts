import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { inspectCanonicalRuntime } from "../../scripts/canonical-runtime.mjs";
import { createTianyanE2eFixture, removeTianyanE2eFixture } from "../../scripts/tianyan-e2e-fixture.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("acceptance runtime diagnostics require the canonical Node 22 and npm 10 pair", () => {
  const canonical = inspectCanonicalRuntime({ nodeVersion: "22.23.2", npmUserAgent: "npm/10.9.2 node/v22.23.2 linux x64", nodeExecutable: "/toolchain/node" });
  assert.deepEqual(canonical.issues, []);
  assert.equal(canonical.npmMajor, 10);

  const rejected = inspectCanonicalRuntime({ nodeVersion: "24.16.0", npmUserAgent: "npm/11.13.0 node/v24.16.0 linux x64" });
  assert.match(rejected.issues.join("\n"), /Node 22/u);
  assert.match(rejected.issues.join("\n"), /npm 10/u);
});

test("E2E fixture roots and project identifiers are unique, while production still rejects a duplicate project folder", () => {
  const first = createTianyanE2eFixture();
  const second = createTianyanE2eFixture();
  try {
    assert.notEqual(first.fixtureRoot, second.fixtureRoot);
    assert.notEqual(first.projectId, second.projectId);

    const firstOperations = createStoryStudioWorkspaceOperations({ rootPath: first.fixtureRoot, stateFilePath: join(first.fixtureRoot, ".story-studio", "state.json") });
    firstOperations.createProject({ title: "第一次隔离验收", folderSlug: first.projectId });
    assert.equal(existsSync(join(first.fixtureRoot, first.projectId, "project.md")), true);
    assert.throws(() => firstOperations.createProject({ title: "不可覆盖", folderSlug: first.projectId }), /already exists/u);

    const secondOperations = createStoryStudioWorkspaceOperations({ rootPath: second.fixtureRoot, stateFilePath: join(second.fixtureRoot, ".story-studio", "state.json") });
    secondOperations.createProject({ title: "第二次隔离验收", folderSlug: second.projectId });
    assert.equal(existsSync(join(second.fixtureRoot, second.projectId, "project.md")), true);

    removeTianyanE2eFixture(first);
    assert.equal(existsSync(first.fixtureRoot), false);
    assert.equal(existsSync(second.fixtureRoot), true, "Cleanup must leave a concurrent fixture root untouched.");
  } finally {
    if (existsSync(first.fixtureRoot)) removeTianyanE2eFixture(first);
    if (existsSync(second.fixtureRoot)) removeTianyanE2eFixture(second);
  }
});
