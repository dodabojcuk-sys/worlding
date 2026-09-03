import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TIANYAN_APPROVED_SOURCE_IMPORT_BASE = "588d41171ac4aa3f303087a13039a15082e15073";
export const TIANYAN_ALLOWED_CANONICAL_BRANCHES = ["main", "codex/tianyan-r12b2-narrative-placement-contract-r0"];

/** Read-only guard for local development startup. It rejects archives,
 * successor paths, unapproved worktrees, branches, and ancestry drift. */
export function verifyStoryStudioCanonicalPreflight(cwd = process.cwd()) {
  const root = realpathSync(git(cwd, ["rev-parse", "--show-toplevel"]));
  const actualCwd = realpathSync(cwd);
  const normalized = root.split(path.sep).join("/");
  if (actualCwd !== root) throw new Error("Story Studio dev server must start from the repository root.");
  if (normalized.includes("/codex-workspace-archive/") || normalized.includes("/codex-workspace-successors/")) throw new Error("Story Studio dev server cannot start from an archive or successor path.");
  const commonDirRaw = git(root, ["rev-parse", "--git-common-dir"]);
  const commonDir = realpathSync(path.resolve(root, commonDirRaw));
  const gitDir = realpathSync(path.resolve(root, git(root, ["rev-parse", "--git-dir"])));
  if (gitDir !== commonDir && !gitDir.startsWith(`${commonDir}${path.sep}worktrees${path.sep}`)) throw new Error("Story Studio Git directory is outside the approved repository worktree registry.");
  const branch = git(root, ["branch", "--show-current"]);
  if (!TIANYAN_ALLOWED_CANONICAL_BRANCHES.some((candidate) => candidate === branch)) {
    throw new Error(`Unexpected Story Studio branch: ${branch || "detached"}.`);
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", TIANYAN_APPROVED_SOURCE_IMPORT_BASE, "HEAD"], { cwd: root, stdio: "ignore" });
  } catch {
    throw new Error("Approved source import baseline is missing or is not an ancestor of the current HEAD.");
  }
  return { root, branch, commonDir, gitDir, acceptedBase: TIANYAN_APPROVED_SOURCE_IMPORT_BASE };
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyStoryStudioCanonicalPreflight();
  console.log(`Canonical preflight PASS: ${result.root} (${result.branch})`);
}
