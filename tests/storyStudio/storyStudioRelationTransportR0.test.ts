import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

test("Relation local transport is typed, token-protected, revision-guarded, and author-receipt-backed", async () => {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-relation-transport-r0-"));
  const stateFilePath = path.join(rootPath, "state.json");
  mkdirSync(rootPath, { recursive: true });
  const port = 46_000 + (process.pid % 1_000);
  const token = "story-relation-transport-token";
  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(port);
    const base = `http://127.0.0.1:${port}/__local/story-studio`;
    assert.equal((await post(`${base}/projects/create`, token, { title: "Relation transport", folderSlug: "relation-transport" })).status, 201);
    const source = await post(`${base}/world-objects/create`, token, { projectId: "relation-transport", type: "character", title: "来源" });
    const target = await post(`${base}/world-objects/create`, token, { projectId: "relation-transport", type: "character", title: "目标" });
    const sourceId = source.data.id as string;
    const targetId = target.data.id as string;

    const type = await post(`${base}/relations/types/create`, token, { projectId: "relation-transport", label: "守护", expectedRepositoryRevision: 0, operationId: "transport.type.create" });
    assert.equal(type.status, 201);
    const relationTypeId = type.data.type.relationTypeId as string;
    const typeList = await get(`${base}/relations/types?projectId=relation-transport`);
    assert.equal(typeList.status, 200);
    assert.equal(typeList.data.types[0].relationTypeId, relationTypeId);

    const missingToken = await post(`${base}/relations/create`, "", { projectId: "relation-transport", sourceObjectId: sourceId, targetObjectId: targetId, relationTypeId, operationId: "transport.relation.missing-token" });
    assert.equal(missingToken.status, 403);
    const candidate = await post(`${base}/relations/create`, token, { projectId: "relation-transport", sourceObjectId: sourceId, targetObjectId: targetId, relationTypeId, direction: "forward", operationId: "transport.relation.create" });
    assert.equal(candidate.status, 201);
    assert.equal(candidate.data.relation.reviewState, "candidate");
    const relationId = candidate.data.relation.relationId as string;
    assert.equal(candidate.data.relation.provenance.authorActionReceiptId !== undefined, true);

    const list = await get(`${base}/relations?projectId=relation-transport&reviewState=candidate`);
    assert.equal(list.status, 200);
    assert.equal(list.data.relations.length, 1);
    assert.equal(list.data.relations[0].evidenceWarnings.length, 0);
    const detail = await get(`${base}/relations/relation?projectId=relation-transport&relationId=${encodeURIComponent(relationId)}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.relation.currentTypeLabel, "守护");

    const stale = await post(`${base}/relations/update`, token, { projectId: "relation-transport", relationId, expectedRelationRevision: 99, direction: "both", operationId: "transport.relation.stale" });
    assert.equal(stale.status, 400);
    assert.match(String(stale.error), /stale/i);
    const confirmed = await post(`${base}/relations/confirm`, token, { projectId: "relation-transport", relationId, expectedRelationRevision: 1, operationId: "transport.relation.confirm" });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.relation.reviewState, "confirmed");
    assert.match(String(confirmed.data.receipt.beforeSemanticHash), /^[a-f0-9]{64}$/u);
    assert.match(String(confirmed.data.receipt.afterSemanticHash), /^[a-f0-9]{64}$/u);

    const duplicate = await get(`${base}/relations/duplicates?projectId=relation-transport&sourceObjectId=${encodeURIComponent(sourceId)}&targetObjectId=${encodeURIComponent(targetId)}&relationTypeId=${encodeURIComponent(relationTypeId)}&direction=forward&relationLabelSnapshot=${encodeURIComponent("守护")}`);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.suggestions.length, 1);
    const permissions = await get(`${base}/agent-permissions?projectId=relation-transport`);
    assert.equal(permissions.status, 200);
    assert.equal(permissions.data.receipts.some((receipt: { targetType: string; targets: string[] }) => receipt.targetType === "relation" && receipt.targets.includes(relationId)), true);

    const relationSource = readFileSync(path.join(rootPath, "relation-transport", ".world-os", "relations", "relations.json"), "utf8");
    assert.match(relationSource, /story-relation-repository\/v2/u);
    assert.doesNotMatch(relationSource, /Canon|WorldState|Provider/u);
  } finally {
    server.kill("SIGTERM");
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("Relation transport surface is present without adding a browser-side JSON writer", () => {
  const source = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
  assert.match(source, /export async function listRelations/);
  assert.match(source, /export async function createRelationCandidate/);
  assert.match(source, /export async function confirmRelationCandidate/);
  assert.match(source, /export async function appendRelationEvidence/);
  assert.doesNotMatch(source, /relations\.json/);
});

async function post(url: string, token: string, body: Record<string, unknown>): Promise<{ status: number; data?: Record<string, unknown>; error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-world-os-local-control-token": token } : {}) },
    body: JSON.stringify(body)
  });
  const payload = await response.json() as { data?: Record<string, unknown>; error?: string };
  return { status: response.status, ...payload };
}

async function get(url: string): Promise<{ status: number; data?: unknown; error?: string }> {
  const response = await fetch(url);
  const payload = await response.json() as { data?: unknown; error?: string };
  return { status: response.status, ...payload };
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/__local/story-studio/bootstrap`)).ok) return;
    } catch {
      // Startup is retried within the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for Story Studio server.");
}
