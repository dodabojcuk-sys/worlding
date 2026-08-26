/**
 * Projects an integrity-verified installed package into adapter discovery.
 * R0 intentionally exposes no execute function: Node/CLI packages are
 * EXTERNAL_EXECUTABLE and consumer execution remains unavailable until the
 * approved OS capability runtime exists.
 */
export function createInstalledCreationPluginAdapter(entry) {
  const { manifest } = entry;
  return {
    descriptor: {
      adapterId: manifest.pluginId,
      displayName: manifest.displayName,
      adapterVersion: manifest.pluginVersion,
      sourceRepository: manifest.upstreamRepository,
      sourceCommit: manifest.upstreamCommitOrRelease,
      license: manifest.licenseSpdx,
      transport: manifest.pluginKind === "export_only" ? "export_only" : "local_cli",
      capabilities: manifest.capabilities,
      acceptedStoryPackageVersions: ["tianyan-neutral-story-package/v1"],
      outputArtifactTypes: manifest.capabilities,
      configurationSchema: {},
      availability: "unavailable",
      health: "unhealthy",
      requirementSummary: "已安装但不可执行；R0 尚未提供真实操作系统能力隔离。"
    }
  };
}
