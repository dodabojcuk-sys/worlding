#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const canonicalRoot = "/Users/m4-zhi/Documents/codex-workspace/天衍2";
const scanRoot = "/Users/m4-zhi/Documents/codex-workspace";
const outputPath = resolve(canonicalRoot, "output/inventory/tianyan-storage-inventory.json");
const reportPath = resolve(canonicalRoot, "docs/ops/TIANYAN_REPOSITORY_AND_STORAGE_INVENTORY_R0.md");

function command(commandName, args, cwd) {
  try { return execFileSync(commandName, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { return ""; }
}

function sizeBytes(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return 0;
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
    return readdirSync(path, { withFileTypes: true }).reduce((sum, entry) => sum + sizeBytes(join(path, entry.name)), 0);
  } catch { return 0; }
}

function directorySize(path, name) {
  const target = join(path, name);
  return existsSync(target) ? sizeBytes(target) : 0;
}

function gitInfo(path) {
  const root = command("git", ["-C", path, "rev-parse", "--show-toplevel"]);
  if (!root) return { kind: "non-git-carrier", branch: null, head: null, status: null, worktree: null, remote: [] };
  const status = command("git", ["-C", path, "status", "--porcelain=v1"]);
  return {
    kind: root === canonicalRoot ? "canonical" : "historical-repository",
    repoRoot: root,
    branch: command("git", ["-C", path, "branch", "--show-current"]) || null,
    head: command("git", ["-C", path, "rev-parse", "HEAD"]) || null,
    tree: command("git", ["-C", path, "rev-parse", "HEAD^{tree}"]) || null,
    status: status ? "dirty" : "clean",
    statusEntries: status ? status.split("\n").filter(Boolean).slice(0, 30) : [],
    worktree: command("git", ["-C", path, "worktree", "list", "--porcelain"]).split(/^worktree /m).filter(Boolean).length || 1,
    remote: command("git", ["-C", path, "remote"]).split("\n").filter(Boolean)
  };
}

function classify(path, rootName) {
  if (path === canonicalRoot) return { type: "canonical", recommendation: "keep" };
  if (rootName === "codex-workspace-successors" || /successor|recovery|consolidat|author-surface|unit-data|shell-information/i.test(path)) return { type: "historical repository", recommendation: "read-only archive" };
  if (/evidence|screenshot|recording|video|playwright/i.test(path)) return { type: "evidence", recommendation: "keep until gate retention review" };
  if (/node_modules|dist|build|coverage|cache|\.cache/i.test(path)) return { type: "cache", recommendation: "rebuild candidate" };
  return { type: "unknown", recommendation: "manual confirmation" };
}

function collectCandidates() {
  const candidates = [{ path: canonicalRoot, rootName: "codex-workspace" }];
  const entries = readdirSync(scanRoot, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(scanRoot, entry.name);
    if (path === canonicalRoot || !entry.isDirectory()) continue;
    if (entry.name === "codex-workspace-successors") {
      for (const child of readdirSync(path, { withFileTypes: true })) {
        if (child.isDirectory() && /天衍|tianyan/i.test(child.name)) candidates.push({ path: join(path, child.name), rootName: entry.name });
      }
      continue;
    }
    if (/天衍|tianyan|Tianyan-Workspace/i.test(entry.name)) candidates.push({ path, rootName: entry.name });
  }
  return candidates;
}

function buildEntry(candidate) {
  const classification = classify(candidate.path, candidate.rootName);
  const git = gitInfo(candidate.path);
  const total = sizeBytes(candidate.path);
  const breakdown = {
    git: directorySize(candidate.path, ".git"),
    nodeModules: directorySize(candidate.path, "node_modules"),
    output: directorySize(candidate.path, "output"),
    screenshots: directorySize(candidate.path, "screenshots"),
    recordings: directorySize(candidate.path, "recordings"),
    coverage: directorySize(candidate.path, "coverage"),
    dist: directorySize(candidate.path, "dist"),
    cache: directorySize(candidate.path, ".cache")
  };
  return {
    absolutePath: candidate.path,
    realpath: command("realpath", [candidate.path]) || candidate.path,
    type: classification.type,
    totalBytes: total,
    breakdown,
    git,
    trackedMarkdownDeleted: false,
    referencedByCanonicalDocs: candidate.path === canonicalRoot,
    recommendation: classification.recommendation,
    deletion: "not performed; requires Founder confirmation"
  };
}

const entries = collectCandidates().map(buildEntry).sort((left, right) => left.absolutePath.localeCompare(right.absolutePath));
const totalBytes = entries.reduce((sum, entry) => sum + entry.totalBytes, 0);
const safeCleanupBytes = entries.reduce((sum, entry) => sum + ["output", "coverage", "dist", "cache"].reduce((inner, key) => inner + entry.breakdown[key], 0), 0);
const inventory = {
  version: "tianyan-storage-inventory-r0",
  generatedAt: new Date().toISOString(),
  scanRoot,
  canonicalRoot,
  scope: "Only Tianyan-named directories under codex-workspace were inspected; unrelated projects were not opened or modified.",
  totalBytes,
  safeCleanupCandidateBytes: safeCleanupBytes,
  repositoriesDeleted: 0,
  trackedDocsDeleted: 0,
  evidenceDeleted: 0,
  entries
};

mkdirSync(join(canonicalRoot, "output/inventory"), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
const gb = (bytes) => (bytes / (1024 ** 3)).toFixed(3);
const lines = [
  "# Tianyan Repository and Storage Inventory R0",
  "",
  `Generated: ${inventory.generatedAt}`,
  "",
  `- Scan root: ${scanRoot}`,
  `- Canonical root: ${canonicalRoot}`,
  `- Scope: ${inventory.scope}`,
  `- Total inspected size: ${gb(totalBytes)} GB`,
  `- Rebuildable cleanup candidate estimate: ${gb(safeCleanupBytes)} GB`,
  "- Repositories deleted: 0",
  "- Tracked Markdown deleted: 0",
  "- Evidence deleted: 0",
  "",
  "No deletion, Trash cleanup, repository move, or tracked-document removal was performed.",
  "",
  "| Path | Type | Size | Git | Branch / HEAD | Status | Recommendation |",
  "| --- | --- | ---: | --- | --- | --- | --- |",
  ...entries.map((entry) => `| ${entry.absolutePath} | ${entry.type} | ${gb(entry.totalBytes)} GB | ${entry.git.kind} | ${entry.git.branch || "—"} / ${(entry.git.head || "—").slice(0, 12)} | ${entry.git.status || "—"} | ${entry.recommendation} |`),
  "",
  "## Retention rule",
  "",
  "Formal gates retain one key screenshot set. Long recordings are compression/external-storage candidates; Playwright temporary output, coverage, dist, and caches are rebuildable. Accepted ADRs, Decisions, Acceptance reports, and referenced evidence are retained until Founder confirms a retirement plan.",
  "",
  "## Next review",
  "",
  "The inventory is evidence only. Any cleanup requires a separate, explicit review that proves reconstruction, preserves rollback artifacts, and excludes unrelated projects."
];
writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${reportPath}\n${outputPath}\n`);
