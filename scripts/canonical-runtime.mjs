const REQUIRED_NODE_MAJOR = 22;
const REQUIRED_NPM_MAJOR = 10;

export { REQUIRED_NODE_MAJOR, REQUIRED_NPM_MAJOR };

export function inspectCanonicalRuntime({ nodeVersion = process.versions.node, npmUserAgent = process.env.npm_config_user_agent || "", nodeExecutable = process.execPath } = {}) {
  const nodeMajor = Number.parseInt(String(nodeVersion).split(".")[0] || "", 10);
  const npmMatch = String(npmUserAgent).match(/(?:^|\s)npm\/(\d+)(?:\.\d+){0,2}(?:\s|$)/u);
  const npmMajor = npmMatch ? Number.parseInt(npmMatch[1], 10) : null;
  const issues = [];
  if (nodeMajor !== REQUIRED_NODE_MAJOR) issues.push(`Node ${REQUIRED_NODE_MAJOR} is required; detected ${nodeVersion || "unknown"}.`);
  if (npmMajor !== REQUIRED_NPM_MAJOR) issues.push(`npm ${REQUIRED_NPM_MAJOR} is required; detected ${npmMajor == null ? "unknown" : npmMajor}.`);
  return {
    nodeVersion: String(nodeVersion || "unknown"),
    nodeMajor: Number.isFinite(nodeMajor) ? nodeMajor : null,
    nodeExecutable,
    npmUserAgent: String(npmUserAgent || "(missing)"),
    npmMajor,
    issues
  };
}

export function assertCanonicalRuntime(input = {}) {
  const diagnostics = inspectCanonicalRuntime(input);
  const write = input.write || console.log;
  write(`[tianyan runtime] node=${diagnostics.nodeVersion} (${diagnostics.nodeExecutable}); npm=${diagnostics.npmMajor ?? "unknown"}`);
  if (diagnostics.issues.length > 0) {
    throw new Error([
      "Tianyan acceptance must run with the repository toolchain: Node 22 and npm 10.",
      ...diagnostics.issues,
      `npm user agent: ${diagnostics.npmUserAgent}`,
      "Fix: install/select Node 22, then activate npm 10 (for example: nvm install 22 && nvm use 22 && corepack prepare npm@10 --activate).",
      "Re-run the package command only after both versions are active."
    ].join("\n"));
  }
  return diagnostics;
}
