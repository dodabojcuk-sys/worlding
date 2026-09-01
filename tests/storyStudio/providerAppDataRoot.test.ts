import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  defaultProviderAppDataRoot,
  providerStoragePaths,
  resolveProviderServerAppDataRoot,
  resolveProviderSmokeAppDataRoot
} from "../../apps/story-studio/server/providerGateway/providerAppDataRoot.mjs";

test("Provider Settings and prediction Smoke resolve one authoritative default root", () => {
  const environment = {};
  const server = resolveProviderServerAppDataRoot({ environment, testFallbackName: "story" });
  const smoke = resolveProviderSmokeAppDataRoot(environment);
  assert.equal(server.rootPath, path.resolve(defaultProviderAppDataRoot()));
  assert.equal(smoke.rootPath, server.rootPath);
  assert.equal(server.scope, "authoritative");
  assert.equal(smoke.smokeCompatibleByDefault, true);
  assert.deepEqual(providerStoragePaths(server.rootPath), {
    appDataRoot: server.rootPath,
    profilePath: path.join(server.rootPath, "provider-profile.json"),
    credentialPath: path.join(server.rootPath, "credentials", "siliconflow.default.credential")
  });
});

test("test roots remain isolated while Server and Smoke discover the same explicit root", () => {
  const isolatedRoot = path.resolve("/tmp/tianyan-provider-root-fixture");
  const environment = { NODE_ENV: "test", TIANYAN_PROVIDER_APP_DATA_ROOT: isolatedRoot };
  const server = resolveProviderServerAppDataRoot({ environment, testFallbackName: "story" });
  const smoke = resolveProviderSmokeAppDataRoot(environment);
  assert.equal(server.rootPath, isolatedRoot);
  assert.equal(smoke.rootPath, isolatedRoot);
  assert.equal(server.scope, "test-isolated");
  assert.equal(server.smokeCompatibleByDefault, false);
  assert.match(server.compatibilityNotice || "", /Smoke/u);
});

test("development root overrides require an explicit isolation flag", () => {
  const configured = "/tmp/tianyan-provider-development-fixture";
  assert.throws(
    () => resolveProviderServerAppDataRoot({ environment: { NODE_ENV: "development", TIANYAN_PROVIDER_APP_DATA_ROOT: configured } }),
    /显式 Provider 开发隔离/u
  );
  const allowed = resolveProviderServerAppDataRoot({
    environment: {
      NODE_ENV: "development",
      TIANYAN_PROVIDER_APP_DATA_ROOT: configured,
      TIANYAN_PROVIDER_PROFILE_DEV_MODE: "1"
    }
  });
  assert.equal(allowed.scope, "development-isolated");
  assert.equal(allowed.rootPath, path.resolve(configured));
});

test("node:test descendants are isolated even when a server test forgets NODE_ENV", () => {
  const resolved = resolveProviderServerAppDataRoot({
    environment: { NODE_TEST_CONTEXT: "child-v8" },
    testFallbackName: "node-test-child"
  });
  assert.equal(resolved.scope, "test-isolated");
  assert.notEqual(resolved.rootPath, path.resolve(defaultProviderAppDataRoot()));
});

test("tests reject the authoritative Provider root even when explicitly configured", () => {
  assert.throws(
    () => resolveProviderServerAppDataRoot({
      environment: {
        NODE_ENV: "test",
        TIANYAN_PROVIDER_APP_DATA_ROOT: defaultProviderAppDataRoot()
      }
    }),
    /tests? must not use the authoritative Provider app-data root|Provider 测试不得使用权威数据根/u
  );
});

test("standard browser E2E pins Provider state to its owned fixture root", () => {
  const source = readFileSync("apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs", "utf8");
  assert.match(source, /const providerFixtureRoot = path\.join\(fixtureRoot, "\.provider-app-data"\)/u);
  assert.match(source, /NODE_ENV: "test"/u);
  assert.match(source, /TIANYAN_PROVIDER_APP_DATA_ROOT: providerFixtureRoot/u);
});
