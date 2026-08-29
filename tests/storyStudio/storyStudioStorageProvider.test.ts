import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { fileManagerCommand } from "../../apps/story-studio/server/localFileManager.mjs";

const appRoot = "apps/story-studio";

test("Story Studio exposes storage providers without an author-facing token flow", () => {
  const appSource = readFileSync(join(appRoot, "src", "App.tsx"), "utf8");
  const transportSource = readFileSync(join(appRoot, "src", "lib", "localTransport.ts"), "utf8");
  const providerSource = readFileSync(join(appRoot, "src", "lib", "storageProvider.ts"), "utf8");

  assert.equal(existsSync(join(appRoot, "src", "components", "ConnectionDialog.tsx")), false);
  assert.doesNotMatch(appSource, /ConnectionDialog|连接本地工作区|本地授权口令|connectionToken/);
  assert.doesNotMatch(transportSource, /x-world-os-local-control-token/);
  assert.match(providerSource, /class LocalFolderProvider/);
  assert.match(providerSource, /CLOUD_PROVIDER_PLACEHOLDER/);
  assert.match(providerSource, /无法访问当前故事位置，请重新授权。/);
});

test("local file-manager commands reveal only the fixed project path without a shell", () => {
  assert.deepEqual(fileManagerCommand("/tmp/story", "darwin"), { command: "open", args: ["/tmp/story"], label: "在 Finder 中打开" });
  assert.deepEqual(fileManagerCommand("C:\\story", "win32"), { command: "explorer.exe", args: ["C:\\story"], label: "在文件资源管理器中打开" });
  assert.deepEqual(fileManagerCommand("/srv/story", "linux"), { command: "xdg-open", args: ["/srv/story"], label: "在文件管理器中打开" });
  assert.equal(fileManagerCommand("/tmp/story", "aix"), null);
});

test("automatic local storage session creates Markdown without exposing the control token", async () => {
  const rootPath = join(tmpdir(), `world-os-story-studio-storage-provider-${process.pid}`);
  const stateFilePath = join(rootPath, ".story-studio", "state.json");
  const port = 46_000 + (process.pid % 1_000);
  const controlToken = "internal-test-control-token";
  const baseUrl = `http://127.0.0.1:${port}`;
  rmSync(rootPath, { recursive: true, force: true });
  mkdirSync(rootPath, { recursive: true });

  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      WORLD_OS_STORY_STUDIO_ROOT: rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: controlToken
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(port);
    const sessionResponse = await fetch(`${baseUrl}/__local/story-studio/storage/session`, {
      headers: { origin: baseUrl }
    });
    assert.equal(sessionResponse.status, 200);
    const sessionCookie = sessionResponse.headers.get("set-cookie") || "";
    const sessionBody = await sessionResponse.text();
    assert.match(sessionCookie, /^story_studio_local_session=/);
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Strict/);
    assert.doesNotMatch(sessionCookie, new RegExp(controlToken));
    assert.doesNotMatch(sessionBody, new RegExp(controlToken));
    assert.doesNotMatch(sessionBody, new RegExp(escapeRegExp(rootPath)));
    assert.doesNotMatch(sessionBody, /token/i);
    assert.match(sessionBody, /"providerId":"local-folder"/);

    const unauthorized = await createProject(baseUrl, null, baseUrl, "blocked-world");
    assert.equal(unauthorized.status, 403);
    assert.match(await unauthorized.text(), /无法访问当前故事位置，请重新授权。/);

    const foreignOrigin = await createProject(baseUrl, sessionCookie, "https://hostile.invalid", "foreign-world");
    assert.equal(foreignOrigin.status, 403);
    assert.equal(existsSync(join(rootPath, "foreign-world")), false);

    const created = await createProject(baseUrl, sessionCookie, baseUrl, "author-world");
    assert.equal(created.status, 201);
    assert.equal(existsSync(join(rootPath, "author-world", "project.md")), true);
    assert.doesNotMatch(await created.text(), new RegExp(escapeRegExp(rootPath)));

    const unauthorizedStatus = await fetch(`${baseUrl}/__local/story-studio/storage/status?projectId=author-world`, {
      headers: { origin: baseUrl }
    });
    assert.equal(unauthorizedStatus.status, 403);

    const foreignStatus = await fetch(`${baseUrl}/__local/story-studio/storage/status?projectId=author-world`, {
      headers: { cookie: sessionCookie, origin: "https://hostile.invalid" }
    });
    assert.equal(foreignStatus.status, 403);

    const statusResponse = await fetch(`${baseUrl}/__local/story-studio/storage/status?projectId=author-world`, {
      headers: { cookie: sessionCookie, origin: baseUrl }
    });
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json() as { data: Record<string, unknown> };
    assert.equal(statusBody.data.version, "story-studio-storage-transparency/v1");
    assert.equal(statusBody.data.projectPath, join(rootPath, "author-world"));
    assert.equal(statusBody.data.libraryPath, rootPath);
    assert.equal(statusBody.data.persistenceState, "verified-local");
    assert.equal(statusBody.data.backupMode, "manual-folder-copy");
    assert.equal(statusBody.data.fullExportState, "not-implemented");
    assert.doesNotMatch(JSON.stringify(statusBody), new RegExp(controlToken));

    const missingStatus = await fetch(`${baseUrl}/__local/story-studio/storage/status?projectId=missing-world`, {
      headers: { cookie: sessionCookie, origin: baseUrl }
    });
    assert.equal(missingStatus.status, 404);
    assert.match(await missingStatus.text(), /找不到这个故事项目/);

    const revealWithArbitraryPath = await fetch(`${baseUrl}/__local/story-studio/storage/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie, origin: baseUrl },
      body: JSON.stringify({ projectId: "author-world", path: "/tmp/other" })
    });
    assert.equal(revealWithArbitraryPath.status, 400);
    assert.match(await revealWithArbitraryPath.text(), /请求包含不支持的项目字段/);

    const foreignReveal = await fetch(`${baseUrl}/__local/story-studio/storage/reveal`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie, origin: "https://hostile.invalid" },
      body: JSON.stringify({ projectId: "author-world" })
    });
    assert.equal(foreignReveal.status, 403);

    rmSync(join(rootPath, "author-world"), { recursive: true, force: true });
    const missingFolder = await fetch(`${baseUrl}/__local/story-studio/bootstrap`);
    assert.equal(missingFolder.status, 200);
    assert.match(await missingFolder.text(), /上次打开的世界已不在项目目录中/);
  } finally {
    server.kill("SIGTERM");
  }
});

async function createProject(baseUrl: string, cookie: string | null, origin: string, folderSlug: string): Promise<Response> {
  return fetch(`${baseUrl}/__local/story-studio/projects/create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify({ title: "Author World", folderSlug })
  });
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__local/story-studio/bootstrap`);
      if (response.ok) return;
    } catch {
      // Server startup is retried within the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for Story Studio server.");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
