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
import { commitStoryEvent } from "../../src/domainTemplates/storyWorld/commit/index.ts";
import {
  planStoryScene,
  reviewStoryScenePlan,
  validateStoryScenePlan
} from "../../src/domainTemplates/storyWorld/scene/index.ts";

test("StoryScenePlanning turns a committed world event into an author-reviewable scene plan", () => {
  const { project, commit } = createCommittedStoryChange();
  const planA = planStoryScene(project, commit);
  const planB = planStoryScene(project, commit);

  assert.deepEqual(planA, planB);
  assert.deepEqual(planA, {
    version: "world-os-story-scene-plan-v1",
    sceneId: "scene-story-commit-scene-intent-1",
    chapterId: "chapter-3",
    sourceCommitId: "story-commit-scene-intent-1",
    purpose: "Transform story-event-scene-intent-1 into a draft-ready scene structure.",
    characters: ["a-lan", "lin-yuan"],
    location: "old-lighthouse",
    conflict: "Reveal the committed change while preserving unresolved story pressure.",
    beats: [
      {
        type: "opening",
        summary: "Establish old-lighthouse and the immediate chapter situation."
      },
      {
        type: "development",
        summary: "Show a-lan and lin-yuan reacting to story-event-scene-intent-1."
      },
      {
        type: "conflict",
        summary: "Put the committed change against loop-1 and loop-2."
      },
      {
        type: "turning_point",
        summary: "Surface: Accept immediate reveal: Let the discovery become explicit in the current chapter."
      },
      {
        type: "resolution",
        summary: "End with a draft handoff, not finished prose."
      }
    ],
    emotionalGoal: "Controlled discovery with suspense preserved.",
    informationReveal: "Accept immediate reveal: Let the discovery become explicit in the current chapter.",
    risks: ["Risk level: high"],
    review: {
      status: "pending",
      authorNotes: []
    }
  });
  assert.equal("chapterText" in planA, false);
  assert.equal("draftText" in planA, false);
});

test("StoryScenePlanning validates scene beat structure and rejects chapter text", () => {
  const { project, commit } = createCommittedStoryChange();
  const plan = planStoryScene(project, commit);
  const invalidPlan = {
    ...plan,
    beats: plan.beats.slice(0, 4),
    draftText: "This should not exist."
  };

  assert.deepEqual(validateStoryScenePlan(plan), {
    version: "world-os-story-scene-validation-v1",
    valid: true,
    violations: []
  });
  assert.deepEqual(validateStoryScenePlan(invalidPlan), {
    version: "world-os-story-scene-validation-v1",
    valid: false,
    violations: [
      "Scene plan must contain opening, development, conflict, turning point, and resolution beats.",
      "Scene plan must not contain generated chapter text."
    ]
  });
});

test("StoryScenePlanning requires author review before draft handoff", () => {
  const { project, commit } = createCommittedStoryChange();
  const plan = planStoryScene(project, commit);
  const pending = reviewStoryScenePlan(plan, {
    status: "pending"
  });
  const rejected = reviewStoryScenePlan(plan, {
    status: "rejected",
    authorNotes: ["这一场先不进入草稿。"]
  });
  const accepted = reviewStoryScenePlan(plan, {
    status: "accepted",
    authorNotes: ["接受这个场景结构。"]
  });

  assert.equal(pending.canDraft, false);
  assert.equal(rejected.canDraft, false);
  assert.equal(accepted.canDraft, true);
  assert.deepEqual(accepted.plan.review, {
    status: "accepted",
    authorNotes: ["接受这个场景结构。"]
  });
});

test("StoryScenePlanning requires author notes for modified scene review", () => {
  const { project, commit } = createCommittedStoryChange();
  const plan = planStoryScene(project, commit);

  assert.throws(
    () =>
      reviewStoryScenePlan(plan, {
        status: "modified"
      }),
    /Modified scene review requires author notes/
  );

  const modified = reviewStoryScenePlan(plan, {
    status: "modified",
    authorNotes: ["把揭示改成钥匙线索，不直接揭示地下室秘密。"]
  });

  assert.equal(modified.canDraft, true);
  assert.equal(modified.plan.review.status, "modified");
  assert.deepEqual(modified.plan.review.authorNotes, ["把揭示改成钥匙线索，不直接揭示地下室秘密。"]);
});

test("StoryScenePlanning does not mutate world state or create chapter prose", () => {
  const { project, commit } = createCommittedStoryChange();
  const before = structuredClone(project);
  const plan = planStoryScene(project, commit);
  const accepted = reviewStoryScenePlan(plan, {
    status: "accepted",
    authorNotes: ["确认场景计划。"]
  });

  assert.deepEqual(project, before);
  assert.deepEqual(accepted.plan.beats, plan.beats);
  assert.equal(JSON.stringify(accepted).includes("正文"), false);
  assert.equal(JSON.stringify(accepted).includes("3000"), false);
});


function createCommittedStoryChange() {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const candidate = createAcceptedCandidate();
  const result = commitStoryEvent(project, candidate, {
    logicalTimestamp: 51,
    previousSnapshotId: "snapshot-before-scene-51"
  });

  return {
    project: result.project,
    commit: result.commit
  };
}

function createAcceptedCandidate(): StoryCommitCandidate {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createStoryAuthorIntent({
    id: "scene-intent-1",
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
  const resolved = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-scene-intent-1-a",
    status: "accepted",
    authorNotes: ["接受方案 A，进入场景规划。"]
  });

  assert.notEqual(resolved.commitCandidate, undefined);
  return resolved.commitCandidate;
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
