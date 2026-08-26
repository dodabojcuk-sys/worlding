import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TIANYAN_ACCEPTED_FOUNDER_BASE = "ed4981c31722cfc57e706c34a5a9f696b1ae614b";
export const TIANYAN_ALLOWED_CANONICAL_BRANCHES = [
  "codex/tianyan-founder-target-integration-r0",
  "codex/tianyan-tianyi-primary-workspace-recovery-r0"
];

/** Read-only guard for local development startup. It rejects archives,
 * successor worktrees, linked common dirs, and ancestry drift. */
export function verifyStoryStudioCanonicalPreflight(cwd = process.cwd()) {
  const root = realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]));
  const actualCwd = realpathSync(cwd);
  const commonDirRaw = git(cwd, ["rev-parse", "--git-common-dir"]);
  const commonDir = realpathSync(path.resolve(root, commonDirRaw));
  const ownGitDir = realpathSync(path.join(root, ".git"));
  const branch = git(cwd, ["branch", "--show-current"]);
  const normalized = root.split(path.sep).join("/");
  if (actualCwd !== root) throw new Error("Story Studio dev server must start from the repository root.");
  if (normalized.includes("/codex-workspace-archive/") || normalized.includes("/codex-workspace-successors/")) throw new Error("Story Studio dev server cannot start from an archive or successor path.");
  if (commonDir !== ownGitDir) throw new Error("Story Studio canonical must use its own independent .git directory.");
  if (!TIANYAN_ALLOWED_CANONICAL_BRANCHES.some((candidate) => candidate === branch)) {
    throw new Error(`Unexpected Story Studio branch: ${branch || "detached"}.`);
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", TIANYAN_ACCEPTED_FOUNDER_BASE, "HEAD"], { cwd: root, stdio: "ignore" });
  } catch {
    throw new Error("Accepted Founder baseline is not an ancestor of the current HEAD.");
  }
  return { root, branch, commonDir, acceptedBase: TIANYAN_ACCEPTED_FOUNDER_BASE };
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyStoryStudioCanonicalPreflight();
  console.log(`Canonical preflight PASS: ${result.root} (${result.branch})`);
}
