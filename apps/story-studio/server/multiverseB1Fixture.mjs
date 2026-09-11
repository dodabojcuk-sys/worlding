import { compareMultiverseB1Versions } from "../../../src/storyWorkspace/multiverseB1.ts";
import { createMultiverseB1MergeCoordinator } from "../../../src/storyControlSurface/multiverseB1MergeCoordinator.ts";

const SOURCE_EVENT_ID = "event.author-confirmed-222222222222222222222222";
const RELATION_ID = "relation.fixture-awu-lin-trust";
const MERGE_KEY = "multiverse-b1-fixture.merge";

/** Explicitly isolated local fixture. It is never available for ordinary user
 * works, and writes every fact through the production Owner operations. */
export function createMultiverseB1FixtureAdapter({ operations, relationOperations, creationSourceSelectionPort, authorControl = null, now = () => new Date().toISOString() }) {
  const coordinator = createMultiverseB1MergeCoordinator({ operations, relationOperations, creationSourcePort: creationSourceSelectionPort, ...(authorControl ? { eventMaterializer: materializeAuthorControlledEvent } : {}) });
  function project(projectId) {
    const value = operations.listProjects().find((item) => item.id === projectId);
    if (!value) throw new Error("MULTI-B1 Fixture Project does not exist.");
    if (!/B1 融入隔离|multiverse[ .-]?b1[ .-]?fixture/i.test(value.title)) throw new Error("MULTI-B1 Fixture writes require an explicitly isolated Project.");
    return value;
  }
  function materializeAuthorControlledEvent({ projectId, source, plan, operationId }) {
    const marker = `multiverse-b1:${plan.receiptId}`;
    const existing = operations.listWorldObjects({ projectId, type: "event" })
      .filter((item) => item.status === "planned" && item.tags.includes(marker))
      .map((item) => operations.readWorldObject({ projectId, objectId: item.id }))[0] || null;
    const planning = existing || operations.createPlanningEvent({ projectId, title: text(source.title), tags: ["MULTI-B1 融入", marker], body: text(source.body) });
    let impact = authorControl.createPlanningEventImpactReview({ projectId, planningEventId: planning.id });
    if (impact.status === "pending") {
      const option = impact.options[0];
      if (!option) throw new Error("MULTI-B1 Event lacks an Author Control impact route.");
      impact = authorControl.chooseImpactRoute({ projectId, reviewId: impact.id, optionId: option.id, action: "adopt" });
    }
    if (impact.status !== "selected") throw new Error("MULTI-B1 Event has no selected Author Control impact route.");
    const changeSet = authorControl.createAuthorChangeSet({ projectId, reviewId: impact.id, decisionSource: "multiverse-b1-fixture", authorizationId: operationId });
    const applied = authorControl.applyAuthorChangeSet({ projectId, changeSetId: changeSet.id });
    if (!applied.application.appliedEventId) throw new Error("MULTI-B1 Author Control did not materialize a Canon Event.");
    return operations.readWorldObject({ projectId, objectId: applied.application.appliedEventId });
  }
  function object(projectId, title) {
    const found = operations.listWorldObjects({ projectId }).find((item) => item.title === title);
    if (!found) throw new Error(`MULTI-B1 Fixture object is missing: ${title}`);
    return operations.readWorldObject({ projectId, objectId: found.id });
  }
  function unit(projectId) {
    const found = operations.listStoryUnits({ projectId }).find((item) => item.title === "北闸替代路线");
    if (!found) throw new Error("MULTI-B1 Fixture Story Unit is missing.");
    return found;
  }
  function sourceVersion(projectId) {
    const version = creationSourceSelectionPort.listWorkVersions(projectId).find((item) => item.identity.kind === "derived");
    if (!version) throw new Error("MULTI-B1 Fixture IF is missing.");
    return version;
  }
  function rootVersion(projectId) {
    const version = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    if (!version) throw new Error("MULTI-B1 Fixture root WorkVersion is missing.");
    return version;
  }
  function setup(projectId) {
    project(projectId);
    let root = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    let awu = operations.listWorldObjects({ projectId }).find((item) => item.title === "阿芜");
    if (!awu) awu = operations.createWorldObject({ projectId, type: "character", title: "阿芜" });
    let lin = operations.listWorldObjects({ projectId }).find((item) => item.title === "林昭");
    if (!lin) lin = operations.createWorldObject({ projectId, type: "character", title: "林昭" });
    let key = operations.listWorldObjects({ projectId }).find((item) => item.title === "铜钥匙");
    if (!key) key = operations.createWorldObject({ projectId, type: "item", title: "铜钥匙" });
    let seed;
    try { seed = operations.readWorldObject({ projectId, objectId: "event.author-confirmed-333333333333333333333333" }); }
    catch { seed = operations.createConfirmedEventOnce({ projectId, targetEventRef: "event.author-confirmed-333333333333333333333333", title: "北闸旧闻", body: "北闸封闭消息仍未向所有人公开。", provenance: { sourceChangeSetId: "multiverse-b1-fixture-baseline", sourceChangeSetRevision: "c".repeat(64), authorDecisionRef: "author.multiverse-b1-fixture.baseline", applyOperationKey: "multiverse-b1-fixture.baseline-event", intentHash: "d".repeat(64) }, operationId: "multiverse-b1-fixture.baseline-event" }).event; }
    let storyUnit = operations.listStoryUnits({ projectId }).find((item) => item.title === "北闸替代路线");
    if (!storyUnit) {
      const sourceRef = { sourceKind: "event-line", ownerId: "story-studio.event", entityId: seed.id, entityVersion: seed.revisionToken, capturedAt: now(), staleState: "fresh" };
      storyUnit = operations.createStoryUnit({ projectId, title: "北闸替代路线", summary: "阿芜与林昭处理铜钥匙。", sourceRefs: [sourceRef], items: [{ id: "multiverse-b1.fixture.key", kind: "event-scope", authority: "author-intent", possibilityStatus: "selected-for-output", content: { summary: "铜钥匙交接" }, sourceRefs: [sourceRef], createdBy: "author" }] });
    }
    if (!root) root = creationSourceSelectionPort.createRoot(projectId);
    let type = relationOperations.listRelationTypes({ projectId }).types.find((item) => item.label === "信任");
    if (!type) type = relationOperations.createRelationType({ projectId, operationId: "multiverse-b1-fixture.type", label: "信任" }).type;
    let derived = creationSourceSelectionPort.listWorkVersions(projectId).find((item) => item.identity.kind === "derived");
    if (!derived) derived = creationSourceSelectionPort.createDerivedWorkVersion(projectId, { displayName: "阿芜持有铜钥匙", parentVersionId: root.identity.workVersionId, expectedParentRevision: root.identity.currentRevision, expectedParentManifestId: root.identity.headManifestId, authorActionId: "author.multiverse-b1-fixture.if", idempotencyKey: "multiverse-b1-fixture.create-if", createdAt: now() });
    const awuFull = operations.readWorldObject({ projectId, objectId: awu.id });
    const linFull = operations.readWorldObject({ projectId, objectId: lin.id });
    const keyFull = operations.readWorldObject({ projectId, objectId: key.id });
    let sourceEvent;
    try { sourceEvent = operations.readWorldObject({ projectId, objectId: SOURCE_EVENT_ID }); }
    catch { sourceEvent = operations.createConfirmedEventOnce({ projectId, workVersionId: derived.identity.workVersionId, targetEventRef: SOURCE_EVENT_ID, title: "阿芜把铜钥匙交给林昭", body: "阿芜只把铜钥匙交给林昭，并说明北闸已封。", provenance: { sourceChangeSetId: "multiverse-b1-fixture", sourceChangeSetRevision: "a".repeat(64), authorDecisionRef: "author.multiverse-b1-fixture.if", applyOperationKey: "multiverse-b1-fixture.if-event", intentHash: "b".repeat(64) }, operationId: "multiverse-b1-fixture.if-event" }).event; }
    let relation;
    try { relation = relationOperations.readRelation({ projectId, workVersionId: derived.identity.workVersionId, relationId: RELATION_ID }).relation; }
    catch {
      const candidate = relationOperations.createRelationCandidate({ projectId, workVersionId: derived.identity.workVersionId, relationId: RELATION_ID, sourceObjectId: awuFull.id, targetObjectId: linFull.id, relationTypeId: type.relationTypeId, direction: "both", operationId: "multiverse-b1-fixture.if-relation" });
      relation = relationOperations.confirmRelationCandidate({ projectId, workVersionId: derived.identity.workVersionId, relationId: candidate.relation.relationId, expectedRelationRevision: candidate.relation.revision, operationId: "multiverse-b1-fixture.if-relation-confirm" }).relation;
    }
    const sourceState = operations.readWorldStateN4({ projectId, objectId: keyFull.id, workVersionId: derived.identity.workVersionId, observedAt: now() });
    if (!sourceState.history.length) operations.applyWorldStateN4({ projectId, objectId: keyFull.id, workVersionId: derived.identity.workVersionId, expectedObjectRevision: keyFull.revisionToken, expectedRevision: 0, operationId: "multiverse-b1-fixture.if-state", effectiveAt: now(), value: { kind: "holder", state: "held", holder: { id: linFull.id, revision: linFull.revisionToken } }, evidence: { kind: "confirmed-event", event: { id: sourceEvent.id, revision: sourceEvent.revisionToken } }, now: now() });
    let arrangement = operations.readNarrativeArrangement({ projectId, workVersionId: derived.identity.workVersionId, narrativePathId: storyUnit.id });
    if (!arrangement.arrangement) {
      const currentUnit = operations.readStoryUnit({ projectId, unitId: storyUnit.id });
      operations.createNarrativeArrangement({ projectId, workVersionId: derived.identity.workVersionId, narrativePathId: storyUnit.id, ownerStoryUnitId: storyUnit.id, expectedOwnerVersion: currentUnit.version, expectedRevision: 0, operationId: "multiverse-b1-fixture.if-arrangement", authorActionId: "author.multiverse-b1-fixture.if", createdAt: now() });
      arrangement = operations.readNarrativeArrangement({ projectId, workVersionId: derived.identity.workVersionId, narrativePathId: storyUnit.id });
    }
    if (!arrangement.projection.placed.some((item) => item.eventId === sourceEvent.id)) operations.insertNarrativePlacement({ projectId, workVersionId: derived.identity.workVersionId, narrativePathId: storyUnit.id, expectedOwnerVersion: arrangement.ownerVersion, expectedRevision: arrangement.arrangement.currentRevision, operationId: "multiverse-b1-fixture.if-placement", authorActionId: "author.multiverse-b1-fixture.if", sourceKind: "author-action", sourceRef: "multiverse-b1-fixture", createdAt: now(), eventId: sourceEvent.id, storyUnitId: storyUnit.id, role: "primary", position: { kind: "end" } });
    return read(projectId);
  }
  function comparison(projectId) {
    const root = rootVersion(projectId); const derived = sourceVersion(projectId);
    const awu = object(projectId, "阿芜"); const lin = object(projectId, "林昭"); const key = object(projectId, "铜钥匙"); const sourceEvent = operations.readWorldObject({ projectId, objectId: SOURCE_EVENT_ID }); const storyUnit = unit(projectId); const type = relationOperations.listRelationTypes({ projectId }).types.find((item) => item.label === "信任");
    if (!type) throw new Error("MULTI-B1 Fixture RelationType is missing.");
    const empty = () => ({ Event: [], Relation: [], WorldState: [], NarrativePlacement: [] });
    const base = { projectId, workVersionId: root.identity.workVersionId, revision: root.identity.currentRevision, manifestDigest: root.manifest.canonicalDigest, objects: empty() };
    const source = { projectId, workVersionId: derived.identity.workVersionId, revision: derived.identity.currentRevision, manifestDigest: derived.manifest.canonicalDigest, objects: {
      Event: [{ id: SOURCE_EVENT_ID, value: { title: sourceEvent.title, body: sourceEvent.body }, sourceRefs: [SOURCE_EVENT_ID] }],
      Relation: [{ id: RELATION_ID, value: { sourceObjectId: awu.id, targetObjectId: lin.id, relationTypeId: type.relationTypeId, direction: "both" }, sourceRefs: [SOURCE_EVENT_ID] }],
      WorldState: [{ id: "state.fixture-copper-key", value: { objectId: key.id, supportingEventId: SOURCE_EVENT_ID, value: { kind: "holder", state: "held", holder: { id: lin.id, revision: lin.revisionToken } } }, sourceRefs: [SOURCE_EVENT_ID], dependencyIds: [SOURCE_EVENT_ID] }],
      NarrativePlacement: [{ id: "placement.fixture-copper-key", value: { narrativePathId: storyUnit.id, eventId: SOURCE_EVENT_ID, role: "primary", position: { kind: "end" } }, sourceRefs: [SOURCE_EVENT_ID], dependencyIds: [SOURCE_EVENT_ID] }]
    } };
    return compareMultiverseB1Versions({ base, source, target: { ...base, objects: empty() } });
  }
  function mergedEventId(execution) { return execution.ownerReceipts.find((item) => item.ownerKind === "Event")?.targetRef.replace(/^event:/u, "") || null; }
  function merge(projectId) {
    const compared = comparison(projectId);
    const execution = coordinator.apply({ comparison: compared, selectedChangeIds: compared.differences.filter((item) => item.selection === "available").map((item) => item.changeId), operationId: "multiverse-b1-fixture.merge", idempotencyKey: MERGE_KEY, authorActionId: "author.multiverse-b1-fixture.merge", createdAt: now() });
    const eventId = mergedEventId(execution); const current = unit(projectId);
    if (eventId && !current.linkedEntityIds.includes(eventId)) {
      const saved = operations.updateStoryUnit({ projectId, unitId: current.id, expectedVersion: current.version, linkedEntityIds: [...current.linkedEntityIds, eventId] });
      if (saved.conflict) throw new Error("MULTI-B1 Fixture Story Unit changed before linking the selected Canon Event.");
    }
    return execution;
  }
  function compensate(projectId) {
    const execution = coordinator.compensate({ projectId, idempotencyKey: MERGE_KEY, operationId: "multiverse-b1-fixture.compensate", authorActionId: "author.multiverse-b1-fixture.compensate", createdAt: now() });
    const eventId = mergedEventId(execution); const current = unit(projectId);
    if (eventId && current.linkedEntityIds.includes(eventId)) {
      const saved = operations.updateStoryUnit({ projectId, unitId: current.id, expectedVersion: current.version, linkedEntityIds: current.linkedEntityIds.filter((item) => item !== eventId) });
      if (saved.conflict) throw new Error("MULTI-B1 Fixture Story Unit changed before compensation link removal.");
    }
    return execution;
  }
  function read(projectId) {
    project(projectId);
    const root = creationSourceSelectionPort.resolveRootWorkVersion(projectId);
    const derived = creationSourceSelectionPort.listWorkVersions(projectId).find((item) => item.identity.kind === "derived") || null;
    // The rehearsal surface may inspect the same frozen comparison that merge
    // consumes.  It does not persist a second fact store or infer any facts.
    const compared = root && derived ? comparison(projectId) : null;
    return {
      version: "tianyan-multiverse-b1-fixture/v1",
      root: root ? { workVersionId: root.identity.workVersionId, revision: root.identity.currentRevision, manifestDigest: root.manifest.canonicalDigest } : null,
      derived: derived ? { workVersionId: derived.identity.workVersionId, revision: derived.identity.currentRevision, parentBaseRevision: derived.identity.parentBaseRevision } : null,
      comparison: compared ? {
        compareDigest: compared.compareDigest,
        source: { workVersionId: compared.source.workVersionId, revision: compared.source.revision, manifestDigest: compared.source.manifestDigest },
        target: { workVersionId: compared.target.workVersionId, revision: compared.target.revision, manifestDigest: compared.target.manifestDigest },
        differences: compared.differences.map((item) => ({ changeId: item.changeId, ownerKind: item.ownerKind, state: item.state, selection: item.selection, summary: item.summary, dependencyIds: item.dependencyIds }))
      } : null,
      execution: coordinator.read({ projectId, idempotencyKey: MERGE_KEY })
    };
  }
  return Object.freeze({ setup, read, comparison, merge, compensate });
}

function text(value) { const result = String(value || "").trim(); if (!result) throw new Error("MULTI-B1 Event source text is required."); return result; }
