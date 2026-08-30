import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createDeterministicMultiNodePredictionGateway, type MultiNodePredictionGateway } from "../storyAgent/multiNodePredictionGateway.ts";
import { createPredictionRun, normalizeMultiNodePredictionRequest, validatePredictionBundle, type PredictionRun } from "../storyContracts/multiNodePrediction.ts";
import { assertStoryStudioEventReferenceEligibility } from "../storyContracts/storyStudioEventReference.ts";
import { publishFileNoReplace, readExistingUtf8, replaceFileAtomically } from "./atomicNoReplaceFile.ts";
import { createStoryStudioWorkspaceOperations } from "./storyStudioWorkspaceOperations.ts";

const VERSION = "story-studio-multi-node-prediction-run/v1";
type PersistedRun = PredictionRun & { version: typeof VERSION };

export function createStoryStudioMultiNodePredictionOperations(options: { rootPath: string; stateFilePath: string; now?: () => string; gateway?: MultiNodePredictionGateway; verifyCanonEventRead?(input: { projectId: string; eventId: string }): boolean }) {
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: options.rootPath, stateFilePath: options.stateFilePath });
  const now = options.now ?? (() => new Date().toISOString());
  const gateway = options.gateway ?? createDeterministicMultiNodePredictionGateway();
  const projectPath = (projectId: string) => workspace.resolveProjectWorkspacePath({ projectId });
  const file = (projectId: string, runId: string) => path.join(projectPath(projectId), ".world-os", "tianyi", "multi-node-predictions", `${safeRunId(runId)}.json`);
  const readStored = (projectId: string, runId: string): PersistedRun | null => {
    const source = readExistingUtf8(projectPath(projectId), file(projectId, runId));
    if (!source) return null;
    const result = JSON.parse(source) as PersistedRun;
    if (result.version !== VERSION || result.projectId !== projectId || result.runId !== runId) throw new Error("Prediction Run file is invalid.");
    return result;
  };
  const writeNew = (run: PersistedRun) => { const target = file(run.projectId, run.runId); const outcome = publishFileNoReplace({ rootPath: projectPath(run.projectId), targetPath: target, content: `${JSON.stringify(run, null, 2)}\n` }); if (outcome === "exists") return readStored(run.projectId, run.runId)!; return run; };
  const replace = (run: PersistedRun) => { replaceFileAtomically({ rootPath: projectPath(run.projectId), targetPath: file(run.projectId, run.runId), content: `${JSON.stringify(run, null, 2)}\n` }); return run; };
  const verifySources = (run: PredictionRun) => run.sourceSnapshot.map((reference) => {
    const event = workspace.readWorldObject({ projectId: run.projectId, objectId: reference.eventId });
    assertStoryStudioEventReferenceEligibility({ reference, event, consumer: "tianyi-grounded", canonVerified: event.status !== "committed" || Boolean(options.verifyCanonEventRead?.({ projectId: run.projectId, eventId: event.id })) });
    return event;
  });
  const markStaleIfSourceChanged = (run: PersistedRun): PersistedRun => {
    if (run.status !== "ready") return run;
    try { verifySources(run); return run; }
    catch { return replace({ ...run, status: "stale" }); }
  };
  return {
    createPredictionRun(input: { request: unknown; runId: string }) {
      const request = normalizeMultiNodePredictionRequest(input.request);
      const duplicate = list(request.projectId).find((run) => run.operationId === request.operationId);
      if (duplicate) return structuredClone(duplicate);
      const run = createPredictionRun({ ...request, runId: input.runId, createdAt: now() });
      verifySources(run);
      return structuredClone(writeNew({ ...run, version: VERSION }));
    },
    async executePredictionRun(input: { projectId: string; runId: string }) {
      const stored = requireRun(input.projectId, input.runId);
      if (stored.status === "ready") return structuredClone(stored);
      if (stored.status !== "created") throw new Error("Prediction Run cannot be executed from its current state.");
      replace({ ...stored, status: "generating" });
      try {
        const events = verifySources(stored);
        const knownEvents = workspace.getStoryStudioWorldLibraryBootstrap({ projectId: stored.projectId }).objects
          .filter((object) => object.type === "event")
          .map((object) => ({ id: object.id, title: object.title }));
        const generated = await gateway.generate({ request: { projectId: stored.projectId, sourceEventRefs: stored.sourceSnapshot, authorGoal: stored.authorGoal, predictionMode: stored.predictionMode, operationId: stored.operationId }, knownEvents, bundleId: `prediction-bundle.${stored.runId}` });
        const validating = replace({ ...stored, status: "validating" });
        const bundle = validatePredictionBundle({ run: validating, bundle: generated });
        return structuredClone(replace({ ...validating, bundle, status: "ready" }));
      } catch (cause) {
        replace({ ...stored, status: "failed" });
        throw cause;
      }
    },
    readPredictionRun(input: { projectId: string; runId: string }) {
      const run = readStored(input.projectId, input.runId);
      return run ? structuredClone(markStaleIfSourceChanged(run)) : null;
    },
    listPredictionRuns(input: { projectId: string }) { return list(input.projectId).map((run) => structuredClone(markStaleIfSourceChanged(run))); },
    abandonPredictionRun(input: { projectId: string; runId: string }) {
      const run = requireRun(input.projectId, input.runId);
      if (["abandoned", "stale"].includes(run.status)) return structuredClone(run);
      return structuredClone(replace({ ...run, status: "abandoned" }));
    },
    markPredictionRunStale(input: { projectId: string; runId: string }) { const run = requireRun(input.projectId, input.runId); return structuredClone(replace({ ...run, status: "stale" })); }
  };
  function requireRun(projectId: string, runId: string): PersistedRun { const run = readStored(projectId, runId); if (!run) throw new Error("Prediction Run does not exist."); return markStaleIfSourceChanged(run); }
  function list(projectId: string): PersistedRun[] { const directory = path.dirname(file(projectId, "prediction-run.placeholder")); if (!existsSync(directory)) return []; return readdirSync(directory).filter((entry) => /^prediction-run\.[\p{L}\p{N}._:-]+\.json$/u.test(entry)).flatMap((entry) => readStored(projectId, entry.slice(0, -5)) ? [readStored(projectId, entry.slice(0, -5))!] : []).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.runId.localeCompare(left.runId)); }
}
function safeRunId(value: string): string { if (!/^prediction-run\.[\p{L}\p{N}._:-]+$/u.test(value)) throw new Error("Prediction Run identifier is invalid."); return value; }
export type StoryStudioMultiNodePredictionOperations = ReturnType<typeof createStoryStudioMultiNodePredictionOperations>;
