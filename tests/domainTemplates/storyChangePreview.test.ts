import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { analyzeStoryImpactReport } from "../../src/domainTemplates/storyWorld/analysis/index.ts";
import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import { createStoryAuthorIntent } from "../../src/domainTemplates/storyWorld/intent/index.ts";
import { resolveStoryEvidenceBundle } from "../../src/domainTemplates/storyWorld/evidence/index.ts";
import {
  createStoryDecisionWorkspace,
  resolveAuthorDecision,
  type StoryCommitCandidate
} from "../../src/domainTemplates/storyWorld/decision/index.ts";

test("StoryChangePreview builds a deterministic before-change-after preview without committing", async () => {
  assert.equal(existsSync("src/domainTemplates/storyWorld/changePreview/index.ts"), true, "change preview index must exist");
  const { buildStoryChangePreview } = await import("../../src/domainTemplates/storyWorld/changePreview/index.ts");
  const { project, candidate, evidenceBundle } = createAcceptedPreviewFixture();
  const before = structuredClone(project);
  const previewA = buildStoryChangePreview({
    project,
    candidate,
    authorDecision: candidate.selectedDecision,
    evidenceBundle,
    previousSnapshotId: "snapshot-before-change-1"
  });
  const previewB = buildStoryChangePreview({
    project,
    candidate,
    authorDecision: candidate.selectedDecision,
    evidenceBundle,
    previousSnapshotId: "snapshot-before-change-1"
  });

  assert.deepEqual(previewA, previewB);
  assert.deepEqual(project, before);
  assert.equal(previewA.version, "world-os-story-change-preview-v1");
  assert.equal(previewA.id, "change-preview-commit-candidate-change-intent-1-a");
  assert.equal(previewA.canCommit, false);
  assert.equal(previewA.mutatesWorld, false);
  assert.deepEqual(previewA.authorDecision, {
    optionId: "decision-change-intent-1-a",
    optionType: "accept_immediate_reveal",
    status: "accepted",
    authorNotes: ["采用显性揭示，但提交前先看世界差异。"]
  });
  assert.deepEqual(previewA.beforeState.characterStates.map((state) => [state.characterId, state.status]), [
    ["a-lan", "missing"],
    ["lin-yuan", "drafting"]
  ]);
  assert.deepEqual(previewA.beforeState.eventStates.map((state) => [state.eventId, state.chapter]), [
    ["event-3", "chapter-3"]
  ]);
  assert.deepEqual(previewA.changeSet.addedFacts.map((fact) => fact.summary), [
    "Accept immediate reveal: Let the discovery become explicit in the current chapter.",
    "Risk level: high"
  ]);
  assert.deepEqual(previewA.changeSet.changedRelationships.map((change) => change.summary), [
    "林远 and 阿岚 relationship may shift through accept_immediate_reveal."
  ]);
  assert.deepEqual(previewA.changeSet.triggeredEvents.map((event) => event.summary), [
    "event-3 is pulled into the preview as a dependency."
  ]);
  assert.deepEqual(previewA.afterState.projectedCharacterStates.map((state) => [state.characterId, state.projectedStatus]), [
    ["a-lan", "missing -> affected by accept_immediate_reveal"],
    ["lin-yuan", "drafting -> affected by accept_immediate_reveal"]
  ]);
  assert.deepEqual(previewA.afterState.projectedWorldState, [
    "World rules remain locked during preview.",
    "No committed story event is created by this preview."
  ]);
  assert.deepEqual(previewA.afterState.affectedFutureThreads, [
    "旧灯塔地下潮门未确认",
    "阿岚留下警告后失踪"
  ]);
  assert.deepEqual(previewA.rollbackReference, {
    version: "world-os-story-change-preview-rollback-reference-v1",
    previousSnapshotId: "snapshot-before-change-1"
  });
  assert.deepEqual(previewA.validation, {
    version: "world-os-story-change-preview-validation-v1",
    valid: true,
    violations: []
  });
});

test("StoryChangePreview rejects rejected decisions and invalid evidence coverage", async () => {
  assert.equal(existsSync("src/domainTemplates/storyWorld/changePreview/index.ts"), true, "change preview index must exist");
  const { buildStoryChangePreview, validateStoryChangePreviewInput } = await import(
    "../../src/domainTemplates/storyWorld/changePreview/index.ts"
  );
  const { project, candidate, evidenceBundle } = createAcceptedPreviewFixture();
  const rejectedCandidate = withDecisionStatus(candidate, "rejected");
  const incompleteEvidence = structuredClone(evidenceBundle);
  incompleteEvidence.coverage.unexplainedImpactRefs = ["character:lin-yuan:knowledge_change"];

  assert.deepEqual(validateStoryChangePreviewInput({ project, candidate: rejectedCandidate, evidenceBundle }), {
    version: "world-os-story-change-preview-validation-v1",
    valid: false,
    violations: ["Author decision must be accepted or modified before change preview."]
  });
  assert.throws(
    () =>
      buildStoryChangePreview({
        project,
        candidate: rejectedCandidate,
        authorDecision: rejectedCandidate.selectedDecision,
        evidenceBundle,
        previousSnapshotId: "snapshot-before-change-2"
      }),
    /Author decision must be accepted or modified before change preview/
  );
  assert.deepEqual(validateStoryChangePreviewInput({ project, candidate, evidenceBundle: incompleteEvidence }), {
    version: "world-os-story-change-preview-validation-v1",
    valid: false,
    violations: ["All preview changes must be traceable to evidence."]
  });
});

test("StoryChangePreview traces every proposed change back to evidence", async () => {
  assert.equal(existsSync("src/domainTemplates/storyWorld/changePreview/index.ts"), true, "change preview index must exist");
  const { buildStoryChangePreview } = await import("../../src/domainTemplates/storyWorld/changePreview/index.ts");
  const { project, candidate, evidenceBundle } = createAcceptedPreviewFixture();
  const preview = buildStoryChangePreview({
    project,
    candidate,
    authorDecision: candidate.selectedDecision,
    evidenceBundle,
    previousSnapshotId: "snapshot-before-change-3"
  });

  const allChanges = [
    ...preview.changeSet.addedFacts,
    ...preview.changeSet.changedRelationships,
    ...preview.changeSet.triggeredEvents
  ];

  assert.equal(allChanges.length > 0, true);
  for (const change of allChanges) {
    assert.equal(change.evidenceRefs.length > 0, true, `missing evidence refs for ${change.id}`);
    assert.equal(change.evidenceRefs.every((ref) => ref.startsWith("evidence-")), true);
  }
  assert.deepEqual(preview.changeSet.addedFacts[0].evidenceRefs, [
    "evidence-character:a-lan:knowledge_change",
    "evidence-character:lin-yuan:knowledge_change"
  ]);
  assert.deepEqual(preview.changeSet.triggeredEvents[0].evidenceRefs, [
    "evidence-event:event-3:dependency_effect"
  ]);
});


function createAcceptedPreviewFixture() {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createStoryAuthorIntent({
    id: "change-intent-1",
    content: "让林远发现旧灯塔地下室的秘密，但保持潮门不能主动开启。",
    source: "author",
    targetScope: "event",
    createdAtLogical: 51,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
  const report = analyzeStoryImpactReport(project, intent);
  const workspace = createStoryDecisionWorkspace(report);
  const resolution = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-change-intent-1-a",
    status: "accepted",
    authorNotes: ["采用显性揭示，但提交前先看世界差异。"]
  });

  assert.notEqual(resolution.commitCandidate, undefined);

  return {
    project,
    candidate: resolution.commitCandidate,
    evidenceBundle: resolveStoryEvidenceBundle(project, report)
  };
}

function withDecisionStatus(candidate: StoryCommitCandidate, status: "pending" | "rejected"): StoryCommitCandidate {
  const copy = structuredClone(candidate) as unknown as StoryCommitCandidate & {
    selectedDecision: {
      status: "pending" | "rejected";
    };
  };
  copy.selectedDecision.status = status;

  return copy as unknown as StoryCommitCandidate;
}

function readSourceTree(root: string): string {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = `${root}/${entry}`;
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return readSourceTree(path);
      }

      return path.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}
