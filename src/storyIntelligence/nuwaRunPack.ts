import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { publishFileNoReplace, replaceFileAtomically } from "../storyControlSurface/atomicNoReplaceFile.ts";
import { serializeStoryMarkdown } from "../storyWorkspace/index.mjs";
import { stableJson } from "./storySnapshotBuilder.ts";
import { buildNuwaTaskContextPack } from "./nuwaTaskContextPack.ts";
import { assertNuwaAttentionContextCurrent, normalizeNuwaAttentionContext, type NuwaAttentionContext } from "./nuwaAttentionContext.ts";
import { buildNuwaCacheIdentity, sanitizeDiagnostic, stableCacheKey } from "./nuwaExecutionBackend.ts";
import { validateNuwaAgentResult } from "./nuwaSynthesis.ts";
import { readExecutionBriefRevision, readExecutionBriefRunBinding } from "./tianyiNuwaBridgeRepository.ts";
import {
  NUWA_REHEARSAL_READ_MODEL_VERSION,
  NUWA_REHEARSAL_REVISION_VERSION,
  assertNuwaRehearsalInheritance,
  normalizeNuwaRehearsalRevision,
  parseNuwaRehearsalRevision,
  type NuwaRehearsalAgentResolver,
  type NuwaRehearsalReadModel,
  type NuwaRehearsalRevision
} from "./nuwaRehearsalContract.ts";
import type { NuwaBackendDescriptor, NuwaCacheEntry, NuwaExecutionEvent, NuwaExecutionOutcome, NuwaTaskExecution } from "./nuwaExecutionBackend.ts";
import type {
  NuwaAgentResult,
  NuwaAgentTask,
  NuwaPlan,
  NuwaRunRecord,
  StoryPredictionBundle,
  StorySnapshot
} from "./storyIntelligenceTypes.ts";
import { createNuwaDirectorStateR1, validateNuwaDirectorStateR1, type NuwaDirectorStateR1 } from "./nuwaDelegationPolicyR1.ts";

const RUNS_ROOT = path.join(".world-os", "runs", "nuwa");

/**
 * A standalone rehearsal belongs to the existing Run Pack.  It deliberately
 * captures a bounded local sandbox rather than registering a second world,
 * object collection, or long-lived Agent profile.
 */
export const NUWA_STANDALONE_SANDBOX_VERSION = "story-studio-nuwa-standalone-sandbox/v1" as const;

export type NuwaStandaloneSandboxAgent = {
  id: string;
  kind: "existing-character" | "temporary-character";
  displayName: string;
  objectId: string | null;
  sourceRevision: string | null;
  goal: string;
  disposition: string;
  knownInformation: string;
  unknownInformation: string;
  sourceExcerpt: string;
};

export type NuwaStandaloneSandboxContext = {
  version: typeof NUWA_STANDALONE_SANDBOX_VERSION;
  runId: string;
  story: string;
  authorGoal: string;
  preservedFacts: string[];
  boundaries: string[];
  depth: "short" | "medium" | "long";
  agents: NuwaStandaloneSandboxAgent[];
  createdAt: string;
  updatedAt: string;
};

export function createNuwaRunPack(input: {
  workspacePath: string;
  plan: NuwaPlan;
  snapshot: StorySnapshot;
  /** Child candidate packs must not steal the parent/latest pointer. */
  updateLatest?: boolean;
  attentionContext?: NuwaAttentionContext;
}): NuwaRunRecord {
  if (input.plan.snapshotHash !== input.snapshot.snapshotHash) {
    throw new Error("Nuwa run pack requires a plan created from the supplied Story Snapshot.");
  }
  const runPath = nuwaRunPath(input.workspacePath, input.plan.runId);
  if (existsSync(runPath)) {
    throw new Error(`Nuwa run already exists: ${input.plan.runId}.`);
  }
  if (input.attentionContext) assertNuwaAttentionContextCurrent(input.attentionContext, input.snapshot.snapshotHash);

  mkdirSync(path.join(runPath, "tasks"), { recursive: true });
  mkdirSync(path.join(runPath, "results"), { recursive: true });
  mkdirSync(path.join(runPath, "report"), { recursive: true });
  mkdirSync(path.join(runPath, "backend"), { recursive: true });
  mkdirSync(path.join(runPath, "backend", "imports"), { recursive: true });
  const record: NuwaRunRecord = {
    version: "world-os-nuwa-run-v1",
    runId: input.plan.runId,
    snapshotHash: input.snapshot.snapshotHash,
    authorGoal: input.plan.authorGoal,
    selectedScenePath: input.snapshot.currentScene?.relativePath ?? null,
    status: "planned",
    plan: structuredClone(input.plan),
    resultTaskIds: [],
    authorConfirmationRequired: true,
    runner: input.plan.runner
  };

  writeStableJson(path.join(runPath, "run.json"), record);
  writeStableJson(path.join(runPath, "snapshot.json"), input.snapshot);
  if (input.attentionContext) writeStableJson(path.join(runPath, "attention-context.json"), input.attentionContext);
  writeStableJson(path.join(runPath, "backend", "manifest.json"), {
    version: "world-os-nuwa-backend-manifest-v1",
    backend: {
      id: "deterministic",
      label: "本地规则推演",
      availability: "available",
      optInRequired: false,
      remoteExecution: false,
      supportsExport: false,
      implementationVersion: "deterministic-v2-story-memory-recall-v1",
      modelIdentity: "deterministic-rules-v1:pending-run-configuration"
    },
    executions: [],
    cache: {}
  });
  writeAtomic(path.join(runPath, "events.jsonl"), "");
  if (input.updateLatest !== false) {
    writeStableJson(path.join(path.resolve(input.workspacePath), RUNS_ROOT, "latest.json"), {
      version: "world-os-nuwa-latest-run-v1",
      runId: record.runId
    });
  }
  for (const task of input.plan.tasks) {
    writeTaskMarkdown(path.join(runPath, "tasks", `${task.role}.md`), task, input.plan, input.snapshot);
  }
  return structuredClone(record);
}

export function readNuwaRunPack(workspacePath: string, runId: string): {
  run: NuwaRunRecord;
  snapshot: StorySnapshot;
  results: NuwaAgentResult[];
  bundle: StoryPredictionBundle | null;
  events: NuwaExecutionEvent[];
  rehearsal: NuwaRehearsalReadModel;
  attentionContext: NuwaAttentionContext | null;
  providerPilotReceipt: unknown | null;
  directorState: NuwaDirectorStateR1;
} {
  const runPath = nuwaRunPath(workspacePath, runId);
  const run = readJson<NuwaRunRecord>(path.join(runPath, "run.json"));
  const snapshot = readJson<StorySnapshot>(path.join(runPath, "snapshot.json"));
  const resultsPath = path.join(runPath, "results");
  const results = existsSync(resultsPath)
    ? readdirSync(resultsPath)
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .map((entry) => readJson<NuwaAgentResult>(path.join(resultsPath, entry)))
    : [];
  const bundlePath = path.join(runPath, "report", "prediction-bundle.json");
  const bundle = existsSync(bundlePath) ? readJson<StoryPredictionBundle>(bundlePath) : null;
  const events = readNuwaExecutionEvents(runPath, runId);
  const rehearsal = readNuwaRehearsalHistory(workspacePath, runId);
  const attentionPath = path.join(runPath, "attention-context.json");
  const attentionContext = existsSync(attentionPath) ? normalizeNuwaAttentionContext(readJson<unknown>(attentionPath)) : null;
  const providerPilotPath = path.join(runPath, "backend", "provider-pilot-receipt.json");
  const providerPilotReceipt = existsSync(providerPilotPath) ? readJson<unknown>(providerPilotPath) : null;
  const directorState = readNuwaDirectorStateR1(workspacePath, runId);

  return { run, snapshot, results, bundle, events, rehearsal, attentionContext, providerPilotReceipt, directorState };
}

/** Director delegation is a Run-local control record inside the existing Run
 * Pack. A missing record projects conservative defaults without writing. */
export function readNuwaDirectorStateR1(workspacePath: string, runId: string): NuwaDirectorStateR1 {
  const safeRunId = safeFileName(runId);
  const runPath = nuwaRunPath(workspacePath, safeRunId);
  const runFile = path.join(runPath, "run.json");
  if (!existsSync(runFile)) throw new Error("Director state requires an existing Nuwa Run Pack.");
  const target = path.join(runPath, "director-state-r1.json");
  if (!existsSync(target)) {
    return createNuwaDirectorStateR1({ projectId: path.basename(path.resolve(workspacePath)), runId: safeRunId });
  }
  if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error("Director state must be a regular Run Pack file.");
  return validateNuwaDirectorStateR1(readJson<NuwaDirectorStateR1>(target));
}

export function writeNuwaDirectorStateR1(input: { workspacePath: string; runId: string; state: NuwaDirectorStateR1 }): NuwaDirectorStateR1 {
  const safeRunId = safeFileName(input.runId);
  const runPath = nuwaRunPath(input.workspacePath, safeRunId);
  if (!existsSync(path.join(runPath, "run.json"))) throw new Error("Director state requires an existing Nuwa Run Pack.");
  const state = validateNuwaDirectorStateR1(input.state);
  if (state.scope.runId !== safeRunId) throw new Error("Director state Run binding does not match its Run Pack.");
  writeStableJson(path.join(runPath, "director-state-r1.json"), state);
  return structuredClone(state);
}

/** Provider telemetry belongs to the existing Run Pack and contains hashes and
 * bounded metadata only; raw prompts, responses, credentials and headers are
 * intentionally excluded by the caller's receipt contract. */
export function writeNuwaProviderPilotReceipt(input: { workspacePath: string; runId: string; receipt: unknown }): void {
  const runPath = nuwaRunPath(input.workspacePath, input.runId);
  const runFile = path.join(runPath, "run.json");
  if (!existsSync(runFile)) throw new Error("Provider receipt requires an existing Nuwa Run Pack.");
  const serialized = stableJson(input.receipt);
  if (Buffer.byteLength(serialized, "utf8") > 256 * 1024) throw new Error("Provider receipt exceeds the bounded Run Pack limit.");
  writeStableJson(path.join(runPath, "backend", "provider-pilot-receipt.json"), input.receipt);
}

export function writeNuwaStandaloneSandboxContext(input: {
  workspacePath: string;
  runId: string;
  context: NuwaStandaloneSandboxContext;
}): NuwaStandaloneSandboxContext {
  const runId = safeFileName(input.runId);
  const runPath = nuwaRunPath(input.workspacePath, runId);
  if (!existsSync(path.join(runPath, "run.json"))) throw new Error("Standalone Nuwa context requires an existing Run Pack.");
  const context = normalizeStandaloneSandboxContext(input.context, runId);
  const target = path.join(runPath, "standalone-sandbox.json");
  if (existsSync(target)) {
    const existing = readNuwaStandaloneSandboxContext(input.workspacePath, runId);
    if (!existing || stableJson(existing) !== stableJson(context)) throw new Error("Standalone Nuwa sandbox already exists with different content.");
    return existing;
  }
  writeStableJson(target, context);
  return structuredClone(context);
}

export function readNuwaStandaloneSandboxContext(workspacePath: string, runId: string): NuwaStandaloneSandboxContext | null {
  const safeRunId = safeFileName(runId);
  const target = path.join(nuwaRunPath(workspacePath, safeRunId), "standalone-sandbox.json");
  if (!existsSync(target)) return null;
  if (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile()) throw new Error("Standalone Nuwa sandbox must be a regular file.");
  return normalizeStandaloneSandboxContext(readJson<unknown>(target), safeRunId);
}

export function readNuwaRehearsalHistory(workspacePath: string, runId: string): NuwaRehearsalReadModel {
  const safeRunId = safeFileName(runId);
  const root = rehearsalRoot(workspacePath, safeRunId);
  if (!existsSync(root)) return { version: NUWA_REHEARSAL_READ_MODEL_VERSION, runId: safeRunId, latestRevision: null, revisions: [] };
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error("Nuwa rehearsal root must be a regular directory.");
  const revisionsRoot = path.join(root, "revisions");
  if (!existsSync(revisionsRoot)) return { version: NUWA_REHEARSAL_READ_MODEL_VERSION, runId: safeRunId, latestRevision: null, revisions: [] };
  if (lstatSync(revisionsRoot).isSymbolicLink() || !lstatSync(revisionsRoot).isDirectory()) throw new Error("Nuwa rehearsal revision root must be a regular directory.");
  const revisions = readdirSync(revisionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && /^revision-\d{6}\.json$/u.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const revision = Number(entry.name.slice("revision-".length, -".json".length));
      return parseNuwaRehearsalRevision({
        source: readFileSync(path.join(revisionsRoot, entry.name), "utf8"),
        expectedRunId: safeRunId,
        expectedRunRevision: revision
      });
    });
  for (let index = 1; index < revisions.length; index += 1) assertNuwaRehearsalInheritance(revisions[index - 1], revisions[index]);
  const pointerPath = path.join(root, "latest.json");
  const pointed = existsSync(pointerPath) ? readRehearsalLatestPointer(pointerPath, safeRunId) : null;
  const fallback = revisions.at(-1)?.runRevision ?? null;
  const latestRevision = pointed != null && revisions.some((revision) => revision.runRevision === pointed) ? pointed : fallback;
  return { version: NUWA_REHEARSAL_READ_MODEL_VERSION, runId: safeRunId, latestRevision, revisions };
}

export function readLatestNuwaRehearsalRevision(workspacePath: string, runId: string): NuwaRehearsalRevision | null {
  const history = readNuwaRehearsalHistory(workspacePath, runId);
  return history.latestRevision == null
    ? null
    : structuredClone(history.revisions.find((revision) => revision.runRevision === history.latestRevision) ?? null);
}

export function writeNuwaRehearsalRevision(input: {
  workspacePath: string;
  runId: string;
  revision: unknown;
  resolveAgent: NuwaRehearsalAgentResolver;
}): NuwaRehearsalRevision {
  const safeRunId = safeFileName(input.runId);
  const runPath = nuwaRunPath(input.workspacePath, safeRunId);
  if (!existsSync(path.join(runPath, "run.json"))) throw new Error("Nuwa rehearsal requires an existing Run Pack.");
  const revision = normalizeNuwaRehearsalRevision(input.revision, { expectedRunId: safeRunId, resolveAgent: input.resolveAgent });
  const brief = readExecutionBriefRevision(input.workspacePath, revision.briefId, revision.briefRevision);
  if (!brief || brief.authorApprovalState !== "approved") throw new Error("Nuwa rehearsal requires the exact approved Execution Brief revision.");
  const binding = readExecutionBriefRunBinding(input.workspacePath, revision.briefId, revision.briefRevision);
  if (!binding || binding.runId !== safeRunId || binding.explorationId !== revision.unitId) {
    throw new Error("Nuwa rehearsal unit must match the existing Brief revision and Exploration binding.");
  }
  const history = readNuwaRehearsalHistory(input.workspacePath, safeRunId);
  const existing = history.revisions.find((candidate) => candidate.runRevision === revision.runRevision);
  if (existing) {
    if (stableJson(existing) !== stableJson(revision)) throw new Error("Nuwa rehearsal revision already exists with different content.");
    return structuredClone(existing);
  }
  const expectedRevision = (history.latestRevision ?? 0) + 1;
  if (revision.runRevision !== expectedRevision) throw new Error("Nuwa rehearsal revision must append after the latest immutable revision.");
  const previous = history.revisions.at(-1) ?? null;
  if (previous) assertNuwaRehearsalInheritance(previous, revision);
  else if (revision.runRevision !== 1 || revision.parentRunRevision != null) throw new Error("The first Nuwa rehearsal revision must start at revision 1.");
  const root = rehearsalRoot(input.workspacePath, safeRunId);
  const target = rehearsalRevisionPath(root, revision.runRevision);
  const bytes = Buffer.from(`${stableJson(revision)}\n`, "utf8");
  const publication = publishFileNoReplace({ rootPath: runPath, targetPath: target, content: bytes });
  if (publication === "exists" && !readFileSync(target).equals(bytes)) throw new Error("Nuwa rehearsal revision publication conflict.");
  replaceFileAtomically({
    rootPath: runPath,
    targetPath: path.join(root, "latest.json"),
    content: `${stableJson({ version: "story-studio-nuwa-rehearsal-latest/v1", runId: safeRunId, runRevision: revision.runRevision })}\n`
  });
  return structuredClone(revision);
}

export function applyNuwaInterventionToNextRevision(input: {
  workspacePath: string;
  runId: string;
  expectedLatestRevision: number;
  interventionId: string;
  operationId: string;
  eventId: string;
  now: string;
  resolveAgent: NuwaRehearsalAgentResolver;
}): NuwaRehearsalRevision {
  const latest = readLatestNuwaRehearsalRevision(input.workspacePath, input.runId);
  if (!latest) throw new Error("Nuwa intervention requires an existing rehearsal revision.");
  const alreadyApplied = latest.interventionProposals.find((proposal) => proposal.applicationOperationId === input.operationId);
  if (alreadyApplied?.applicationReceipt) return structuredClone(latest);
  if (latest.runRevision !== input.expectedLatestRevision) throw new Error("Nuwa rehearsal revision conflict.");
  const intervention = latest.interventionProposals.find((proposal) => proposal.interventionId === input.interventionId);
  if (!intervention) throw new Error("Nuwa intervention proposal does not exist.");
  if (intervention.status !== "approved" || intervention.approvedForRevision !== latest.runRevision + 1) {
    throw new Error("Nuwa intervention must be approved for the next explicit run revision.");
  }
  const nextRevision = latest.runRevision + 1;
  const eventId = safeStructuredRef(input.eventId, "Intervention event identifier");
  const operationId = safeStructuredRef(input.operationId, "Intervention operation identifier");
  const now = safeTimestamp(input.now, "Intervention application time");
  const next: NuwaRehearsalRevision = {
    ...structuredClone(latest),
    runRevision: nextRevision,
    parentRunRevision: latest.runRevision,
    status: "running",
    temporaryVariables: latest.temporaryVariables.filter((variable) => variable.scope === "current_unit"),
    creativeBoosts: latest.creativeBoosts.filter((boost) => boost.scope === "current_unit"),
    interventionProposals: latest.interventionProposals.map((proposal) => proposal.interventionId === intervention.interventionId
      ? {
        ...proposal,
        status: "applied_to_run_revision" as const,
        applicationOperationId: operationId,
        applicationReceipt: { runId: latest.runId, runRevision: nextRevision, eventId, operationId, appliedAt: now }
      }
      : structuredClone(proposal)),
    orderedEvents: [
      {
        eventId,
        unitId: latest.unitId,
        runId: latest.runId,
        runRevision: nextRevision,
        sequence: 1,
        eventType: "intervention_applied",
        actorAgentRef: null,
        targetRefs: [intervention.targetAgentRef.objectId],
        source: { kind: "director", sourceRef: intervention.source },
        payload: { interventionId: intervention.interventionId, operationId },
        createdAt: now
      }
    ],
    memoryDeltas: [],
    relationshipDeltas: [],
    candidateRefs: [],
    inheritance: { temporaryVariables: true, creativeBoosts: true },
    updatedAt: now
  };
  return writeNuwaRehearsalRevision({ ...input, revision: next });
}

export function readNuwaBackendManifest(workspacePath: string, runId: string): {
  version: "world-os-nuwa-backend-manifest-v1";
  backend: NuwaBackendDescriptor;
  executions: NuwaExecutionOutcome["executions"];
  cache: Record<string, NuwaCacheEntry>;
} {
  return readJson(path.join(nuwaRunPath(workspacePath, runId), "backend", "manifest.json"));
}

export function getNuwaSynthesisReadiness(workspacePath: string, runId: string): {
  canSynthesize: boolean;
  partial: boolean;
  requiredResultCount: number;
  validatedResultCount: number;
  pendingResultCount: number;
  rejectedResultCount: number;
  cacheHitCount: number;
  missingRequiredRoles: NuwaAgentTask["role"][];
  missingOptionalRoles: NuwaAgentTask["role"][];
} {
  const manifest = readNuwaBackendManifest(workspacePath, runId);
  const run = readJson<NuwaRunRecord>(path.join(nuwaRunPath(workspacePath, runId), "run.json"));
  const accepted = manifest.executions.filter((execution) => execution.status === "accepted-by-nuwa");
  const acceptedRoles = new Set(accepted.map((execution) => execution.role));
  const missingRequiredRoles = run.plan.tasks.filter((task) => task.requirement === "required" && !acceptedRoles.has(task.role)).map((task) => task.role);
  const missingOptionalRoles = run.plan.tasks.filter((task) => task.requirement === "optional" && !acceptedRoles.has(task.role)).map((task) => task.role);
  return {
    canSynthesize: missingRequiredRoles.length === 0 && accepted.length > 0,
    partial: missingRequiredRoles.length === 0 && missingOptionalRoles.length > 0,
    requiredResultCount: run.plan.tasks.filter((task) => task.requirement === "required").length,
    validatedResultCount: accepted.length,
    pendingResultCount: manifest.executions.filter((execution) => execution.status === "queued" || execution.validationStatus === "pending").length,
    rejectedResultCount: manifest.executions.filter((execution) => execution.status === "rejected").length,
    cacheHitCount: accepted.filter((execution) => execution.cacheHit).length,
    missingRequiredRoles,
    missingOptionalRoles
  };
}

export function writeNuwaExecutionOutcome(input: {
  workspacePath: string;
  runId: string;
  outcome: NuwaExecutionOutcome;
}): NuwaRunRecord {
  const runPath = nuwaRunPath(input.workspacePath, input.runId);
  const record = readJson<NuwaRunRecord>(path.join(runPath, "run.json"));
  const snapshot = readJson<StorySnapshot>(path.join(runPath, "snapshot.json"));
  const previous = readNuwaBackendManifest(input.workspacePath, input.runId);
  const cache = { ...previous.cache };
  const acceptedExecutions = input.outcome.executions.map((execution) => {
    if (!execution.result || execution.status === "accepted-by-nuwa") return structuredClone(execution);
    const task = record.plan.tasks.find((candidate) => candidate.taskId === execution.taskId);
    if (!task) return { ...structuredClone(execution), status: "rejected" as const, validationStatus: "rejected" as const, diagnostic: "Unknown task result." };
    try {
      const result = validateNuwaAgentResult(execution.result, record.plan, snapshot);
      const context = buildNuwaTaskContextPack({ plan: record.plan, snapshot, task });
      const identity = buildNuwaCacheIdentity({ snapshot, context, backend: input.outcome.backend, profile: input.outcome.profile });
      const cacheKey = stableCacheKey(identity);
      if (input.outcome.backend.id === "deterministic") {
        cache[cacheKey] = {
          version: "world-os-nuwa-cache-entry-v1",
          cacheKey,
          identity,
          validationStatus: "accepted-by-nuwa",
          result: structuredClone(result),
          ...(execution.capability ? { capability: structuredClone(execution.capability) } : {})
        };
      }
      return { ...structuredClone(execution), status: "accepted-by-nuwa" as const, validationStatus: "accepted-by-nuwa" as const, result };
    } catch (error) {
      const { result: _result, ...safeExecution } = structuredClone(execution);
      return {
        ...safeExecution,
        status: "rejected" as const,
        validationStatus: "rejected" as const,
        reasonCategory: "invalid-result" as const,
        diagnostic: sanitizeDiagnostic(error instanceof Error ? error.message : String(error))
      };
    }
  });
  const acceptedResults = acceptedExecutions.flatMap((execution) => execution.status === "accepted-by-nuwa" && execution.result ? [execution.result] : []);
  const missingRequiredRoles = record.plan.tasks
    .filter((task) => task.requirement === "required" && !acceptedExecutions.some((execution) => execution.role === task.role && execution.status === "accepted-by-nuwa"))
    .map((task) => task.role);
  const missingOptionalRoles = record.plan.tasks
    .filter((task) => task.requirement === "optional" && !acceptedExecutions.some((execution) => execution.role === task.role && execution.status === "accepted-by-nuwa"))
    .map((task) => task.role);
  const validationEvents: NuwaExecutionEvent[] = acceptedExecutions.flatMap((execution) => {
    if (execution.status === "accepted-by-nuwa") {
      return [
        validatedEvent(record.runId, execution.taskId, input.outcome.backend.id, "result-validated", "Schema and evidence references validated."),
        validatedEvent(record.runId, execution.taskId, input.outcome.backend.id, "result-accepted", "Result accepted by Nuwa for synthesis.")
      ];
    }
    if (execution.status === "rejected") {
      return [validatedEvent(record.runId, execution.taskId, input.outcome.backend.id, "task-rejected", execution.diagnostic ?? "Result rejected.")];
    }
    return [];
  });
  writeStableJson(path.join(runPath, "backend", "manifest.json"), {
    version: "world-os-nuwa-backend-manifest-v1",
    backend: input.outcome.backend,
    executions: acceptedExecutions,
    cache
  });
  appendNuwaEvents(input.workspacePath, input.runId, [...input.outcome.events, ...validationEvents]);
  if (acceptedResults.length > 0) {
    writeValidatedResults({ workspacePath: input.workspacePath, runId: input.runId, results: acceptedResults, status: "awaiting-results" });
  }
  const next: NuwaRunRecord = {
    ...record,
    status: missingRequiredRoles.length > 0 && input.outcome.replanRequested ? "failed" : "awaiting-results"
  };
  writeStableJson(path.join(runPath, "run.json"), next);
  return structuredClone(next);
}

export function appendNuwaEvents(workspacePath: string, runId: string, events: NuwaExecutionEvent[]): void {
  if (events.length === 0) return;
  const filePath = path.join(nuwaRunPath(workspacePath, runId), "events.jsonl");
  if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
    throw new Error("Nuwa event log must not be a symbolic link.");
  }
  const safe = events.map((event) => ({
    version: event.version,
    type: event.type,
    runId: event.runId,
    ...(event.taskId ? { taskId: event.taskId } : {}),
    backendId: event.backendId,
    detail: sanitizeDiagnostic(event.detail)
  }));
  const previous = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const validPrevious = previous.split("\n").filter((line) => {
    if (!line.trim()) return false;
    try { JSON.parse(line); return true; } catch { return false; }
  });
  const previousLineCount = previous.split("\n").filter((line) => line.trim()).length;
  if (validPrevious.length !== previousLineCount) {
    writeAtomic(filePath, validPrevious.length > 0 ? `${validPrevious.join("\n")}\n` : "");
  }
  appendFileSync(filePath, `${safe.map((entry) => stableJson(entry)).join("\n")}\n`, "utf8");
}

export function writeNuwaResults(input: {
  workspacePath: string;
  runId: string;
  results: NuwaAgentResult[];
  status?: NuwaRunRecord["status"];
}): NuwaRunRecord {
  const runPath = nuwaRunPath(input.workspacePath, input.runId);
  const record = readJson<NuwaRunRecord>(path.join(runPath, "run.json"));
  const snapshot = readJson<StorySnapshot>(path.join(runPath, "snapshot.json"));
  const validated = input.results.map((result) => validateNuwaAgentResult(result, record.plan, snapshot));
  return writeValidatedResults({ ...input, results: validated });
}

function writeValidatedResults(input: {
  workspacePath: string;
  runId: string;
  results: NuwaAgentResult[];
  status?: NuwaRunRecord["status"];
}): NuwaRunRecord {
  const runPath = nuwaRunPath(input.workspacePath, input.runId);
  const record = readJson<NuwaRunRecord>(path.join(runPath, "run.json"));
  const resultIds = input.results.map((result) => result.taskId).sort();

  for (const result of input.results) {
    if (result.runId !== record.runId || result.snapshotHash !== record.snapshotHash) {
      throw new Error(`Result does not belong to Nuwa run ${record.runId}.`);
    }
    writeStableJson(path.join(runPath, "results", `${safeFileName(result.taskId)}.json`), result);
  }

  const next: NuwaRunRecord = {
    ...record,
    status: input.status ?? "awaiting-results",
    resultTaskIds: [...new Set([...record.resultTaskIds, ...resultIds])].sort()
  };
  writeStableJson(path.join(runPath, "run.json"), next);
  return structuredClone(next);
}

export function writeNuwaPredictionBundle(input: {
  workspacePath: string;
  runId: string;
  bundle: StoryPredictionBundle;
  /** Deterministic concurrency-test boundary; product callers omit it. */
  onBeforePublish?: () => void;
}): NuwaRunRecord {
  const runPath = nuwaRunPath(input.workspacePath, input.runId);
  const record = readJson<NuwaRunRecord>(path.join(runPath, "run.json"));
  if (input.bundle.runId !== record.runId || input.bundle.snapshotHash !== record.snapshotHash) {
    throw new Error(`Prediction bundle does not belong to Nuwa run ${record.runId}.`);
  }
  const bundlePath = path.join(runPath, "report", "prediction-bundle.json");
  const expectedBytes = Buffer.from(`${stableJson(input.bundle)}\n`, "utf8");
  input.onBeforePublish?.();
  const publication = publishFileNoReplace({
    rootPath: input.workspacePath,
    targetPath: bundlePath,
    content: expectedBytes
  });
  if (publication === "exists") {
    const existingBytes = readFileSync(bundlePath);
    if (!existingBytes.equals(expectedBytes)) {
      throw new Error("Prediction bundle already exists with different content.");
    }
    return structuredClone(record);
  }
  const next: NuwaRunRecord = { ...record, status: "ready-for-author-review" };
  writeStableJson(path.join(runPath, "run.json"), next);
  return structuredClone(next);
}

export function writeNuwaAuthorReview(input: {
  workspacePath: string;
  runId: string;
  review: unknown;
}): void {
  const runPath = nuwaRunPath(input.workspacePath, input.runId);
  writeStableJson(path.join(runPath, "report", "author-review.json"), input.review);
}

export function readLatestNuwaRun(workspacePath: string): NuwaRunRecord | null {
  const root = path.join(path.resolve(workspacePath), RUNS_ROOT);
  if (!existsSync(root)) return null;
  const latestPath = path.join(root, "latest.json");
  const pointer = existsSync(latestPath) ? readJson<{ runId?: string }>(latestPath).runId : null;
  const fallbackRunId = readdirSync(root)
    .filter((entry) => entry.startsWith("nuwa-run-"))
    .sort()
    .at(-1);
  const runId = isSafeRunId(pointer) ? pointer : fallbackRunId;
  return runId ? readJson<NuwaRunRecord>(path.join(root, runId, "run.json")) : null;
}

export function importNuwaResultFile(input: {
  workspacePath: string;
  runId: string;
  filePath: string;
}): NuwaRunRecord {
  const runPath = nuwaRunPath(input.workspacePath, input.runId);
  const importsRoot = path.resolve(runPath, "backend", "imports");
  const source = path.resolve(input.filePath);
  if (!source.startsWith(`${importsRoot}${path.sep}`)) {
    throw new Error("External Nuwa result must be placed inside the run backend/imports directory.");
  }
  const stat = lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("External Nuwa result must be a regular non-symlink file.");
  const resolvedImportsRoot = realpathSync(importsRoot);
  const resolvedSource = realpathSync(source);
  if (!resolvedSource.startsWith(`${resolvedImportsRoot}${path.sep}`)) {
    throw new Error("External Nuwa result must be placed inside the run backend/imports directory.");
  }
  assertNuwaWritePath(importsRoot);
  if (stat.size > 256 * 1024) throw new Error("External Nuwa result exceeds the 256 KiB limit.");
  const result = readJson<NuwaAgentResult>(source);
  const run = writeNuwaResults({
    workspacePath: input.workspacePath,
    runId: input.runId,
    results: [result],
    status: "awaiting-results"
  });
  const manifest = readNuwaBackendManifest(input.workspacePath, input.runId);
  const task = run.plan.tasks.find((candidate) => candidate.taskId === result.taskId);
  if (task) {
    const importedExecution: NuwaTaskExecution = {
      taskId: task.taskId,
      role: task.role,
      status: "accepted-by-nuwa",
      taskHash: buildNuwaTaskContextPack({ plan: run.plan, snapshot: readJson<StorySnapshot>(path.join(runPath, "snapshot.json")), task }).taskHash,
      result,
      attempts: 0,
      requirement: task.requirement,
      cacheHit: false,
      validationStatus: "accepted-by-nuwa"
    };
    manifest.executions = [
      ...manifest.executions.filter((execution) => execution.taskId !== result.taskId),
      importedExecution
    ].sort((left, right) => left.taskId.localeCompare(right.taskId));
    writeStableJson(path.join(runPath, "backend", "manifest.json"), manifest);
    appendNuwaEvents(input.workspacePath, input.runId, [
      validatedEvent(run.runId, task.taskId, manifest.backend.id, "result-imported", "External result imported from the bounded run directory."),
      validatedEvent(run.runId, task.taskId, manifest.backend.id, "result-validated", "Schema and evidence references validated."),
      validatedEvent(run.runId, task.taskId, manifest.backend.id, "result-accepted", "Result accepted by Nuwa for synthesis.")
    ]);
  }
  return run;
}

export function removeNuwaRunPack(workspacePath: string, runId: string): void {
  rmSync(nuwaRunPath(workspacePath, runId), { force: true, recursive: true });
}

export function nuwaRunPath(workspacePath: string, runId: string): string {
  const root = path.resolve(workspacePath);
  const cleanRunId = safeFileName(runId);
  const target = path.resolve(root, RUNS_ROOT, cleanRunId);
  if (!target.startsWith(`${path.resolve(root, RUNS_ROOT)}${path.sep}`)) {
    throw new Error("Nuwa run path is outside the workspace.");
  }
  return target;
}

function writeTaskMarkdown(filePath: string, task: NuwaAgentTask, plan: NuwaPlan, snapshot: StorySnapshot): void {
  const context = buildNuwaTaskContextPack({ task, plan, snapshot });
  const body = [
    "# Nuwa Specialist Task",
    "",
    "## Author Goal",
    "",
    plan.authorGoal,
    "",
    "## Task",
    "",
    task.purpose,
    "",
    "## Allowed Source Notes",
    "",
    ...task.allowedNoteRefs.map((ref) => `- ${ref}`),
    "",
    "## Required Evidence Format",
    "",
    "For every finding or branch, list snapshot evidence ids and note paths.",
    "",
    "## Forbidden Behavior",
    "",
    ...task.forbiddenOperations.map((operation) => `- ${operation}`),
    "",
    "## Expected Result",
    "",
    `Return ${task.expectedOutputSchema} with at most ${task.maximumBranchProposals} branch proposal(s) and ${task.maximumEvidenceExcerpts} evidence excerpt(s).`,
    "",
    "## Snapshot Context",
    "",
    `Selected scene: ${snapshot.currentScene?.relativePath ?? "none"}`,
    `Locked rules: ${snapshot.lockedRules.map((note) => note.relativePath).join(", ") || "none"}`,
    `Open threads: ${snapshot.openThreads.map((note) => note.relativePath).join(", ") || "none"}`,
    "",
    "## Bounded Task Context",
    "",
    `Task hash: ${context.taskHash}`,
    ...context.allowedNotes.map((note) => `- ${note.relativePath}: ${note.excerpt}`)
  ].join("\n");
  const markdown = serializeStoryMarkdown({
    frontmatter: {
      world_os: "nuwa-agent-task/v1",
      run_id: plan.runId,
      task_id: task.taskId,
      role: task.role,
      snapshot_hash: plan.snapshotHash,
      task_hash: context.taskHash,
      write_scope: "none",
      status: "planned"
    },
    body
  });
  writeAtomic(filePath, markdown);
}

function writeStableJson(filePath: string, value: unknown): void {
  writeAtomic(filePath, `${stableJson(value)}\n`);
}

function writeAtomic(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  assertNuwaWritePath(filePath);
  const temporary = `${filePath}.tmp`;
  if (existsSync(temporary) && lstatSync(temporary).isSymbolicLink()) {
    throw new Error("Nuwa atomic write temporary path must not be a symbolic link.");
  }
  if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
    throw new Error("Nuwa atomic write target must not be a symbolic link.");
  }
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, filePath);
}

function assertNuwaWritePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const segments = resolved.split(path.sep);
  const markerIndex = segments.findIndex((segment, index) => segment === ".world-os" && segments[index + 1] === "runs" && segments[index + 2] === "nuwa");
  if (markerIndex < 1) throw new Error("Nuwa write path is outside the workspace run directory.");
  const rootPrefix = path.parse(resolved).root;
  const workspaceRoot = path.join(rootPrefix, ...segments.slice(1, markerIndex));
  const runsRoot = path.join(workspaceRoot, ".world-os", "runs", "nuwa");
  const realWorkspaceRoot = realpathSync(workspaceRoot);
  const realRunsRoot = realpathSync(runsRoot);
  const realParent = realpathSync(path.dirname(resolved));
  const realTarget = existsSync(resolved) ? realpathSync(resolved) : realParent;
  if (!isInside(realRunsRoot, realWorkspaceRoot) || !isInside(realParent, realRunsRoot) || !isInside(realTarget, realRunsRoot)) {
    throw new Error("Nuwa write path resolves outside the workspace run directory.");
  }
}

function isInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

/**
 * Event logs are an existing Run Pack read model. Invalid historical lines are
 * omitted here so a damaged diagnostic line cannot prevent an author from
 * opening the rest of an otherwise readable unit.
 */
function readNuwaExecutionEvents(runPath: string, runId: string): NuwaExecutionEvent[] {
  const eventPath = path.join(runPath, "events.jsonl");
  if (!existsSync(eventPath) || lstatSync(eventPath).isSymbolicLink()) return [];
  return readFileSync(eventPath, "utf8")
    .split("\n")
    .flatMap((line) => {
      if (!line.trim()) return [];
      try {
        const value = JSON.parse(line) as Partial<NuwaExecutionEvent>;
        if (
          value.version !== "world-os-nuwa-execution-event-v1"
          || value.runId !== runId
          || typeof value.type !== "string"
          || !isNuwaExecutionEventType(value.type)
          || typeof value.backendId !== "string"
          || !isNuwaBackendId(value.backendId)
          || typeof value.detail !== "string"
          || value.detail.length > 1_000
          || (value.taskId !== undefined && !isSafeRunId(value.taskId))
        ) return [];
        return [{
          version: value.version,
          type: value.type,
          runId: value.runId,
          ...(value.taskId ? { taskId: value.taskId } : {}),
          backendId: value.backendId,
          detail: value.detail
        }];
      } catch {
        return [];
      }
    });
}

function isNuwaExecutionEventType(value: string): value is NuwaExecutionEvent["type"] {
  return [
    "backend-selected",
    "task-started",
    "result-produced",
    "result-imported",
    "result-validated",
    "result-accepted",
    "cache-hit",
    "cache-miss",
    "task-queued",
    "task-rejected",
    "task-cancelled",
    "replan-requested"
  ].includes(value as NuwaExecutionEvent["type"]);
}

function isNuwaBackendId(value: string): value is NuwaBackendDescriptor["id"] {
  return ["deterministic", "external-run-pack", "codex-cli"].includes(value as NuwaBackendDescriptor["id"]);
}

function safeFileName(value: string): string {
  const normalized = String(value).trim();
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(normalized)) {
    throw new Error(`Invalid Nuwa run or task id: ${value}.`);
  }
  return normalized;
}

function normalizeStandaloneSandboxContext(value: unknown, expectedRunId: string): NuwaStandaloneSandboxContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Standalone Nuwa sandbox is invalid.");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["version", "runId", "story", "authorGoal", "preservedFacts", "boundaries", "depth", "agents", "createdAt", "updatedAt"]);
  if (Object.keys(record).some((key) => !allowed.has(key)) || record.version !== NUWA_STANDALONE_SANDBOX_VERSION || record.runId !== expectedRunId) {
    throw new Error("Standalone Nuwa sandbox is invalid.");
  }
  const text = (field: string, maximum: number, required = true) => {
    const candidate = typeof record[field] === "string" ? record[field].normalize("NFC").trim() : "";
    if ((required && !candidate) || [...candidate].length > maximum) throw new Error(`Standalone Nuwa ${field} is invalid.`);
    return candidate;
  };
  const list = (field: string, maximum: number) => {
    if (!Array.isArray(record[field]) || record[field].length > maximum || record[field].some((item) => typeof item !== "string" || !item.trim() || [...item].length > 240)) {
      throw new Error(`Standalone Nuwa ${field} is invalid.`);
    }
    return record[field].map((item) => String(item).normalize("NFC").trim());
  };
  if (record.depth !== "short" && record.depth !== "medium" && record.depth !== "long") throw new Error("Standalone Nuwa depth is invalid.");
  if (!Array.isArray(record.agents) || record.agents.length > 16) throw new Error("Standalone Nuwa agents are invalid.");
  const agents = record.agents.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Standalone Nuwa agent is invalid.");
    const agent = value as Record<string, unknown>;
    const keys = ["id", "kind", "displayName", "objectId", "sourceRevision", "goal", "disposition", "knownInformation", "unknownInformation", "sourceExcerpt"];
    if (Object.keys(agent).length !== keys.length || keys.some((key) => !(key in agent))) throw new Error("Standalone Nuwa agent fields are invalid.");
    if (typeof agent.id !== "string" || !/^[a-z0-9][a-z0-9._:-]{2,119}$/i.test(agent.id)) throw new Error("Standalone Nuwa agent id is invalid.");
    if (agent.kind !== "existing-character" && agent.kind !== "temporary-character") throw new Error("Standalone Nuwa agent kind is invalid.");
    if ((agent.objectId !== null && (typeof agent.objectId !== "string" || !agent.objectId)) || (agent.sourceRevision !== null && (typeof agent.sourceRevision !== "string" || !agent.sourceRevision))) throw new Error("Standalone Nuwa agent reference is invalid.");
    if (agent.kind === "existing-character" && (!agent.objectId || !agent.sourceRevision)) throw new Error("Existing standalone Nuwa agent needs an object snapshot.");
    if (agent.kind === "temporary-character" && (agent.objectId !== null || agent.sourceRevision !== null)) throw new Error("Temporary standalone Nuwa agent cannot own a formal object reference.");
    const agentText = (field: string, maximum: number) => {
      const candidate = typeof agent[field] === "string" ? agent[field].normalize("NFC").trim() : "";
      if (!candidate || [...candidate].length > maximum) throw new Error(`Standalone Nuwa agent ${field} is invalid.`);
      return candidate;
    };
    return {
      id: agent.id,
      kind: agent.kind,
      displayName: agentText("displayName", 120),
      objectId: agent.objectId,
      sourceRevision: agent.sourceRevision,
      goal: agentText("goal", 500),
      disposition: agentText("disposition", 500),
      knownInformation: agentText("knownInformation", 800),
      unknownInformation: agentText("unknownInformation", 800),
      sourceExcerpt: agentText("sourceExcerpt", 800)
    } as NuwaStandaloneSandboxAgent;
  });
  if (new Set(agents.map((agent) => agent.id)).size !== agents.length) throw new Error("Standalone Nuwa agents are duplicated.");
  const timestamp = (field: string) => {
    const candidate = text(field, 32);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(candidate) || Number.isNaN(Date.parse(candidate))) throw new Error(`Standalone Nuwa ${field} is invalid.`);
    return candidate;
  };
  return {
    version: NUWA_STANDALONE_SANDBOX_VERSION,
    runId: expectedRunId,
    story: text("story", 12_000),
    authorGoal: text("authorGoal", 1_000),
    preservedFacts: list("preservedFacts", 24),
    boundaries: list("boundaries", 24),
    depth: record.depth,
    agents,
    createdAt: timestamp("createdAt"),
    updatedAt: timestamp("updatedAt")
  };
}

function isSafeRunId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/i.test(value);
}

function rehearsalRoot(workspacePath: string, runId: string): string {
  return path.join(nuwaRunPath(workspacePath, runId), "rehearsal");
}

function rehearsalRevisionPath(root: string, revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 99_999) throw new Error("Nuwa rehearsal revision is invalid.");
  return path.join(root, "revisions", `revision-${String(revision).padStart(6, "0")}.json`);
}

function readRehearsalLatestPointer(filePath: string, runId: string): number | null {
  if (lstatSync(filePath).isSymbolicLink() || !lstatSync(filePath).isFile()) throw new Error("Nuwa rehearsal latest pointer must be a regular file.");
  const value = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3
    || value.version !== "story-studio-nuwa-rehearsal-latest/v1"
    || value.runId !== runId
    || !Number.isSafeInteger(value.runRevision)
    || Number(value.runRevision) < 1
    || Number(value.runRevision) > 99_999
  ) throw new Error("Nuwa rehearsal latest pointer is invalid.");
  return Number(value.runRevision);
}

function safeStructuredRef(value: string, label: string): string {
  const normalized = String(value).normalize("NFC").trim();
  if (!normalized || [...normalized].length > 180 || !/^[\p{L}\p{N}][\p{L}\p{N}._:/@+-]*$/u.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function safeTimestamp(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function validatedEvent(runId: string, taskId: string, backendId: NuwaBackendDescriptor["id"], type: NuwaExecutionEvent["type"], detail: string): NuwaExecutionEvent {
  return { version: "world-os-nuwa-execution-event-v1", type, runId, taskId, backendId, detail };
}
