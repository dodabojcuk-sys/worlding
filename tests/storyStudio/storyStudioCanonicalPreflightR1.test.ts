import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TIANYAN_APPROVED_SOURCE_IMPORT_BASE,
  TIANYAN_ALLOWED_CANONICAL_BRANCHES,
  verifyStoryStudioCanonicalPreflight
} from "../../scripts/verify-story-studio-canonical.mjs";

const sourceRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const roots: string[] = [];

test("development preflight accepts only an independent master descended from the approved source import", () => {
  assert.deepEqual(TIANYAN_ALLOWED_CANONICAL_BRANCHES, ["master"]);
  assert.equal(TIANYAN_APPROVED_SOURCE_IMPORT_BASE, "a86f64cd9c527b06980b5934759feadedb3cdc19");
  const repository = cloneRepository("accepted");
  const result = verifyStoryStudioCanonicalPreflight(repository);
  assert.equal(result.root, repository);
  assert.equal(result.commonDir, path.join(repository, ".git"));
  assert.equal(result.branch, "master");
  assert.equal(result.acceptedBase, TIANYAN_APPROVED_SOURCE_IMPORT_BASE);
});

test("development preflight rejects non-root, archive, and successor locations", () => {
  const repository = cloneRepository("wrong-cwd");
  const child = path.join(repository, "tests");
  assert.throws(() => verifyStoryStudioCanonicalPreflight(child), /must start from the repository root/u);

  for (const forbidden of ["codex-workspace-archive", "codex-workspace-successors"]) {
    const parent = temporaryRoot(`forbidden-${forbidden}`);
    const forbiddenParent = path.join(parent, forbidden);
    mkdirSync(forbiddenParent);
    const forbiddenRepository = cloneRepositoryInto(forbiddenParent, "repository");
    assert.throws(() => verifyStoryStudioCanonicalPreflight(forbiddenRepository), /cannot start from an archive or successor path/u);
  }
});

test("development preflight rejects linked worktrees and shared common dirs", () => {
  const repository = cloneRepository("linked-source");
  const linkedRoot = temporaryRoot("linked-target");
  const linked = path.join(linkedRoot, "worktree");
  git(repository, ["worktree", "add", "--quiet", "-b", "linked", linked]);
  assert.throws(() => verifyStoryStudioCanonicalPreflight(linked), /must use its own independent \.git directory/u);
});

test("development preflight rejects detached HEAD and every non-approved branch", () => {
  const detached = cloneRepository("detached");
  git(detached, ["checkout", "--quiet", "--detach"]);
  assert.throws(() => verifyStoryStudioCanonicalPreflight(detached), /Unexpected Story Studio branch: detached/u);

  for (const branch of ["main", "codex/portable-repair", "feature/test"]) {
    const repository = cloneRepository(`branch-${branch.replaceAll("/", "-")}`);
    git(repository, ["checkout", "--quiet", "-b", branch]);
    assert.throws(() => verifyStoryStudioCanonicalPreflight(repository), new RegExp(`Unexpected Story Studio branch: ${escapeRegExp(branch)}`, "u"));
  }
});

test("development preflight rejects a missing approved base and a non-ancestor base", () => {
  const missingBase = temporaryRoot("missing-base");
  const repository = path.join(missingBase, "repository");
  mkdirSync(repository);
  git(repository, ["init", "--quiet", "--initial-branch=master"]);
  configureIdentity(repository);
  writeFileSync(path.join(repository, "README.md"), "independent fixture\n", "utf8");
  git(repository, ["add", "README.md"]);
  git(repository, ["commit", "--quiet", "-m", "fixture root"]);
  assert.throws(() => verifyStoryStudioCanonicalPreflight(repository), /baseline is missing or is not an ancestor/u);

  const nonAncestor = cloneRepository("non-ancestor");
  git(nonAncestor, ["checkout", "--quiet", "--orphan", "replacement"]);
  git(nonAncestor, ["rm", "--quiet", "-r", "--force", "--ignore-unmatch", "."]);
  writeFileSync(path.join(nonAncestor, "README.md"), "unrelated history\n", "utf8");
  git(nonAncestor, ["add", "README.md"]);
  git(nonAncestor, ["commit", "--quiet", "-m", "unrelated root"]);
  git(nonAncestor, ["branch", "-M", "master"]);
  assert.doesNotThrow(() => git(nonAncestor, ["cat-file", "-e", `${TIANYAN_APPROVED_SOURCE_IMPORT_BASE}^{commit}`]));
  assert.throws(() => verifyStoryStudioCanonicalPreflight(nonAncestor), /baseline is missing or is not an ancestor/u);
});

test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function cloneRepository(name: string): string {
  return cloneRepositoryInto(temporaryRoot(name), "repository");
}

function cloneRepositoryInto(parent: string, name: string): string {
  const target = path.join(parent, name);
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", sourceRoot, target], { stdio: "ignore" });
  configureIdentity(target);
  return realpathSync(target);
}

function temporaryRoot(name: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `tianyan-canonical-${name}-`));
  roots.push(root);
  return root;
}

function configureIdentity(repository: string): void {
  git(repository, ["config", "user.name", "Tianyan Test"]);
  git(repository, ["config", "user.email", "tianyan-test@example.invalid"]);
}

function git(repository: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
