import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const appRoot = "apps/story-studio";

test("Story Studio client stays browser-only and outside legacy execution systems", () => {
  const files = walk(join(appRoot, "src"));
  const source = files.map((path) => readFileSync(path, "utf8")).join("\n");

  for (const forbidden of ["node:fs", "storyWorkspaceRepository", "story-product-prototype", "capabilityRuntime"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("Story Studio server delegates product operations without duplicating workspace semantics", () => {
  const source = readFileSync(join(appRoot, "server", "server.mjs"), "utf8");
  assert.match(source, /createStoryStudioWorkspaceOperations/);
  assert.doesNotMatch(source, /parseStoryMarkdown|serializeStoryMarkdown|createStoryWorkspace\s*\(/);
  assert.match(source, /createStoryStudioIntelligenceBridgeOperations/);
  assert.match(source, /readNuwaRunPack/);
  assert.match(source, /createAiProviderGateway/);
});

test("Story Studio development command starts both the local server and Vite", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: { dev: string } };
  const devSource = readFileSync("scripts/start-story-studio-dev.mjs", "utf8");

  assert.equal(packageJson.scripts.dev, "node scripts/run-with-canonical-runtime.mjs scripts/start-story-studio-dev.mjs");
  assert.match(devSource, /assertCanonicalRuntime/);
  assert.match(devSource, /apps\/story-studio\/server\/server\.mjs/);
  assert.match(devSource, /apps\/story-studio\/vite\.config\.ts/);
});

test("Story Studio local transport enforces token root and product-safe responses", async () => {
  const rootPath = join(tmpdir(), "world-os-story-studio-transport");
  const stateFilePath = join(tmpdir(), "world-os-story-studio-transport-state.json");
  const port = 43_000 + (process.pid % 1_000);
  const token = "story-studio-test-token";
  rmSync(rootPath, { recursive: true, force: true });
  rmSync(stateFilePath, { force: true });
  mkdirSync(rootPath, { recursive: true });

  const server = spawn(process.execPath, ["--experimental-strip-types", "apps/story-studio/server/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      WORLD_OS_STORY_STUDIO_ROOT: rootPath,
      WORLD_OS_STORY_STUDIO_STATE_FILE: stateFilePath,
      WORLD_OS_LOCAL_CONTROL_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(port);
    const endpoint = `http://127.0.0.1:${port}/__local/story-studio/projects/create`;

    const missingToken = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "No Token", folderSlug: "no-token" })
    });
    assert.equal(missingToken.status, 403);

    const invalidToken = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-world-os-local-control-token": "wrong" },
      body: JSON.stringify({ title: "Wrong Token", folderSlug: "wrong-token" })
    });
    assert.equal(invalidToken.status, 403);

    const unsafePath = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-world-os-local-control-token": token },
      body: JSON.stringify({ title: "Unsafe", folderSlug: "/tmp/outside" })
    });
    assert.equal(unsafePath.status, 400);

    const created = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-world-os-local-control-token": token },
      body: JSON.stringify({
        title: "雾中灯塔",
        folderSlug: "mist-lighthouse",
        genre: "mystery",
        ambience: "distant-sea"
      })
    });
    assert.equal(created.status, 201);
    const createdSource = await created.text();
    assert.doesNotMatch(createdSource, new RegExp(escapeRegExp(rootPath)));
    assert.match(createdSource, /"source":"markdown"/);

    const bootstrap = await fetch(`http://127.0.0.1:${port}/__local/story-studio/bootstrap`);
    assert.equal(bootstrap.status, 200);
    const bootstrapSource = await bootstrap.text();
    assert.match(bootstrapSource, /雾中灯塔/);
    assert.doesNotMatch(bootstrapSource, new RegExp(escapeRegExp(rootPath)));
  } finally {
    server.kill("SIGTERM");
  }
});

function walk(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [".ts", ".tsx", ".css"].includes(extname(entry.name)) ? [path] : [];
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
