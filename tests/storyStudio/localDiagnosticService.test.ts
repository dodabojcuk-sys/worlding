import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalDiagnosticService,
  LOCAL_DIAGNOSTIC_STORAGE_KEY,
  redactDiagnosticMetadata
} from "../../apps/story-studio/src/storyDiagnostics/localDiagnosticService.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values
  };
}

test("local diagnostics redact prose, prompts, credentials, and nested sensitive fields", () => {
  const result = redactDiagnosticMetadata({ route: "/nuwa", prompt: "secret prose", nested: { apiKey: "key", objectId: "object.1" } });
  assert.equal(result.prompt, "[REDACTED]");
  assert.deepEqual(result.nested, { apiKey: "[REDACTED]", objectId: "object.1" });
});
test("local diagnostics persist a bounded ring buffer and expire old events", () => {
  const storage = memoryStorage();
  let now = new Date("2026-08-17T00:00:00.000Z");
  const service = createLocalDiagnosticService({ storage, now: () => now, maxBytes: 1500, retentionMs: 24 * 60 * 60 * 1000 });
  for (let index = 0; index < 40; index += 1) service.record({ category: "user-action", route: "/tianyi", summary: `action-${index}`, metadata: { index } });
  assert.ok(service.list().length < 40);
  assert.ok(storage.values.has(LOCAL_DIAGNOSTIC_STORAGE_KEY));
  now = new Date("2026-08-19T00:00:00.000Z");
  service.record({ category: "navigation", route: "/", summary: "fresh", metadata: {} });
  assert.deepEqual(service.list().map((event) => event.summary), ["fresh"]);
});

test("diagnostic export contains status context and no raw content", () => {
  const service = createLocalDiagnosticService();
  service.record({ category: "request", route: "/library", summary: "request failed", metadata: { body: "novel body", status: 500 } });
  const payload = service.exportPackage({ appVersion: "test", branch: "test", head: "head", tree: "tree", browser: "test", runtime: "test", route: "/library", persistenceHealth: "healthy", ownerHashes: {} });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /novel body/u);
  assert.match(serialized, /REDACTED/u);
  assert.equal(payload.events.length, 1);
});
