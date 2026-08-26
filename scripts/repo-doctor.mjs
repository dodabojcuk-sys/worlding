#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const canonicalRoot = "/Users/m4-zhi/Documents/codex-workspace/天衍2";
const requestedPorts = [4191, 4192, 4998];

function runGit(args, cwd = process.cwd()) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function currentListeners() {
  return requestedPorts.map((port) => {
    const output = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pcfn"]);
    const records = [];
    let current = null;
    for (const line of output.split("\n")) {
      if (line.startsWith("p")) {
        current = { pid: Number(line.slice(1)), command: "", cwd: null };
        records.push(current);
      } else if (current && line.startsWith("c")) current.command = line.slice(1);
      else if (current && line.startsWith("n")) current.socket = line.slice(1);
    }
    for (const record of records) {
      const cwdOutput = run("lsof", ["-a", "-p", String(record.pid), "-d", "cwd", "-Fn"]);
      record.cwd = cwdOutput.split("\n").find((line) => line.startsWith("n"))?.slice(1) || null;
    }
    return { port, listeners: records };
  });
}

function checked() {
  const cwd = resolve(process.cwd());
  const root = runGit(["rev-parse", "--show-toplevel"], cwd);
  const currentRoot = typeof root === "string" ? root : null;
  const packagePath = currentRoot ? resolve(currentRoot, "package.json") : null;
  let packageIdentity = null;
  if (packagePath) {
    try {
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      packageIdentity = { name: packageJson.name ?? null, productEntry: "apps/story-studio", scripts: Object.keys(packageJson.scripts ?? {}).sort() };
    } catch {
      packageIdentity = { name: null, productEntry: "apps/story-studio", scripts: [] };
    }
  }
  const status = typeof runGit(["status", "--porcelain=v1"], cwd) === "string" ? runGit(["status", "--porcelain=v1"], cwd) : "";
  const worktrees = typeof runGit(["worktree", "list", "--porcelain"], cwd) === "string"
    ? runGit(["worktree", "list", "--porcelain"], cwd).split(/^worktree /m).filter(Boolean).map((entry) => entry.split("\n")[0].trim()).filter(Boolean)
    : [];
  const result = {
    version: "tianyan-repo-doctor-r0",
    canonicalRoot,
    cwd,
    gitRoot: currentRoot,
    gitCommonDir: currentRoot ? runGit(["rev-parse", "--git-common-dir"], cwd) : null,
    workspaceIdentity: currentRoot === canonicalRoot && packageIdentity?.name === "world-os-deterministic-kernel" ? "verified" : "mismatch",
    branch: currentRoot ? runGit(["branch", "--show-current"], cwd) : null,
    head: currentRoot ? runGit(["rev-parse", "HEAD"], cwd) : null,
    tree: currentRoot ? runGit(["rev-parse", "HEAD^{tree}"], cwd) : null,
    status: status === "" ? "clean" : "dirty",
    statusEntries: status ? status.split("\n").filter(Boolean) : [],
    worktreeCount: worktrees.length,
    worktrees,
    remotes: currentRoot ? runGit(["remote"], cwd).split("\n").filter(Boolean) : [],
    packageIdentity,
    listeners: currentListeners()
  };
  result.failClosed = result.workspaceIdentity !== "verified"
    || result.gitRoot !== canonicalRoot
    || result.status !== "clean"
    || result.worktreeCount !== 1
    || result.remotes.length !== 0;
  return result;
}

const result = checked();
const json = process.argv.includes("--json");
if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  process.stdout.write(`Tianyan repo doctor\n`);
  process.stdout.write(`root: ${result.gitRoot ?? "unresolved"}\n`);
  process.stdout.write(`canonical: ${result.canonicalRoot}\n`);
  process.stdout.write(`identity: ${result.workspaceIdentity}\n`);
  process.stdout.write(`branch: ${result.branch ?? "unresolved"}\n`);
  process.stdout.write(`HEAD: ${result.head ?? "unresolved"}\n`);
  process.stdout.write(`tree: ${result.tree ?? "unresolved"}\n`);
  process.stdout.write(`status: ${result.status}; worktrees: ${result.worktreeCount}; remotes: ${result.remotes.length}\n`);
  for (const listener of result.listeners) process.stdout.write(`port ${listener.port}: ${listener.listeners.map((item) => `${item.pid}:${item.command}`).join(", ") || "free"}\n`);
  process.stdout.write(`fail-closed: ${result.failClosed ? "YES" : "NO"}\n`);
}
if (result.failClosed) process.exitCode = 2;
