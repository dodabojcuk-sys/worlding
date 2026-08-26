#!/usr/bin/env node

import { join } from "node:path";
import { readFileSync } from "node:fs";

import { createStoryControlSurface } from "../src/storyControlSurface/storyControlSurface.ts";
import {
  loadStoryControlState,
  saveStoryControlState
} from "../src/storyControlSurface/storyControlSerializer.ts";
import {
  createStoryWorkspace,
  createWorkspaceNote,
  getWorkspaceProjectSummary,
  getWorkspaceTree,
  openStoryWorkspace,
  readWorkspaceNote,
  rebuildWorkspaceIndex,
  updateWorkspaceNote,
  validateStoryWorkspace
} from "../src/storyWorkspace/index.mjs";
import {
  buildNuwaAuthorChangePreview,
  buildNuwaAuthorReview,
  buildStorySnapshot,
  createNuwaExecutionBackend,
  createNuwaPlan,
  createNuwaRunPack,
  executeNuwaPlanWithBackend,
  getNuwaSynthesisReadiness,
  importNuwaResultFile,
  readLatestNuwaRun,
  readNuwaBackendManifest,
  readNuwaRunPack,
  listNuwaExecutionBackends,
  runStoryIntelligenceBenchmark,
  runDeterministicNuwaPlan,
  synthesizeNuwaResults,
  writeNuwaAuthorReview,
  writeNuwaExecutionOutcome,
  writeNuwaPredictionBundle,
  writeNuwaResults
} from "../src/storyIntelligence/index.ts";

const defaultStateFile = join(".world-os", "prototype", "story-control-state.json");

try {
  const parsed = parseArgs(process.argv.slice(2));
  const result = parsed.command === "workspace"
    ? runWorkspaceCommand(parsed.commandArgs, parsed.flags)
    : parsed.command === "nuwa"
      ? await runNuwaCommand(parsed.commandArgs, parsed.flags)
      : runControlSurfaceCommand(parsed);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseArgs(args) {
  const flags = {};
  let actor = "user";
  let stateFile = defaultStateFile;
  const commandParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--state-file") {
      stateFile = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--actor") {
      actor = normalizeActor(requireValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    commandParts.push(arg);
  }

  return {
    command: commandParts[0] || "snapshot",
    commandArgs: commandParts.slice(1),
    actor,
    flags,
    stateFile
  };
}

function runControlSurfaceCommand(parsed) {
  const state = loadStoryControlState(parsed.stateFile);
  const surface = createStoryControlSurface({ actor: parsed.actor, state });
  const result = runCommand(surface, parsed.command, parsed.flags);
  saveStoryControlState(parsed.stateFile, result.state);
  return result;
}

function runCommand(surface, command, flags) {
  if (command === "home") return surface.getProjectHome();
  if (command === "continue") return surface.continueCurrentWriting();
  if (command === "analyze") return surface.analyzeStoryInput({ text: requireFlag(flags, "text", command) });
  if (command === "choose") return surface.chooseStoryPath({ pathId: normalizePathId(requireFlag(flags, "path", command)) });
  if (command === "update-preview") return surface.applyWorldUpdatePreview();
  if (command === "writing-workspace") return surface.enterWritingWorkspace();
  if (command === "draft-workspace") return surface.enterDraftWorkspace();
  if (command === "draft") return surface.updateDraftText({ text: requireFlag(flags, "text", command) });
  if (command === "check-draft") return surface.checkDraftConsistency();
  if (command === "resolve-draft") return surface.resolveDraft({ action: normalizeDraftResolutionAction(requireFlag(flags, "action", command)) });
  if (command === "snapshot") return surface.getCurrentStoryState();

  throw new Error(`Unknown command: ${command}`);
}

function runWorkspaceCommand(commandArgs, flags) {
  const [operation = "", subOperation = ""] = commandArgs;
  const rootPath = flags.path;

  if (operation === "create") {
    const workspace = createStoryWorkspace({
      rootPath: requireFlag(flags, "path", "workspace create"),
      title: requireFlag(flags, "title", "workspace create")
    });
    return workspaceResult("workspace create", "Created a Markdown-first Story World workspace.", workspace);
  }
  if (operation === "open") {
    const workspace = openStoryWorkspace(requireFlag(flags, "path", "workspace open"));
    return workspaceResult("workspace open", "Opened the selected Markdown workspace.", workspace);
  }
  if (operation === "status") {
    const summary = getWorkspaceProjectSummary(requireFlag(flags, "path", "workspace status"));
    return workspaceResult("workspace status", "Read the current workspace summary.", { summary });
  }
  if (operation === "tree") {
    const tree = getWorkspaceTree(requireFlag(flags, "path", "workspace tree"));
    return workspaceResult("workspace tree", "Read the workspace note tree.", tree);
  }
  if (operation === "validate") {
    const validation = validateStoryWorkspace(requireFlag(flags, "path", "workspace validate"));
    return workspaceResult("workspace validate", validation.valid ? "Workspace is valid." : "Workspace has validation errors.", validation);
  }
  if (operation === "reindex") {
    const index = rebuildWorkspaceIndex(requireFlag(flags, "path", "workspace reindex"));
    return workspaceResult("workspace reindex", "Rebuilt the derived Markdown workspace index.", index);
  }
  if (operation === "note" && subOperation === "create") {
    const note = createWorkspaceNote(requireFlag(flags, "path", "workspace note create"), {
      id: requireFlag(flags, "id", "workspace note create"),
      type: requireFlag(flags, "type", "workspace note create"),
      title: requireFlag(flags, "title", "workspace note create"),
      status: flags.status,
      relativePath: flags["relative-path"],
      body: flags.body || ""
    });
    return workspaceResult("workspace note create", "Created a canonical Markdown note.", { note });
  }
  if (operation === "note" && subOperation === "read") {
    const note = readWorkspaceNote(requireFlag(flags, "path", "workspace note read"), requireFlag(flags, "note", "workspace note read"));
    return workspaceResult("workspace note read", "Read a canonical Markdown note.", { note });
  }
  if (operation === "note" && subOperation === "update") {
    const updated = updateWorkspaceNote(requireFlag(flags, "path", "workspace note update"), {
      relativePath: requireFlag(flags, "note", "workspace note update"),
      expectedContentHash: flags["expected-hash"],
      body: requireFlag(flags, "body", "workspace note update")
    });
    return workspaceResult(
      "workspace note update",
      updated.conflict ? "External edit detected; Markdown was not overwritten." : "Updated the canonical Markdown note.",
      updated
    );
  }

  if (rootPath) throw new Error(`Unknown workspace command: ${commandArgs.join(" ")}`);
  throw new Error("Workspace command is required.");
}

async function runNuwaCommand(commandArgs, flags) {
  const [operation = ""] = commandArgs;
  const workspacePath = requireFlag(flags, "workspace", `nuwa ${operation || "command"}`);
  const runId = flags.run;

  if (operation === "backend" && commandArgs[1] === "list") {
    return nuwaResult("nuwa backend list", "Listed the available Nuwa execution backends. Experimental backends remain opt-in.", {
      backends: listNuwaExecutionBackends()
    });
  }

  if (operation === "benchmark") {
    const casesPath = flags.cases || join(process.cwd(), "tests", "fixtures", "story-intelligence-benchmark-v1", "cases.json");
    const cases = JSON.parse(readFileSync(casesPath, "utf8"));
    const outputDirectory = flags.output || join(workspacePath, "output", "story-intelligence-benchmark-v1");
    const benchmark = runStoryIntelligenceBenchmark({ workspacePath, cases, outputDirectory });
    return nuwaResult("nuwa benchmark", "Completed deterministic Story Intelligence benchmark checks. This does not claim model-quality prediction.", { benchmark, outputDirectory });
  }

  if (operation === "plan") {
    const snapshot = buildStorySnapshot({
      workspacePath,
      selectedScenePath: flags.scene
    });
    const plan = createNuwaPlan({
      snapshot,
      authorGoal: requireFlag(flags, "goal", "nuwa plan")
    });
    const run = createNuwaRunPack({ workspacePath, plan, snapshot });
    return nuwaResult("nuwa plan", "Created a read-only Nuwa plan and external-agent run pack.", { run, snapshot });
  }

  const resolvedRunId = runId || readLatestNuwaRun(workspacePath)?.runId;
  if (!resolvedRunId) throw new Error("Nuwa command requires --run when no local Nuwa run exists.");
  const loaded = readNuwaRunPack(workspacePath, resolvedRunId);

  if (operation === "status") {
    const backendManifest = readNuwaBackendManifest(workspacePath, loaded.run.runId);
    const readiness = getNuwaSynthesisReadiness(workspacePath, loaded.run.runId);
    return nuwaResult("nuwa status", "Read Nuwa run status without changing the story workspace.", {
      run: loaded.run,
      resultCount: loaded.results.length,
      hasPredictionBundle: loaded.bundle !== null,
      backend: backendManifest.backend,
      taskStates: backendManifest.executions,
      readiness
    });
  }

  if (operation === "capability-status") {
    const manifest = readNuwaBackendManifest(workspacePath, loaded.run.runId);
    const execution = manifest.executions.find((item) => item.role === "evidence-critic" && item.capability);
    const diagnostic = execution?.capability ?? null;
    return nuwaResult("nuwa capability-status", "Read the bounded story evidence recall status without changing the workspace.", {
      capability: {
        purpose: "Recall bounded story source references for Nuwa evidence review.",
        installed: diagnostic?.compiler.installed ?? false,
        enabled: diagnostic?.compiler.enabled ?? false,
        policy: diagnostic?.compiler.policy ?? "not-evaluated",
        budget: diagnostic?.compiler.budget ?? "not-evaluated",
        lastExecutionStatus: diagnostic?.status ?? "available",
        returnedReferenceCount: diagnostic?.compiler.returnedReferences ?? 0,
        rejectedReferenceCount: diagnostic?.rejectedReferenceCount ?? 0,
        writeAuthority: "none",
        networkAuthority: "none"
      }
    });
  }

  if (operation === "run") {
    assertCurrentSnapshot(workspacePath, loaded.snapshot, loaded.run.selectedScenePath);
    const requestedBackend = flags.backend || flags.runner || "deterministic";
    const backendId = normalizeNuwaBackend(requestedBackend);
    const manifest = readNuwaBackendManifest(workspacePath, loaded.run.runId);
    const outcome = await executeNuwaPlanWithBackend({
      plan: loaded.run.plan,
      snapshot: loaded.snapshot,
      backend: createNuwaExecutionBackend({ id: backendId }),
      profile: normalizeProfile(flags.profile),
      cachedResults: manifest.cache
    });
    const run = writeNuwaExecutionOutcome({
      workspacePath,
      runId: loaded.run.runId,
      outcome
    });
    const finalManifest = readNuwaBackendManifest(workspacePath, loaded.run.runId);
    const readiness = getNuwaSynthesisReadiness(workspacePath, loaded.run.runId);
    return nuwaResult("nuwa run", outcome.completed
      ? "Completed bounded Nuwa specialist tasks. No story content was changed."
      : "Recorded a bounded backend outcome. External results still require validation and synthesis.", {
      run,
      outcome: { ...outcome, taskStates: finalManifest.executions, readiness },
      results: finalManifest.executions.flatMap((execution) => execution.status === "accepted-by-nuwa" && execution.result ? [execution.result] : [])
    });
  }

  if (operation === "export-tasks") {
    const runPath = join(workspacePath, ".world-os", "runs", "nuwa", loaded.run.runId, "tasks");
    return nuwaResult("nuwa export-tasks", "Exported the existing bounded task files for external execution. No external backend was called.", {
      run: loaded.run,
      taskDirectory: runPath,
      taskFiles: loaded.run.plan.tasks.map((task) => `${task.role}.md`)
    });
  }

  if (operation === "validate-results") {
    assertCurrentSnapshot(workspacePath, loaded.snapshot, loaded.run.selectedScenePath);
    const readiness = getNuwaSynthesisReadiness(workspacePath, loaded.run.runId);
    if (!readiness.canSynthesize) throw new Error(`Nuwa results are not ready for synthesis. Missing required roles: ${readiness.missingRequiredRoles.join(", ") || "none"}.`);
    const bundle = synthesizeNuwaResults({ plan: loaded.run.plan, snapshot: loaded.snapshot, results: loaded.results });
    return nuwaResult("nuwa validate-results", "Validated imported task results against the existing Nuwa plan without writing a prediction bundle.", {
      run: loaded.run,
      validResultCount: loaded.results.length,
      branchCount: bundle.branches.length
    });
  }

  if (operation === "import-result") {
    assertCurrentSnapshot(workspacePath, loaded.snapshot, loaded.run.selectedScenePath);
    const run = importNuwaResultFile({
      workspacePath,
      runId: loaded.run.runId,
      filePath: requireFlag(flags, "file", "nuwa import-result")
    });
    return nuwaResult("nuwa import-result", "Imported one external result for later validation and synthesis.", { run });
  }

  if (operation === "synthesize") {
    assertCurrentSnapshot(workspacePath, loaded.snapshot, loaded.run.selectedScenePath);
    const readiness = getNuwaSynthesisReadiness(workspacePath, loaded.run.runId);
    if (!readiness.canSynthesize) throw new Error(`Nuwa synthesis is blocked. Missing required roles: ${readiness.missingRequiredRoles.join(", ") || "none"}.`);
    const bundle = synthesizeNuwaResults({
      plan: loaded.run.plan,
      snapshot: loaded.snapshot,
      results: loaded.results
    });
    const run = writeNuwaPredictionBundle({ workspacePath, runId: loaded.run.runId, bundle });
    return nuwaResult("nuwa synthesize", "Built evidence-backed candidate paths for author review.", { run, bundle });
  }

  if (operation === "report") {
    if (!loaded.bundle) throw new Error("Nuwa report requires a synthesized prediction bundle.");
    return nuwaResult("nuwa report", "Read the Nuwa prediction bundle. Author review is still required.", {
      run: loaded.run,
      bundle: loaded.bundle
    });
  }

  if (operation === "author-review") {
    if (!loaded.bundle) throw new Error("Nuwa author-review requires a synthesized prediction bundle.");
    assertCurrentSnapshot(workspacePath, loaded.snapshot, loaded.run.selectedScenePath);
    const review = buildNuwaAuthorReview({
      snapshot: loaded.snapshot,
      bundle: loaded.bundle,
      branchId: requireFlag(flags, "branch", "nuwa author-review")
    });
    writeNuwaAuthorReview({ workspacePath, runId: loaded.run.runId, review });
    return nuwaResult("nuwa author-review", "Prepared the selected path for the existing author decision workspace.", { review });
  }

  if (operation === "preview") {
    if (!loaded.bundle) throw new Error("Nuwa preview requires a synthesized prediction bundle.");
    assertCurrentSnapshot(workspacePath, loaded.snapshot, loaded.run.selectedScenePath);
    const review = buildNuwaAuthorChangePreview({
      snapshot: loaded.snapshot,
      bundle: loaded.bundle,
      branchId: requireFlag(flags, "branch", "nuwa preview"),
      decisionOptionId: requireFlag(flags, "decision", "nuwa preview"),
      authorNotes: flags.note ? [flags.note] : []
    });
    return nuwaResult("nuwa preview", "Created a read-only existing Story Change Preview. Markdown remains unchanged.", { preview: review });
  }

  throw new Error(`Unknown Nuwa command: ${operation}.`);
}

function assertCurrentSnapshot(workspacePath, snapshot, selectedScenePath) {
  const current = buildStorySnapshot({ workspacePath, selectedScenePath: selectedScenePath || undefined });
  if (current.snapshotHash !== snapshot.snapshotHash) {
    throw new Error("Nuwa run is stale because the Markdown workspace changed. Create a new plan before continuing.");
  }
}

function nuwaResult(command, summary, data) {
  return {
    version: "world-os-story-nuwa-cli-v1",
    command,
    summary,
    data
  };
}

function workspaceResult(command, summary, data) {
  return {
    version: "world-os-story-workspace-cli-v1",
    command,
    summary,
    data
  };
}

function normalizeActor(raw) {
  if (raw === "user" || raw === "codex" || raw === "api" || raw === "skill" || raw === "playwright") return raw;

  throw new Error(`Unknown actor: ${raw}`);
}

function normalizeDraftResolutionAction(raw) {
  if (raw === "revise") return "revise";
  if (raw === "mark_ready" || raw === "mark-ready") return "mark_ready";
  if (raw === "review_impact" || raw === "review-impact") return "review_impact";

  throw new Error(`Unknown draft resolution action: ${raw}`);
}

function normalizePathId(raw) {
  if (raw === "partial_clue" || raw === "partial-clue") return "partial_clue";
  if (raw === "delayed_reveal" || raw === "delayed-reveal") return "delayed_reveal";
  if (raw === "keep_current_world" || raw === "keep-current-world") return "keep_current_world";

  throw new Error(`Unknown path id: ${raw}`);
}

function normalizeNuwaBackend(raw) {
  if (raw === "deterministic" || raw === "external-run-pack" || raw === "codex-cli") return raw;
  if (raw === "external") return "external-run-pack";
  throw new Error(`Unknown Nuwa backend: ${raw}`);
}

function normalizeProfile(raw) {
  if (!raw || raw === "balanced") return "balanced";
  if (raw === "economy" || raw === "quality") return raw;
  throw new Error(`Unknown Nuwa execution profile: ${raw}`);
}

function requireFlag(flags, name, command) {
  const value = flags[name];

  if (!value) throw new Error(`Command "${command}" requires --${name}.`);

  return value;
}

function requireValue(args, index, name) {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);

  return value;
}
