import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceFiles = [
  "src/domainTemplates/storyWorld/evidence/evidenceProjection.ts",
  "src/domainTemplates/storyWorld/evidence/evidenceResolver.ts",
  "src/domainTemplates/storyWorld/evidence/evidenceTypes.ts",
  "src/domainTemplates/storyWorld/evidence/index.ts"
] as const;

test("clean Git artifact contains the complete story evidence source boundary", async () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "tianyan-story-evidence-git-artifact-"));

  try {
    const requestedTreeish = process.env.TIANYAN_CLEAN_ARTIFACT_TREEISH?.trim() || "HEAD";
    const resolvedTree = runChecked("git", [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${requestedTreeish}^{tree}`
    ]).stdout.trim();
    assert.match(resolvedTree, /^[0-9a-f]{40}$/u, "treeish must resolve to one Git tree");

    const archivePath = path.join(temporaryRoot, "repository.tar");
    const artifactRoot = path.join(temporaryRoot, "artifact");
    mkdirSync(artifactRoot);

    runChecked("git", ["archive", "--format=tar", `--output=${archivePath}`, resolvedTree]);
    runChecked("tar", ["-xf", archivePath, "-C", artifactRoot]);

    for (const relativePath of evidenceFiles) {
      const artifactPath = path.join(artifactRoot, relativePath);
      assert.equal(existsSync(artifactPath), true, `${relativePath} must exist in the clean Git artifact`);
      assert.equal(statSync(artifactPath).isFile(), true, `${relativePath} must be a regular file`);
    }

    assert.equal(existsSync(path.join(artifactRoot, "node_modules")), false);

    const evidenceIndexUrl = pathToFileURL(
      path.join(artifactRoot, "src/domainTemplates/storyWorld/evidence/index.ts")
    ).href;
    const evidenceModule = await import(evidenceIndexUrl);
    assert.equal(typeof evidenceModule.resolveStoryEvidenceBundle, "function");
    assert.equal(typeof evidenceModule.projectStoryEvidenceForAuthor, "function");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

function runChecked(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env
  });

  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed with status ${String(result.status)}: ${result.stderr || result.error?.message || "no stderr"}`
  );

  return result;
}
