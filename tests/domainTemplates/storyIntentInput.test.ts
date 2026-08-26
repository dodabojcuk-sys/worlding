import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import {
  analyzeStoryImpact,
  commitStoryEvent,
  createStoryAuthoringFlow
} from "../../src/domainTemplates/storyWorld/workflow/index.ts";
import {
  buildIntentImpactRequest,
  buildWorkflowIntentFromImpactRequest,
  classifyStoryIntent,
  createIntentHistory,
  createStoryAuthorIntent,
  recordIntentHistory,
  updateIntentHistoryStatus
} from "../../src/domainTemplates/storyWorld/intent/index.ts";

test("StoryAuthorIntent captures author input as deterministic inert data", () => {
  const input = {
    id: "intent-input-1",
    content: "林远怀疑阿岚和旧灯塔的关系发生变化。",
    source: "author" as const,
    targetScope: "relationship" as const,
    createdAtLogical: 12,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  };

  const intentA = createStoryAuthorIntent(input);
  const intentB = createStoryAuthorIntent(input);

  assert.deepEqual(intentA, intentB);
  assert.deepEqual(intentA, {
    id: "intent-input-1",
    content: "林远怀疑阿岚和旧灯塔的关系发生变化。",
    source: "author",
    targetScope: "relationship",
    createdAtLogical: 12,
    relatedCharacters: ["a-lan", "lin-yuan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
});

test("IntentClassifier deterministically classifies change type and author priority", () => {
  const authorRuleIntent = createStoryAuthorIntent({
    id: "intent-rule",
    content: "保持潮门不能主动开启这条世界规则。",
    source: "author",
    targetScope: "world_rule",
    createdAtLogical: 13,
    relatedCharacters: [],
    relatedEvents: [],
    relatedLocations: []
  });
  const aiSceneIntent = createStoryAuthorIntent({
    id: "intent-scene",
    content: "建议新增一个雾港码头场景。",
    source: "ai",
    targetScope: "new_scene",
    createdAtLogical: 13,
    relatedCharacters: [],
    relatedEvents: [],
    relatedLocations: ["fog-port"]
  });

  assert.deepEqual(classifyStoryIntent(authorRuleIntent), {
    version: "world-os-story-intent-classification-v1",
    intentId: "intent-rule",
    primaryType: "world_rule_change",
    intentTypes: ["world_rule_change"],
    priority: 100,
    reasons: ["targetScope maps to world_rule_change", "author source has highest priority"]
  });
  assert.deepEqual(classifyStoryIntent(aiSceneIntent), {
    version: "world-os-story-intent-classification-v1",
    intentId: "intent-scene",
    primaryType: "new_scene",
    intentTypes: ["new_scene"],
    priority: 10,
    reasons: ["targetScope maps to new_scene", "AI source requires author confirmation"]
  });
});

test("IntentImpactRequest connects AuthorIntent to ImpactAnalysis without modifying the world", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const beforeEventCount = project.events.length;
  const intent = createStoryAuthorIntent({
    id: "intent-impact",
    content: "林远发现阿岚到过旧灯塔，关系线需要调整。",
    source: "author",
    targetScope: "relationship",
    createdAtLogical: 14,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
  const requestA = buildIntentImpactRequest(project, intent);
  const requestB = buildIntentImpactRequest(project, intent);

  assert.deepEqual(requestA, requestB);
  assert.equal(project.events.length, beforeEventCount);
  assert.deepEqual(requestA, {
    version: "world-os-intent-impact-request-v1",
    intent,
    affectedObjects: {
      characters: ["a-lan", "lin-yuan"],
      events: ["event-3"],
      locations: ["old-lighthouse"],
      rules: []
    },
    analysisNeeded: ["relationship_change", "character_change", "event_change", "new_scene"],
    workflowTarget: {
      chapterId: "chapter-3"
    }
  });
});

test("AI and imported input cannot enter workflow without author confirmation", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const aiIntent = createStoryAuthorIntent({
    id: "intent-ai",
    content: "AI建议林远直接打开潮门。",
    source: "ai",
    targetScope: "world_rule",
    createdAtLogical: 15,
    relatedCharacters: ["lin-yuan"],
    relatedEvents: ["event-3"],
    relatedLocations: []
  });
  const request = buildIntentImpactRequest(project, aiIntent);

  assert.throws(
    () => buildWorkflowIntentFromImpactRequest(request),
    /Author confirmation required before non-author input can enter Story Authoring Workflow/
  );
  assert.equal(project.events.length, 3);

  const workflowIntent = buildWorkflowIntentFromImpactRequest(request, {
    authorConfirmed: true,
    authorNote: "作者只采纳为待分析建议。"
  });
  const analysis = analyzeStoryImpact(project, workflowIntent);

  assert.equal(analysis.authorChoice.choice, "pending");
  assert.throws(
    () => commitStoryEvent(project, analysis),
    /AuthorDecision required before StoryEventCommit/
  );
  assert.equal(project.events.length, 3);
});

test("IntentHistory records source and author priority while tracking status", () => {
  const history = createIntentHistory("mist-lighthouse");
  const aiIntent = createStoryAuthorIntent({
    id: "intent-ai-history",
    content: "AI建议新增海雾预兆。",
    source: "ai",
    targetScope: "new_scene",
    createdAtLogical: 10,
    relatedCharacters: [],
    relatedEvents: [],
    relatedLocations: ["fog-port"]
  });
  const authorIntent = createStoryAuthorIntent({
    id: "intent-author-history",
    content: "作者决定先处理阿岚线索。",
    source: "author",
    targetScope: "character",
    createdAtLogical: 11,
    relatedCharacters: ["a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: []
  });

  const withAi = recordIntentHistory(history, aiIntent);
  const withAuthor = recordIntentHistory(withAi, authorIntent);
  const accepted = updateIntentHistoryStatus(withAuthor, "intent-author-history", "accepted");
  const rejected = updateIntentHistoryStatus(accepted, "intent-ai-history", "rejected");

  assert.deepEqual(withAuthor.entries.map((entry) => [entry.intent.id, entry.status, entry.sourcePriority]), [
    ["intent-author-history", "pending", 100],
    ["intent-ai-history", "pending", 10]
  ]);
  assert.deepEqual(rejected.entries.map((entry) => [entry.intent.id, entry.status]), [
    ["intent-author-history", "accepted"],
    ["intent-ai-history", "rejected"]
  ]);
  assert.equal(history.entries.length, 0);
});

test("Story Authoring Flow starts from AuthorInput before AuthorIntent", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const flow = createStoryAuthoringFlow(project);

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
