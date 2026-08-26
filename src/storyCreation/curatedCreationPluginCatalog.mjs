/**
 * Product-visible metadata for reviewed plugins. packagePath is intentionally
 * absent in a normal runtime: R0 does not claim that a production catalog has
 * been published. Tests may inject a local, temporary catalog file instead.
 */
export const DEFAULT_CURATED_CREATION_PLUGIN_CATALOG = [{
  manifest: {
    schemaVersion: "tianyan-creation-plugin-package/v1",
    pluginId: "fountain-js",
    displayName: "Fountain.js",
    pluginVersion: "1.2.4",
    releaseSequence: 1,
    description: "将已确认的故事包整理为剧本交付格式。",
    publisher: "Tianyan Curated",
    upstreamRepository: "https://github.com/jonnygreenwald/fountain-js",
    upstreamCommitOrRelease: "a0e57b77344c4fc333bd3ca2a653a58a9d62e0c1",
    licenseSpdx: "MIT",
    licenseNotice: "MIT license notice is retained with the curated package.",
    capabilities: ["screenplay"],
    pluginKind: "local_cli",
    supportedPlatforms: ["darwin", "linux"],
    packageSha256: `sha256:${"0".repeat(64)}`,
    entrypoint: "host.mjs",
    runtime: "node",
    runtimeClass: "external_executable",
    permissions: ["package-read", "process-execute"],
    resourceLimits: { timeoutMs: 30000, maxOutputBytes: 524288 },
    expectedArtifacts: ["text/html"],
    healthCheck: "entrypoint-present",
    minimumTianyanVersion: "0.1.0",
    installMode: "curated-local-package",
    updateChannel: "stable",
    externalServiceRequired: false,
    modelManagedByTianyan: false
  },
  packagePath: null
}];
