import { createHash } from "node:crypto";

import { createNovelDocumentStructure, readNovelDocumentModel } from "../../../src/storyCreation/creationArtifactModel.ts";
import { buildNeutralStoryPackage } from "../../../src/storyCreation/neutralStoryPackage.ts";
import { buildCreationSourceDriftCompareR0, validateCreationSourceReconciliationSelection } from "../../../src/storyCreation/creationSourceDriftR0.ts";
import { replaceBlockText, serializeNovelDocumentModelToMarkdown, withRevision } from "../../../src/storyCreation/novelDocumentModelR1.ts";
import { projectWorkVersionOutputArtifactSourceValidation } from "../../../src/storyCreation/workVersionBoundOutputArtifact.ts";
import { stableJson } from "../../../src/storyContinuity/continuityValidation.ts";
import { createStoryStudioWorkVersionAuthority } from "../../../src/storyWorkspace/workVersionAuthority.ts";
import { resolveWorkVersionOwnerSnapshotRefs } from "../../../src/storyWorkspace/workVersionSnapshotResolver.ts";

const ROOT_ACTION_ID = "author.creation-source.root.r0";
const CREATE_ACTION_ID = "author.creation-source.create-artifact.r0";
const CREATE_IDEMPOTENCY_KEY = "creation-source-r0:create-artifact";
const APPEND_ACTION_ID = "author.creation-source.append-artifact.r0";
const SAVE_OPERATION_ID = "author.creation-source.save-artifact-r2.r0";
const ADVANCE_ACTION_ID = "author.creation-source.advance-root.r0";
const ARCHIVE_ACTION_ID = "author.creation-source.archive-root.r0";
const RECONCILE_SOURCE_OPERATION_ID = "author.creation-source.reconcile-artifact-r3.r0";
const RECONCILE_SOURCE_ACTION_ID = "author.creation-source.append-reconciled-artifact.r0";
export function createCreationSourceSelectionPort({ operations, relationOperations = null, canonReadProjection = null, projectGuard = null, projectionSalt = () => null, faultInjector = () => {} }) {
  function resolveActiveProject(projectId) {
    const project = operations.listProjects().find((item) => item.id === projectId);
    if (!project) throw new Error("当前作品已不存在或未选择。");
    if (projectGuard) projectGuard(project);
    return project;
  }

  function projectPath(projectId) {
    resolveActiveProject(projectId);
    return operations.resolveProjectWorkspacePath({ projectId });
  }

  function authority(projectId) {
    return createStoryStudioWorkVersionAuthority({ projectRoot: projectPath(projectId) });
  }

  function selectedScope(projectId, input = {}) {
    const storyUnits = operations.listStoryUnits({ projectId }).filter((item) => item.lifecycle !== "archived");
    const storyUnit = input.storyUnitId
      ? storyUnits.find((item) => item.id === input.storyUnitId)
      : storyUnits[0];
    if (!storyUnit) throw new Error("当前作品还没有可用的故事单元，请先在事件线或资料中准备故事范围。");
    const allEvents = operations.listWorldObjects({ projectId, type: "event" }).filter((item) => item.status !== "archived");
    const verified = canonReadProjection?.listVerifiedCanonEvents({ projectId });
    if (verified?.status === "error") throw new Error(verified.error.message);
    const allowedEventIds = verified?.status === "ready" ? new Set(verified.eventIds) : null;
    const verifiedEvents = allowedEventIds ? allEvents.filter((item) => allowedEventIds.has(item.id)) : allEvents;
    // The unit is the first scope boundary. Do not let an empty checkbox set
    // silently borrow an arbitrary confirmed Event from another unit.
    const linkedIds = new Set([
      ...(storyUnit.linkedEntityIds || []),
      ...storyUnit.items.flatMap((item) => item.sourceRefs.map((ref) => ref.entityId))
    ]);
    const availableEvents = verifiedEvents.filter((item) => linkedIds.has(item.id));
    const requestedEventIds = Array.isArray(input.eventIds) ? [...new Set(input.eventIds.map(String))] : [];
    // Empty means the complete available scope for this unit, never an
    // undocumented first-item fallback. The UI keeps a non-empty selected set.
    const events = requestedEventIds.length ? requestedEventIds.map((id) => availableEvents.find((item) => item.id === id)).filter(Boolean) : availableEvents;
    if (!availableEvents.length) throw new Error("当前故事单元还没有可验证的已确认事件，请先完成作者确认和单元编排。");
    if (requestedEventIds.length && requestedEventIds.length !== events.length) throw new Error("选择的事件不属于当前故事单元，或尚未通过作者确认链验证。");
    return { storyUnit, events, availableEvents };
  }

  function scopedUnitForEvents(projectId, storyUnit, events) {
    const selectedIds = new Set(events.map((event) => event.id));
    const isSelectedFormalEventRef = (ref) => ref.sourceKind === "event-line" && selectedIds.has(ref.entityId);
    // A mixed fragment cannot be safely split at export time. Keep only a
    // fully formal item whose every source is one of this exact selection;
    // candidates, author intent, and a second unselected Event never hitch a
    // ride merely because one selected Event was mentioned.
    const includedItems = storyUnit.items.filter((item) => (
      item.authority === "canon" && item.sourceRefs.length > 0 && item.sourceRefs.every(isSelectedFormalEventRef)
    ));
    const eventItems = events.map((event) => {
      // List projections intentionally omit body text. Read the selected,
      // canon-authorized Event by stable identity so the package contains the
      // actual frozen narrative rather than a title-only directory row.
      const sourceEvent = operations.readWorldObject({ projectId, objectId: event.id });
      if (!sourceEvent || sourceEvent.status === "archived") throw new Error("选择的正式事件在建立创作稿前已不可读取。");
      // A protected Author Change Set may carry a canon Event's selected
      // source prose in its immutable planning-event provenance. It is not a
      // second scope: it is reachable only through this exact formal Event's
      // `planned_from` identity, and remains excluded for every other Event.
      const plannedFrom = typeof sourceEvent.properties?.planned_from === "string" ? sourceEvent.properties.planned_from : null;
      const planningSource = plannedFrom ? operations.readWorldObject({ projectId, objectId: plannedFrom }) : null;
      const content = {
        title: event.title,
        ...(sourceEvent.body ? { body: sourceEvent.body } : {}),
        ...(planningSource?.type === "event" && planningSource.status !== "archived" && planningSource.body ? { selectedSourceBody: planningSource.body } : {})
      };
      return {
        id: `formal-event:${event.id}`,
        kind: "confirmed-event",
        authority: "canon",
        // A formal Event title alone is only an index entry.  The selected
        // Event body is the canon-owned narrative material, so include its
        // frozen current text in the source package rather than rebuilding a
        // draft from a later Story Unit summary.
        content,
        sourceRefs: [{
          sourceKind: "event-line",
          ownerId: "story-studio-event-owner",
          entityId: event.id,
          entityVersion: event.revisionToken,
          capturedAt: event.updatedAt || event.createdAt || new Date(0).toISOString(),
          staleState: "fresh"
        }],
        createdBy: "system"
      };
    });
    return {
      ...storyUnit,
      // Story Unit summaries can be author plans or candidate notes. They are
      // not an event-content authority, so they are intentionally not prose.
      summary: "",
      sourceRefs: storyUnit.sourceRefs.filter(isSelectedFormalEventRef),
      items: [...eventItems, ...includedItems]
    };
  }

  function createRoot(projectId) {
    const project = resolveActiveProject(projectId);
    const current = authority(projectId).listVersions();
    if (current.some((item) => item.identity.kind === "derived")) throw new Error("Derived WorkVersion sources are rejected in this Creation slice.");
    const result = authority(projectId).createRootCheckpoint({
      displayName: "当前作品主线",
      authorActionId: ROOT_ACTION_ID,
      idempotencyKey: `creation-source-r0:root:${project.id}`,
      expectedRevision: 0,
      createdAt: operationTime(project, 0),
      ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: 1 }),
      optionalNuwaProvenanceRefs: []
    });
    return result;
  }

  async function packageForRoot(projectId, root, scopeInput = {}) {
    const project = resolveActiveProject(projectId);
    const { storyUnit, events } = selectedScope(projectId, scopeInput);
    const scopedUnit = scopedUnitForEvents(projectId, storyUnit, events);
    return buildNeutralStoryPackage({
      projectRef: { projectId: root.identity.projectId, title: project.title },
      scope: { kind: "unit", unitIds: [storyUnit.id], label: `${storyUnit.title} · ${events.length} 个已确认事件` },
      sourceRevision: {
        revisionId: `${root.identity.workVersionId}:r${root.identity.currentRevision}`,
        revisionHash: root.manifest.canonicalDigest,
        capturedAt: root.revision.createdAt,
        sourceOwners: ["story-unit", "event", "source-anchor"],
        workVersion: {
          projectId: root.identity.projectId,
          workVersionId: root.identity.workVersionId,
          kind: "root",
          pinnedRevision: root.identity.currentRevision,
          manifestId: root.manifest.manifestId,
          manifestDigest: root.manifest.canonicalDigest
        }
      },
      storyUnits: [scopedUnit],
      selectedUnitIds: [storyUnit.id],
      createdAt: root.revision.createdAt
    });
  }

  function pinnedPackageSnapshot(packageValue) {
    const snapshot = {
      packageId: packageValue.packageId,
      contentHash: packageValue.contentHash,
      scope: packageValue.scope,
      sourceAnchors: packageValue.manifest.sourceAnchors,
      warnings: packageValue.warnings,
      storyMarkdown: packageValue.storyMarkdown
    };
    return { ...snapshot, snapshotDigest: pinnedPackageSnapshotDigest(snapshot) };
  }

  async function createArtifact(projectId, input = {}) {
    const versionAuthority = authority(projectId);
    const versions = versionAuthority.listVersions();
    if (versions.some((item) => item.identity.kind === "derived")) throw new Error("Derived WorkVersion sources are rejected in this Creation slice.");
    const root = versions.find((item) => item.identity.kind === "root");
    if (!root) throw new Error("Create the root WorkVersion explicitly before creating an artifact.");
    assertRequestedRoot(versionAuthority, root, input.workVersionId);
    if (root.identity.status !== "active") throw new Error("Archived WorkVersion cannot create an OutputArtifact.");
    const creationKey = normalizedCreationKey(input.creationKey);
    const idempotencyKey = `${CREATE_IDEMPOTENCY_KEY}:${projectId}:${creationKey}`;
    const existing = operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => item.provenance.workVersionSource?.creationOperationReceipt.idempotencyKey === idempotencyKey);
    if (existing) {
      reconcile(projectId, existing.id);
      return existing;
    }
    const { storyUnit, events } = selectedScope(projectId, input);
    const packageValue = await packageForRoot(projectId, root, input);
    // Synthetic formal-event export records are a read projection, not Story
    // Unit items. Only persisted, canon-authorized items may be referenced by
    // the OutputArtifact's source-unit ownership record.
    const sourceUnits = [{ unitId: storyUnit.id, unitVersion: storyUnit.version, role: "primary", includedItemIds: scopedUnitForEvents(projectId, storyUnit, events).items.filter((item) => !item.id.startsWith("formal-event:")).map((item) => item.id) }];
    const generationBrief = {
      sourceKind: "work-version",
      neutralStoryPackageId: packageValue.packageId,
      neutralStoryPackageDigest: packageValue.contentHash,
      writeBack: "none"
    };
    const operationId = `${CREATE_ACTION_ID}:${projectId}:${creationKey}`;
    const sourceOwnerReceiptRefs = root.manifest.ownerSnapshotRefs
      .filter((item) => ["story-structure", "event-hierarchy", "source-anchors"].includes(item.ownerKind))
      .flatMap((item) => item.provenanceReceiptIds)
      .sort();
    const bindingBase = {
      schemaVersion: "tianyan-work-version-output-artifact-source/r0",
      sourceKind: "work-version",
      projectId: root.identity.projectId,
      workVersionId: root.identity.workVersionId,
      workVersionKind: "root",
      pinnedRevision: root.identity.currentRevision,
      manifestId: root.manifest.manifestId,
      manifestDigest: root.manifest.canonicalDigest,
      selectedStoryUnitRefs: [{ unitId: storyUnit.id, unitVersion: storyUnit.version }],
      selectedEventRefs: events.map((event) => ({ eventId: event.id, eventRevision: event.revisionToken })),
      sourceAnchorRefs: packageValue.manifest.sourceAnchors.map((anchor) => anchor.anchorId),
      neutralStoryPackageId: packageValue.packageId,
      neutralStoryPackageDigest: packageValue.contentHash,
      pinnedPackageSnapshot: pinnedPackageSnapshot(packageValue),
      sourceOwnerReceiptRefs,
      creationOperationReceipt: { operationId, idempotencyKey },
      createdAt: operationTime(resolveActiveProject(projectId), 10)
    };
    const title = String(input.title || `${resolveActiveProject(projectId).title} · 创作稿`).normalize("NFC").trim();
    const keySuffix = sha256(creationKey).slice(0, 10);
    const artifactTitle = input.title ? title : `${title} · ${keySuffix}`;
    const artifactId = outputArtifactId("novel", `${artifactTitle}-${keySuffix}`);
    const structure = createNovelDocumentStructure({ artifactId, title: artifactTitle, createdAt: operationTime(resolveActiveProject(projectId), 10) });
    const payloadDigest = creationPayloadDigest({ type: "novel", title: artifactTitle, sourceUnits, generationBrief, content: "", structure, workVersionSource: bindingBase });
    const artifact = operations.createOutputArtifact({
      projectId,
      artifactId,
      type: "novel",
      title: artifactTitle,
      sourceUnits,
      generationBrief,
      content: "",
      structure,
      workVersionSource: { ...bindingBase, creationOperationReceipt: { operationId, idempotencyKey, payloadDigest } },
      createdAt: operationTime(resolveActiveProject(projectId), 10)
    });
    faultInjector("after-artifact-save", { projectId, artifactId: artifact.id });
    reconcile(projectId, artifact.id);
    return artifact;
  }

  function reconcile(projectId, artifactId = null) {
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    const artifact = artifactId ? requireBoundArtifact(projectId, artifactId) : operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => item.provenance.workVersionSource);
    if (!root || !artifact) return { reconciled: false, reason: "nothing-to-reconcile" };
    if (root.identity.currentRevision === 1) {
      const binding = artifact.provenance.workVersionSource;
      if (!binding || binding.pinnedRevision !== 1 || binding.workVersionId !== root.identity.workVersionId) throw new Error("Existing artifact source binding cannot be reconciled.");
      versionAuthority.appendRevision({
        workVersionId: root.identity.workVersionId,
        expectedRevision: 1,
        authorActionId: APPEND_ACTION_ID,
        // The creation action already contains project and author-key data.
        // Hash that nested identifier so the WorkVersion receipt remains under
        // its 180-character contract for real project IDs and UI-generated
        // fixed-artifact keys.
        idempotencyKey: `creation-source-r0:root-r2:${sha256(binding.creationOperationReceipt.operationId).slice(0, 40)}`,
        createdAt: operationTime(resolveActiveProject(projectId), 11),
        ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: 1 }),
        optionalNuwaProvenanceRefs: [],
        semanticDeltaRefs: [
          `creation-output:${artifact.id}`,
          `artifact-revision:${artifact.currentRevisionId}`,
          `creation-receipt:${binding.creationOperationReceipt.operationId}`
        ]
      });
      return { reconciled: true, reason: "appended-root-r2" };
    }
    if (root.identity.currentRevision >= 2) return { reconciled: true, reason: "already-complete" };
    throw new Error("Unexpected root WorkVersion revision during Creation reconciliation.");
  }

  function saveArtifact(projectId, text = "雨声停在窗沿，沈砚把旧名守夜记录轻轻压在灯下。", artifactId = null) {
    const artifact = requireBoundArtifact(projectId, artifactId);
    const revisionOperationId = `${SAVE_OPERATION_ID}:${projectId}:${artifact.id}`;
    if (artifact.currentRevisionId === `artifact-revision.${sha256(revisionOperationId).slice(0, 32)}`) return artifact;
    const model = readNovelDocumentModel(artifact.structure);
    if (!model) throw new Error("当前创作稿无法使用现有正文修订边界。");
    const paragraph = Object.values(model.blocks).find((block) => block.kind === "paragraph");
    if (!paragraph) throw new Error("当前创作稿没有可编辑的正文段落。");
    const edited = withRevision(replaceBlockText(model, paragraph.id, text), "edit", operationTime(resolveActiveProject(projectId), 20));
    const structure = { ...artifact.structure, novelDocumentModel: edited };
    const result = operations.updateOutputArtifact({
      projectId,
      artifactId: artifact.id,
      expectedVersion: artifact.version,
      title: artifact.title,
      content: serializeNovelDocumentModelToMarkdown(edited),
      structure,
      revisionOperationId
    });
    if (result.conflict) throw new Error("OutputArtifact optimistic concurrency conflict.");
    return result.artifact;
  }

  function advanceRoot(projectId) {
    reconcile(projectId);
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    if (!root) throw new Error("Root WorkVersion is missing.");
    if (root.identity.currentRevision === 2) {
      return versionAuthority.appendRevision({
        workVersionId: root.identity.workVersionId,
        expectedRevision: 2,
        authorActionId: ADVANCE_ACTION_ID,
        idempotencyKey: `creation-source-r0:root-r3:${projectId}`,
        createdAt: operationTime(resolveActiveProject(projectId), 30),
        ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: 2 }),
        optionalNuwaProvenanceRefs: [],
        semanticDeltaRefs: ["story-source:author-advanced-after-creation"]
      });
    }
    if (root.identity.currentRevision === 3) return root;
    throw new Error("Unexpected root WorkVersion revision during source advance.");
  }

  function archiveRoot(projectId) {
    advanceRoot(projectId);
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    if (!root) throw new Error("Root WorkVersion is missing.");
    if (root.identity.status === "archived") return root;
    return versionAuthority.archiveVersion({
      workVersionId: root.identity.workVersionId,
      expectedRevision: root.identity.currentRevision,
      authorActionId: ARCHIVE_ACTION_ID,
      idempotencyKey: `creation-source-r0:root-archive:${projectId}`,
      createdAt: operationTime(resolveActiveProject(projectId), 40)
    });
  }

  async function sourceDriftCompare(projectId, options = {}) {
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    // The read path may be inspecting one exact historical artifact while
    // several fixed drafts coexist. Keep that identity through the nested
    // drift comparison instead of falling back to the single-artifact path.
    const artifact = requireBoundArtifact(projectId, options.artifactId);
    const binding = artifact.provenance.workVersionSource;
    if (!root || !binding) throw new Error("Creation source compare requires one bound root WorkVersion artifact.");
    if (root.identity.kind !== "root") throw new Error("Creation source compare accepts only a root WorkVersion.");
    const pinnedManifest = versionAuthority.getSnapshotManifest(binding.manifestId);
    const currentManifest = root.manifest;
    return buildCreationSourceDriftCompareR0({
      baseRevision: binding.pinnedRevision,
      currentRevision: root.identity.currentRevision,
      baseManifestDigest: pinnedManifest.canonicalDigest,
      currentManifestDigest: currentManifest.canonicalDigest,
      baseOwnerDigests: ownerDigestMap(pinnedManifest.ownerSnapshotRefs),
      currentOwnerDigests: ownerDigestMap(currentManifest.ownerSnapshotRefs),
      missingReference: options.fixtureCase === "missing",
      corruptReference: options.fixtureCase === "corrupt",
      concurrentCurrentRevision: options.fixtureCase === "concurrency" ? root.identity.currentRevision + 1 : null
    });
  }

  async function reconcileSource(projectId, input = {}) {
    const versionAuthority = authority(projectId);
    let root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    const artifactId = input.artifactId || null;
    let artifact = requireBoundArtifact(projectId, artifactId);
    let binding = artifact.provenance.workVersionSource;
    if (!root || !binding) throw new Error("Creation source reconciliation requires one bound root WorkVersion artifact.");
    if (binding.sourceReconciliationReceipt && binding.pinnedRevision === 3) {
      recoverSourceReconciliation(projectId, artifact.id);
      return requireBoundArtifact(projectId, artifact.id);
    }
    const expectedRootRevision = Number(input.expectedRootRevision);
    if (expectedRootRevision !== 3 || root.identity.currentRevision !== expectedRootRevision) {
      throw new Error("主线已再次更新，请重新核对");
    }
    if (binding.pinnedRevision !== 1) throw new Error("当前来源历史不符合本轮重新核对边界。");
    const validation = (await read(projectId, { view: "pinned", artifactId: artifact.id })).sourceValidation;
    if (validation?.status !== "historical_valid" || !validation.sourceDependentOperationsAllowed) throw new Error("The historical source is not valid for reconciliation.");
    const compare = await sourceDriftCompare(projectId, { artifactId: artifact.id });
    const confirmedDifferenceIds = validateCreationSourceReconciliationSelection(compare, input.selectedDifferenceIds || []);
    const operationId = `${RECONCILE_SOURCE_OPERATION_ID}:${projectId}`;
    const appendKey = `creation-source-r0:root-r4:${projectId}:${operationId}`;
    const newArtifactRevisionId = `artifact-revision.${sha256(operationId).slice(0, 32)}`;
    const bodyDigest = artifactBodyDigest(artifact);
    const packageValue = await packageForRoot(projectId, root);
    const { storyUnit, events } = selectedScope(projectId);
    const sourceOwnerReceiptRefs = root.manifest.ownerSnapshotRefs
      .filter((item) => ["story-structure", "event-hierarchy", "source-anchors"].includes(item.ownerKind))
      .flatMap((item) => item.provenanceReceiptIds)
      .sort();
    const nextBinding = {
      ...binding,
      pinnedRevision: root.identity.currentRevision,
      manifestId: root.manifest.manifestId,
      manifestDigest: root.manifest.canonicalDigest,
      selectedStoryUnitRefs: [{ unitId: storyUnit.id, unitVersion: storyUnit.version }],
      selectedEventRefs: events.map((event) => ({ eventId: event.id, eventRevision: event.revisionToken })),
      sourceAnchorRefs: packageValue.manifest.sourceAnchors.map((anchor) => anchor.anchorId),
      neutralStoryPackageId: packageValue.packageId,
      neutralStoryPackageDigest: packageValue.contentHash,
      pinnedPackageSnapshot: pinnedPackageSnapshot(packageValue),
      sourceOwnerReceiptRefs,
      sourceReconciliationReceipt: {
        schemaVersion: "tianyan-creation-source-reconciliation-receipt/r0",
        artifactId: artifact.id,
        originalArtifactRevisionId: artifact.currentRevisionId,
        newArtifactRevisionId,
        sourceWorkVersionId: root.identity.workVersionId,
        fromRevision: binding.pinnedRevision,
        fromManifestDigest: binding.manifestDigest,
        toRevision: root.identity.currentRevision,
        toManifestDigest: root.manifest.canonicalDigest,
        semanticDiffDigest: `sha256:${sha256(stableJson(compare))}`,
        bodyDigestBefore: bodyDigest,
        bodyDigestAfter: bodyDigest,
        confirmedDifferenceIds,
        unresolvedDifferenceIds: compare.differences.filter((difference) => !confirmedDifferenceIds.includes(difference.id) && difference.kind !== "unchanged").map((difference) => difference.id).sort(),
        idempotencyKey: operationId,
        executionStage: "artifact_revision_appended",
        expectedWorkVersionReceiptId: expectedWorkVersionReceiptId(root.identity.projectId, appendKey),
        blockedReason: null,
        createdAt: operationTime(resolveActiveProject(projectId), 50)
      },
      createdAt: operationTime(resolveActiveProject(projectId), 50)
    };
    const updated = operations.updateOutputArtifact({
      projectId,
      artifactId: artifact.id,
      expectedVersion: artifact.version,
      title: artifact.title,
      content: artifact.content,
      structure: artifact.structure,
      workVersionSource: nextBinding,
      revisionOperationId: operationId
    });
    if (updated.conflict) throw new Error("OutputArtifact optimistic concurrency conflict during source reconciliation.");
    artifact = updated.artifact;
    faultInjector("after-source-reconciliation-artifact-append", { projectId, artifactId: artifact.id });
    recoverSourceReconciliation(projectId, artifact.id);
    root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    faultInjector("after-source-reconciliation-work-version-append", { projectId, rootRevision: root?.identity.currentRevision });
    return artifact;
  }

  function recoverSourceReconciliation(projectId, artifactId = null) {
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    const artifact = requireBoundArtifact(projectId, artifactId);
    const binding = artifact.provenance.workVersionSource;
    const receipt = binding?.sourceReconciliationReceipt;
    if (!root || !binding || !receipt) return { reconciled: false, reason: "nothing-to-reconcile" };
    if (binding.pinnedRevision !== 3 || receipt.newArtifactRevisionId !== artifact.currentRevisionId) throw new Error("Reconciled artifact source receipt is inconsistent.");
    const appendKey = `creation-source-r0:root-r4:${projectId}:${receipt.idempotencyKey}`;
    if (receipt.expectedWorkVersionReceiptId !== expectedWorkVersionReceiptId(root.identity.projectId, appendKey)) throw new Error("Expected WorkVersion reconciliation receipt is inconsistent.");
    if (root.identity.currentRevision === 3) {
      const result = versionAuthority.appendRevision({
        workVersionId: root.identity.workVersionId,
        expectedRevision: 3,
        authorActionId: RECONCILE_SOURCE_ACTION_ID,
        idempotencyKey: appendKey,
        createdAt: operationTime(resolveActiveProject(projectId), 51),
        ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: 2 }),
        optionalNuwaProvenanceRefs: [],
        semanticDeltaRefs: [
          `creation-output:${artifact.id}`,
          `artifact-revision:${artifact.currentRevisionId}`,
          `source-reconciliation:${receipt.semanticDiffDigest}`,
          ...receipt.confirmedDifferenceIds
        ]
      });
      if (result.receipt.receiptId !== receipt.expectedWorkVersionReceiptId) throw new Error(`Committed WorkVersion reconciliation receipt does not match the artifact expectation: ${result.receipt.receiptId} != ${receipt.expectedWorkVersionReceiptId}; key=${result.receipt.idempotencyKey}; project=${result.receipt.projectId}.`);
      return { reconciled: true, reason: "appended-root-r4", receiptId: result.receipt.receiptId };
    }
    if (root.identity.currentRevision === 4) {
      const result = versionAuthority.getVersion(root.identity.workVersionId);
      if (result.receipt.receiptId !== receipt.expectedWorkVersionReceiptId || !result.revision.semanticDeltaRefs.includes(`artifact-revision:${artifact.currentRevisionId}`)) {
        throw new Error("Root revision 4 does not reference the reconciled artifact revision.");
      }
      return { reconciled: true, reason: "already-complete", receiptId: result.receipt.receiptId };
    }
    throw new Error("主线已再次更新，请重新核对");
  }

  function advanceRootForConcurrencyTest(projectId) {
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    if (!root || root.identity.currentRevision !== 3) throw new Error("Concurrency test requires root revision 3.");
    return versionAuthority.appendRevision({
      workVersionId: root.identity.workVersionId,
      expectedRevision: 3,
      authorActionId: "author.creation-source.concurrent-advance.r0",
      idempotencyKey: `creation-source-r0:concurrent-root-r4:${projectId}`,
      createdAt: operationTime(resolveActiveProject(projectId), 49),
      ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: 3 }),
      optionalNuwaProvenanceRefs: [],
      semanticDeltaRefs: ["story-source:concurrent-author-advance"]
    });
  }

  async function read(projectId, options = {}) {
    const project = resolveActiveProject(projectId);
    const versionAuthority = authority(projectId);
    const versions = versionAuthority.listVersions();
    const root = versions.find((item) => item.identity.kind === "root") || null;
    const sourceRequestBlocker = root ? requestedSourceBlocker(versionAuthority, root, options.workVersionId) : null;
    const derived = versions.filter((item) => item.identity.kind === "derived");
    const artifacts = operations.listOutputArtifacts({ projectId, includeArchived: true }).filter((item) => item.provenance.workVersionSource);
    // A pinned artifact is independently readable. Resolve its saved snapshot
    // before consulting today's Story Unit/Event projection: the latter may
    // legitimately have been archived or changed after the artifact was made.
    const wantsPinnedArtifact = options.view !== "current";
    let artifact = null;
    let binding = null;
    if (options.artifactId || wantsPinnedArtifact) {
      try {
        artifact = selectBoundArtifact(projectId, options.artifactId);
        binding = artifact?.provenance.workVersionSource || null;
      } catch (error) {
        return blockedReadProjection({ project, root, derivedVersionCount: derived.length, artifacts, sourceRequestBlocker: { kind: "artifact-selection", authorMessage: String(error?.message || error) } });
      }
    }
    const packageMode = binding && wantsPinnedArtifact ? "pinned-artifact" : "current-selection";
    let storyUnit;
    let events;
    let availableEvents;
    let packageValue = null;
    try {
      if (packageMode === "pinned-artifact" && binding) {
        if (!binding.pinnedPackageSnapshot) {
          return blockedReadProjection({
            project,
            root,
            derivedVersionCount: derived.length,
            artifacts,
            sourceRequestBlocker: { kind: "pinned-source-unavailable", authorMessage: "这份固定创作稿缺少当时的来源快照；为避免以旧版本标签导出新正文，已阻止导出。请显式选择当前来源并建立新的创作稿。" }
          });
        }
        const snapshot = binding.pinnedPackageSnapshot;
        if (!snapshot.snapshotDigest || snapshot.snapshotDigest !== pinnedPackageSnapshotDigest(snapshot)) {
          return blockedReadProjection({
            project,
            root,
            derivedVersionCount: derived.length,
            artifacts,
            sourceRequestBlocker: { kind: "pinned-source-corrupt", authorMessage: snapshot.snapshotDigest ? "这份固定创作稿的来源快照摘要不匹配；已阻止读取和下载，历史记录仍保留。" : "这份旧固定创作稿缺少可复核的快照摘要；已阻止读取和下载。请从可验证来源建立新的固定稿。" }
          });
        }
        packageValue = {
          packageId: snapshot.packageId,
          contentHash: snapshot.contentHash,
          scope: snapshot.scope,
          manifest: { sourceAnchors: snapshot.sourceAnchors },
          warnings: snapshot.warnings,
          storyMarkdown: snapshot.storyMarkdown
        };
        const unitRef = binding.selectedStoryUnitRefs[0] || null;
        const retainedUnit = unitRef ? operations.listStoryUnits({ projectId }).find((item) => item.id === unitRef.unitId) : null;
        storyUnit = retainedUnit || {
          id: unitRef?.unitId || snapshot.scope.unitIds[0] || "pinned-source",
          title: snapshot.scope.label,
          version: unitRef?.unitVersion || "pinned",
          summary: "",
          items: [],
          lifecycle: "archived"
        };
        const eventById = new Map(operations.listWorldObjects({ projectId, type: "event" }).map((event) => [event.id, event]));
        events = binding.selectedEventRefs.map((ref) => eventById.get(ref.eventId) || { id: ref.eventId, title: `已固定事件 · ${ref.eventId}`, revisionToken: ref.eventRevision, status: "archived" });
        availableEvents = events;
      } else {
        ({ storyUnit, events, availableEvents } = selectedScope(projectId, options));
      }
    } catch (error) {
      return blockedReadProjection({
        project,
        root,
        derivedVersionCount: derived.length,
        artifacts,
        sourceRequestBlocker: { kind: "missing-source", authorMessage: String(error?.message || error) }
      });
    }
    const legacyArtifact = operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => !item.provenance.workVersionSource) || null;
    let sourceValidation = null;
    if (packageMode === "current-selection" && root) {
      packageValue = await packageForRoot(projectId, root, options);
    }
    if (root && binding) {
      let integrity = "verified";
      let pinnedManifest = null;
      try {
        versionAuthority.verifyVersionIntegrity(root.identity.workVersionId);
        pinnedManifest = manifestProjection(versionAuthority.getSnapshotManifest(binding.manifestId));
      } catch (error) {
        integrity = String(error?.message || error).toLowerCase().includes("missing") ? "missing" : "corrupt";
      }
      if (options.fixtureCase === "missing") { integrity = "missing"; pinnedManifest = null; }
      if (options.fixtureCase === "corrupt" && pinnedManifest) pinnedManifest = { ...pinnedManifest, canonicalDigest: "0".repeat(64) };
      const currentManifest = manifestProjection(root.manifest);
      sourceValidation = projectWorkVersionOutputArtifactSourceValidation({
        binding,
        currentVersion: { projectId: root.identity.projectId, workVersionId: root.identity.workVersionId, kind: root.identity.kind, status: root.identity.status, currentRevision: root.identity.currentRevision },
        pinnedManifest,
        currentSourceProjectionMatchesPinned: pinnedManifest ? sourceSlicesMatch(pinnedManifest.ownerSnapshotRefs, currentManifest.ownerSnapshotRefs) : false,
        integrity
      });
    }
    const revisionHistory = artifact ? operations.getDocumentRevisionHistory({ projectId, ref: { kind: "artifact", id: artifact.id } }) : null;
    const authorText = artifact ? artifactAuthorText(artifact) : "";
    const reconciliationReceipt = binding?.sourceReconciliationReceipt || null;
    const compare = root && binding && !reconciliationReceipt && root.identity.currentRevision >= 3 && binding.pinnedRevision < root.identity.currentRevision
      ? await sourceDriftCompare(projectId, options)
      : null;
    const reconciliationComplete = Boolean(reconciliationReceipt && root?.identity.currentRevision === 4 && binding?.pinnedRevision === 3);
    return {
      version: "tianyan-project-scoped-creation-source-port/r0",
      project: { id: project.id, title: project.title },
      sourceRequestBlocker,
      root: root ? { id: root.identity.workVersionId, name: root.identity.displayName, kind: root.identity.kind, revision: root.identity.currentRevision, status: root.identity.status, manifestId: root.identity.headManifestId, manifestDigest: root.manifest.canonicalDigest } : null,
      derivedVersionCount: derived.length,
      storyUnit: { id: storyUnit.id, title: storyUnit.title, version: storyUnit.version, summary: storyUnit.summary, itemCount: storyUnit.items.length },
      events: events.map((event) => ({ id: event.id, title: event.title, revision: event.revisionToken, status: event.status })),
      availableEvents: availableEvents.map((event) => ({ id: event.id, title: event.title, revision: event.revisionToken, status: event.status })),
      selectedEventIds: packageMode === "pinned-artifact" ? binding.selectedEventRefs.map((ref) => ref.eventId) : events.map((event) => event.id),
      packageMode,
      package: packageValue ? { id: packageValue.packageId, digest: packageValue.contentHash, scope: packageValue.scope, sourceAnchors: packageValue.manifest.sourceAnchors, warnings: packageValue.warnings, storyMarkdown: packageValue.storyMarkdown } : null,
      artifact,
      artifacts,
      authorText,
      legacyArtifact,
      revisionHistory,
      sourceValidation,
      sourceCompare: compare,
      reconciliation: reconciliationReceipt ? {
        status: reconciliationComplete ? "completed" : "artifact_revision_appended",
        receipt: reconciliationReceipt,
        bodyUnchanged: reconciliationReceipt.bodyDigestBefore === reconciliationReceipt.bodyDigestAfter,
        workVersionReceiptVerified: reconciliationComplete
      } : null,
      recovery: { pendingAppend: Boolean(artifact && (root?.identity.currentRevision === 1 || (reconciliationReceipt && root?.identity.currentRevision === 3))), artifactSourcePinnedRevision: binding?.pinnedRevision || null },
      writes: { outputArtifactRevisions: reconciliationReceipt ? 1 : 0, workVersionRevisions: reconciliationComplete ? 1 : 0, provider: 0, plugin: 0, canon: 0, event: 0, worldState: 0, character: 0, relation: 0, session: 0, archive: 0, memory: 0 },
      multiverseExpansion: "HOLD"
    };
  }

  function blockedReadProjection({ project, root, derivedVersionCount, artifacts = [], sourceRequestBlocker }) {
    return {
      version: "tianyan-project-scoped-creation-source-port/r0",
      project: { id: project.id, title: project.title },
      sourceRequestBlocker,
      root: root ? { id: root.identity.workVersionId, name: root.identity.displayName, kind: root.identity.kind, revision: root.identity.currentRevision, status: root.identity.status, manifestId: root.identity.headManifestId, manifestDigest: root.manifest.canonicalDigest } : null,
      derivedVersionCount,
      storyUnit: null,
      events: [],
      availableEvents: [],
      selectedEventIds: [],
      packageMode: "blocked",
      package: null,
      artifact: null,
      artifacts,
      authorText: "",
      legacyArtifact: null,
      revisionHistory: null,
      sourceValidation: null,
      sourceCompare: null,
      reconciliation: null,
      recovery: { pendingAppend: false, artifactSourcePinnedRevision: null },
      writes: { outputArtifactRevisions: 0, workVersionRevisions: 0, provider: 0, plugin: 0, canon: 0, event: 0, worldState: 0, character: 0, relation: 0, session: 0, archive: 0, memory: 0 },
      multiverseExpansion: "HOLD"
    };
  }

  function selectBoundArtifact(projectId, artifactId = null) {
    const artifacts = operations.listOutputArtifacts({ projectId, includeArchived: true }).filter((item) => item.provenance.workVersionSource);
    if (artifactId) {
      const selected = artifacts.find((item) => item.id === artifactId);
      if (!selected) throw new Error("指定的固定创作稿不存在或不属于当前作品。");
      return selected;
    }
    if (artifacts.length > 1) throw new Error("当前作品存在多份固定创作稿；必须指定 artifactId，不能按列表顺序猜测来源范围。");
    return artifacts[0] || null;
  }

  function requireBoundArtifact(projectId, artifactId = null) {
    const artifact = selectBoundArtifact(projectId, artifactId);
    if (!artifact) throw new Error("WorkVersion-bound OutputArtifact does not exist.");
    return artifact;
  }

  function assertRequestedRoot(versionAuthority, root, requestedWorkVersionId) {
    if (!requestedWorkVersionId) return;
    let requested;
    try { requested = versionAuthority.getVersion(String(requestedWorkVersionId)); }
    catch { throw new Error("指定的作品版本已缺失，请重新选择当前作品主线。"); }
    if (requested.identity.kind !== "root") throw new Error("派生作品版本暂不能作为创作来源，请选择当前作品主线。");
    if (requested.identity.workVersionId !== root.identity.workVersionId) throw new Error("指定的作品主线与当前项目不一致。");
  }

  function requestedSourceBlocker(versionAuthority, root, requestedWorkVersionId) {
    if (!requestedWorkVersionId) return null;
    let requested;
    try { requested = versionAuthority.getVersion(String(requestedWorkVersionId)); }
    catch { throw new Error("指定的作品版本已缺失，请重新选择当前作品主线。"); }
    if (requested.identity.kind === "derived") return {
      kind: "derived-source",
      authorMessage: "派生作品版本暂不能作为创作来源，请选择当前作品主线。"
    };
    if (requested.identity.workVersionId !== root.identity.workVersionId) throw new Error("指定的作品主线与当前项目不一致。");
    return null;
  }

  function ownerSnapshotRefs(projectId, { sourceGeneration }) {
    const project = resolveActiveProject(projectId);
    const storyUnits = operations.listStoryUnits({ projectId }).filter((item) => item.lifecycle !== "archived");
    const worldObjects = operations.listWorldObjects({ projectId }).filter((item) => item.status !== "archived");
    const characters = worldObjects.filter((item) => item.type === "character");
    const verifiedCanon = canonReadProjection?.listVerifiedCanonEvents({ projectId });
    if (verifiedCanon?.status === "error") throw new Error(verifiedCanon.error.message);
    const canonEventIds = verifiedCanon?.status === "ready" ? verifiedCanon.eventIds : worldObjects.filter((item) => item.type === "event").map((item) => item.id);
    const canonSet = new Set(canonEventIds);
    const events = worldObjects.filter((item) => item.type === "event" && canonSet.has(item.id));
    const relationsRead = relationOperations?.listRelations({ projectId, includeArchived: true }) ?? { repositoryVersion: "unavailable", repositoryRevision: 0, relations: [] };
    const relations = relationsRead.relations;
    const outputs = operations.listOutputArtifacts({ projectId, includeArchived: true });
    // A confirmed Event is an exportable formal authority in its own right.
    // Record its stable source anchor in the WorkVersion snapshot even when a
    // Story Unit deliberately contains no prose fragment for that Event.
    const anchors = [
      ...storyUnits.flatMap((unit) => unit.sourceRefs.concat(unit.items.flatMap((item) => item.sourceRefs))),
      ...events.map((event) => ({ sourceKind: "event-line", ownerId: "story-studio-event-owner", entityId: event.id, entityVersion: event.revisionToken }))
    ].map(sourceAnchorId);
    const salt = projectionSalt({ projectId, sourceGeneration });
    const slices = {
      project: projectionSlice("project", [`project:${project.id}`], { projectId: project.id, title: project.title }),
      "story-structure": projectionSlice("story-structure", storyUnits.length ? storyUnits.map((unit) => `story-unit:${unit.id}`) : [`story-structure:${project.id}:empty`], { storyUnits: storyUnits.map((unit) => ({ id: unit.id, version: unit.version })), ...(salt ? { projectionSalt: salt } : {}) }),
      "event-hierarchy": projectionSlice("event-hierarchy", events.length ? events.map((event) => `event:${event.id}`) : [`event-hierarchy:${project.id}:empty`], { events: events.map((event) => ({ id: event.id, revision: event.revisionToken })), ...(salt ? { projectionSalt: salt } : {}) }),
      // An ordinary new project may legitimately have no character yet.  The
      // existing Character State owner still supplies a complete, explicit
      // empty projection; an empty array alone is not a valid digest input.
      "character-state": projectionSlice("character-state", characters.length ? characters.map((item) => `character:${item.id}`) : [`character-state:${project.id}:empty`], { state: characters.length ? "present" : "empty", characters: characters.map((item) => ({ id: item.id, revision: item.revisionToken })) }),
      "world-state": projectionSlice("world-state", worldObjects.length ? worldObjects.map((item) => `world-object:${item.id}`) : [`world-state:${project.id}:empty`], { objects: worldObjects.map((item) => ({ id: item.id, type: item.type, revision: item.revisionToken, status: item.status })) }),
      relation: projectionSlice("relation", relations.length ? relations.map((item) => `relation:${item.relationId}`) : [`relation:${project.id}:empty`], { repositoryVersion: relationsRead.repositoryVersion, repositoryRevision: relationsRead.repositoryRevision, relations: relations.map((item) => ({ id: item.relationId, revision: item.revision, archived: item.archived })) }),
      canon: projectionSlice("canon", canonEventIds.length ? canonEventIds.map((id) => `canon-event:${id}`) : [`canon:${project.id}:empty`], { verifiedEventIds: canonEventIds, invalidRecordCount: verifiedCanon?.status === "ready" ? verifiedCanon.invalidRecordCount : 0 }),
      "source-anchors": projectionSlice("source-anchors", anchors.length ? anchors : [`source-anchors:${project.id}:empty`], { state: anchors.length ? "present" : "empty", anchors, ...(salt ? { projectionSalt: salt } : {}) }),
      "creation-output": projectionSlice("creation-output", outputs.length ? outputs.map((item) => `creation-output:${item.id}`) : [`creation-output:${project.id}:empty`], { state: outputs.length ? "present" : "empty", outputs: outputs.map((item) => ({ id: item.id, revision: item.currentRevisionId, version: item.version })) })
    };
    return resolveWorkVersionOwnerSnapshotRefs(slices);
  }

  function appendStructuredStoryRevision(projectId, input) {
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root") || null;
    if (!root) throw new Error("当前作品尚未建立主故事版本，不能执行正式采纳。");
    if (root.identity.status !== "active") throw new Error("当前主故事版本已归档，不能执行正式采纳。");
    return versionAuthority.appendRevision({
      workVersionId: root.identity.workVersionId,
      expectedRevision: input.expectedRevision,
      authorActionId: input.authorActionId,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.createdAt,
      ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: input.expectedRevision + 1 }),
      optionalNuwaProvenanceRefs: [],
      semanticDeltaRefs: input.semanticDeltaRefs
    });
  }

  // MULTI-B1 needs a target-version checkpoint without pretending that a
  // derived IF is the root creation source.  This remains a WorkVersion-only
  // write: Event, Relation, WorldState and NarrativeArrangement are recorded
  // first by their existing Owners and are passed here only as receipt refs.
  function appendTargetWorkVersionRevision(projectId, input) {
    const versionAuthority = authority(projectId);
    const target = versionAuthority.getVersion(input.workVersionId);
    if (target.identity.status !== "active") throw new Error("归档的作品版本不能接收 MULTI-B1 融入结果。");
    // The authority checks its idempotency receipt before current-version
    // concurrency.  Preserve that order so a response lost after append can
    // replay even though the target has advanced to the merge result.
    if (target.identity.currentRevision === input.expectedRevision && target.manifest.canonicalDigest !== input.expectedManifestDigest) {
      throw new Error("目标作品版本已变化；请重新比较后再融入。");
    }
    try {
      return versionAuthority.appendRevision({
      workVersionId: target.identity.workVersionId,
      expectedRevision: input.expectedRevision,
      authorActionId: input.authorActionId,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.createdAt,
      ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: target.identity.currentRevision + 1 }),
      optionalNuwaProvenanceRefs: [],
      semanticDeltaRefs: input.semanticDeltaRefs
      });
    } catch (error) {
      if (/revision conflict|expected revision/i.test(String(error?.message || error))) throw new Error("目标作品版本已变化；请重新比较后再融入。");
      throw error;
    }
  }

  function listWorkVersions(projectId) {
    const versionAuthority = authority(projectId);
    return versionAuthority.listVersions().map((version) => ({
      identity: version.identity,
      manifest: { manifestId: version.manifest.manifestId, canonicalDigest: version.manifest.canonicalDigest },
      revision: { revision: version.revision.revision, createdAt: version.revision.createdAt },
      staleness: versionAuthority.projectVersionStaleness(version.identity.workVersionId)
    }));
  }

  function createDerivedWorkVersion(projectId, input) {
    const versionAuthority = authority(projectId);
    const parent = versionAuthority.getVersion(input.parentVersionId);
    if (parent.identity.kind !== "root" || parent.identity.status !== "active") throw new Error("IF 必须从当前可用的主故事版本创建。");
    if (parent.identity.currentRevision !== input.expectedParentRevision || parent.identity.headManifestId !== input.expectedParentManifestId) {
      throw new Error("主故事版本在创建 IF 前已变化；请刷新后重新选择分叉点。");
    }
    const created = versionAuthority.createDerivedVersion({
      displayName: input.displayName,
      parentVersionId: parent.identity.workVersionId,
      parentBaseRevision: parent.identity.currentRevision,
      parentManifestId: parent.identity.headManifestId,
      expectedRevision: 0,
      authorActionId: input.authorActionId,
      idempotencyKey: input.idempotencyKey,
      createdAt: input.createdAt,
      ownerSnapshotRefs: ownerSnapshotRefs(projectId, { sourceGeneration: parent.identity.currentRevision }),
      optionalNuwaProvenanceRefs: []
    });
    // Freeze N4's deliberately narrow state slices inside their existing
    // WorldState Owner.  Later IF writes select the child WorkVersion key and
    // therefore cannot leak back to the parent/mainline object field.
    operations.forkWorldStateN4({
      projectId,
      parentWorkVersionId: parent.identity.workVersionId,
      childWorkVersionId: created.identity.workVersionId,
      operationId: `${input.idempotencyKey}.world-state-fork`
    });
    return created;
  }

  return Object.freeze({
    resolveActiveProject,
    resolveRootWorkVersion: (projectId) => authority(projectId).listVersions().find((item) => item.identity.kind === "root") || null,
    listWorkVersions,
    createDerivedWorkVersion,
    appendStructuredStoryRevision,
    appendTargetWorkVersionRevision,
    validateWorkVersionSource: read,
    buildNeutralStoryPackage: async (projectId, input = {}) => {
      const root = authority(projectId).listVersions().find((item) => item.identity.kind === "root");
      if (!root) throw new Error("请先建立当前作品主线。");
      return packageForRoot(projectId, root, input);
    },
    createOrOpenOutputArtifact: createArtifact,
    getArtifactSourceProjection: read,
    compareArtifactSourceWithCurrentRoot: sourceDriftCompare,
    keepPinnedSource: async (projectId) => read(projectId),
    prepareSourceReconciliation: sourceDriftCompare,
    confirmSourceReconciliation: reconcileSource,
    recoverSourceState: recoverSourceReconciliation,
    read,
    createRoot,
    createArtifact,
    reconcile,
    saveArtifact,
    advanceRoot,
    archiveRoot,
    sourceDriftCompare,
    reconcileSource,
    recoverSourceReconciliation,
    advanceRootForConcurrencyTest
  });
}

function artifactAuthorText(artifact) {
  const model = readNovelDocumentModel(artifact.structure);
  if (!model) return artifact.content || "";
  return Object.values(model.blocks)
    .filter((block) => block.kind === "paragraph")
    .map((block) => block.inlines.map((inline) => inline.kind === "text" ? inline.text : inline.kind === "hard-break" ? "\n" : "").join(""))
    .join("\n\n");
}

function projectionSlice(ownerKind, stableReferenceIds, canonicalProjection) {
  const revisionToken = sha256(stableJson({ ownerKind, canonicalProjection }));
  return {
    ownerIdentity: `story-studio.${ownerKind}`,
    projectionSchemaVersion: `story-studio-${ownerKind}-projection/r0`,
    revisionToken,
    stableReferenceIds: [...new Set(stableReferenceIds)].sort(),
    provenanceReceiptIds: [`snapshot-receipt:${ownerKind}:${revisionToken.slice(0, 24)}`],
    canonicalProjection
  };
}

function sourceAnchorId(ref) {
  return [ref.sourceKind, ref.ownerId, ref.entityId, ref.entityVersion || "current"].join(":");
}

function manifestProjection(manifest) {
  return {
    manifestId: manifest.manifestId,
    projectId: manifest.projectId,
    workVersionId: manifest.workVersionId,
    versionRevision: manifest.versionRevision,
    canonicalDigest: manifest.canonicalDigest,
    stableReferenceIds: manifest.ownerSnapshotRefs.flatMap((item) => item.stableReferenceIds),
    provenanceReceiptIds: manifest.ownerSnapshotRefs.flatMap((item) => item.provenanceReceiptIds),
    ownerSnapshotRefs: manifest.ownerSnapshotRefs
  };
}

function sourceSlicesMatch(pinned, current) {
  const currentByKind = new Map(current.map((item) => [item.ownerKind, item]));
  return pinned.filter((item) => item.ownerKind !== "creation-output").every((item) => currentByKind.get(item.ownerKind)?.canonicalDigest === item.canonicalDigest);
}

function operationTime(project, minuteOffset) {
  const parsed = Date.parse(String(project.createdAt || ""));
  const base = Number.isFinite(parsed) ? parsed : Date.parse("2026-08-25T00:00:00.000Z");
  return new Date(base + minuteOffset * 60_000).toISOString();
}

function creationPayloadDigest(input) {
  return `sha256:${sha256(stableJson(input))}`;
}

function outputArtifactId(type, title) {
  const segment = title.normalize("NFC").trim().replace(/\s+/gu, "-").replace(/[^\p{L}\p{N}._-]/gu, "-").replace(/-+/gu, "-").slice(0, 96) || "untitled";
  return `${type}.${segment}`;
}

function normalizedCreationKey(value) {
  if (value === undefined || value === null || value === "") return "initial";
  const key = String(value).normalize("NFC").trim();
  if (!/^[a-zA-Z0-9._-]{8,120}$/u.test(key)) throw new Error("新建固定创作稿必须携带有效的作者操作标识。");
  return key;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pinnedPackageSnapshotDigest(snapshot) {
  const { snapshotDigest: _ignored, ...payload } = snapshot;
  return `sha256:${sha256(stableJson(payload))}`;
}

function ownerDigestMap(refs) {
  return Object.fromEntries(refs.map((ref) => [ref.ownerKind, ref.canonicalDigest]));
}

function artifactBodyDigest(artifact) {
  return `sha256:${sha256(stableJson({ content: artifact.content, structure: artifact.structure }))}`;
}

function expectedWorkVersionReceiptId(projectId, idempotencyKey) {
  return `work-version-receipt.${sha256(`${projectId}:${idempotencyKey}`).slice(0, 40)}`;
}
