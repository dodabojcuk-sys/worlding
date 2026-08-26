import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { AuthorChangeSetApplyError, createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { readNuwaRunPack, readNuwaStandaloneSandboxContext } from "../../src/storyIntelligence/nuwaRunPack.ts";
import { NUWA_AUTHOR_LOOP_SEEDS } from "../../src/storyIntelligence/storyIntelligenceTypes.ts";

test("Story Studio builds a real deterministic impact review through one author-control boundary", () => {
  const fixture = createFixture();
  try {
    const before = readMarkdownTree(fixture.projectPath);
    const review = fixture.control.createImpactReview({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "林远告诉阿岚地下室存在，但只透露部分线索。",
      selectedObjectIds: [fixture.characterId, fixture.locationId]
    });

    assert.equal(review.status, "pending");
    assert.equal(review.source.sceneTitle, "铁门前的迟疑");
    assert.deepEqual(review.source.involvedObjects.map((item) => item.id), [fixture.characterId, fixture.allyId, fixture.locationId]);
    assert.equal(review.options.length, 3);
    assert.equal(review.preview, null);
    assert.equal(review.mutatesMarkdown, false);
    assert.deepEqual(readMarkdownTree(fixture.projectPath), before);

    const repeated = fixture.control.createImpactReview({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "林远告诉阿岚地下室存在，但只透露部分线索。",
      selectedObjectIds: [fixture.characterId, fixture.locationId]
    });
    assert.deepEqual(repeated, review);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("author route selection creates only a preview and preserve-current leaves Markdown untouched", () => {
  const fixture = createFixture();
  try {
    const before = readMarkdownTree(fixture.projectPath);
    const review = fixture.control.createImpactReview({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "林远告诉阿岚地下室存在，但只透露部分线索。"
    });
    const partial = review.options.find((option) => option.label === "只透露部分线索");
    assert.ok(partial);

    const selected = fixture.control.chooseImpactRoute({
      projectId: fixture.projectId,
      reviewId: review.id,
      optionId: partial.id,
      action: "adopt"
    });
    assert.equal(selected.status, "selected");
    assert.ok(selected.preview);
    assert.equal(selected.canCreateChangeSet, true);
    assert.deepEqual(readMarkdownTree(fixture.projectPath), before);

    const preserved = fixture.control.chooseImpactRoute({
      projectId: fixture.projectId,
      reviewId: review.id,
      optionId: partial.id,
      action: "preserve"
    });
    assert.equal(preserved.status, "rejected");
    assert.equal(preserved.preview, null);
    assert.equal(preserved.canCreateChangeSet, false);
    assert.deepEqual(readMarkdownTree(fixture.projectPath), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Golden Loop Candidate Review persists rejection and acceptance receipts without writing Canon", () => {
  const fixture = createFixture();
  try {
    const before = readMarkdownTree(fixture.projectPath);
    const result = {
      version: "tianyan-golden-loop-candidate/v1" as const,
      status: "candidate" as const,
      contextPack: {
        id: "context-pack-0123456789abcdef",
        sources: [{ id: "writing:current", type: "selection", label: "当前正文选区" }],
        budgets: { maximumSources: 12, maximumCharacters: 8000 }
      },
      tianyi: { facts: [] },
      nuwa: { candidates: [
        { id: "route-1", title: "路线一", change: "保持印章不公开。", after: "只有我知道印章存在。" },
        { id: "route-2", title: "路线二", change: "向同伴出示印章。", after: "同伴开始追问来源。" }
      ] },
      provider: { profileId: "profile" }
    };
    const created = fixture.control.createCandidateReview({ projectId: fixture.projectId, result, createdAt: "2026-08-11T08:00:00.000Z" });
    assert.equal(created.status, "awaiting");
    assert.equal(created.contextPackId, result.contextPack.id);

    const rejected = fixture.control.decideCandidateReview({
      projectId: fixture.projectId,
      reviewId: created.id,
      candidateId: "route-1",
      decision: "rejected",
      reason: "这条路线过早暴露印章。",
      decidedAt: "2026-08-11T08:01:00.000Z"
    });
    assert.equal(rejected.candidates[0].status, "rejected");
    assert.equal(fixture.control.readCandidateReview({ projectId: fixture.projectId })?.candidates[0].rejectionReason, "这条路线过早暴露印章。");
    assert.deepEqual(readMarkdownTree(fixture.projectPath), before);

    const accepted = fixture.control.decideCandidateReview({
      projectId: fixture.projectId,
      reviewId: created.id,
      candidateId: "route-2",
      decision: "accepted",
      confirmationReceipt: { planningEventId: "event-planning", impactReviewId: "impact-review-0123456789abcdef" },
      decidedAt: "2026-08-11T08:02:00.000Z"
    });
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.candidates[1].confirmationReceipt?.impactReviewId, "impact-review-0123456789abcdef");
    assert.deepEqual(readMarkdownTree(fixture.projectPath), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Candidate Review history derives superseded runs and persists explicit abandonment without Canon writes", () => {
  const fixture = createFixture();
  try {
    const before = readMarkdownTree(fixture.projectPath);
    const candidateResult = (suffix: string) => ({
      version: "tianyan-golden-loop-candidate/v1" as const,
      status: "candidate" as const,
      contextPack: {
        id: `context-pack-${suffix.padEnd(16, "0")}`,
        sources: [{ id: "writing:current", type: "selection", label: "当前正文选区" }],
        budgets: { maximumSources: 12, maximumCharacters: 8000 }
      },
      tianyi: { facts: [] },
      nuwa: { candidates: [
        { id: `route-${suffix}-1`, title: `路线 ${suffix} 一`, change: "保持现状。", after: "世界事实不变。" },
        { id: `route-${suffix}-2`, title: `路线 ${suffix} 二`, change: "提出变化。", after: "等待作者评审。" }
      ] },
      provider: { profileId: "profile" }
    });
    const first = fixture.control.createCandidateReview({ projectId: fixture.projectId, result: candidateResult("one"), createdAt: "2026-08-11T08:00:00.000Z" });
    const second = fixture.control.createCandidateReview({ projectId: fixture.projectId, result: candidateResult("two"), createdAt: "2026-08-11T08:02:00.000Z" });

    const history = fixture.control.listCandidateReviews({ projectId: fixture.projectId });
    assert.deepEqual(history.map((entry) => [entry.id, entry.lifecycleStatus]), [
      [second.id, "awaiting"],
      [first.id, "superseded"]
    ]);

    const abandoned = fixture.control.abandonCandidateReview({
      projectId: fixture.projectId,
      reviewId: second.id,
      abandonedAt: "2026-08-11T08:03:00.000Z"
    });
    assert.equal(abandoned.status, "abandoned");
    assert.equal(fixture.control.listCandidateReviews({ projectId: fixture.projectId })[0].lifecycleStatus, "abandoned");
    assert.throws(() => fixture.control.decideCandidateReview({
      projectId: fixture.projectId,
      reviewId: second.id,
      candidateId: "route-two-1",
      decision: "rejected",
      decidedAt: "2026-08-11T08:04:00.000Z"
    }), /read-only/);
    assert.deepEqual(readMarkdownTree(fixture.projectPath), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("external Markdown changes make an existing impact review stale", () => {
  const fixture = createFixture();
  try {
    const review = fixture.control.createImpactReview({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "让林远继续靠近旧灯塔。"
    });
    const writing = fixture.workspace.getWritingBootstrap({ projectId: fixture.projectId }).activeDocument!;
    fixture.workspace.updateWritingDocument({
      projectId: fixture.projectId,
      documentId: writing.id,
      expectedHash: writing.revisionToken,
      status: writing.status,
      body: `${writing.body}\n\n外部修改。`
    });

    const stale = fixture.control.readImpactReview({ projectId: fixture.projectId, reviewId: review.id });
    assert.equal(stale?.status, "stale");
    assert.throws(() => fixture.control.chooseImpactRoute({
      projectId: fixture.projectId,
      reviewId: review.id,
      optionId: review.options[0].id,
      action: "adopt"
    }), /已经改变/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("author-approved Change Set dry-runs, persists, and applies exactly one event Markdown", () => {
  const fixture = createFixture();
  try {
    const before = readMarkdownTree(fixture.projectPath);
    const review = fixture.control.createImpactReview({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "林远告诉阿岚地下室存在，但只透露部分线索。"
    });
    const partial = review.options.find((option) => option.label === "只透露部分线索")!;
    fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: partial.id, action: "adopt" });
    const changeSet = fixture.control.createAuthorChangeSet({ projectId: fixture.projectId, reviewId: review.id });

    assert.equal(changeSet.status, "pending");
    assert.equal(changeSet.application.canApply, true);
    assert.equal(changeSet.application.markdownWrites, 0);
    assert.deepEqual(readMarkdownTree(fixture.projectPath), before);
    assert.deepEqual(fixture.control.dryRunAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id }), changeSet);

    const applied = fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id });
    assert.equal(applied.status, "applied");
    assert.equal(applied.application.markdownWrites, 1);
    assert.equal(applied.application.eventRecorded, true);
    assert.ok(applied.application.appliedEventId);
    assert.equal(applied.application.sceneProseChanged, false);
    assert.equal(applied.application.objectNotesChanged, false);
    const after = readMarkdownTree(fixture.projectPath);
    assert.equal(Object.keys(after).length, Object.keys(before).length + 1);
    const eventSource = Object.values(after).find((source) => source.includes("作者选择")) || "";
    const eventBody = eventSource.slice(eventSource.indexOf("\n---\n") + 5);
    assert.match(eventSource, /事件记录：已由作者确认/);
    assert.match(eventSource, /source_change_set_id: author-change-set-/);
    assert.match(eventSource, /apply_operation_key: author-change-set-apply-/);
    assert.doesNotMatch(eventBody, /author-change-set-|Commit reference|Change Set:/);
    const timelineBeforeReplay = fixture.workspace.getVisualWorkbenchBootstrap({ projectId: fixture.projectId }).documents.find((document) => document.type === "timeline");
    assert.equal((timelineBeforeReplay?.content.entries as Array<{ eventId: string }>).filter((entry) => entry.eventId === applied.application.appliedEventId).length, 1);
    assert.equal(fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id }).application.appliedEventId, applied.application.appliedEventId);
    const timelineAfterReplay = fixture.workspace.getVisualWorkbenchBootstrap({ projectId: fixture.projectId }).documents.find((document) => document.type === "timeline");
    assert.equal((timelineAfterReplay?.content.entries as Array<{ eventId: string }>).filter((entry) => entry.eventId === applied.application.appliedEventId).length, 1);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("planning event enters the existing Impact Review and creates a separate canon event with planned_from", () => {
  const fixture = createFixture();
  try {
    const planning = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "阿岚只获得部分地下室线索",
      status: "planned",
      tags: ["作者规划"],
      body: "# 阿岚只获得部分地下室线索\n\n[[林远]]只向[[阿岚]]透露[[旧灯塔]]地下室的一部分。\n"
    });
    const planningPath = path.join(fixture.projectPath, planning.relativeId);
    const planningBefore = readFileSync(planningPath, "utf8");
    const canonicalBeforeReview = readMarkdownTree(fixture.projectPath);
    const timelineBeforeReview = fixture.workspace.getVisualWorkbenchBootstrap({ projectId: fixture.projectId }).documents
      .filter((document) => document.type === "timeline")
      .map((document) => JSON.stringify(document));
    const eventCountBefore = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" }).length;
    const review = fixture.control.createPlanningEventImpactReview({
      projectId: fixture.projectId,
      planningEventId: planning.id
    });
    assert.equal(review.source.kind, "planning-event");
    assert.equal(review.source.planningEventId, planning.id);
    assert.equal(review.source.sceneTitle, planning.title);
    assert.equal(review.mutatesMarkdown, false);

    const option = review.options.find((item) => item.label === "只透露部分线索") || review.options[0];
    fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: option.id, action: "adopt" });
    const changeSet = fixture.control.createAuthorChangeSet({ projectId: fixture.projectId, reviewId: review.id });
    assert.equal(fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" }).length, eventCountBefore);
    assert.deepEqual(readMarkdownTree(fixture.projectPath), canonicalBeforeReview);
    const timelineBeforeApply = fixture.workspace.getVisualWorkbenchBootstrap({ projectId: fixture.projectId }).documents
      .filter((document) => document.type === "timeline")
      .map((document) => JSON.stringify(document));
    assert.deepEqual(timelineBeforeApply, timelineBeforeReview);
    const applied = fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id });
    assert.equal(applied.status, "applied");
    assert.equal(applied.application.markdownWrites, 1);

    const events = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" });
    assert.equal(events.length, eventCountBefore + 1);
    const committed = events.map((item) => fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: item.id }))
      .find((item) => item.status === "committed" && item.properties.planned_from === planning.id);
    assert.ok(committed);
    assert.ok(committed.tags.includes("作者确认"));
    assert.equal(readFileSync(planningPath, "utf8"), planningBefore);
    assert.equal(fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: planning.id }).status, "planned");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("verified Canon read gate accepts only the complete author-adoption chain and rejects spoofed or malformed events", () => {
  const fixture = createFixture();
  try {
    const planning = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "合法作者确认来源",
      status: "planned",
      tags: ["作者规划"]
    });
    const review = fixture.control.createPlanningEventImpactReview({ projectId: fixture.projectId, planningEventId: planning.id });
    const option = review.options.find((item) => item.label === "只透露部分线索") || review.options[0];
    fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: option.id, action: "adopt" });
    const changeSet = fixture.control.createAuthorChangeSet({ projectId: fixture.projectId, reviewId: review.id });
    fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id });
    const canon = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" })
      .map((event) => fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: event.id }))
      .find((event) => event.properties.source_change_set_id === changeSet.id)!;
    const canonPath = path.join(fixture.projectPath, canon.relativeId);
    const canonSource = readFileSync(canonPath, "utf8");

    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [canon.id]);
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: canon.id }), true);
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: planning.id }), false);

    const genericActive = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "通用 active 事件",
      status: "active"
    });
    const committedWithoutTag = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "没有作者确认标签的 committed 事件",
      status: "committed"
    });
    const spoof = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "伪造的已确认事件",
      status: "committed",
      tags: ["作者确认"]
    });
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: genericActive.id }), false);
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: committedWithoutTag.id }), false);
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: spoof.id }), false);

    for (const [property, invalidValue] of [
      ["source_change_set_id", "author-change-set-0000000000000000"],
      ["source_change_set_revision", "invalid-revision"],
      ["author_decision_ref", "invalid-author-decision"],
      ["apply_operation_key", "invalid-operation"],
      ["apply_intent_hash", "invalid-intent-hash"]
    ]) {
      writeFileSync(canonPath, replaceFrontmatterScalar(canonSource, property, invalidValue), "utf8");
      assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: canon.id }), false, property);
    }
    writeFileSync(canonPath, canonSource, "utf8");
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: canon.id }), true);

    const intentPath = path.join(fixture.projectPath, ".world-os", "author-control", "change-sets", `${changeSet.id}.apply-intent.v1.json`);
    const originalIntent = readFileSync(intentPath, "utf8");
    const malformedIntent = JSON.parse(readFileSync(intentPath, "utf8")) as Record<string, unknown>;
    malformedIntent.intentHash = "invalid-intent-hash";
    writeFileSync(intentPath, `${JSON.stringify(malformedIntent, null, 2)}\n`, "utf8");
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: canon.id }), false);
    writeFileSync(intentPath, originalIntent, "utf8");

    const changeSetPath = path.join(fixture.projectPath, ".world-os", "author-control", "change-sets", `${changeSet.id}.json`);
    const originalChangeSet = readFileSync(changeSetPath, "utf8");
    const targetMismatch = JSON.parse(originalChangeSet) as { application: { appliedEventId: string | null } };
    targetMismatch.application.appliedEventId = "event.author-confirmed-not-the-canon";
    writeFileSync(changeSetPath, `${JSON.stringify(targetMismatch, null, 2)}\n`, "utf8");
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: canon.id }), false);
    writeFileSync(changeSetPath, originalChangeSet, "utf8");

    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [canon.id]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a different operation key for the same proposal revision is rejected before a second Canon or claimant", () => {
  const fixture = createFixture();
  try {
    const planning = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "确定性作者确认来源",
      status: "planned",
      tags: ["作者规划"]
    });
    const review = fixture.control.createPlanningEventImpactReview({ projectId: fixture.projectId, planningEventId: planning.id });
    const option = review.options[0];
    fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: option.id, action: "adopt" });
    const first = fixture.control.createAuthorChangeSet({ projectId: fixture.projectId, reviewId: review.id });
    const applied = fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: first.id });
    assert.equal(applied.status, "applied");
    const canon = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" })
      .map((event) => fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: event.id }))
      .find((event) => event.properties.source_change_set_id === first.id)!;
    const firstOperationKey = canon.properties.apply_operation_key;
    const secondOperationKey = `${firstOperationKey}.second`;
    assert.notEqual(secondOperationKey, firstOperationKey);
    const second = fixture.workspace.createConfirmedEventOnce({
      projectId: fixture.projectId,
      targetEventRef: canon.id,
      title: canon.title,
      body: canon.body,
      plannedFrom: planning.id,
      provenance: {
        sourceChangeSetId: canon.properties.source_change_set_id,
        sourceChangeSetRevision: canon.properties.source_change_set_revision,
        authorDecisionRef: canon.properties.author_decision_ref,
        applyOperationKey: secondOperationKey,
        intentHash: "f".repeat(64)
      },
      operationId: secondOperationKey
    });
    assert.deepEqual(second, { created: false, conflict: true, event: null });

    const persistedCanon = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" })
      .map((event) => fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: event.id }))
      .filter((event) => event.properties.source_change_set_id === first.id);
    assert.equal(persistedCanon.length, 1);
    assert.equal(persistedCanon[0].id, canon.id);

    const operations = readFileSync(path.join(fixture.projectPath, ".world-os", "operations.jsonl"), "utf8");
    const claimantCount = (operationId: string) => operations.split(`"operationId": ${JSON.stringify(operationId)}`).length - 1;
    assert.equal(claimantCount(firstOperationKey), 1);
    assert.equal(claimantCount(secondOperationKey), 0);
    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [canon.id]);
    assert.equal(fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: planning.id }).status, "planned");
    assert.notEqual(planning.id, canon.id);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("verified Canon reads distinguish healthy empty state and invalid records from authority failures", () => {
  const emptyFixture = createFixture();
  try {
    const before = readTreeGuard(emptyFixture.root);
    assert.deepEqual(emptyFixture.control.listVerifiedCanonEventIds({ projectId: emptyFixture.projectId }), []);
    assert.equal(emptyFixture.control.verifyCanonEventRead({ projectId: emptyFixture.projectId, eventId: "event.missing" }), false);
    assert.deepEqual(readTreeGuard(emptyFixture.root), before);
    assert.throws(() => emptyFixture.control.listVerifiedCanonEventIds({ projectId: "missing-project" }), /Project does not exist/);
    assert.throws(() => emptyFixture.control.verifyCanonEventRead({ projectId: "missing-project", eventId: "event.missing" }), /Project does not exist/);
  } finally {
    rmSync(emptyFixture.root, { recursive: true, force: true });
  }

  const fixture = createFixture();
  try {
    const chain = createVerifiedCanon(fixture, "合法事件与坏记录共存");
    const spoof = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "只有展示字段的伪造事件",
      status: "committed",
      tags: ["作者确认"]
    });
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: spoof.id }), false);
    const malformedReference = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "带非法 Change Set 引用的伪造事件",
      status: "committed",
      tags: ["作者确认"]
    });
    const malformedReferencePath = path.join(fixture.projectPath, malformedReference.relativeId);
    writeFileSync(malformedReferencePath, readFileSync(malformedReferencePath, "utf8").replace(
      "---\n",
      "---\nsource_change_set_id: garbage\n"
    ), "utf8");
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: malformedReference.id }), false);
    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [chain.canon.id]);

    const indexPath = path.join(fixture.projectPath, ".world-os", "index.json");
    const originalIndex = readFileSync(indexPath, "utf8");
    try {
      writeFileSync(indexPath, "{\n", "utf8");
      assert.throws(() => fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), SyntaxError);
      assert.throws(() => fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: chain.canon.id }), SyntaxError);
    } finally {
      writeFileSync(indexPath, originalIndex, "utf8");
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("malformed authority JSON and deterministic I/O faults propagate through list and detail", () => {
  const fixture = createFixture();
  try {
    const chain = createVerifiedCanon(fixture, "权威文件故障必须显式返回");
    const paths = authorityArtifactPaths(fixture.projectPath, chain.review.id, chain.changeSet.id);
    for (const target of [paths.changeSet, paths.review, paths.intent]) {
      const original = readFileSync(target, "utf8");
      try {
        writeFileSync(target, "{\n", "utf8");
        assert.throws(() => fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), SyntaxError);
        assert.throws(() => fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: chain.canon.id }), SyntaxError);
      } finally {
        writeFileSync(target, original, "utf8");
      }
    }

    const originalIntent = readFileSync(paths.intent, "utf8");
    rmSync(paths.intent);
    mkdirSync(paths.intent);
    try {
      const isIoError = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "EISDIR";
      assert.throws(() => fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), isIoError);
      assert.throws(() => fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: chain.canon.id }), isIoError);
    } finally {
      rmSync(paths.intent, { recursive: true, force: true });
      writeFileSync(paths.intent, originalIntent, "utf8");
    }

    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [chain.canon.id]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("multiple events claiming one operation surface an authority-store conflict", () => {
  const fixture = createFixture();
  try {
    const chain = createVerifiedCanon(fixture, "重复 claimant 必须阻断读取");
    const duplicate = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "冲突 claimant",
      status: "committed",
      tags: ["作者确认"]
    });
    const duplicatePath = path.join(fixture.projectPath, duplicate.relativeId);
    writeFileSync(duplicatePath, readFileSync(duplicatePath, "utf8").replace(
      "---\n",
      `---\nsource_change_set_id: ${chain.canon.properties.source_change_set_id}\nsource_change_set_revision: ${chain.canon.properties.source_change_set_revision}\nauthor_decision_ref: ${chain.canon.properties.author_decision_ref}\napply_operation_key: ${chain.canon.properties.apply_operation_key}\napply_intent_hash: ${chain.canon.properties.apply_intent_hash}\n`
    ), "utf8");

    const isMultiplicityConflict = (error: unknown) =>
      error instanceof AuthorChangeSetApplyError && error.code === "MULTIPLE_EVENTS_FOR_OPERATION";
    assert.throws(() => fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), isMultiplicityConflict);
    assert.throws(() => fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: chain.canon.id }), isMultiplicityConflict);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Change Set, Review decision, Intent, and event identities cannot cross workspaces", () => {
  const fixture = createFixture();
  try {
    const local = createVerifiedCanon(fixture, "本地世界的作者确认事件");
    const otherProjectId = "other-world";
    fixture.workspace.createProject({ title: "另一世界", folderSlug: otherProjectId });
    const planning = fixture.workspace.createWorldObject({
      projectId: otherProjectId,
      type: "event",
      title: "另一世界的作者规划",
      status: "planned",
      tags: ["作者规划"]
    });
    const review = fixture.control.createPlanningEventImpactReview({ projectId: otherProjectId, planningEventId: planning.id });
    fixture.control.chooseImpactRoute({ projectId: otherProjectId, reviewId: review.id, optionId: review.options[0].id, action: "adopt" });
    const changeSet = fixture.control.createAuthorChangeSet({ projectId: otherProjectId, reviewId: review.id });
    fixture.control.applyAuthorChangeSet({ projectId: otherProjectId, changeSetId: changeSet.id });
    const otherCanon = fixture.workspace.listWorldObjects({ projectId: otherProjectId, type: "event" })
      .map((event) => fixture.workspace.readWorldObject({ projectId: otherProjectId, objectId: event.id }))
      .find((event) => event.properties.source_change_set_id === changeSet.id)!;

    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: otherCanon.id }), false);
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: otherProjectId, eventId: local.canon.id }), false);

    const localPaths = authorityArtifactPaths(fixture.projectPath, local.review.id, local.changeSet.id);
    for (const target of [localPaths.changeSet, localPaths.review, localPaths.intent]) {
      const original = readFileSync(target, "utf8");
      const value = JSON.parse(original) as { projectId: string };
      value.projectId = otherProjectId;
      try {
        writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
        assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: local.canon.id }), false);
        assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), []);
      } finally {
        writeFileSync(target, original, "utf8");
      }
    }

    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [local.canon.id]);
    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: otherProjectId }), [otherCanon.id]);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("verified Canon list and detail are byte, file-list, and timestamp read-only", () => {
  const fixture = createFixture();
  try {
    const chain = createVerifiedCanon(fixture, "读取不得产生副作用");
    const before = readTreeGuard(fixture.root);
    assert.deepEqual(fixture.control.listVerifiedCanonEventIds({ projectId: fixture.projectId }), [chain.canon.id]);
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: chain.canon.id }), true);
    assert.equal(fixture.control.verifyCanonEventRead({ projectId: fixture.projectId, eventId: chain.planning.id }), false);
    assert.deepEqual(readTreeGuard(fixture.root), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("planning review rejection and staleness never mutate the planning note", () => {
  const fixture = createFixture();
  try {
    const planning = fixture.workspace.createWorldObject({ projectId: fixture.projectId, type: "event", title: "待评审规划", status: "planned", tags: ["作者规划"] });
    const planningPath = path.join(fixture.projectPath, planning.relativeId);
    const before = readFileSync(planningPath, "utf8");
    const rejectedReview = fixture.control.createPlanningEventImpactReview({ projectId: fixture.projectId, planningEventId: planning.id });
    const rejected = fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: rejectedReview.id, optionId: rejectedReview.options[0].id, action: "preserve" });
    assert.equal(rejected.status, "rejected");
    assert.equal(readFileSync(planningPath, "utf8"), before);

    const second = fixture.workspace.createWorldObject({ projectId: fixture.projectId, type: "event", title: "会过期的评审来源", status: "planned", tags: ["作者规划"] });
    const review = fixture.control.createPlanningEventImpactReview({ projectId: fixture.projectId, planningEventId: second.id });
    const opened = fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: second.id });
    fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: opened.id,
      expectedHash: opened.revisionToken,
      title: opened.title,
      status: opened.status,
      tags: opened.tags,
      aliases: opened.aliases,
      body: `${opened.body}\n作者修改了规划。`,
      card: opened.card
    });
    assert.equal(fixture.control.readImpactReview({ projectId: fixture.projectId, reviewId: review.id })?.status, "stale");
    assert.equal(fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: second.id }).status, "planned");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Change Set becomes stale after an affected object changes and can be abandoned without writes", () => {
  const fixture = createFixture();
  try {
    const review = fixture.control.createImpactReview({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "林远告诉阿岚地下室存在，但只透露部分线索。"
    });
    const partial = review.options.find((option) => option.label === "只透露部分线索")!;
    fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: partial.id, action: "adopt" });
    const changeSet = fixture.control.createAuthorChangeSet({ projectId: fixture.projectId, reviewId: review.id });
    const character = fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: fixture.characterId });
    fixture.workspace.updateWorldObject({
      projectId: fixture.projectId,
      objectId: character.id,
      expectedHash: character.revisionToken,
      title: character.title,
      status: "changed-outside",
      tags: character.tags,
      aliases: character.aliases,
      body: character.body,
      card: character.card
    });

    const stale = fixture.control.dryRunAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id });
    assert.equal(stale.status, "stale");
    assert.equal(stale.application.canApply, false);
    assert.equal(stale.application.markdownWrites, 0);
    assert.equal(fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id }).status, "stale");

    const secondFixture = createFixture();
    try {
      const secondReview = secondFixture.control.createImpactReview({ projectId: secondFixture.projectId, sceneId: secondFixture.sceneId, authorGoal: "让林远停在铁门前。" });
      const option = secondReview.options[0];
      secondFixture.control.chooseImpactRoute({ projectId: secondFixture.projectId, reviewId: secondReview.id, optionId: option.id, action: "adopt" });
      const pending = secondFixture.control.createAuthorChangeSet({ projectId: secondFixture.projectId, reviewId: secondReview.id });
      const abandoned = secondFixture.control.abandonAuthorChangeSet({ projectId: secondFixture.projectId, changeSetId: pending.id });
      assert.equal(abandoned.status, "abandoned");
      assert.equal(abandoned.application.markdownWrites, 0);
    } finally {
      rmSync(secondFixture.root, { recursive: true, force: true });
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Nuwa supervision runs deterministically, synthesizes routes, and enters the same Impact Review", async () => {
  const fixture = createFixture();
  try {
    const before = readCanonicalMarkdownTree(fixture.projectPath);
    const planned = fixture.control.createStoryExploration({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "比较林远告诉阿岚部分地下室线索后的长期影响。"
    });
    assert.equal(planned.status, "planned");
    assert.equal(planned.supervisor.label, "女娲");
    assert.equal(planned.modelCalls, 0);
    assert.ok(planned.specialists.length >= 3);

    const executed = await fixture.control.runStoryExploration({ projectId: fixture.projectId, explorationId: planned.id });
    assert.equal(executed.status, "ready-to-synthesize");
    assert.equal(executed.progress.completed, executed.progress.total);
    const synthesized = fixture.control.synthesizeStoryExploration({ projectId: fixture.projectId, explorationId: planned.id });
    assert.equal(synthesized.status, "ready-for-review");
    assert.ok(synthesized.routes.length >= 3);
    assert.equal(synthesized.canSubmitRoute, true);

    const submitted = fixture.control.submitStoryExplorationRouteToImpact({
      projectId: fixture.projectId,
      explorationId: planned.id,
      routeId: synthesized.routes[0].id,
      submittedAt: "2026-08-11T09:00:00.000Z"
    });
    assert.equal(submitted.exploration.status, "submitted-to-impact");
    assert.equal(submitted.review.status, "pending");
    assert.equal(submitted.candidateReview.status, "accepted");
    assert.equal(submitted.candidateReview.candidates[0].confirmationReceipt?.impactReviewId, submitted.review.id);
    assert.equal(submitted.candidateReview.candidates[0].confirmationReceipt?.planningEventId, null);
    assert.equal(fixture.control.readCandidateReview({ projectId: fixture.projectId })?.id, submitted.candidateReview.id);
    assert.ok(submitted.review.impact.evidenceCount > 0);
    assert.match(submitted.review.impact.evidenceCoverage, /^[1-9][0-9]*\/[1-9][0-9]* /);
    assert.ok(submitted.review.evidence.length > 0);
    assert.equal(submitted.overlay.readOnly, true);
    assert.equal(submitted.overlay.source, "validated-prediction-bundle");
    assert.deepEqual(fixture.control.readIntelligenceOverlay({ projectId: fixture.projectId }), submitted.overlay);
    const persistedPath = path.join(fixture.projectPath, ".world-os", "author-control", "impact-reviews", `${submitted.review.id}.json`);
    const persistedBeforeRestart = JSON.parse(readFileSync(persistedPath, "utf8"));
    assert.ok(persistedBeforeRestart.validatedEvidence.length > 0);
    assert.ok(persistedBeforeRestart.validatedEvidence.every((item: { evidenceId: string; noteId: string; excerpt: string; coveredImpactRefs: string[] }) => item.evidenceId && item.noteId && item.excerpt && item.coveredImpactRefs.length > 0));
    const restarted = createStoryStudioAuthorControl({ rootPath: path.dirname(fixture.projectPath), stateFilePath: path.join(fixture.root, "state.json") });
    const restored = restarted.readImpactReview({ projectId: fixture.projectId, reviewId: submitted.review.id });
    assert.equal(restored?.impact.evidenceCount, submitted.review.impact.evidenceCount);
    assert.deepEqual(restored?.evidence, submitted.review.evidence);
    assert.deepEqual(JSON.parse(readFileSync(persistedPath, "utf8")).validatedEvidence, persistedBeforeRestart.validatedEvidence);
    const preserved = fixture.control.chooseImpactRoute({
      projectId: fixture.projectId,
      reviewId: submitted.review.id,
      optionId: submitted.review.options[0].id,
      action: "preserve"
    });
    assert.equal(preserved.status, "rejected");
    assert.deepEqual(readCanonicalMarkdownTree(fixture.projectPath), before);
    const history = fixture.control.readReviewHistory({ projectId: fixture.projectId });
    assert.equal(history.entries[0].sourceKind, "女娲候选路线");
    assert.equal(history.entries[0].authorChoice, "保持当前世界");
    assert.match(history.entries[0].evidenceCoverage, /^[1-9][0-9]*\/[1-9][0-9]* /);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("author loop creates three isolated fixed-seed futures, preserves knowledge boundaries, and rejects without writes", async () => {
  const fixture = createFixture();
  try {
    const before = readCanonicalMarkdownTree(fixture.projectPath);
    const planned = fixture.control.createStoryExploration({ projectId: fixture.projectId, sceneId: fixture.sceneId, authorGoal: "比较林远先找阿岚或先进入钟楼的后果。" });
    const executed = await fixture.control.runStoryExploration({ projectId: fixture.projectId, explorationId: planned.id });
    const synthesized = fixture.control.synthesizeStoryExploration({ projectId: fixture.projectId, explorationId: planned.id });
    const candidates = synthesized.routes.map((route) => route.candidateRun).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    assert.equal(candidates.length, 3);
    assert.deepEqual(candidates.map((candidate) => candidate.seed), [...NUWA_AUTHOR_LOOP_SEEDS]);
    assert.equal(new Set(candidates.map((candidate) => candidate.runId)).size, 3);
    assert.equal(new Set(candidates.map((candidate) => candidate.traceHash)).size, 3);
    assert.ok(candidates.every((candidate) => candidate.startingRevision.length > 0 && candidate.cost.modelCalls === 0));
    assert.ok(candidates.every((candidate) => candidate.knowledgeBoundary.rule.includes("只能使用当前快照")));
    const owner = fixture.control.readStoryExplorationRunOwner({ projectId: fixture.projectId, explorationId: planned.id });
    const packs = candidates.map((candidate) => readNuwaRunPack(fixture.projectPath, candidate.runId));
    assert.ok(packs.every((pack) => pack.run.snapshotHash === packs[0]!.run.snapshotHash));
    assert.equal(owner.runId, candidates[0]!.runId);
    assert.deepEqual(new Set(packs.map((pack) => pack.run.runId)), new Set(candidates.map((candidate) => candidate.runId)));
    const rejected = fixture.control.rejectStoryExplorationRoute({ projectId: fixture.projectId, explorationId: planned.id, routeId: synthesized.routes[0]!.id });
    assert.equal(rejected.routes[0]?.candidateStatus, "rejected");
    assert.deepEqual(readCanonicalMarkdownTree(fixture.projectPath), before);
    assert.throws(() => fixture.control.submitStoryExplorationRouteToImpact({ projectId: fixture.projectId, explorationId: planned.id, routeId: synthesized.routes[0]!.id }), /淘汰/);
    const restarted = createStoryStudioAuthorControl({ rootPath: path.dirname(fixture.projectPath), stateFilePath: path.join(fixture.root, "state.json") });
    const replay = restarted.synthesizeStoryExploration({ projectId: fixture.projectId, explorationId: planned.id });
    assert.deepEqual(replay.routes.map((route) => route.candidateRun?.traceHash), synthesized.routes.map((route) => route.candidateRun?.traceHash));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("standalone Nuwa rehearsal keeps temporary characters inside the existing Run Pack", async () => {
  const fixture = createFixture();
  try {
    const before = readCanonicalMarkdownTree(fixture.projectPath);
    const characterCount = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "character" }).length;
    const standalone = fixture.control.createStandaloneStoryExploration({
      projectId: fixture.projectId,
      story: "林远在灯塔外遇见无灯者，必须决定是否交出印章。",
      authorGoal: "比较两人面对印章时的不同选择。",
      characterNames: ["林远", "无灯者"],
      preservedFacts: ["印章仍未公开"],
      boundaries: ["不得确认任何新的正史事件"],
      depth: "short"
    });
    assert.equal(standalone.source.kind, "standalone");
    const run = fixture.control.readStoryExplorationRunOwner({ projectId: fixture.projectId, explorationId: standalone.id });
    const sandbox = readNuwaStandaloneSandboxContext(fixture.projectPath, run.runId);
    assert.ok(sandbox);
    assert.deepEqual(sandbox.agents.map((agent) => agent.kind), ["existing-character", "temporary-character"]);
    assert.equal(sandbox.agents[0]?.objectId, fixture.characterId);
    assert.equal(sandbox.agents[1]?.objectId, null);
    assert.equal(fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "character" }).length, characterCount);
    const repeated = fixture.control.createStandaloneStoryExploration({
      projectId: fixture.projectId,
      story: "林远在灯塔外遇见无灯者，必须决定是否交出印章。",
      authorGoal: "比较两人面对印章时的不同选择。",
      characterNames: ["林远", "无灯者"],
      preservedFacts: ["印章仍未公开"],
      boundaries: ["不得确认任何新的正史事件"],
      depth: "short"
    });
    assert.equal(repeated.id, standalone.id);
    const executed = await fixture.control.runStoryExploration({ projectId: fixture.projectId, explorationId: standalone.id });
    assert.equal(executed.status, "ready-to-synthesize");
    const synthesized = fixture.control.synthesizeStoryExploration({ projectId: fixture.projectId, explorationId: standalone.id });
    assert.ok(synthesized.routes.length >= 2);
    assert.deepEqual(readCanonicalMarkdownTree(fixture.projectPath), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("supplemental Brief sources do not make a current Nuwa exploration stale", async () => {
  const fixture = createFixture();
  try {
    const planned = fixture.control.createStoryExploration({
      projectId: fixture.projectId,
      sceneId: fixture.sceneId,
      authorGoal: "核对作者批准的历史消息。",
      planOptions: {
        allowedRoles: ["causality"],
        maxRoles: 1,
        runKey: "brief-source-restart-proof",
        supplementalNotes: [{
          id: "brief-source-0000000000000001",
          relativePath: ".world-os/brief-sources/brief-source-0000000000000001.json",
          type: "review",
          title: "作者选择的历史消息",
          status: "current",
          links: [],
          evidenceExcerpt: "仅传递作者明确选中的有界摘要。"
        }]
      }
    });
    assert.equal(planned.status, "planned");
    assert.equal(fixture.control.readStoryExploration({ projectId: fixture.projectId, explorationId: planned.id })?.status, "planned");
    assert.equal((await fixture.control.runStoryExploration({ projectId: fixture.projectId, explorationId: planned.id })).status, "ready-to-synthesize");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Nuwa product exploration becomes stale after scene change and never exposes backend identifiers", async () => {
  const fixture = createFixture();
  try {
    const planned = fixture.control.createStoryExploration({ projectId: fixture.projectId, sceneId: fixture.sceneId, authorGoal: "比较三条候选路线。" });
    const serialized = JSON.stringify(planned);
    for (const forbidden of ["runId", "taskId", "snapshotHash", "relativePath", "deterministic-rules", "codex-cli"]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    const scene = fixture.workspace.readWritingDocument({ projectId: fixture.projectId, documentId: fixture.sceneId });
    fixture.workspace.updateWritingDocument({ projectId: fixture.projectId, documentId: scene.id, expectedHash: scene.revisionToken, status: scene.status, body: `${scene.body}\n外部改动。` });
    assert.equal(fixture.control.readStoryExploration({ projectId: fixture.projectId, explorationId: planned.id })?.status, "stale");
    await assert.rejects(() => fixture.control.runStoryExploration({ projectId: fixture.projectId, explorationId: planned.id }), /重新规划/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Nuwa exploration reserves exactly one Context Receipt identity across retry", () => {
  const fixture = createFixture();
  try {
    const planned = fixture.control.createStoryExploration({ projectId: fixture.projectId, sceneId: fixture.sceneId, authorGoal: "核对回执绑定。" });
    const first = fixture.control.bindStoryExplorationContextReceipt({ projectId: fixture.projectId, explorationId: planned.id, contextReceiptId: "receipt.000001" });
    const retry = fixture.control.bindStoryExplorationContextReceipt({ projectId: fixture.projectId, explorationId: planned.id, contextReceiptId: "receipt.000001" });
    assert.deepEqual(retry, first);
    assert.equal(fixture.control.readStoryExplorationRunOwner({ projectId: fixture.projectId, explorationId: planned.id }).contextReceiptId, "receipt.000001");
    assert.throws(() => fixture.control.bindStoryExplorationContextReceipt({ projectId: fixture.projectId, explorationId: planned.id, contextReceiptId: "receipt.000002" }), /已经绑定/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Nuwa run owner accepts a chapter-only writing project", () => {
  const fixture = createFixture();
  try {
    const chapter = fixture.workspace.createWritingDocument({ projectId: fixture.projectId, type: "chapter", title: "只有章节" });
    const planned = fixture.control.createStoryExploration({ projectId: fixture.projectId, sceneId: chapter.id, authorGoal: "从当前章节提出下一步。" });
    assert.equal(planned.status, "planned");
    assert.equal(planned.source.sceneId, chapter.id);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Story Studio browser remains separated from Story Domain and Story Intelligence", () => {
  const appRoot = path.resolve("apps/story-studio/src");
  const source = listFiles(appRoot).filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => readFileSync(file, "utf8")).join("\n");
  for (const forbidden of ["domainTemplates/storyWorld", "storyIntelligence", "storyWorkspace/", "nuwaRunPath"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test("stale evidence-backed review remains blocked without losing validated evidence", async () => {
  const fixture = createFixture();
  try {
    const planned = fixture.control.createStoryExploration({ projectId: fixture.projectId, sceneId: fixture.sceneId, authorGoal: "比较部分透露后的长期影响。" });
    await fixture.control.runStoryExploration({ projectId: fixture.projectId, explorationId: planned.id });
    const synthesized = fixture.control.synthesizeStoryExploration({ projectId: fixture.projectId, explorationId: planned.id });
    const submitted = fixture.control.submitStoryExplorationRouteToImpact({ projectId: fixture.projectId, explorationId: planned.id, routeId: synthesized.routes[0].id });
    const evidence = structuredClone(submitted.review.evidence);
    const scene = fixture.workspace.readWritingDocument({ projectId: fixture.projectId, documentId: fixture.sceneId });
    fixture.workspace.updateWritingDocument({ projectId: fixture.projectId, documentId: scene.id, expectedHash: scene.revisionToken, status: scene.status, body: `${scene.body}\n外部修订。` });
    const stale = fixture.control.readImpactReview({ projectId: fixture.projectId, reviewId: submitted.review.id });
    assert.equal(stale?.status, "stale");
    assert.deepEqual(stale?.evidence, evidence);
    assert.ok((stale?.impact.evidenceCount || 0) > 0);
    assert.throws(() => fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: submitted.review.id, optionId: submitted.review.options[0].id, action: "adopt" }), /已经改变/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "story-studio-author-control-"));
  const workspaceRoot = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "mist-lighthouse";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath: workspaceRoot, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: projectId });
  const character = workspace.createWorldObject({ projectId, type: "character", title: "林远", status: "active" });
  const ally = workspace.createWorldObject({ projectId, type: "character", title: "阿岚", status: "missing" });
  const location = workspace.createWorldObject({ projectId, type: "location", title: "旧灯塔" });
  workspace.createWorldObject({ projectId, type: "rule", title: "地下室秘密不可完整公开", status: "locked" });
  workspace.createWorldObject({ projectId, type: "thread", title: "旧信来自何处", status: "open" });
  const chapter = workspace.createWritingDocument({ projectId, type: "chapter", title: "第三章 · 地下室" });
  const scene = workspace.createWritingDocument({ projectId, type: "scene", title: "铁门前的迟疑", chapterId: chapter.id });
  workspace.updateWritingDocument({
    projectId,
    documentId: scene.id,
    expectedHash: scene.revisionToken,
    status: "drafting",
    body: "# 铁门前的迟疑\n\n[[林远]]在[[旧灯塔]]前决定是否告诉[[阿岚]]部分秘密。\n"
  });
  return {
    root,
    projectPath: path.join(workspaceRoot, projectId),
    projectId,
    sceneId: scene.id,
    characterId: character.id,
    allyId: ally.id,
    locationId: location.id,
    workspace,
    control: createStoryStudioAuthorControl({ rootPath: workspaceRoot, stateFilePath })
  };
}

function readMarkdownTree(root: string): Record<string, string> {
  return Object.fromEntries(listFiles(root)
    .filter((file) => file.endsWith(".md"))
    .map((file) => [path.relative(root, file), readFileSync(file, "utf8")]));
}

function readCanonicalMarkdownTree(root: string): Record<string, string> {
  return Object.fromEntries(Object.entries(readMarkdownTree(root)).filter(([relativePath]) => !relativePath.startsWith(`.world-os${path.sep}`)));
}

function replaceFrontmatterScalar(source: string, key: string, value: string): string {
  const pattern = new RegExp(`^${key}: .*$`, "m");
  assert.match(source, pattern, `${key} must be present on the Writer-produced Canon event`);
  return source.replace(pattern, `${key}: ${value}`);
}

function createVerifiedCanon(fixture: ReturnType<typeof createFixture>, title: string) {
  const planning = fixture.workspace.createWorldObject({
    projectId: fixture.projectId,
    type: "event",
    title,
    status: "planned",
    tags: ["作者规划"]
  });
  const review = fixture.control.createPlanningEventImpactReview({ projectId: fixture.projectId, planningEventId: planning.id });
  fixture.control.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: review.options[0].id, action: "adopt" });
  const changeSet = fixture.control.createAuthorChangeSet({ projectId: fixture.projectId, reviewId: review.id });
  fixture.control.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id });
  const canon = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" })
    .map((event) => fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: event.id }))
    .find((event) => event.properties.source_change_set_id === changeSet.id)!;
  assert.ok(canon);
  return { planning, review, changeSet, canon };
}

function authorityArtifactPaths(projectPath: string, reviewId: string, changeSetId: string) {
  return {
    review: path.join(projectPath, ".world-os", "author-control", "impact-reviews", `${reviewId}.json`),
    changeSet: path.join(projectPath, ".world-os", "author-control", "change-sets", `${changeSetId}.json`),
    intent: path.join(projectPath, ".world-os", "author-control", "change-sets", `${changeSetId}.apply-intent.v1.json`)
  };
}

function readTreeGuard(root: string) {
  return listFiles(root).sort().map((file) => {
    const source = readFileSync(file);
    const stat = statSync(file, { bigint: true });
    return {
      path: path.relative(root, file),
      sha256: createHash("sha256").update(source).digest("hex"),
      size: stat.size.toString(),
      mode: stat.mode.toString(),
      mtimeNs: stat.mtimeNs.toString()
    };
  });
}

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}
