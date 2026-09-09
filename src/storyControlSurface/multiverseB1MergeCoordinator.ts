import { createHash } from "node:crypto";
import path from "node:path";
import { publishFileNoReplace, readExistingUtf8, replaceFileAtomically } from "./atomicNoReplaceFile.ts";
import {
  beginMultiverseB1Compensation, beginMultiverseB1Merge, finishMultiverseB1Compensation, finishMultiverseB1Merge,
  markMultiverseB1MergeRecovery, planMultiverseB1Merge, recordMultiverseB1OwnerResult,
  resumeMultiverseB1Compensation,
  type MultiverseComparison, type MultiverseDifference, type MultiverseMergeExecution, type MultiverseMergeOwnerReceipt
} from "../storyWorkspace/multiverseB1.ts";

type AnyRecord = Record<string, any>;
type ExecutionEnvelope = {
  schemaVersion: "tianyan-multiverse-b1-owner-execution/v1";
  idempotencyKey: string;
  execution: MultiverseMergeExecution;
  detail: {
    events: Record<string, string>;
    relations: Record<string, string>;
    worldStateChanges: Record<string, { objectId: string; changeId: string }>;
    arrangements: Record<string, { narrativePathId: string; beforeRevision: number; afterRevision: number }>;
    compensationEventId: string | null;
  };
};
type MergeRequest = { comparison: MultiverseComparison; selectedChangeIds: string[]; operationId: string; idempotencyKey: string; authorActionId: string; createdAt: string };

/** An orchestration receipt only: all story facts stay in their existing Owner. */
export function createMultiverseB1MergeCoordinator(input: { operations: AnyRecord; relationOperations: AnyRecord; creationSourcePort: AnyRecord; eventMaterializer?: (value: { projectId: string; workVersionId: string; source: AnyRecord; plan: AnyRecord; difference: MultiverseDifference; operationId: string }) => any }) {
  function executionPath(projectId: string, idempotencyKey: string): string {
    return path.join(input.operations.resolveProjectWorkspacePath({ projectId }), ".world-os", "workspace", "multiverse-b1", "merges", `${digest(idempotencyKey)}.json`);
  }
  function readEnvelope(projectId: string, idempotencyKey: string): ExecutionEnvelope | null {
    const root = input.operations.resolveProjectWorkspacePath({ projectId });
    const raw = readExistingUtf8(root, executionPath(projectId, idempotencyKey));
    if (!raw) return null;
    const value = JSON.parse(raw) as ExecutionEnvelope;
    if (value?.schemaVersion !== "tianyan-multiverse-b1-owner-execution/v1" || value.idempotencyKey !== idempotencyKey || !value.execution) throw new Error("B1 merge receipt is malformed; no Owner write was attempted.");
    return structuredClone(value);
  }
  function persist(projectId: string, envelope: ExecutionEnvelope): ExecutionEnvelope {
    const root = input.operations.resolveProjectWorkspacePath({ projectId });
    const target = executionPath(projectId, envelope.idempotencyKey);
    const content = `${JSON.stringify(envelope, null, 2)}\n`;
    if (publishFileNoReplace({ rootPath: root, targetPath: target, content }) === "exists") replaceFileAtomically({ rootPath: root, targetPath: target, content });
    return structuredClone(envelope);
  }
  function resume(request: MergeRequest): ExecutionEnvelope {
    const existing = readEnvelope(request.comparison.target.projectId, request.idempotencyKey);
    if (existing) {
      const plan = existing.execution.plan;
      if (plan.operationId !== request.operationId || plan.compareDigest !== request.comparison.compareDigest) throw new Error("This B1 idempotency key is already bound to another frozen comparison.");
      return existing;
    }
    const target = request.comparison.target;
    const plan = planMultiverseB1Merge({ comparison: request.comparison, selectedChangeIds: request.selectedChangeIds, operationId: request.operationId, idempotencyKey: request.idempotencyKey, currentTarget: { workVersionId: target.workVersionId, revision: target.revision, manifestDigest: target.manifestDigest } });
    return persist(target.projectId, { schemaVersion: "tianyan-multiverse-b1-owner-execution/v1", idempotencyKey: request.idempotencyKey, execution: beginMultiverseB1Merge(plan), detail: { events: {}, relations: {}, worldStateChanges: {}, arrangements: {}, compensationEventId: null } });
  }

  return {
    read(value: { projectId: string; idempotencyKey: string }): MultiverseMergeExecution | null { return readEnvelope(value.projectId, value.idempotencyKey)?.execution ?? null; },
    apply(request: MergeRequest): MultiverseMergeExecution {
      let envelope = resume(request);
      if (["applied", "compensated"].includes(envelope.execution.status)) return envelope.execution;
      try {
        const plan = envelope.execution.plan;
        const selected = selectedDifferences(request.comparison, plan);
        const events = new Map<string, string>(Object.entries(envelope.detail.events));
        for (const difference of selected.filter((item) => item.ownerKind === "Event")) {
          if (hasReceipt(envelope.execution, difference.changeId)) continue;
          const source = sourceValue(difference);
          const targetEventRef = `event.author-confirmed-${digest(`${plan.receiptId}:${difference.objectId}`).slice(0, 24)}`;
          const saved = input.eventMaterializer
            ? { conflict: false, event: input.eventMaterializer({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, source, plan, difference, operationId: `${plan.operationId}.event.${difference.objectId}` }) }
            : input.operations.createConfirmedEventOnce({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, targetEventRef, title: text(source.title, "B1 source Event title"), body: text(source.body, "B1 source Event body"), provenance: eventProvenance(source, plan), operationId: `${plan.operationId}.event.${difference.objectId}` });
          if (saved.conflict || !saved.event) throw new Error(`B1 Event write conflicts for ${difference.objectId}; no later Owner was written.`);
          events.set(difference.objectId, saved.event.id);
          envelope.detail.events[difference.objectId] = saved.event.id;
          envelope.execution = addReceipt(envelope.execution, "Event", difference, `${plan.operationId}.event.${difference.objectId}`, `event:${saved.event.id}`);
          envelope = persist(plan.target.projectId, envelope);
        }
        for (const difference of selected.filter((item) => item.ownerKind === "Relation")) {
          if (hasReceipt(envelope.execution, difference.changeId)) continue;
          const source = sourceValue(difference);
          const candidate = input.relationOperations.createRelationCandidate({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, relationId: difference.objectId, sourceObjectId: text(source.sourceObjectId, "B1 Relation source"), targetObjectId: text(source.targetObjectId, "B1 Relation target"), relationTypeId: text(source.relationTypeId, "B1 Relation type"), ...(typeof source.relationLabelSnapshot === "string" ? { relationLabelSnapshot: source.relationLabelSnapshot } : {}), direction: text(source.direction, "B1 Relation direction"), evidenceRefs: Array.isArray(source.evidenceRefs) ? source.evidenceRefs : [], sourceRevision: typeof source.sourceRevision === "string" ? source.sourceRevision : "multiverse-b1", operationId: `${plan.operationId}.relation.${difference.objectId}` });
          const confirmed = input.relationOperations.confirmRelationCandidate({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, relationId: candidate.relation.relationId, expectedRelationRevision: candidate.relation.revision, operationId: `${plan.operationId}.relation.${difference.objectId}.confirm` });
          envelope.detail.relations[difference.changeId] = confirmed.relation.relationId;
          envelope.execution = addReceipt(envelope.execution, "Relation", difference, confirmed.receipt.receiptId, `relation:${confirmed.relation.relationId}`);
          envelope = persist(plan.target.projectId, envelope);
        }
        for (const difference of selected.filter((item) => item.ownerKind === "WorldState")) {
          if (hasReceipt(envelope.execution, difference.changeId)) continue;
          const source = sourceValue(difference);
          const objectId = text(source.objectId, "B1 WorldState object");
          const sourceEventId = text(source.supportingEventId, "B1 WorldState supporting Event");
          const event = input.operations.readWorldObject({ projectId: plan.target.projectId, objectId: events.get(sourceEventId) || sourceEventId });
          const subject = input.operations.readWorldObject({ projectId: plan.target.projectId, objectId });
          const prior = input.operations.readWorldStateN4({ projectId: plan.target.projectId, objectId, workVersionId: plan.target.workVersionId, observedAt: request.createdAt });
          const saved = input.operations.applyWorldStateN4({ projectId: plan.target.projectId, objectId, workVersionId: plan.target.workVersionId, expectedObjectRevision: subject.revisionToken, expectedRevision: prior.history.length, operationId: `${plan.operationId}.world-state.${difference.objectId}`, effectiveAt: request.createdAt, value: source.value, evidence: { kind: "confirmed-event", event: { id: event.id, revision: event.revisionToken } }, now: request.createdAt });
          envelope.detail.worldStateChanges[difference.changeId] = { objectId, changeId: saved.change.changeId };
          envelope.execution = addReceipt(envelope.execution, "WorldState", difference, saved.change.changeId, `world-state:${objectId}`);
          envelope = persist(plan.target.projectId, envelope);
        }
        for (const difference of selected.filter((item) => item.ownerKind === "NarrativePlacement")) {
          if (hasReceipt(envelope.execution, difference.changeId)) continue;
          const source = sourceValue(difference);
          const narrativePathId = text(source.narrativePathId, "B1 Narrative path");
          const eventId = events.get(text(source.eventId, "B1 Narrative Event")) || text(source.eventId, "B1 Narrative Event");
          let arrangement = input.operations.readNarrativeArrangement({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, narrativePathId });
          if (!arrangement.arrangement) {
            const unit = input.operations.readStoryUnit({ projectId: plan.target.projectId, unitId: narrativePathId });
            const created = input.operations.createNarrativeArrangement({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, narrativePathId, ownerStoryUnitId: narrativePathId, expectedOwnerVersion: unit.version, expectedRevision: 0, operationId: `${plan.operationId}.arrangement.${difference.objectId}.create`, authorActionId: request.authorActionId, createdAt: request.createdAt });
            if (created.conflict) throw new Error(`B1 NarrativeArrangement conflicts for ${difference.objectId}.`);
            arrangement = input.operations.readNarrativeArrangement({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, narrativePathId });
          }
          const saved = input.operations.insertNarrativePlacement({ projectId: plan.target.projectId, workVersionId: plan.target.workVersionId, narrativePathId, expectedOwnerVersion: arrangement.ownerVersion, expectedRevision: arrangement.arrangement.currentRevision, operationId: `${plan.operationId}.arrangement.${difference.objectId}`, authorActionId: request.authorActionId, sourceKind: "author-action", sourceRef: `multiverse-b1:${plan.receiptId}`, createdAt: request.createdAt, eventId, storyUnitId: narrativePathId, role: source.role || "primary", position: source.position || { kind: "end" } });
          if (saved.conflict || !saved.receipt || !saved.arrangement) throw new Error(`B1 NarrativePlacement conflicts for ${difference.objectId}.`);
          envelope.detail.arrangements[difference.changeId] = { narrativePathId, beforeRevision: saved.receipt.beforeRevision, afterRevision: saved.arrangement.currentRevision };
          envelope.execution = addReceipt(envelope.execution, "NarrativePlacement", difference, saved.receipt.receiptId, `placement:${eventId}`);
          envelope = persist(plan.target.projectId, envelope);
        }
        const result = input.creationSourcePort.appendTargetWorkVersionRevision(plan.target.projectId, { workVersionId: plan.target.workVersionId, expectedRevision: plan.target.revision, expectedManifestDigest: plan.target.manifestDigest, authorActionId: request.authorActionId, idempotencyKey: `${plan.idempotencyKey}.result-version`, createdAt: request.createdAt, semanticDeltaRefs: envelope.execution.ownerReceipts.map((receipt) => `${receipt.ownerKind}:${receipt.targetRef}`) });
        envelope.execution = finishMultiverseB1Merge({ execution: envelope.execution, resultVersion: { workVersionId: result.identity.workVersionId, revision: result.identity.currentRevision, manifestDigest: result.manifest.canonicalDigest } });
        return persist(plan.target.projectId, envelope).execution;
      } catch (error) {
        envelope.execution = markMultiverseB1MergeRecovery(envelope.execution, safeMessage(error));
        persist(envelope.execution.plan.target.projectId, envelope);
        throw error;
      }
    },
    compensate(request: { projectId: string; idempotencyKey: string; operationId: string; authorActionId: string; createdAt: string }): MultiverseMergeExecution {
      let envelope = readEnvelope(request.projectId, request.idempotencyKey);
      if (!envelope) throw new Error("B1 merge receipt does not exist.");
      if (envelope.execution.status === "compensated") return envelope.execution;
      try {
        const original = envelope.execution;
        if (original.status === "applied") envelope.execution = beginMultiverseB1Compensation(original);
        else if (original.status === "recovery-required") envelope.execution = resumeMultiverseB1Compensation(original);
        const plan = envelope.execution.plan;
        const current = input.creationSourcePort.resolveWorkVersion(request.projectId, plan.target.workVersionId);
        if (!original.resultVersion || current.identity.currentRevision !== original.resultVersion.revision || current.manifest.canonicalDigest !== original.resultVersion.manifestDigest) throw new Error("Target WorkVersion changed after this B1 merge; compensation stopped to protect later author changes.");
        envelope = persist(request.projectId, envelope);
        for (const [changeId, relationId] of Object.entries(envelope.detail.relations)) {
          const relation = input.relationOperations.readRelation({ projectId: request.projectId, workVersionId: plan.target.workVersionId, relationId }).relation;
          if (relation.archived || relation.reviewState !== "confirmed") throw new Error(`Relation ${changeId} changed after B1 merge; compensation stopped.`);
          input.relationOperations.archiveConfirmedRelation({ projectId: request.projectId, workVersionId: plan.target.workVersionId, relationId, expectedRelationRevision: relation.revision, operationId: `${request.operationId}.relation.${changeId}` });
        }
        for (const [changeId, detail] of Object.entries(envelope.detail.arrangements)) {
          const arrangement = input.operations.readNarrativeArrangement({ projectId: request.projectId, workVersionId: plan.target.workVersionId, narrativePathId: detail.narrativePathId });
          if (!arrangement.arrangement || arrangement.arrangement.currentRevision !== detail.afterRevision || !arrangement.ownerVersion) throw new Error(`NarrativePlacement ${changeId} changed after B1 merge; compensation stopped.`);
          const rolled = input.operations.rollbackNarrativeArrangement({ projectId: request.projectId, workVersionId: plan.target.workVersionId, narrativePathId: detail.narrativePathId, expectedOwnerVersion: arrangement.ownerVersion, expectedRevision: arrangement.arrangement.currentRevision, operationId: `${request.operationId}.arrangement.${changeId}`, authorActionId: request.authorActionId, sourceKind: "author-action", sourceRef: `multiverse-b1-compensation:${plan.receiptId}`, createdAt: request.createdAt, targetRevision: detail.beforeRevision });
          if (rolled.conflict || !rolled.receipt) throw new Error(`NarrativePlacement ${changeId} compensation conflicts.`);
        }
        if (!envelope.detail.compensationEventId) {
          const targetEventRef = `event.author-confirmed-${digest(`${plan.receiptId}:${request.operationId}`).slice(0, 24)}`;
          const saved = input.operations.createConfirmedEventOnce({ projectId: request.projectId, workVersionId: plan.target.workVersionId, targetEventRef, title: `回溯：${plan.receiptId.slice(-12)}`, body: `此正式补偿 Event 撤回 B1 融入 ${plan.receiptId} 的当前世界状态与关系效果；原 IF 与原始正式 Event 保留为可追溯历史。`, provenance: { sourceChangeSetId: `multiverse-b1-compensation:${plan.receiptId}`, sourceChangeSetRevision: digest(plan.receiptId), authorDecisionRef: request.authorActionId, applyOperationKey: `${request.operationId}.event`, intentHash: digest(`${plan.receiptId}:compensate`) }, operationId: `${request.operationId}.event` });
          if (saved.conflict || !saved.event) throw new Error("B1 compensation Event conflicts.");
          envelope.detail.compensationEventId = saved.event.id;
          envelope = persist(request.projectId, envelope);
        }
        const evidence = input.operations.readWorldObject({ projectId: request.projectId, objectId: envelope.detail.compensationEventId });
        for (const [changeId, detail] of Object.entries(envelope.detail.worldStateChanges)) {
          const state = input.operations.readWorldStateN4({ projectId: request.projectId, objectId: detail.objectId, workVersionId: plan.target.workVersionId, observedAt: request.createdAt });
          if (state.change?.changeId !== detail.changeId) throw new Error(`WorldState ${changeId} changed after B1 merge; compensation stopped.`);
          const subject = input.operations.readWorldObject({ projectId: request.projectId, objectId: detail.objectId });
          input.operations.compensateWorldStateN4({ projectId: request.projectId, objectId: detail.objectId, workVersionId: plan.target.workVersionId, expectedObjectRevision: subject.revisionToken, expectedRevision: state.history.length, operationId: `${request.operationId}.world-state.${changeId}`, compensatesChangeId: detail.changeId, effectiveAt: request.createdAt, evidence: { kind: "confirmed-event", event: { id: evidence.id, revision: evidence.revisionToken } }, now: request.createdAt });
        }
        const result = input.creationSourcePort.appendTargetWorkVersionRevision(request.projectId, { workVersionId: plan.target.workVersionId, expectedRevision: original.resultVersion!.revision, expectedManifestDigest: original.resultVersion!.manifestDigest, authorActionId: request.authorActionId, idempotencyKey: `${request.idempotencyKey}.compensation-result-version`, createdAt: request.createdAt, semanticDeltaRefs: [`compensation-of:${plan.receiptId}`, `event:${envelope.detail.compensationEventId}`, ...Object.values(envelope.detail.relations).map((id) => `archived-relation:${id}`), ...Object.values(envelope.detail.worldStateChanges).map((value) => `compensated-world-state:${value.objectId}:${value.changeId}`)] });
        envelope.execution = finishMultiverseB1Compensation({ execution: envelope.execution, resultVersion: { workVersionId: result.identity.workVersionId, revision: result.identity.currentRevision, manifestDigest: result.manifest.canonicalDigest } });
        return persist(request.projectId, envelope).execution;
      } catch (error) {
        envelope.execution = markMultiverseB1MergeRecovery(envelope.execution, safeMessage(error));
        persist(request.projectId, envelope);
        throw error;
      }
    }
  };
}

function selectedDifferences(comparison: MultiverseComparison, plan: MultiverseMergeExecution["plan"]): MultiverseDifference[] { const byId = new Map(comparison.differences.map((item) => [item.changeId, item])); return [...plan.requiredChangeIds, ...plan.selectedChangeIds].map((id) => byId.get(id)).filter((item): item is MultiverseDifference => Boolean(item)); }
function hasReceipt(execution: MultiverseMergeExecution, changeId: string) { return execution.ownerReceipts.some((item) => item.changeId === changeId); }
function addReceipt(execution: MultiverseMergeExecution, ownerKind: MultiverseMergeOwnerReceipt["ownerKind"], difference: MultiverseDifference, receiptRef: string, targetRef: string) { return recordMultiverseB1OwnerResult({ execution, ownerKind, changeId: difference.changeId, receiptRef, targetRef }); }
function sourceValue(difference: MultiverseDifference): AnyRecord { if (!difference.source || !difference.source.value || typeof difference.source.value !== "object") throw new Error(`B1 source payload is unavailable for ${difference.changeId}.`); return difference.source.value as AnyRecord; }
function text(value: unknown, label: string): string { const result = String(value || "").trim(); if (!result) throw new Error(`${label} is required.`); return result; }
function eventProvenance(source: AnyRecord, plan: AnyRecord) { const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value) ? value : digest(`${plan.receiptId}:${String(value || "")}`); return { sourceChangeSetId: typeof source.sourceChangeSetId === "string" ? source.sourceChangeSetId : `multiverse-b1:${plan.receiptId}`, sourceChangeSetRevision: hash(source.sourceChangeSetRevision), authorDecisionRef: typeof source.authorDecisionRef === "string" ? source.authorDecisionRef : plan.operationId, applyOperationKey: `${plan.operationId}.event`, intentHash: hash(source.intentHash) }; }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function safeMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
