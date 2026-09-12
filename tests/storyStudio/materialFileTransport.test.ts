import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("material file transport preserves bytes, revisions, partial receipts and token-protected downloads", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "story-studio-material-transport-"));
  const rootPath = path.join(fixture, "projects");
  const stateFilePath = path.join(fixture, "state.json");
  const port = 46_000 + (process.pid % 1_000);
  const token = "material-file-transport-token";
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), WORLD_OS_STORY_STUDIO_ROOT: rootPath, WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath, WORLD_OS_LOCAL_CONTROL_TOKEN: token, PROVIDER_MODE: "MOCK_OR_LOCAL_FAKE_ONLY" },
    stdio: "ignore"
  });
  const base = `http://127.0.0.1:${port}/__local/story-studio`;
  const post = async (route: string, body: unknown, status = 200) => {
    const response = await fetch(`${base}${route}`, { method: "POST", headers: { "content-type": "application/json", "x-world-os-local-control-token": token }, body: JSON.stringify(body) });
    assert.equal(response.status, status);
    return (await response.json()).data;
  };
  try {
    await waitForServer(base, child);
    await post("/projects/create", { title: "资料隔离作品", folderSlug: "materials-fixture" }, 201);
    const operationId = "operation.transport.import";
    const receipt = await post("/material-files/import", { projectId: "materials-fixture", operationId, files: [
      { name: "雾港笔记.md", mimeType: "text/markdown", base64: Buffer.from("雾港实行夜间宵禁。", "utf8").toString("base64") },
      { name: "blocked.exe", mimeType: "application/octet-stream", base64: Buffer.from("MZ").toString("base64") }
    ] }, 201);
    assert.equal(receipt.state, "partial");
    assert.equal(receipt.results[0].status, "created");
    assert.equal(receipt.results[1].status, "failed");
    const replay = await post("/material-files/import", { projectId: "materials-fixture", operationId, files: [] }, 201);
    assert.equal(replay.replayed, true);
    assert.equal(replay.results[0].fileId, receipt.results[0].fileId);
    const fileId = receipt.results[0].fileId as string;
    const missingToken = await fetch(`${base}/material-file/content?projectId=materials-fixture&fileId=${encodeURIComponent(fileId)}`);
    assert.equal(missingToken.status, 403);
    const download = await fetch(`${base}/material-file/content?projectId=materials-fixture&fileId=${encodeURIComponent(fileId)}`, { headers: { "x-world-os-local-control-token": token } });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), "雾港实行夜间宵禁。");
    const listing = await fetch(`${base}/material-files?projectId=materials-fixture&folderId=&archived=false`);
    assert.equal(listing.status, 200);
    const record = (await listing.json()).data.files[0];
    assert.equal(record.type, "text");
    assert.equal(record.revisions.length, 1);
    const catalog = JSON.parse(await readFile(path.join(rootPath, "materials-fixture", "documents", "workspace", "material-files.json"), "utf8"));
    assert.equal(catalog.files[0].id, fileId);
  } finally {
    child.kill("SIGTERM");
    await rm(fixture, { recursive: true, force: true });
  }
});

async function waitForServer(base: string, child: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Story Studio server exited before readiness (${child.exitCode}).`);
    try { if ((await fetch(`${base}/bootstrap`)).ok) return; } catch { /* bounded startup wait */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Story Studio material transport test server.");
}
