import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const execFileAsync = promisify(execFile);

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

test("Nuwa real API runner persists a missing external condition without posting a Run", async () => {
  let postCount = 0;
  const host = createServer((request, response) => {
    if (request.method === "POST") postCount += 1;
    const unavailable = { data: { availability: { kind: "unavailable", label: "Provider 尚未配置" }, participants: [], storyUnits: [] } };
    const payload = request.url === "/__local/story-studio/health"
      ? { data: { status: "healthy", runtimeMode: "api-only" } }
      : request.url === "/__local/story-studio/storage/session"
        ? { data: { granted: true } }
        : request.url === "/__local/story-studio/model-service/status"
          ? { data: { profile: { profile: { id: "fixture.default", provider: "fixture", modelId: "fixture-model" } } } }
      : unavailable;
    response.writeHead(200, { "content-type": "application/json", ...(request.url === "/__local/story-studio/storage/session" ? { "set-cookie": "story_studio_local_session=fixture; HttpOnly" } : {}) });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-nuwa-api-runner-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, ["scripts/tianyan-nuwa-real-api-runner-r0.mjs", "--confirm-real-provider"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TIANYAN_NUWA_API_TEST_PROJECT_ID: "isolated-story",
        TIANYAN_NUWA_API_TEST_BASE_URL: `http://127.0.0.1:${port}/__local/story-studio`,
        TIANYAN_NUWA_API_TEST_OUTPUT: path.join(root, "result.json")
      },
      encoding: "utf8"
    });
    const result = JSON.parse(stdout) as { status: string; providerDispatches: number; exitCode: number };
    assert.equal(result.status, "external-condition-missing");
    assert.equal(result.providerDispatches, 0);
    assert.equal(result.exitCode, 0);
    assert.equal(postCount, 0);
    const persisted = JSON.parse(readFileSync(path.join(root, "result.json"), "utf8"));
    assert.deepEqual(persisted.provider, { profileId: "fixture.default", providerId: "fixture", modelId: "fixture-model" });
  } finally {
    await new Promise<void>((resolve, reject) => host.close((error) => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

test("Nuwa real API runner creates an isolated, author-confirmed knowledge fixture through host APIs", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  let characterSequence = 0;
  const host = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown> : null;
    requests.push({ url: request.url || "", body });
    const payload = request.url === "/__local/story-studio/health"
      ? { data: { status: "healthy", runtimeMode: "api-only" } }
      : request.url === "/__local/story-studio/storage/session"
        ? { data: { granted: true } }
        : request.url === "/__local/story-studio/projects/create"
          ? { data: { id: "api-isolated-project" } }
          : request.url === "/__local/story-studio/world-objects/create" && body?.type === "character"
            ? { data: { id: `character-${++characterSequence}`, title: body.title } }
            : request.url === "/__local/story-studio/world-objects/create"
              ? { data: { id: body?.type === "event" ? "event-planning" : `object-${String(body?.type)}` } }
              : request.url === "/__local/story-studio/author-control/impact-review/create-from-planning-event"
                ? { data: { id: "review-fixture", options: [{ id: "option-adopt" }] } }
                : request.url === "/__local/story-studio/author-control/impact-review/choose"
                  ? { data: { id: "review-fixture", status: "selected" } }
                  : request.url === "/__local/story-studio/author-control/change-set/create"
                    ? { data: { id: "change-set-fixture" } }
                    : request.url === "/__local/story-studio/author-control/change-set/apply"
                      ? { data: { application: { appliedEventId: "event-confirmed" } } }
                      : request.url === "/__local/story-studio/story-units/create"
                        ? { data: { id: "unit-fixture" } }
                        : request.url === "/__local/story-studio/model-service/status"
                          ? { data: { profile: { profile: { id: "fixture.default", provider: "fixture", modelId: "fixture-model" } } } }
                          : { data: { availability: { kind: "unavailable", label: "Provider 尚未配置" }, participants: [], storyUnits: [] } };
    response.writeHead(200, { "content-type": "application/json", ...(request.url === "/__local/story-studio/storage/session" ? { "set-cookie": "story_studio_local_session=fixture; HttpOnly" } : {}) });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const address = host.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const root = mkdtempSync(path.join(os.tmpdir(), "tianyan-nuwa-api-runner-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, ["scripts/tianyan-nuwa-real-api-runner-r0.mjs", "--confirm-real-provider"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TIANYAN_NUWA_API_TEST_CREATE_ISOLATED_FIXTURE: "1",
        TIANYAN_NUWA_API_TEST_BASE_URL: `http://127.0.0.1:${port}/__local/story-studio`,
        TIANYAN_NUWA_API_TEST_OUTPUT: path.join(root, "result.json")
      },
      encoding: "utf8"
    });
    const result = JSON.parse(stdout) as { status: string; providerDispatches: number; exitCode: number };
    assert.equal(result.status, "external-condition-missing");
    assert.equal(result.providerDispatches, 0);
    assert.equal(result.exitCode, 0);
    const characters = requests.filter((request) => request.url.endsWith("/world-objects/create") && request.body?.type === "character");
    assert.equal(characters.length, 3);
    assert.ok(characters.every((request) => (request.body?.profile as { authorConfirmed?: boolean } | undefined)?.authorConfirmed === true));
    const planning = requests.find((request) => request.url.endsWith("/world-objects/create") && request.body?.type === "event");
    assert.deepEqual(planning?.body?.knowledgeSubjects, ["character-2"]);
    assert.ok(requests.some((request) => request.url.endsWith("/author-control/change-set/apply")), "the fixture uses the existing Author Control path to materialize its evidence");
    const unit = requests.find((request) => request.url.endsWith("/story-units/create"));
    assert.ok((unit?.body?.linkedEntityIds as string[]).includes("event-confirmed"));
    assert.equal(requests.some((request) => request.url.endsWith("/nuwa-n1/create") || request.url.endsWith("/nuwa-n1/continuous")), false, "an unavailable provider never reaches Run creation");
  } finally {
    await new Promise<void>((resolve, reject) => host.close((error) => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});
