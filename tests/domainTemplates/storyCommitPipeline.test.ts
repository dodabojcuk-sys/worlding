import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import { createStoryAuthorIntent } from "../../src/domainTemplates/storyWorld/intent/index.ts";
import { analyzeStoryImpactReport } from "../../src/domainTemplates/storyWorld/analysis/index.ts";
import {
  createStoryDecisionWorkspace,
  resolveAuthorDecision,
  type StoryCommitCandidate
} from "../../src/domainTemplates/storyWorld/decision/index.ts";
import {
  commitStoryEvent,
  previewStoryCommit,
  validateStoryCommitCandidate
} from "../../src/domainTemplates/storyWorld/commit/index.ts";

test("StoryCommitPipeline previews candidate changes before committing", () => {
  const project = createStoryProject();
  const candidate = createAcceptedCandidate();
  const preview = previewStoryCommit(project, candidate, {
    logicalTimestamp: 41,
    previousSnapshotId: "snapshot-before-41"
  });

  assert.deepEqual(preview, {
    version: "world-os-story-commit-preview-v1",
    id: "commit-preview-commit-candidate-commit-intent-1-a",
    candidateId: "commit-candidate-commit-intent-1-a",
    commitId: "story-commit-commit-intent-1",
    changes: [
      "Accept immediate reveal: Let the discovery become explicit in the current chapter.",
      "Risk level: high"
    ],
    affectedCharacters: ["a-lan", "lin-yuan"],
    affectedEvents: ["event-3"],
    affectedRules: [],
    chapterImpact: ["chapter-3"],
    rollbackReference: {
      version: "world-os-story-rollback-reference-v1",
      previousSnapshotId: "snapshot-before-41",
      affectedObjects: {
        characters: ["a-lan", "lin-yuan"],
        events: ["event-3"],
        rules: []
      }
    },
    validation: {
      version: "world-os-story-commit-validation-v1",
      valid: true,
      violations: []
    }
  });
});

test("StoryCommitPipeline commits accepted candidates with history without mutating input project", () => {
  const project = createStoryProject();
  const before = structuredClone(project);
  const candidate = createAcceptedCandidate();
  const resultA = commitStoryEvent(project, candidate, {
    logicalTimestamp: 42,
    previousSnapshotId: "snapshot-before-42"
  });
  const resultB = commitStoryEvent(project, candidate, {
    logicalTimestamp: 42,
    previousSnapshotId: "snapshot-before-42"
  });

  assert.deepEqual(resultA, resultB);
  assert.deepEqual(project, before);
  assert.equal(resultA.version, "world-os-story-commit-result-v1");
  assert.deepEqual(resultA.commit, {
    version: "world-os-story-event-commit-v1",
    id: "story-commit-commit-intent-1",
    projectId: "mist-lighthouse",
    chapterId: "chapter-3",
    event: {
      id: "story-event-commit-intent-1",
      chapter: "chapter-3",
      timelinePosition: 31,
      participants: ["a-lan", "lin-yuan"],
      consequences: [
        "Accept immediate reveal: Let the discovery become explicit in the current chapter.",
        "Risk level: high"
      ]
    },
    source: {
      candidateId: "commit-candidate-commit-intent-1-a",
      intentId: "commit-intent-1",
      decisionId: "decision-commit-intent-1-a",
      authorChoice: "accepted"
    }
  });
  assert.deepEqual(resultA.history, {
    version: "world-os-story-commit-history-v1",
    commitId: "story-commit-commit-intent-1",
    sourceIntentId: "commit-intent-1",
    decisionId: "decision-commit-intent-1-a",
    logicalTimestamp: 42,
    changes: [
      "Accept immediate reveal: Let the discovery become explicit in the current chapter.",
      "Risk level: high"
    ],
    authorNotes: ["接受方案 A，进入提交预览。"],
    rollbackReference: {
      version: "world-os-story-rollback-reference-v1",
      previousSnapshotId: "snapshot-before-42",
      affectedObjects: {
        characters: ["a-lan", "lin-yuan"],
        events: ["event-3"],
        rules: []
      }
    }
  });
  assert.equal(resultA.project.events.length, 4);
  assert.equal(project.events.length, 3);
});

test("StoryCommitPipeline rejects pending and rejected candidates", () => {
  const project = createStoryProject();
  const accepted = createAcceptedCandidate();
  const pending = withDecisionStatus(accepted, "pending");
  const rejected = withDecisionStatus(accepted, "rejected");

  assert.deepEqual(validateStoryCommitCandidate(project, pending), {
    version: "world-os-story-commit-validation-v1",
    valid: false,
    violations: ["Author decision must be accepted or modified before commit."]
  });
  assert.throws(
    () => commitStoryEvent(project, pending, { logicalTimestamp: 43, previousSnapshotId: "snapshot-before-43" }),
    /Author decision must be accepted or modified before commit/
  );
  assert.throws(
    () => commitStoryEvent(project, rejected, { logicalTimestamp: 44, previousSnapshotId: "snapshot-before-44" }),
    /Author decision must be accepted or modified before commit/
  );
});

test("StoryCommitPipeline rejects invalid world rules and duplicate events", () => {
  const project = createStoryProject();
  const invalidRuleCandidate = {
    ...createAcceptedCandidate(),
    worldChangesProposal: ["Change rule: 工业时代技术水平不得自动跃迁 -> 科技时代"]
  };
  const duplicateProject = structuredClone(project);
  duplicateProject.events.push({
    id: "story-event-commit-intent-1",
    chapter: "chapter-3",
    timelinePosition: 31,
    participants: ["lin-yuan"],
    consequences: ["Already committed"]
  });

  assert.deepEqual(validateStoryCommitCandidate(project, invalidRuleCandidate), {
    version: "world-os-story-commit-validation-v1",
    valid: false,
    violations: ["World rule violation: technology level cannot drift without a keyframe."]
  });
  assert.deepEqual(validateStoryCommitCandidate(duplicateProject, createAcceptedCandidate()), {
    version: "world-os-story-commit-validation-v1",
    valid: false,
    violations: ["Duplicate story event id: story-event-commit-intent-1."]
  });
});


function createStoryProject() {
  return createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
}

function createAcceptedCandidate(): StoryCommitCandidate {
  const project = createStoryProject();
  const intent = createStoryAuthorIntent({
    id: "commit-intent-1",
    content: "让林远发现旧灯塔地下室的秘密，但保持潮门不能主动开启。",
    source: "author",
    targetScope: "event",
    createdAtLogical: 31,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
  const report = analyzeStoryImpactReport(project, intent);
  const workspace = createStoryDecisionWorkspace(report);
  const resolved = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-commit-intent-1-a",
    status: "accepted",
    authorNotes: ["接受方案 A，进入提交预览。"]
  });

  assert.notEqual(resolved.commitCandidate, undefined);
  return resolved.commitCandidate;
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
