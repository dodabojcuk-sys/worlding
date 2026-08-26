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
    const requestedEventIds = Array.isArray(input.eventIds) ? [...new Set(input.eventIds.map(String))] : [];
    const events = requestedEventIds.length ? requestedEventIds.map((id) => verifiedEvents.find((item) => item.id === id)).filter(Boolean) : verifiedEvents.slice(0, 1);
    if (!events.length) throw new Error("当前作品还没有可验证的已确认事件，请先完成作者确认。");
    if (requestedEventIds.length && requestedEventIds.length !== events.length) throw new Error("选择的事件已缺失或未通过作者确认链验证。");
    return { storyUnit, events };
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
    const { storyUnit } = selectedScope(projectId, scopeInput);
    return buildNeutralStoryPackage({
      projectRef: { projectId: root.identity.projectId, title: project.title },
      scope: { kind: "unit", unitIds: [storyUnit.id], label: storyUnit.title },
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
      storyUnits: [storyUnit],
      selectedUnitIds: [storyUnit.id],
      createdAt: root.revision.createdAt
    });
  }

  async function createArtifact(projectId, input = {}) {
    const versionAuthority = authority(projectId);
    const versions = versionAuthority.listVersions();
    if (versions.some((item) => item.identity.kind === "derived")) throw new Error("Derived WorkVersion sources are rejected in this Creation slice.");
    const root = versions.find((item) => item.identity.kind === "root");
    if (!root) throw new Error("Create the root WorkVersion explicitly before creating an artifact.");
    assertRequestedRoot(versionAuthority, root, input.workVersionId);
    if (root.identity.status !== "active") throw new Error("Archived WorkVersion cannot create an OutputArtifact.");
    const existing = operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => item.provenance.workVersionSource?.creationOperationReceipt.idempotencyKey === `${CREATE_IDEMPOTENCY_KEY}:${projectId}`);
    if (existing) {
      reconcile(projectId);
      return existing;
    }
    if (root.identity.currentRevision !== 1) throw new Error("新建创作稿必须明确使用当前作品主线的初始版本。");
    const { storyUnit, events } = selectedScope(projectId, input);
    const packageValue = await packageForRoot(projectId, root, input);
    const sourceUnits = [{ unitId: storyUnit.id, unitVersion: storyUnit.version, role: "primary", includedItemIds: storyUnit.items.map((item) => item.id) }];
    const generationBrief = {
      sourceKind: "work-version",
      neutralStoryPackageId: packageValue.packageId,
      neutralStoryPackageDigest: packageValue.contentHash,
      writeBack: "none"
    };
    const operationId = `${CREATE_ACTION_ID}:${projectId}`;
    const idempotencyKey = `${CREATE_IDEMPOTENCY_KEY}:${projectId}`;
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
      sourceOwnerReceiptRefs,
      creationOperationReceipt: { operationId, idempotencyKey },
      createdAt: operationTime(resolveActiveProject(projectId), 10)
    };
    const title = String(input.title || `${resolveActiveProject(projectId).title} · 创作稿`).normalize("NFC").trim();
    const structure = createNovelDocumentStructure({ artifactId: outputArtifactId("novel", title), title, createdAt: operationTime(resolveActiveProject(projectId), 10) });
    const payloadDigest = creationPayloadDigest({ type: "novel", title, sourceUnits, generationBrief, content: "", structure, workVersionSource: bindingBase });
    const artifact = operations.createOutputArtifact({
      projectId,
      type: "novel",
      title,
      sourceUnits,
      generationBrief,
      content: "",
      structure,
      workVersionSource: { ...bindingBase, creationOperationReceipt: { operationId, idempotencyKey, payloadDigest } },
      createdAt: operationTime(resolveActiveProject(projectId), 10)
    });
    faultInjector("after-artifact-save", { projectId, artifactId: artifact.id });
    reconcile(projectId);
    return artifact;
  }

  function reconcile(projectId) {
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    const artifact = operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => item.provenance.workVersionSource?.creationOperationReceipt.idempotencyKey === `${CREATE_IDEMPOTENCY_KEY}:${projectId}`);
    if (!root || !artifact) return { reconciled: false, reason: "nothing-to-reconcile" };
    if (root.identity.currentRevision === 1) {
      const binding = artifact.provenance.workVersionSource;
      if (!binding || binding.pinnedRevision !== 1 || binding.workVersionId !== root.identity.workVersionId) throw new Error("Existing artifact source binding cannot be reconciled.");
      versionAuthority.appendRevision({
        workVersionId: root.identity.workVersionId,
        expectedRevision: 1,
        authorActionId: APPEND_ACTION_ID,
        idempotencyKey: `creation-source-r0:root-r2:${projectId}:${binding.creationOperationReceipt.operationId}`,
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

  function saveArtifact(projectId, text = "雨声停在窗沿，沈砚把旧名守夜记录轻轻压在灯下。") {
    const artifact = requireBoundArtifact(projectId);
    const revisionOperationId = `${SAVE_OPERATION_ID}:${projectId}`;
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
    const artifact = requireBoundArtifact(projectId);
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
    let artifact = requireBoundArtifact(projectId);
    let binding = artifact.provenance.workVersionSource;
    if (!root || !binding) throw new Error("Creation source reconciliation requires one bound root WorkVersion artifact.");
    if (binding.sourceReconciliationReceipt && binding.pinnedRevision === 3) {
      recoverSourceReconciliation(projectId);
      return requireBoundArtifact(projectId);
    }
    const expectedRootRevision = Number(input.expectedRootRevision);
    if (expectedRootRevision !== 3 || root.identity.currentRevision !== expectedRootRevision) {
      throw new Error("主线已再次更新，请重新核对");
    }
    if (binding.pinnedRevision !== 1) throw new Error("当前来源历史不符合本轮重新核对边界。");
    const validation = (await read(projectId)).sourceValidation;
    if (validation?.status !== "historical_valid" || !validation.sourceDependentOperationsAllowed) throw new Error("The historical source is not valid for reconciliation.");
    const compare = await sourceDriftCompare(projectId);
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
    recoverSourceReconciliation(projectId);
    root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    faultInjector("after-source-reconciliation-work-version-append", { projectId, rootRevision: root?.identity.currentRevision });
    return artifact;
  }

  function recoverSourceReconciliation(projectId) {
    const versionAuthority = authority(projectId);
    const root = versionAuthority.listVersions().find((item) => item.identity.kind === "root");
    const artifact = requireBoundArtifact(projectId);
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
    let storyUnit;
    let events;
    try {
      ({ storyUnit, events } = selectedScope(projectId, options));
    } catch (error) {
      return blockedReadProjection({
        project,
        root,
        derivedVersionCount: derived.length,
        sourceRequestBlocker: { kind: "missing-source", authorMessage: String(error?.message || error) }
      });
    }
    const artifact = operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => item.provenance.workVersionSource) || null;
    const legacyArtifact = operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => !item.provenance.workVersionSource) || null;
    const binding = artifact?.provenance.workVersionSource || null;
    let sourceValidation = null;
    let packageValue = null;
    let pinnedPackageCreatedAt = operationTime(project, 0);
    if (binding) {
      try { pinnedPackageCreatedAt = versionAuthority.getSnapshotManifest(binding.manifestId).createdAt; }
      catch { /* Integrity validation below owns the author-facing missing/corrupt state. */ }
    }
    if (root) packageValue = binding
      ? await packageForPinnedBinding(binding, storyUnit, project.title, pinnedPackageCreatedAt)
      : await packageForRoot(projectId, root, options);
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
      package: packageValue ? { id: packageValue.packageId, digest: packageValue.contentHash, scope: packageValue.scope, sourceAnchors: packageValue.manifest.sourceAnchors, warnings: packageValue.warnings, storyMarkdown: packageValue.storyMarkdown } : null,
      artifact,
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

  function blockedReadProjection({ project, root, derivedVersionCount, sourceRequestBlocker }) {
    return {
      version: "tianyan-project-scoped-creation-source-port/r0",
      project: { id: project.id, title: project.title },
      sourceRequestBlocker,
      root: root ? { id: root.identity.workVersionId, name: root.identity.displayName, kind: root.identity.kind, revision: root.identity.currentRevision, status: root.identity.status, manifestId: root.identity.headManifestId, manifestDigest: root.manifest.canonicalDigest } : null,
      derivedVersionCount,
      storyUnit: null,
      events: [],
      package: null,
      artifact: null,
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

  function requireBoundArtifact(projectId) {
    const artifact = operations.listOutputArtifacts({ projectId, includeArchived: true }).find((item) => item.provenance.workVersionSource);
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
    const anchors = storyUnits.flatMap((unit) => unit.sourceRefs.concat(unit.items.flatMap((item) => item.sourceRefs))).map(sourceAnchorId);
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

  return Object.freeze({
    resolveActiveProject,
    resolveRootWorkVersion: (projectId) => authority(projectId).listVersions().find((item) => item.identity.kind === "root") || null,
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

async function packageForPinnedBinding(binding, storyUnit, projectTitle, createdAt) {
  return buildNeutralStoryPackage({
    projectRef: { projectId: binding.projectId, title: projectTitle },
    scope: { kind: "unit", unitIds: [storyUnit.id], label: storyUnit.title },
    sourceRevision: {
      revisionId: `${binding.workVersionId}:r${binding.pinnedRevision}`,
      revisionHash: binding.manifestDigest,
      capturedAt: createdAt,
      sourceOwners: ["story-unit", "event", "source-anchor"],
      workVersion: { projectId: binding.projectId, workVersionId: binding.workVersionId, kind: "root", pinnedRevision: binding.pinnedRevision, manifestId: binding.manifestId, manifestDigest: binding.manifestDigest }
    },
    storyUnits: [storyUnit],
    selectedUnitIds: [storyUnit.id],
    createdAt
  });
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

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
