import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("B1 rehearsal UI is explicitly local, isolated, and receipt-backed", () => {
  const workspace = source("apps/story-studio/src/components/multiverse/MultiverseB1Workspace.tsx");
  const transport = source("apps/story-studio/src/lib/localTransport.ts");
  const server = source("apps/story-studio/server/server.mjs");
  const fixture = source("apps/story-studio/server/multiverseB1Fixture.mjs");

  assert.match(workspace, /get\("b1Fixture"\) === "1"/);
  assert.match(workspace, /B1 铜钥匙融入排演/);
  assert.match(workspace, /建立隔离故事与 IF/);
  assert.match(workspace, /融入全部可用差异/);
  assert.match(workspace, /补偿本批融入/);
  assert.match(workspace, /Owner 分项回执/);
  assert.match(workspace, /runMultiverseB1Fixture/);
  assert.match(transport, /multiverse\/b1-fixture/);
  assert.match(server, /TIANYAN_MULTIVERSE_B1_FIXTURE !== "1"/);
  assert.match(fixture, /writes require an explicitly isolated Project/);
  assert.match(fixture, /comparison: compared/);
  assert.match(fixture, /coordinator\.read/);
});
