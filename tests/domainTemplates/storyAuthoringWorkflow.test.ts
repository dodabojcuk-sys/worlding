import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import {
  analyzeStoryImpact,
  applyAuthorDecision,
  applyStoryWorldUpdate,
  buildStoryChapterState,
  buildStoryWorkflowDashboard,
  commitStoryEvent,
  createAuthorIntent,
  createStoryAuthoringFlow
} from "../../src/domainTemplates/storyWorld/workflow/index.ts";

test("StoryAuthoringFlow defines the author-controlled story lifecycle", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const flow = createStoryAuthoringFlow(project);

  assert.equal(flow.version, "world-os-story-authoring-flow-v1");
  assert.equal(flow.projectId, "mist-lighthouse");
  assert.equal(flow.currentStage, "AuthorInput");
  assert.deepEqual(flow.lifecycle, [
    "AuthorInput",
    "AuthorIntent",
    "ImpactAnalysis",
    "AuthorDecision",
    "StoryEventCommit",
    "ChapterDraft",
    "WorldUpdate"
  ]);
  assert.deepEqual(flow.observation, {
    worldTitle: "雾中灯塔",
    currentChapterId: "chapter-3",
    currentChapterTitle: "第3章 · 灯塔下层",
    eventCount: 3,
    openLoopCount: 2,
    ruleCount: 3
  });
  assert.equal(flow.deterministic, true);
});

test("AI suggestions cannot bypass AuthorDecision and modify the world", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createAuthorIntent({
    id: "intent-1",
    chapterId: "chapter-3",
    text: "林远在灯塔下层发现阿岚留下的煤油灯。",
    proposedChanges: [
      {
        type: "character",
        targetId: "lin-yuan",
        summary: "林远确认阿岚到过灯塔下层"
      },
      {
        type: "relationship",
        targetId: "a-lan",
        summary: "阿岚与旧灯塔的关系变成待确认线索"
      }
    ]
  });
  const analysis = analyzeStoryImpact(project, intent);

  assert.equal(analysis.proposal.source, "ai_suggestion");
  assert.equal(analysis.authorChoice.choice, "pending");
  assert.deepEqual(analysis.affectedCharacters, ["a-lan", "lin-yuan"]);
  assert.deepEqual(analysis.affectedEvents, ["event-3"]);

  assert.throws(
    () => commitStoryEvent(project, analysis),
    /AuthorDecision required before StoryEventCommit/
  );
  assert.equal(project.events.length, 3);

  const rejected = applyAuthorDecision(analysis, {
    choice: "reject",
    note: "这一段先不要进入正史。"
  });

  assert.throws(
    () => commitStoryEvent(project, rejected),
    /Only accepted or modified author decisions can be committed/
  );
  assert.equal(project.events.length, 3);
});

test("Accepted author decisions create traceable story events and sourced world updates", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createAuthorIntent({
    id: "intent-2",
    chapterId: "chapter-3",
    text: "林远确认潮门仍关闭，但阿岚曾在下层停留。",
    proposedChanges: [
      {
        type: "character",
        targetId: "lin-yuan",
        summary: "林远获得阿岚到访证据"
      },
      {
        type: "time",
        targetId: "event-3",
        summary: "第3章新增灯塔下层证据节点"
      },
      {
        type: "rule",
        targetId: "潮门不能主动开启",
        summary: "确认潮门规则不被改写"
      }
    ]
  });
  const analysis = analyzeStoryImpact(project, intent);
  const decision = applyAuthorDecision(analysis, {
    choice: "accept",
    note: "进入第3章草稿。"
  });
  const commit = commitStoryEvent(project, decision);
  const worldUpdate = applyStoryWorldUpdate(project, commit);

  assert.deepEqual(commit, {
    version: "world-os-story-event-commit-v1",
    id: "commit-intent-2",
    projectId: "mist-lighthouse",
    chapterId: "chapter-3",
    event: {
      id: "story-event-intent-2",
      chapter: "chapter-3",
      timelinePosition: 31,
      participants: ["lin-yuan"],
      consequences: [
        "林远获得阿岚到访证据",
        "第3章新增灯塔下层证据节点",
        "确认潮门规则不被改写"
      ]
    },
    source: {
      intentId: "intent-2",
      decisionId: "decision-intent-2",
      authorChoice: "accept"
    },
    trace: [
      "AuthorInput",
      "AuthorIntent",
      "ImpactAnalysis",
      "AuthorDecision",
      "StoryEventCommit"
    ]
  });
  assert.equal(project.events.length, 3);
  assert.equal(worldUpdate.project.events.length, 4);
  assert.deepEqual(worldUpdate.source, {
    commitId: "commit-intent-2",
    eventId: "story-event-intent-2",
    decisionId: "decision-intent-2",
    intentId: "intent-2"
  });
  assert.deepEqual(worldUpdate.changes, {
    addedEventIds: ["story-event-intent-2"],
    affectedCharacterIds: ["lin-yuan"],
    openThreadIds: ["loop-1", "loop-2"]
  });
});

test("StoryChapterState is stable after event commit", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createAuthorIntent({
    id: "intent-3",
    chapterId: "chapter-3",
    text: "阿岚的警告被写入章节线索。",
    proposedChanges: [
      {
        type: "character",
        targetId: "a-lan",
        summary: "阿岚的警告进入第3章草稿"
      }
    ]
  });
  const decision = applyAuthorDecision(analyzeStoryImpact(project, intent), {
    choice: "modify",
    note: "改成线索，不直接揭示真相。",
    modifiedProposal: "阿岚的警告只作为灯塔下层线索出现。"
  });
  const commit = commitStoryEvent(project, decision);
  const chapterA = buildStoryChapterState(project, commit);
  const chapterB = buildStoryChapterState(project, commit);

  assert.deepEqual(chapterA, chapterB);
  assert.deepEqual(chapterA, {
    version: "world-os-story-chapter-state-v1",
    chapterId: "chapter-3",
    status: "event_committed",
    relatedEvents: ["event-3", "story-event-intent-3"],
    involvedCharacters: ["a-lan"],
    openThreads: ["loop-1", "loop-2"],
    draftState: {
      status: "ready_for_draft",
      sourceCommitId: "commit-intent-3",
      requiredAuthorReview: true
    }
  });
});

test("StoryWorkflowDashboardModel explains current work, next step, and pending decision", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const flow = createStoryAuthoringFlow(project);
  const intent = createAuthorIntent({
    id: "intent-4",
    chapterId: "chapter-3",
    text: "林远准备打开下层门，但规则禁止潮门主动开启。",
    proposedChanges: [
      {
        type: "rule",
        targetId: "潮门不能主动开启",
        summary: "作者需要决定是否保持潮门限制"
      }
    ]
  });
  const analysis = analyzeStoryImpact(project, intent);
  const dashboard = buildStoryWorkflowDashboard({
    flow,
    decision: analysis
  });

  assert.deepEqual(dashboard, {
    version: "world-os-story-workflow-dashboard-v1",
    happening: "Impact analysis is waiting for author decision.",
    nextStep: "AuthorDecision",
    waitingForAuthor: "Choose accept, modify, or reject for proposal-intent-4.",
    currentStage: "ImpactAnalysis",
    visibleItems: ["proposal", "affectedCharacters", "risks"]
  });
});

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
