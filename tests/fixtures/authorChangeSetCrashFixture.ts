import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync
} from "node:fs";
import path from "node:path";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

export type CrashSafeApplyFixture = Awaited<ReturnType<typeof createCrashSafeApplyFixture>>;

export async function createCrashSafeApplyFixture(root: string) {
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "story-control-state.json");
  const projectId = "crash-safe-world";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "Crash Safe World", folderSlug: projectId });
  workspace.createWorldObject({ projectId, type: "character", title: "Author Witness", status: "active" });
  workspace.createWorldObject({ projectId, type: "location", title: "North Gate", status: "active" });
  workspace.createWorldObject({ projectId, type: "rule", title: "One Confirmed Event", status: "locked" });
  workspace.createWorldObject({
    projectId,
    type: "event",
    title: "Unrelated Confirmed Event",
    status: "committed",
    tags: ["作者确认"],
    body: "# Unrelated Confirmed Event\n\nThis Event is outside the apply operation.\n"
  });
  const chapter = workspace.createWritingDocument({ projectId, type: "chapter", title: "Chapter One" });
  const scene = workspace.createWritingDocument({ projectId, type: "scene", title: "North Gate Decision", chapterId: chapter.id });
  workspace.updateWritingDocument({
    projectId,
    documentId: scene.id,
    expectedHash: scene.revisionToken,
    status: "drafting",
    body: "# North Gate Decision\n\n[[Author Witness]] reaches [[North Gate]] under [[One Confirmed Event]].\n"
  });

  const control = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const exploration = control.createStoryExploration({
    projectId,
    sceneId: scene.id,
    authorGoal: "Record exactly one author-confirmed event at the North Gate.",
    planOptions: {
      allowedRoles: ["causality", "continuity", "rules"],
      maxRoles: 3,
      runKey: "crash-safe-event-apply-v0"
    }
  });
  await control.runStoryExploration({ projectId, explorationId: exploration.id });
  const synthesized = control.synthesizeStoryExploration({ projectId, explorationId: exploration.id });
  const submitted = control.submitStoryExplorationRouteToImpact({
    projectId,
    explorationId: exploration.id,
    routeId: synthesized.routes[0].id
  });
  control.chooseImpactRoute({
    projectId,
    reviewId: submitted.review.id,
    optionId: submitted.review.options[0].id,
    action: "adopt"
  });
  const changeSet = control.createAuthorChangeSet({ projectId, reviewId: submitted.review.id });
  const projectPath = path.join(rootPath, projectId);
  return {
    root,
    rootPath,
    stateFilePath,
    projectId,
    projectPath,
    sceneId: scene.id,
    reviewId: submitted.review.id,
    explorationId: exploration.id,
    changeSetId: changeSet.id,
    protectedFingerprint: protectedFixtureFingerprint(projectPath),
    ...workflowSemanticFingerprints(projectPath, changeSet.id)
  };
}

export function openCrashSafeApplyFixture(root: string, projectId: string) {
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "story-control-state.json");
  return {
    rootPath,
    stateFilePath,
    projectPath: path.join(rootPath, projectId),
    workspace: createStoryStudioWorkspaceOperations({ rootPath, stateFilePath })
  };
}

export function inspectCrashSafeApplyFixture(root: string, projectId: string, changeSetId: string) {
  const fixture = openCrashSafeApplyFixture(root, projectId);
  const control = createStoryStudioAuthorControl({
    rootPath: fixture.rootPath,
    stateFilePath: fixture.stateFilePath
  });
  const productChangeSet = control.readAuthorChangeSet({ projectId, changeSetId });
  const changeSetPath = path.join(
    fixture.projectPath,
    ".world-os",
    "author-control",
    "change-sets",
    `${changeSetId}.json`
  );
  const intentPath = path.join(
    fixture.projectPath,
    ".world-os",
    "author-control",
    "change-sets",
    `${changeSetId}.apply-intent.v1.json`
  );
  const persistedChangeSet = JSON.parse(readFileSync(changeSetPath, "utf8"));
  const intent = existsSync(intentPath) ? JSON.parse(readFileSync(intentPath, "utf8")) : null;
  const events = fixture.workspace.listWorldObjects({ projectId, type: "event" })
    .map((event) => fixture.workspace.readWorldObject({ projectId, objectId: event.id }));
  const operationEvents = intent
    ? events.filter((event) => event.properties.apply_operation_key === intent.applyOperationKey)
    : [];
  const target = intent ? events.find((event) => event.id === intent.targetEventRef) || null : null;
  const operationsPath = path.join(fixture.projectPath, ".world-os", "operations.jsonl");
  const operationsSource = existsSync(operationsPath) ? readFileSync(operationsPath, "utf8") : "";
  const allFiles = walkFiles(fixture.projectPath);
  const workflowFingerprints = workflowSemanticFingerprints(fixture.projectPath, changeSetId);
  return {
    changeSetStatus: persistedChangeSet.status,
    productStatus: productChangeSet?.status ?? null,
    appliedEventId: persistedChangeSet.application.appliedEventId,
    intent,
    operationEventCount: operationEvents.length,
    operationEventIds: operationEvents.map((event) => event.id).sort(),
    targetEventHash: target ? target.revisionToken : null,
    targetEventStatus: target?.status ?? null,
    targetEventProvenance: target ? {
      sourceChangeSetId: target.properties.source_change_set_id ?? null,
      sourceChangeSetRevision: target.properties.source_change_set_revision ?? null,
      authorDecisionRef: target.properties.author_decision_ref ?? null,
      applyOperationKey: target.properties.apply_operation_key ?? null,
      intentHash: target.properties.apply_intent_hash ?? null
    } : null,
    operationProjectionCount: intent
      ? countOccurrences(operationsSource, `"operationId": ${JSON.stringify(intent.applyOperationKey)}`)
      : 0,
    eventMarkdownCount: allFiles.filter((file) => /^world\/events\/.+\.md$/u.test(file)).length,
    temporaryFiles: allFiles.filter((file) => file.includes(".tianyan-stage-") || file.endsWith(".tmp")).sort(),
    loaderVisibleTemporaryCount: allFiles.filter((file) => file.includes(".tianyan-stage-") && file.endsWith(".md")).length,
    memoryFileCount: allFiles.filter((file) => file.includes("/memories/")).length,
    timelineFileCount: allFiles.filter((file) => file.endsWith(".timeline.json")).length,
    protectedFingerprint: protectedFixtureFingerprint(fixture.projectPath),
    ...workflowFingerprints
  };
}

function workflowSemanticFingerprints(projectPath: string, changeSetId: string) {
  const persisted = JSON.parse(readFileSync(path.join(
    projectPath,
    ".world-os",
    "author-control",
    "change-sets",
    `${changeSetId}.json`
  ), "utf8"));
  const semantic = {
    version: persisted.version,
    changeSetId: persisted.changeSetId,
    reviewId: persisted.reviewId,
    projectId: persisted.projectId,
    source: persisted.source,
    baseline: persisted.baseline,
    affectedNoteIds: persisted.affectedNoteIds,
    structuredChanges: persisted.structuredChanges,
    evidenceRefs: persisted.evidenceRefs,
    before: persisted.before,
    change: persisted.change,
    after: persisted.after,
    authorDecision: persisted.authorDecision,
    candidate: persisted.candidate,
    applicationMode: persisted.application.mode
  };
  return {
    changeSetSemanticHash: stableHash(semantic),
    authorDecisionHash: stableHash({
      reviewId: persisted.reviewId,
      authorDecision: persisted.authorDecision
    })
  };
}

export function protectedFixtureFingerprint(projectPath: string): string {
  const entries = walkFiles(projectPath)
    .filter((relativePath) => !isExpectedApplyMutation(relativePath))
    .map((relativePath) => {
      const absolute = path.join(projectPath, relativePath);
      return `${relativePath}\t${statSync(absolute).mode & 0o777}\t${hash(readFileSync(absolute))}`;
    });
  return hash(entries.sort().join("\n"));
}

export function walkFiles(root: string, relativeDirectory = ""): string[] {
  const directory = relativeDirectory ? path.join(root, relativeDirectory) : root;
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
    if (entry.isDirectory()) return walkFiles(root, relativePath);
    return entry.isFile() ? [relativePath] : [];
  });
}

function isExpectedApplyMutation(relativePath: string): boolean {
  return (
    relativePath === ".world-os/index.json" ||
    relativePath === ".world-os/operations.jsonl" ||
    relativePath === ".world-os/state.json" ||
    relativePath.startsWith(".world-os/author-control/change-sets/") ||
    relativePath.startsWith("documents/timelines/") ||
    relativePath.includes("history/documents/visual-timeline.") ||
    relativePath.startsWith("world/events/event.author-confirmed-") ||
    relativePath.includes("history/documents/object-event.author-confirmed-") ||
    relativePath.includes(".tianyan-stage-") ||
    relativePath.endsWith(".tmp")
  );
}

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableHash(value: unknown): string {
  return hash(JSON.stringify(sortJson(value)));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }
  return value;
}

function countOccurrences(source: string, marker: string): number {
  let count = 0;
  let cursor = 0;
  while ((cursor = source.indexOf(marker, cursor)) >= 0) {
    count += 1;
    cursor += marker.length;
  }
  return count;
}
