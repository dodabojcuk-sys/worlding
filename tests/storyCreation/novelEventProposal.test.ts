import assert from "node:assert/strict";
import test from "node:test";

import { blockText, createNovelDocumentModelR1Fixture } from "../../src/storyCreation/novelDocumentModelR1.ts";
import { acceptNovelEventProposal, buildNovelNarrativeDiff, createNovelEventProposal, rejectNovelEventProposal, validateNovelEventProposal } from "../../src/storyCreation/novelEventProposal.ts";

test("confirmed Event proposal records provenance and accepts only the target block", () => {
  const model = createNovelDocumentModelR1Fixture();
  const target = model.blocks["paragraph.roof.1"]!;
  const before = blockText(target);
  const proposal = createNovelEventProposal({
    proposalId: "proposal.event.confirmed.1",
    sourceEventId: "event.confirmed.bell",
    sourceEventRevision: "a".repeat(64),
    targetDocumentId: model.documentId,
    targetBlockId: target.id,
    before,
    eventTitle: "钟楼确认",
    eventBody: "第三声钟响已被作者确认。",
    generatedAt: "2026-08-17T00:00:00.000Z"
  });
  const accepted = acceptNovelEventProposal(model, proposal, "2026-08-17T00:01:00.000Z");
  assert.equal(accepted.proposal.status, "accepted");
  assert.equal(accepted.model.blocks[target.id]?.id, target.id);
  assert.match(blockText(accepted.model.blocks[target.id]!), /@林海/u);
  assert.match(blockText(accepted.model.blocks[target.id]!), /钟楼确认/u);
  assert.equal(blockText(accepted.model.blocks["paragraph.roof.2"]!), blockText(model.blocks["paragraph.roof.2"]!));
  assert.equal(accepted.proposal.provenance.sourceKind, "confirmed-event");
});

test("rejecting a confirmed Event proposal keeps model text and references unchanged", () => {
  const model = createNovelDocumentModelR1Fixture();
  const target = model.blocks["paragraph.tower.1"]!;
  const before = blockText(target);
  const proposal = createNovelEventProposal({
    proposalId: "proposal.event.reject.1",
    sourceEventId: "event.confirmed.bell",
    sourceEventRevision: "b".repeat(64),
    targetDocumentId: model.documentId,
    targetBlockId: target.id,
    before,
    eventTitle: "不要改正文",
    eventBody: "这条建议只应保留回执。",
    generatedAt: "2026-08-17T00:00:00.000Z"
  });
  const rejected = rejectNovelEventProposal(proposal, "2026-08-17T00:02:00.000Z");
  assert.equal(rejected.status, "rejected");
  assert.equal(blockText(model.blocks[target.id]!), before);
  assert.throws(() => acceptNovelEventProposal(model, rejected, "2026-08-17T00:03:00.000Z"), /Rejected/);
});

test("Event proposal fails closed when target block has changed", () => {
  const model = createNovelDocumentModelR1Fixture();
  const target = model.blocks["paragraph.roof.2"]!;
  const proposal = createNovelEventProposal({
    proposalId: "proposal.event.stale.1",
    sourceEventId: "event.confirmed.bell",
    sourceEventRevision: "c".repeat(64),
    targetDocumentId: model.documentId,
    targetBlockId: target.id,
    before: blockText(target),
    eventTitle: "过期建议",
    eventBody: "目标段落已经被作者改过。",
    generatedAt: "2026-08-17T00:00:00.000Z"
  });
  const changed = { ...model, blocks: { ...model.blocks, [target.id]: { ...target, inlines: [{ kind: "text" as const, text: "作者的新正文。" }] } } };
  assert.throws(() => acceptNovelEventProposal(changed, proposal, "2026-08-17T00:04:00.000Z"), /stale/);
});

test("Event proposal keeps technical provenance out of narrative content and exposes a clean diff", () => {
  const proposal = createNovelEventProposal({
    proposalId: "proposal.event.clean.1",
    sourceEventId: "event.confirmed.clean",
    sourceEventRevision: "d".repeat(64),
    targetDocumentId: "novel.doc",
    targetBlockId: "paragraph.clean",
    before: "林海推开门。",
    eventTitle: "门外的雨",
    eventBody: "author-confirmed: true\n雨声压过了钟声。\nsnapshot-hash: abc123",
    generatedAt: "2026-08-17T00:00:00.000Z"
  });
  assert.equal(proposal.version, "tianyan-novel-event-proposal/v2");
  assert.match(proposal.proposedNarrativeContent, /雨声压过了钟声/u);
  assert.doesNotMatch(proposal.proposedNarrativeContent, /author-confirmed|snapshot-hash|abc123/u);
  assert.equal(proposal.after, proposal.proposedNarrativeContent);
  const diff = buildNovelNarrativeDiff(proposal.beforeContent, proposal.proposedNarrativeContent);
  assert.match(diff.added, /门外的雨/u);
});

test("legacy v1 proposals are read as a clean in-memory projection without raw technical text", () => {
  const legacy = validateNovelEventProposal({
    version: "tianyan-novel-event-proposal/v1",
    proposalId: "proposal.legacy",
    sourceEventId: "event.legacy",
    sourceEventRevision: "e".repeat(64),
    targetDocumentId: "novel.doc",
    targetBlockId: "paragraph.legacy",
    before: "原段落。",
    after: "原段落。\n\n【已确认事件 · 旧标题】旧正文。\nauthor-confirmed: true",
    provenance: { sourceKind: "confirmed-event", sourceId: "event.legacy", sourceRevision: "e".repeat(64), generatedBy: "deterministic-event-projection" },
    generatedAt: "2026-08-17T00:00:00.000Z",
    status: "pending"
  });
  assert.equal(legacy.version, "tianyan-novel-event-proposal/v2");
  assert.match(legacy.proposedNarrativeContent, /旧正文/u);
  assert.doesNotMatch(legacy.proposedNarrativeContent, /author-confirmed|【已确认事件/u);
  assert.equal(legacy.technicalMetadata.legacySource?.version, "tianyan-novel-event-proposal/v1");
});

test("legacy browser-shaped proposal removes mixed evidence and debug prose before any write", () => {
  const legacy = validateNovelEventProposal({
    version: "tianyan-novel-event-proposal/v1",
    proposalId: "proposal.legacy.browser-shaped",
    sourceEventId: "event.author-confirmed-legacy",
    sourceEventRevision: "f".repeat(64),
    targetDocumentId: "novel.doc",
    targetBlockId: "paragraph.legacy.browser-shaped",
    before: "林海停在钟楼外。",
    after: "林海停在钟楼外。\n\n【已确认事件 · 钟楼外寻找阿岚】钟楼外寻找阿岚 R1 · 只透露部分线索 作者选择 只透露部分线索 已确认的事件变化 采用部分线索: 只展示线索，不确认秘密全貌。 中等风险 event.author-confirmed-legacy is pulled into the preview as a dependency. 证据引用 evidence-event:event.author-confirmed-legacy:dependency_effect snapshot-evidence-chapter.我 snapshot-evidence-event.author-confirmed-legacy 事件记录：已由作者确认 变更来源：作者确认的受保护变更单",
    provenance: { sourceKind: "confirmed-event", sourceId: "event.author-confirmed-legacy", sourceRevision: "f".repeat(64), generatedBy: "deterministic-event-projection" },
    generatedAt: "2026-08-17T00:00:00.000Z",
    status: "pending"
  });
  assert.match(legacy.proposedNarrativeContent, /采用部分线索/u);
  assert.match(legacy.proposedNarrativeContent, /只展示线索，不确认秘密全貌/u);
  assert.doesNotMatch(legacy.proposedNarrativeContent, /event\.author-confirmed|evidence-event|snapshot-evidence|作者选择|中等风险|证据引用|变更来源|受保护变更单/u);
});
