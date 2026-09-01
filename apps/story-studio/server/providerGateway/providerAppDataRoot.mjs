import os from "node:os";
import path from "node:path";

export const PROVIDER_APP_DATA_ROOT_VERSION = "tianyan-provider-app-data-root/v1";

export function defaultProviderAppDataRoot() {
  return path.join(os.homedir(), "Library", "Application Support", "Tianyan");
}

export function resolveProviderServerAppDataRoot(options = {}) {
  return resolveProviderAppDataRoot({
    environment: options.environment,
    testFallbackName: options.testFallbackName
  });
}

export function resolveProviderSmokeAppDataRoot(environment = process.env) {
  return resolveProviderAppDataRoot({ environment });
}

export function resolveProviderAppDataRoot(options = {}) {
  const environment = options.environment || process.env;
  const configured = String(environment.TIANYAN_PROVIDER_APP_DATA_ROOT || "").trim();
  // `node --test` exposes NODE_TEST_CONTEXT to the test process and its
  // descendants. Treat it as authoritative test evidence so a server spawned
  // by an integration test cannot silently fall back to the author's data.
  const isTest = environment.NODE_ENV === "test" || Boolean(environment.NODE_TEST_CONTEXT);
  const explicitDevelopmentOverride = environment.TIANYAN_PROVIDER_PROFILE_DEV_MODE === "1";
  const authoritativeRoot = path.resolve(defaultProviderAppDataRoot());

  if (configured && !isTest && !explicitDevelopmentOverride) {
    throw new Error("TIANYAN_PROVIDER_APP_DATA_ROOT 仅可在测试或显式 Provider 开发隔离模式中使用。");
  }
  if (configured && isTest && path.resolve(configured) === authoritativeRoot) {
    throw new Error("Provider 测试不得使用权威数据根。");
  }
  if (configured) {
    return freezeResolution({
      rootPath: path.resolve(configured),
      source: isTest ? "test-override" : "development-override",
      scope: isTest ? "test-isolated" : "development-isolated",
      smokeCompatibleByDefault: false,
      compatibilityNotice: "当前 Provider 配置使用隔离根；独立 Smoke 必须显式传入同一 TIANYAN_PROVIDER_APP_DATA_ROOT。"
    });
  }
  if (isTest) {
    const name = safeTestFallbackName(options.testFallbackName);
    return freezeResolution({
      rootPath: path.join(os.tmpdir(), "tianyan-provider-profile-test", name),
      source: "test-fallback",
      scope: "test-isolated",
      smokeCompatibleByDefault: false,
      compatibilityNotice: "当前为测试隔离 Provider 配置，不会被正式 Smoke 读取。"
    });
  }
  return freezeResolution({
    rootPath: authoritativeRoot,
    source: "authoritative-default",
    scope: "authoritative",
    smokeCompatibleByDefault: true,
    compatibilityNotice: null
  });
}

export function providerStoragePaths(rootPath) {
  const resolved = path.resolve(rootPath);
  return Object.freeze({
    appDataRoot: resolved,
    profilePath: path.join(resolved, "provider-profile.json"),
    credentialPath: path.join(resolved, "credentials", "siliconflow.default.credential")
  });
}

function safeTestFallbackName(value) {
  const candidate = String(value || "default").trim();
  return /^[\p{L}\p{N}._-]{1,120}$/u.test(candidate) ? candidate : "default";
}

function freezeResolution(value) {
  return Object.freeze({ version: PROVIDER_APP_DATA_ROOT_VERSION, ...value });
}
