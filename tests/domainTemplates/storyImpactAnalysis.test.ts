import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import { commitStoryEvent } from "../../src/domainTemplates/storyWorld/workflow/index.ts";
import { createStoryAuthorIntent } from "../../src/domainTemplates/storyWorld/intent/index.ts";
import {
  analyzeStoryImpactReport,
  buildAuthorDecisionInputFromImpactReport
} from "../../src/domainTemplates/storyWorld/analysis/index.ts";

test("StoryImpactAnalysisEngine produces an explainable deterministic impact report", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createDiscoveryIntent();
  const reportA = analyzeStoryImpactReport(project, intent);
  const reportB = analyzeStoryImpactReport(project, intent);

  assert.deepEqual(reportA, reportB);
  assert.equal(reportA.version, "world-os-story-impact-report-v1");
  assert.equal(reportA.intentId, "impact-intent-1");
  assert.equal(reportA.confidence, 0.84);
  assert.deepEqual(reportA.affectedCharacters.map((impact) => [impact.characterId, impact.category, impact.summary]), [
    ["a-lan", "knowledge_change", "阿岚 is tied to the discovered clue."],
    ["lin-yuan", "knowledge_change", "林远 gains new information from the intent."]
  ]);
  assert.deepEqual(reportA.affectedEvents, [
    {
      eventId: "event-3",
      category: "dependency_effect",
      summary: "Existing event event-3 becomes a dependency for the new author intent.",
      chapter: "chapter-3"
    }
  ]);
  assert.deepEqual(reportA.affectedRules, [
    {
      rule: "潮门不能主动开启",
      category: "rule_conflict",
      summary: "Intent mentions a protected world rule: 潮门不能主动开启."
    },
    {
      rule: "old-lighthouse",
      category: "location_impact",
      summary: "Intent affects location old-lighthouse."
    }
  ]);
  assert.deepEqual(reportA.reasoning, [
    "Intent source author is analyzed as suggestion data only.",
    "Matched 2 character references.",
    "Matched 1 event references.",
    "Matched 1 location references.",
    "Detected discovery language, so knowledge impact is primary."
  ]);
});

test("StoryImpactAnalysisEngine detects relationship and event dependency effects", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createStoryAuthorIntent({
    id: "impact-intent-relationship",
    content: "林远开始怀疑阿岚隐瞒了旧灯塔地下室的线索。",
    source: "author",
    targetScope: "relationship",
    createdAtLogical: 22,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-2", "event-3"],
    relatedLocations: ["old-lighthouse"]
  });
  const report = analyzeStoryImpactReport(project, intent);

  assert.deepEqual(report.affectedRelationships, [
    {
      sourceId: "a-lan",
      targetId: "lin-yuan",
      category: "conflict",
      summary: "Suspicion language can increase conflict between a-lan and lin-yuan."
    },
    {
      sourceId: "lin-yuan",
      targetId: "a-lan",
      category: "conflict",
      summary: "Suspicion language can increase conflict between lin-yuan and a-lan."
    }
  ]);
  assert.deepEqual(report.affectedEvents.map((impact) => [impact.eventId, impact.category]), [
    ["event-2", "dependency_effect"],
    ["event-3", "dependency_effect"]
  ]);
  assert.deepEqual(report.risks, [
    "Relationship conflict may reveal motivation too early.",
    "The intent changes existing event dependencies.",
    "The intent touches a protected story rule or location."
  ]);
});

test("StoryImpactAnalysisEngine generates alternatives that are suggestions only", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const report = analyzeStoryImpactReport(project, createDiscoveryIntent());

  assert.deepEqual(report.alternatives, [
    {
      id: "alternative-impact-intent-1-a",
      label: "immediate reveal",
      summary: "Let the discovery become explicit in the current chapter.",
      effect: "Higher clarity, higher risk of collapsing suspense.",
      canModifyWorld: false
    },
    {
      id: "alternative-impact-intent-1-b",
      label: "partial clue",
      summary: "Show a clue without confirming the full secret.",
      effect: "Preserves open loops while rewarding the author intent.",
      canModifyWorld: false
    },
    {
      id: "alternative-impact-intent-1-c",
      label: "delayed reveal",
      summary: "Move the discovery pressure to a later chapter.",
      effect: "Maintains pacing and keeps current world state stable.",
      canModifyWorld: false
    }
  ]);
  assert.deepEqual(report.opportunities, [
    "Use the discovery to pay off an existing open loop.",
    "Turn the location into a stronger scene anchor.",
    "Let the author choose between reveal, clue, or delay."
  ]);
});

test("StoryImpactAnalysisEngine cannot mutate project or commit events", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const before = structuredClone(project);
  const report = analyzeStoryImpactReport(project, createDiscoveryIntent());
  const decisionInput = buildAuthorDecisionInputFromImpactReport(report);

  assert.deepEqual(project, before);
  assert.deepEqual(decisionInput, {
    version: "world-os-impact-author-decision-input-v1",
    intentId: "impact-intent-1",
    nextStep: "AuthorDecision",
    proposal: "Review impact report for impact-intent-1.",
    alternatives: ["immediate reveal", "partial clue", "delayed reveal"],
    authorChoice: {
      choice: "pending"
    },
    canCommit: false
  });
  assert.throws(
    () => commitStoryEvent(project, decisionInput),
    /Cannot read properties|AuthorDecision required|Only accepted/
  );
  assert.deepEqual(project, before);
});


function createDiscoveryIntent() {
  return createStoryAuthorIntent({
    id: "impact-intent-1",
    content: "让林远发现旧灯塔地下室的秘密，但保持潮门不能主动开启。",
    source: "author",
    targetScope: "event",
    createdAtLogical: 21,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
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
