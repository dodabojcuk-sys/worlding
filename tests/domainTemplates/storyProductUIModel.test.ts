import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
import { planStoryScene, reviewStoryScenePlan } from "../../src/domainTemplates/storyWorld/scene/index.ts";
import { createStoryWritingWorkspace } from "../../src/domainTemplates/storyWorld/writing/index.ts";
import {
  projectStoryProductUIState,
  validateStoryProductUIState
} from "../../src/domainTemplates/storyWorld/productUI/storyUIProjection.ts";

test("StoryProductUIModel projects Story World domain state into four author-facing panels", () => {
  const domain = createDomainState();
  const stateA = projectStoryProductUIState({
    project: domain.project,
    writingWorkspace: domain.writingWorkspace,
    impactReport: domain.impactReport,
    decisionWorkspace: domain.decisionWorkspace,
    currentWorkspace: "writing"
  });
  const stateB = projectStoryProductUIState({
    project: domain.project,
    writingWorkspace: domain.writingWorkspace,
    impactReport: domain.impactReport,
    decisionWorkspace: domain.decisionWorkspace,
    currentWorkspace: "writing"
  });

  assert.deepEqual(stateA, stateB);
  assert.equal(stateA.version, "world-os-story-product-ui-state-v1");
  assert.equal(stateA.currentWorkspace, "writing");
  assert.deepEqual(stateA.activeChapter, {
    id: "chapter-3",
    title: "第3章 · 灯塔下层",
    status: "drafting",
    primaryAction: "Continue writing",
    visibleConcepts: ["chapter", "scenes", "constraints"]
  });
  assert.deepEqual(stateA.activeScene, {
    id: "scene-story-commit-ui-intent-1",
    sourceCommitId: "story-commit-ui-intent-1",
    status: "ready_for_draft",
    purpose: "Transform story-event-ui-intent-1 into a draft-ready scene structure.",
    primaryAction: "Prepare draft request",
    visibleConcepts: ["scene", "beats", "locks"]
  });
  assert.deepEqual(stateA.worldSummary, {
    title: "雾中灯塔",
    characters: ["阿岚", "林远"],
    locations: ["雾港", "旧灯塔"],
    events: ["event-1", "event-2", "event-3", "story-event-ui-intent-1"],
    primaryAction: "Review world",
    visibleConcepts: ["characters", "locations", "events"]
  });
  assert.deepEqual(stateA.characterPanel, {
    focus: ["a-lan:missing", "lin-yuan:drafting"],
    locked: ["character facts", "world rules", "approved decisions"],
    editable: ["wording", "pacing", "description", "scene_expansion"],
    primaryAction: "Review character constraints",
    visibleConcepts: ["focus", "locked", "editable"]
  });
});

test("StoryProductUIModel exposes Tianyi decision and inspect panels without chat-first behavior", () => {
  const domain = createDomainState();
  const state = projectStoryProductUIState({
    project: domain.project,
    writingWorkspace: domain.writingWorkspace,
    impactReport: domain.impactReport,
    decisionWorkspace: domain.decisionWorkspace,
    currentWorkspace: "ai_assistant"
  });

  assert.deepEqual(state.aiDecisionPanel, {
    title: "天意",
    status: "decision_ready",
    impactSummary: [
      "character:a-lan",
      "character:lin-yuan",
      "event:event-3",
      "rule:潮门不能主动开启",
      "rule:old-lighthouse"
    ],
    alternatives: ["immediate reveal", "partial clue", "delayed reveal"],
    pendingDecision: {
      intentId: "ui-intent-1",
      optionIds: [
        "decision-ui-intent-1-a",
        "decision-ui-intent-1-b",
        "decision-ui-intent-1-c",
        "decision-ui-intent-1-custom",
        "decision-ui-intent-1-reject"
      ]
    },
    primaryAction: "Choose story path",
    visibleConcepts: ["impact", "alternatives", "decision"]
  });
  assert.deepEqual(state.consistencyPanel, {
    consistency: {
      characterConsistency: 95,
      timelineConflicts: 0,
      unresolvedThreads: 2
    },
    recentHistory: ["story-commit-ui-intent-1", "story-event-ui-intent-1"],
    primaryAction: "Inspect consistency",
    visibleConcepts: ["consistency", "threads", "history"]
  });
  assert.deepEqual(state.nextAction, {
    id: "prepare-draft-request",
    label: "Prepare draft request",
    targetWorkspace: "writing",
    reason: "Accepted scene plan is ready for structured draft preparation."
  });
});

test("StoryProductUIModel validates primary actions, concept limits, and product wording", () => {
  const domain = createDomainState();
  const state = projectStoryProductUIState({
    project: domain.project,
    writingWorkspace: domain.writingWorkspace,
    impactReport: domain.impactReport,
    decisionWorkspace: domain.decisionWorkspace,
    currentWorkspace: "inspect"
  });

  assert.deepEqual(validateStoryProductUIState(state), {
    version: "world-os-story-product-ui-validation-v1",
    valid: true,
    violations: []
  });

  const invalidState = structuredClone(state);
  invalidState.writingPanel.visibleConcepts.push("extra");
  invalidState.writingPanel.primaryAction = "";

  assert.deepEqual(validateStoryProductUIState(invalidState), {
    version: "world-os-story-product-ui-validation-v1",
    valid: false,
    violations: [
      "Every product panel needs a primary action.",
      "Visible concepts must be three or fewer per panel."
    ]
  });
});

test("StoryProductUIModel is a projection only and stays outside lower systems", () => {
  const domain = createDomainState();
  const before = structuredClone(domain.project);
  const state = projectStoryProductUIState({
    project: domain.project,
    writingWorkspace: domain.writingWorkspace,
    impactReport: domain.impactReport,
    decisionWorkspace: domain.decisionWorkspace,
    currentWorkspace: "world"
  });
  const source = readSourceTree("src/domainTemplates/storyWorld/productUI");
  const imports = [...new Set([...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]))].sort();

  assert.deepEqual(domain.project, before);
  assert.equal(JSON.stringify(state).includes("gateway"), false);
  assert.equal(JSON.stringify(state).includes("execution"), false);
  assert.deepEqual(imports, [
    "../analysis/index.ts",
    "../decision/index.ts",
    "../index.ts",
    "../writing/index.ts",
    "./storyUIState.ts"
  ]);

  const forbidden = [
    ["gate", "way"],
    ["exec", "ution"],
    ["run", "time"],
    ["skill", "Runtime"],
    ["plugin"],
    ["memory", "core"],
    ["ui", "Rendering"],
    ["agent"],
    ["generate", "Chapter"],
    ["execute", "Intent"],
    ["Execution", "Gateway"],
    ["process", "Intent"],
    ["fetch", "("],
    ["XML", "Http", "Request"],
    ["Date", ".now"],
    ["Math", ".random"]
  ].map((parts) => parts.join(""));

  for (const term of forbidden) {
    assert.equal(source.includes(term), false, `forbidden product UI source term leaked: ${term}`);
  }
});

function createDomainState() {
  const baseProject = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createStoryAuthorIntent({
    id: "ui-intent-1",
    content: "让林远发现旧灯塔地下室的秘密，但保持潮门不能主动开启。",
    source: "author",
    targetScope: "event",
    createdAtLogical: 71,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
  const impactReport = analyzeStoryImpactReport(baseProject, intent);
  const decisionWorkspace = createStoryDecisionWorkspace(impactReport);
  const resolved = resolveAuthorDecision({
    workspace: decisionWorkspace,
    selectedOptionId: "decision-ui-intent-1-a",
    status: "accepted",
    authorNotes: ["接受方案 A，进入产品 UI 投影。"]
  });
  const commitCandidate = resolved.commitCandidate as StoryCommitCandidate;
  const commitResult = commitStoryEvent(baseProject, commitCandidate, {
    logicalTimestamp: 71,
    previousSnapshotId: "snapshot-before-ui-71"
  });
  const scenePlan = planStoryScene(commitResult.project, commitResult.commit);
  const acceptedScene = reviewStoryScenePlan(scenePlan, {
    status: "accepted",
    authorNotes: ["确认场景计划。"]
  }).plan;
  const writingWorkspace = createStoryWritingWorkspace(commitResult.project, [acceptedScene]);

  return {
    project: commitResult.project,
    impactReport,
    decisionWorkspace,
    writingWorkspace
  };
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
