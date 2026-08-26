import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import { commitStoryEvent } from "../../src/domainTemplates/storyWorld/workflow/index.ts";
import { createStoryAuthorIntent } from "../../src/domainTemplates/storyWorld/intent/index.ts";
import { analyzeStoryImpactReport } from "../../src/domainTemplates/storyWorld/analysis/index.ts";
import {
  createStoryDecisionWorkspace,
  resolveAuthorDecision
} from "../../src/domainTemplates/storyWorld/decision/index.ts";

test("StoryDecisionWorkspace turns impact report into bounded author options", () => {
  const report = createImpactReport();
  const workspaceA = createStoryDecisionWorkspace(report);
  const workspaceB = createStoryDecisionWorkspace(report);

  assert.deepEqual(workspaceA, workspaceB);
  assert.equal(workspaceA.version, "world-os-story-decision-workspace-v1");
  assert.equal(workspaceA.intentId, "decision-intent-1");
  assert.equal(workspaceA.status, "pending");
  assert.equal(workspaceA.selectedOption, undefined);
  assert.deepEqual(workspaceA.authorNotes, []);
  assert.deepEqual(workspaceA.options.map((option) => [option.id, option.type, option.riskLevel]), [
    ["decision-decision-intent-1-a", "accept_immediate_reveal", "high"],
    ["decision-decision-intent-1-b", "accept_partial_clue", "medium"],
    ["decision-decision-intent-1-c", "accept_delayed_reveal", "low"],
    ["decision-decision-intent-1-custom", "custom_modification", "medium"],
    ["decision-decision-intent-1-reject", "reject_change", "low"]
  ]);
  assert.deepEqual(workspaceA.options[0].affectedObjects, {
    characters: ["a-lan", "lin-yuan"],
    events: ["event-3"],
    relationships: ["a-lan->lin-yuan", "lin-yuan->a-lan"],
    rules: ["潮门不能主动开启", "old-lighthouse"]
  });
  assert.deepEqual(workspaceA.options[0].consequences, [
    "Higher clarity, higher risk of collapsing suspense.",
    "Risk: The intent changes existing event dependencies.",
    "Risk: The intent touches a protected story rule or location."
  ]);
});

test("pending and rejected decisions cannot create commit candidates", () => {
  const workspace = createStoryDecisionWorkspace(createImpactReport());
  const pending = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-decision-intent-1-a",
    status: "pending"
  });
  const rejected = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-decision-intent-1-reject",
    status: "rejected",
    authorNotes: ["保持原计划。"]
  });

  assert.deepEqual(pending.commitCandidate, undefined);
  assert.equal(pending.canCommit, false);
  assert.equal(pending.workspace.status, "pending");
  assert.deepEqual(rejected.commitCandidate, undefined);
  assert.equal(rejected.canCommit, false);
  assert.equal(rejected.workspace.status, "rejected");
  assert.deepEqual(rejected.decisionHistory.authorChoice, {
    optionId: "decision-decision-intent-1-reject",
    optionType: "reject_change",
    status: "rejected"
  });
});

test("modified decision requires author content before candidate creation", () => {
  const workspace = createStoryDecisionWorkspace(createImpactReport());

  assert.throws(
    () =>
      resolveAuthorDecision({
        workspace,
        selectedOptionId: "decision-decision-intent-1-custom",
        status: "modified",
        authorNotes: ["我想改成误导线索。"]
      }),
    /Modified decision requires author content/
  );

  const resolved = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-decision-intent-1-custom",
    status: "modified",
    authorNotes: ["我想改成误导线索。"],
    authorContent: "林远只发现一枚不属于阿岚的旧钥匙。"
  });

  assert.equal(resolved.canCommit, true);
  assert.deepEqual(resolved.commitCandidate?.selectedDecision, {
    optionId: "decision-decision-intent-1-custom",
    optionType: "custom_modification",
    status: "modified",
    authorNotes: ["我想改成误导线索。"],
    authorContent: "林远只发现一枚不属于阿岚的旧钥匙。"
  });
  assert.equal(resolved.decisionHistory.modificationReason, "林远只发现一枚不属于阿岚的旧钥匙。");
});

test("accepted decision creates a commit candidate but not a StoryEventCommit", () => {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const before = structuredClone(project);
  const workspace = createStoryDecisionWorkspace(createImpactReport());
  const resolved = resolveAuthorDecision({
    workspace,
    selectedOptionId: "decision-decision-intent-1-a",
    status: "accepted",
    authorNotes: ["接受方案 A，但后续保留规则风险。"]
  });

  assert.equal(resolved.version, "world-os-story-decision-resolution-v1");
  assert.equal(resolved.canCommit, true);
  assert.deepEqual(resolved.commitCandidate, {
    version: "world-os-story-commit-candidate-v1",
    id: "commit-candidate-decision-intent-1-a",
    intentId: "decision-intent-1",
    selectedDecision: {
      optionId: "decision-decision-intent-1-a",
      optionType: "accept_immediate_reveal",
      status: "accepted",
      authorNotes: ["接受方案 A，但后续保留规则风险。"]
    },
    affectedEvents: ["event-3"],
    affectedCharacters: ["a-lan", "lin-yuan"],
    worldChangesProposal: [
      "Accept immediate reveal: Let the discovery become explicit in the current chapter.",
      "Risk level: high"
    ],
    decisionHistory: {
      version: "world-os-story-decision-history-v1",
      originalIntentId: "decision-intent-1",
      aiSuggestions: ["immediate reveal", "partial clue", "delayed reveal"],
      authorChoice: {
        optionId: "decision-decision-intent-1-a",
        optionType: "accept_immediate_reveal",
        status: "accepted"
      }
    }
  });
  assert.deepEqual(project, before);
  assert.throws(
    () => commitStoryEvent(project, resolved.commitCandidate),
    /Cannot read properties|AuthorDecision required|Only accepted/
  );
  assert.deepEqual(project, before);
});


function createImpactReport() {
  const project = createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const intent = createStoryAuthorIntent({
    id: "decision-intent-1",
    content: "让林远发现旧灯塔地下室的秘密，但保持潮门不能主动开启。",
    source: "author",
    targetScope: "event",
    createdAtLogical: 31,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });

  return analyzeStoryImpactReport(project, intent);
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
