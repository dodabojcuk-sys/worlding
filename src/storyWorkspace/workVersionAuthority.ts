import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { publishFileNoReplace } from "../storyControlSurface/atomicNoReplaceFile.ts";
import { openStoryWorkspace } from "./storyWorkspaceRepository.mjs";

export const WORK_VERSION_IDENTITY_SCHEMA = "story-work-version-identity/v1" as const;
export const WORK_VERSION_MANIFEST_SCHEMA = "story-work-version-snapshot-manifest/v1" as const;
export const WORK_VERSION_REVISION_SCHEMA = "story-work-version-revision/v1" as const;
export const WORK_VERSION_RECEIPT_SCHEMA = "story-work-version-action-receipt/v1" as const;

export const WORK_VERSION_REQUIRED_OWNER_KINDS = [
  "project",
  "story-structure",
  "event-hierarchy",
  "character-state",
  "world-state",
  "relation",
  "canon",
  "source-anchors",
  "creation-output"
] as const;

export type WorkVersionOwnerKind = (typeof WORK_VERSION_REQUIRED_OWNER_KINDS)[number];
export type WorkVersionKind = "root" | "derived";
export type WorkVersionStatus = "active" | "archived";
export type OwnerSnapshotCompleteness = "complete" | "missing" | "unsupported" | "stale";

export type OwnerSnapshotRef = {
  ownerKind: WorkVersionOwnerKind;
  ownerIdentity: string;
  projectionSchemaVersion: string;
  revisionToken: string;
  canonicalDigest: string;
  stableReferenceIds: string[];
  provenanceReceiptIds: string[];
  completeness: OwnerSnapshotCompleteness;
};

export type NuwaProvenanceRef = {
  runId: string;
  branchId: string;
  stepId: string;
  receiptId: string;
  canonicalDigest: string;
};

export type WorkVersionSnapshotManifest = {
  schemaVersion: typeof WORK_VERSION_MANIFEST_SCHEMA;
  manifestId: string;
  projectId: string;
  workVersionId: string;
  versionRevision: number;
  createdAt: string;
  createdByAuthorActionId: string;
  ownerSnapshotRefs: OwnerSnapshotRef[];
  optionalNuwaProvenanceRefs: NuwaProvenanceRef[];
  completeness: "complete";
  canonicalDigest: string;
  previousManifestDigest: string | null;
};

export type WorkVersionRevision = {
  schemaVersion: typeof WORK_VERSION_REVISION_SCHEMA;
  workVersionId: string;
  revision: number;
  expectedPreviousRevision: number;
  previousRevisionDigest: string | null;
  manifestId: string;
  semanticDeltaRefs: string[];
  authorActionId: string;
  idempotencyKey: string;
  createdAt: string;
  revisionDigest: string;
};

export type WorkVersionIdentity = {
  schemaVersion: typeof WORK_VERSION_IDENTITY_SCHEMA;
  workVersionId: string;
  projectId: string;
  kind: WorkVersionKind;
  displayName: string;
  parentVersionId: string | null;
  parentBaseRevision: number | null;
  parentManifestId: string | null;
  parentManifestDigest: string | null;
  lineageDepth: 0 | 1;
  status: WorkVersionStatus;
  createdByAuthorActionId: string;
  createdAt: string;
  currentRevision: number;
  headManifestId: string;
  integrityDigest: string;
};

export type WorkVersionActionReceipt = {
  schemaVersion: typeof WORK_VERSION_RECEIPT_SCHEMA;
  receiptId: string;
  action: "create-root" | "create-derived" | "append-revision" | "archive";
  projectId: string;
  authorActionId: string;
  idempotencyKey: string;
  payloadDigest: string;
  createdAt: string;
  result: {
    identity: WorkVersionIdentity;
    manifest: WorkVersionSnapshotManifest;
    revision: WorkVersionRevision;
  };
  receiptDigest: string;
};

export type WorkVersionMutationResult = WorkVersionActionReceipt["result"] & {
  receipt: WorkVersionActionReceipt;
};

type BaseMutationInput = {
  authorActionId: string;
  idempotencyKey: string;
  expectedRevision: number;
  createdAt: string;
};

type SnapshotMutationInput = BaseMutationInput & {
  ownerSnapshotRefs: OwnerSnapshotRef[];
  optionalNuwaProvenanceRefs: NuwaProvenanceRef[];
};

export type CreateRootCheckpointInput = SnapshotMutationInput & {
  displayName: string;
};

export type CreateDerivedVersionInput = SnapshotMutationInput & {
  displayName: string;
  parentVersionId: string;
  parentBaseRevision: number;
  parentManifestId: string;
};

export type AppendRevisionInput = Omit<SnapshotMutationInput, "optionalNuwaProvenanceRefs"> & {
  workVersionId: string;
  semanticDeltaRefs: string[];
  optionalNuwaProvenanceRefs?: NuwaProvenanceRef[];
};

export type ArchiveVersionInput = BaseMutationInput & {
  workVersionId: string;
};

export type WorkVersionStaleness =
  | { state: "current"; parentVersionId: string | null; pinnedRevision: number | null; currentParentRevision: number | null; pinnedManifestId: string | null; currentParentManifestId: string | null }
  | { state: "stale"; parentVersionId: string; pinnedRevision: number; currentParentRevision: number; pinnedManifestId: string; currentParentManifestId: string }
  | { state: "blocked_missing_reference"; parentVersionId: string; pinnedRevision: number; currentParentRevision: number | null; pinnedManifestId: string; currentParentManifestId: string | null };

export type StoryStudioWorkVersionAuthority = ReturnType<typeof createStoryStudioWorkVersionAuthority>;

const AUTHORITY_RELATIVE_ROOT = ".world-os/work-versions";
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export function createStoryStudioWorkVersionAuthority(input: { projectRoot: string }) {
  const workspace = openStoryWorkspace(input.projectRoot);
  const projectRoot = realpathSync(workspace.rootPath);
  const projectId = requireText(workspace.project.id, "Project identity", 180);
  const authorityRoot = path.join(projectRoot, AUTHORITY_RELATIVE_ROOT);

  const paths = {
    authorityRoot,
    manifestPath: (manifestId: string) => path.join(authorityRoot, "manifests", `${safeObjectName(manifestId)}.json`),
    revisionPath: (workVersionId: string, revision: number) => path.join(authorityRoot, "revisions", safeObjectName(workVersionId), `${String(revision).padStart(12, "0")}.json`),
    receiptPath: (idempotencyKey: string) => path.join(authorityRoot, "receipts", `${hash(`receipt:${projectId}:${idempotencyKey}`)}.json`)
  };

  function createRootCheckpoint(raw: CreateRootCheckpointInput): WorkVersionMutationResult {
    const normalized = normalizeCreateRoot(raw);
    const existing = readIdempotentReceipt(normalized.idempotencyKey, normalized);
    if (existing) return existing;
    if (normalized.expectedRevision !== 0) throw new Error("Root creation revision conflict: expected revision must be 0.");
    if (listVersions().some((version) => version.identity.kind === "root")) {
      throw new Error("One root WorkVersion already exists for this Project.");
    }

    const workVersionId = createWorkVersionId("root", normalized.authorActionId);
    return commitMutation({
      action: "create-root",
      input: normalized,
      workVersionId,
      kind: "root",
      displayName: normalized.displayName,
      parent: null,
      previous: null,
      status: "active",
      ownerSnapshotRefs: normalized.ownerSnapshotRefs,
      optionalNuwaProvenanceRefs: normalized.optionalNuwaProvenanceRefs,
      semanticDeltaRefs: []
    });
  }

  function createDerivedVersion(raw: CreateDerivedVersionInput): WorkVersionMutationResult {
    const normalized = normalizeCreateDerived(raw);
    const existing = readIdempotentReceipt(normalized.idempotencyKey, normalized);
    if (existing) return existing;
    if (normalized.expectedRevision !== 0) throw new Error("Derived creation revision conflict: expected revision must be 0.");

    const parent = getVersion(normalized.parentVersionId);
    if (parent.identity.kind !== "root" || parent.identity.lineageDepth !== 0) {
      throw new Error("R0 rejects derived-from-derived lineage depth greater than one.");
    }
    if (parent.identity.currentRevision !== normalized.parentBaseRevision) {
      throw new Error("Parent revision conflict while creating derived WorkVersion.");
    }
    if (parent.identity.headManifestId !== normalized.parentManifestId) {
      throw new Error("Parent manifest conflict while creating derived WorkVersion.");
    }
    if (parent.identity.status !== "active") throw new Error("Archived parent WorkVersion cannot create a derived version.");

    const workVersionId = createWorkVersionId("derived", normalized.authorActionId);
    return commitMutation({
      action: "create-derived",
      input: normalized,
      workVersionId,
      kind: "derived",
      displayName: normalized.displayName,
      parent: {
        workVersionId: parent.identity.workVersionId,
        revision: parent.identity.currentRevision,
        manifestId: parent.identity.headManifestId,
        manifestDigest: parent.manifest.canonicalDigest
      },
      previous: null,
      status: "active",
      ownerSnapshotRefs: normalized.ownerSnapshotRefs,
      optionalNuwaProvenanceRefs: normalized.optionalNuwaProvenanceRefs,
      semanticDeltaRefs: []
    });
  }

  function appendRevision(raw: AppendRevisionInput): WorkVersionMutationResult {
    const normalized = normalizeAppend(raw);
    const existing = readIdempotentReceipt(normalized.idempotencyKey, normalized);
    if (existing) return existing;
    const current = getVersion(normalized.workVersionId);
    assertExpectedRevision(current.identity, normalized.expectedRevision);
    if (current.identity.status !== "active") throw new Error("Archived WorkVersion cannot receive another content revision.");
    return commitMutation({
      action: "append-revision",
      input: normalized,
      workVersionId: current.identity.workVersionId,
      kind: current.identity.kind,
      displayName: current.identity.displayName,
      parent: parentSeed(current.identity),
      previous: current,
      status: current.identity.status,
      ownerSnapshotRefs: normalized.ownerSnapshotRefs,
      optionalNuwaProvenanceRefs: normalized.optionalNuwaProvenanceRefs,
      semanticDeltaRefs: normalized.semanticDeltaRefs
    });
  }

  function archiveVersion(raw: ArchiveVersionInput): WorkVersionMutationResult {
    const normalized = normalizeArchive(raw);
    const existing = readIdempotentReceipt(normalized.idempotencyKey, normalized);
    if (existing) return existing;
    const current = getVersion(normalized.workVersionId);
    assertExpectedRevision(current.identity, normalized.expectedRevision);
    if (current.identity.status === "archived") throw new Error("WorkVersion is already archived.");
    return commitMutation({
      action: "archive",
      input: normalized,
      workVersionId: current.identity.workVersionId,
      kind: current.identity.kind,
      displayName: current.identity.displayName,
      parent: parentSeed(current.identity),
      previous: current,
      status: "archived",
      ownerSnapshotRefs: current.manifest.ownerSnapshotRefs,
      optionalNuwaProvenanceRefs: current.manifest.optionalNuwaProvenanceRefs,
      semanticDeltaRefs: ["lifecycle.archive"]
    });
  }

  function commitMutation(input: {
    action: WorkVersionActionReceipt["action"];
    input: Record<string, unknown> & BaseMutationInput;
    workVersionId: string;
    kind: WorkVersionKind;
    displayName: string;
    parent: { workVersionId: string; revision: number; manifestId: string; manifestDigest: string } | null;
    previous: WorkVersionMutationResult | null;
    status: WorkVersionStatus;
    ownerSnapshotRefs: OwnerSnapshotRef[];
    optionalNuwaProvenanceRefs: NuwaProvenanceRef[];
    semanticDeltaRefs: string[];
  }): WorkVersionMutationResult {
    const revisionNumber = input.previous ? input.previous.identity.currentRevision + 1 : 1;
    const manifest = createManifest({
      workVersionId: input.workVersionId,
      revision: revisionNumber,
      createdAt: input.input.createdAt,
      authorActionId: input.input.authorActionId,
      ownerSnapshotRefs: input.ownerSnapshotRefs,
      optionalNuwaProvenanceRefs: input.optionalNuwaProvenanceRefs,
      previousManifestDigest: input.previous?.manifest.canonicalDigest ?? null
    });
    const revision = createRevision({
      workVersionId: input.workVersionId,
      revision: revisionNumber,
      previousRevisionDigest: input.previous?.revision.revisionDigest ?? null,
      manifestId: manifest.manifestId,
      semanticDeltaRefs: input.semanticDeltaRefs,
      authorActionId: input.input.authorActionId,
      idempotencyKey: input.input.idempotencyKey,
      createdAt: input.input.createdAt
    });
    const identity = createIdentity({
      workVersionId: input.workVersionId,
      kind: input.kind,
      displayName: input.displayName,
      parent: input.parent,
      createdByAuthorActionId: input.previous?.identity.createdByAuthorActionId ?? input.input.authorActionId,
      createdAt: input.previous?.identity.createdAt ?? input.input.createdAt,
      status: input.status,
      currentRevision: revisionNumber,
      headManifestId: manifest.manifestId
    });
    const receipt = createReceipt({
      action: input.action,
      authorActionId: input.input.authorActionId,
      idempotencyKey: input.input.idempotencyKey,
      payloadDigest: hash(canonical(input.input)),
      createdAt: input.input.createdAt,
      result: { identity, manifest, revision }
    });

    publishImmutableJson(paths.manifestPath(manifest.manifestId), manifest, "Manifest");
    publishImmutableJson(paths.revisionPath(input.workVersionId, revisionNumber), revision, "Revision");
    publishImmutableJson(paths.receiptPath(input.input.idempotencyKey), receipt, "Receipt");
    return clone({ identity, manifest, revision, receipt });
  }

  function getVersion(workVersionId: string): WorkVersionMutationResult {
    const id = requireWorkVersionId(workVersionId);
    const receipts = receiptsForVersion(id).sort(byRevision);
    if (receipts.length === 0) throw new Error("WorkVersion does not exist.");
    verifyReceiptChain(receipts);
    return mutationResult(receipts.at(-1)!);
  }

  function listVersions(): WorkVersionMutationResult[] {
    const grouped = new Map<string, WorkVersionActionReceipt[]>();
    for (const receipt of readAllReceipts()) {
      const id = receipt.result.identity.workVersionId;
      grouped.set(id, [...(grouped.get(id) ?? []), receipt]);
    }
    return [...grouped.values()]
      .map((receipts) => {
        verifyReceiptChain(receipts);
        return mutationResult(receipts.sort(byRevision).at(-1)!);
      })
      .sort((left, right) => left.identity.createdAt.localeCompare(right.identity.createdAt) || left.identity.workVersionId.localeCompare(right.identity.workVersionId));
  }

  function getSnapshotManifest(manifestId: string): WorkVersionSnapshotManifest {
    const id = requireManifestId(manifestId);
    const manifestPath = paths.manifestPath(id);
    if (!existsSync(manifestPath)) throw new Error("Committed WorkVersion manifest is missing.");
    return readAndValidateManifest(manifestPath, id);
  }

  function verifyVersionIntegrity(workVersionId: string) {
    const id = requireWorkVersionId(workVersionId);
    const receipts = receiptsForVersion(id);
    if (receipts.length === 0) throw new Error("WorkVersion does not exist.");
    verifyReceiptChain(receipts);
    const latest = receipts.sort(byRevision).at(-1)!;
    verifyPinnedParent(latest.result.identity);
    return clone({
      integrity: "verified" as const,
      workVersionId: id,
      revisionCount: receipts.length,
      currentRevision: latest.result.identity.currentRevision,
      headManifestId: latest.result.identity.headManifestId,
      integrityDigest: latest.result.identity.integrityDigest
    });
  }

  function projectVersionStaleness(workVersionId: string): WorkVersionStaleness {
    const current = getVersion(workVersionId);
    if (current.identity.kind === "root") {
      return { state: "current", parentVersionId: null, pinnedRevision: null, currentParentRevision: null, pinnedManifestId: null, currentParentManifestId: null };
    }
    const parentVersionId = current.identity.parentVersionId!;
    const pinnedRevision = current.identity.parentBaseRevision!;
    const pinnedManifestId = current.identity.parentManifestId!;
    try {
      const pinnedManifest = getSnapshotManifest(pinnedManifestId);
      if (pinnedManifest.canonicalDigest !== current.identity.parentManifestDigest) throw new Error("Pinned parent manifest digest mismatch.");
      const parent = getVersion(parentVersionId);
      if (parent.identity.currentRevision !== pinnedRevision || parent.identity.headManifestId !== pinnedManifestId) {
        return { state: "stale", parentVersionId, pinnedRevision, currentParentRevision: parent.identity.currentRevision, pinnedManifestId, currentParentManifestId: parent.identity.headManifestId };
      }
      return { state: "current", parentVersionId, pinnedRevision, currentParentRevision: parent.identity.currentRevision, pinnedManifestId, currentParentManifestId: parent.identity.headManifestId };
    } catch {
      return { state: "blocked_missing_reference", parentVersionId, pinnedRevision, currentParentRevision: null, pinnedManifestId, currentParentManifestId: null };
    }
  }

  function recoverVersionAuthority() {
    const versions = listVersions();
    for (const version of versions) verifyPinnedParent(version.identity);
    const referencedManifests = new Set(versions.flatMap((version) => receiptsForVersion(version.identity.workVersionId).map((receipt) => receipt.result.manifest.manifestId)));
    const referencedRevisions = new Set(versions.flatMap((version) => receiptsForVersion(version.identity.workVersionId).map((receipt) => revisionObjectKey(receipt.result.revision))));
    const storedManifestIds = listJsonFiles(path.join(authorityRoot, "manifests")).map((file) => readAndValidateManifest(file).manifestId);
    const storedRevisionKeys = listJsonFiles(path.join(authorityRoot, "revisions"), true).map((file) => {
      const revision = readAndValidateRevision(file);
      return revisionObjectKey(revision);
    });
    return clone({
      schemaVersion: "story-work-version-recovery/v1",
      projectId,
      authorityRoot: AUTHORITY_RELATIVE_ROOT,
      versionCount: versions.length,
      receiptCount: readAllReceipts().length,
      orphanManifestCount: storedManifestIds.filter((id) => !referencedManifests.has(id)).length,
      orphanRevisionCount: storedRevisionKeys.filter((key) => !referencedRevisions.has(key)).length,
      integrity: "verified" as const,
      versions: versions.map((version) => version.identity)
    });
  }

  function verifyReceiptChain(receipts: WorkVersionActionReceipt[]) {
    const ordered = [...receipts].sort(byRevision);
    let previous: WorkVersionActionReceipt | null = null;
    for (const receipt of ordered) {
      const { identity, manifest, revision } = receipt.result;
      const expectedRevision = previous ? previous.result.revision.revision + 1 : 1;
      if (revision.revision !== expectedRevision || identity.currentRevision !== expectedRevision) throw new Error("WorkVersion revision chain is broken.");
      if (revision.expectedPreviousRevision !== expectedRevision - 1) throw new Error("WorkVersion expected revision chain is broken.");
      if (revision.previousRevisionDigest !== (previous?.result.revision.revisionDigest ?? null)) throw new Error("WorkVersion previous revision digest is broken.");
      if (manifest.previousManifestDigest !== (previous?.result.manifest.canonicalDigest ?? null)) throw new Error("WorkVersion previous manifest digest is broken.");
      if (manifest.versionRevision !== revision.revision || manifest.manifestId !== revision.manifestId) throw new Error("WorkVersion manifest and revision identity mismatch.");
      if (identity.headManifestId !== manifest.manifestId) throw new Error("WorkVersion head manifest mismatch.");
      if (previous) assertStableIdentity(previous.result.identity, identity);

      const storedManifest = getSnapshotManifest(manifest.manifestId);
      if (canonical(storedManifest) !== canonical(manifest)) throw new Error("Committed WorkVersion manifest receipt mismatch.");
      const revisionPath = paths.revisionPath(identity.workVersionId, revision.revision);
      if (!existsSync(revisionPath)) throw new Error("Committed WorkVersion revision is missing.");
      const storedRevision = readAndValidateRevision(revisionPath);
      if (canonical(storedRevision) !== canonical(revision)) throw new Error("Committed WorkVersion revision receipt mismatch.");
      validateIdentity(identity);
      previous = receipt;
    }
  }

  function verifyPinnedParent(identity: WorkVersionIdentity) {
    if (identity.kind === "root") return;
    const pinnedManifest = getSnapshotManifest(identity.parentManifestId!);
    if (pinnedManifest.canonicalDigest !== identity.parentManifestDigest) throw new Error("Pinned parent manifest digest mismatch.");
    const parentReceipts = receiptsForVersion(identity.parentVersionId!);
    if (parentReceipts.length === 0) throw new Error("Pinned parent WorkVersion reference is missing.");
    verifyReceiptChain(parentReceipts);
    const parentAtBase = parentReceipts.find((receipt) => receipt.result.revision.revision === identity.parentBaseRevision);
    if (!parentAtBase || parentAtBase.result.identity.kind !== "root" || parentAtBase.result.manifest.manifestId !== identity.parentManifestId || parentAtBase.result.manifest.canonicalDigest !== identity.parentManifestDigest) {
      throw new Error("Pinned parent WorkVersion reference is inconsistent.");
    }
  }

  function receiptsForVersion(workVersionId: string) {
    return readAllReceipts().filter((receipt) => receipt.result.identity.workVersionId === workVersionId);
  }

  function readAllReceipts(): WorkVersionActionReceipt[] {
    return listJsonFiles(path.join(authorityRoot, "receipts")).map(readAndValidateReceipt);
  }

  function readIdempotentReceipt(idempotencyKey: string, normalizedInput: Record<string, unknown>): WorkVersionMutationResult | null {
    const target = paths.receiptPath(idempotencyKey);
    if (!existsSync(target)) return null;
    const receipt = readAndValidateReceipt(target);
    const payloadDigest = hash(canonical(normalizedInput));
    if (receipt.idempotencyKey !== idempotencyKey || receipt.payloadDigest !== payloadDigest) {
      throw new Error("Idempotency key was already used with a different payload.");
    }
    verifyReceiptChain(receiptsForVersion(receipt.result.identity.workVersionId));
    return mutationResult(receipt);
  }

  return Object.freeze({
    createRootCheckpoint,
    createDerivedVersion,
    appendRevision,
    archiveVersion,
    getVersion,
    listVersions,
    getSnapshotManifest,
    verifyVersionIntegrity,
    projectVersionStaleness,
    recoverVersionAuthority,
    persistencePaths: () => ({ ...paths })
  });

  function createWorkVersionId(kind: WorkVersionKind, authorActionId: string) {
    return `work-version.${kind}.${hash(`${projectId}:${kind}:${authorActionId}`).slice(0, 32)}`;
  }

  function createManifest(input: {
    workVersionId: string;
    revision: number;
    createdAt: string;
    authorActionId: string;
    ownerSnapshotRefs: OwnerSnapshotRef[];
    optionalNuwaProvenanceRefs: NuwaProvenanceRef[];
    previousManifestDigest: string | null;
  }): WorkVersionSnapshotManifest {
    const body = {
      schemaVersion: WORK_VERSION_MANIFEST_SCHEMA,
      projectId,
      workVersionId: requireWorkVersionId(input.workVersionId),
      versionRevision: requirePositiveInteger(input.revision, "Manifest revision"),
      createdAt: requireTimestamp(input.createdAt),
      createdByAuthorActionId: requireText(input.authorActionId, "Author action", 180),
      ownerSnapshotRefs: normalizeOwnerSnapshotRefs(input.ownerSnapshotRefs),
      optionalNuwaProvenanceRefs: normalizeNuwaRefs(input.optionalNuwaProvenanceRefs),
      completeness: "complete" as const,
      previousManifestDigest: input.previousManifestDigest == null ? null : requireDigest(input.previousManifestDigest, "Previous manifest digest")
    };
    const canonicalDigest = hash(canonical(body));
    return { ...body, manifestId: `work-version-manifest.${canonicalDigest.slice(0, 40)}`, canonicalDigest };
  }

  function createRevision(input: {
    workVersionId: string;
    revision: number;
    previousRevisionDigest: string | null;
    manifestId: string;
    semanticDeltaRefs: string[];
    authorActionId: string;
    idempotencyKey: string;
    createdAt: string;
  }): WorkVersionRevision {
    const revision = requirePositiveInteger(input.revision, "Revision");
    const body = {
      schemaVersion: WORK_VERSION_REVISION_SCHEMA,
      workVersionId: requireWorkVersionId(input.workVersionId),
      revision,
      expectedPreviousRevision: revision - 1,
      previousRevisionDigest: input.previousRevisionDigest == null ? null : requireDigest(input.previousRevisionDigest, "Previous revision digest"),
      manifestId: requireManifestId(input.manifestId),
      semanticDeltaRefs: normalizeTextArray(input.semanticDeltaRefs, "Semantic delta reference", 180),
      authorActionId: requireText(input.authorActionId, "Author action", 180),
      idempotencyKey: requireText(input.idempotencyKey, "Idempotency key", 180),
      createdAt: requireTimestamp(input.createdAt)
    };
    return { ...body, revisionDigest: hash(canonical(body)) };
  }

  function createIdentity(input: {
    workVersionId: string;
    kind: WorkVersionKind;
    displayName: string;
    parent: { workVersionId: string; revision: number; manifestId: string; manifestDigest: string } | null;
    createdByAuthorActionId: string;
    createdAt: string;
    status: WorkVersionStatus;
    currentRevision: number;
    headManifestId: string;
  }): WorkVersionIdentity {
    const body = {
      schemaVersion: WORK_VERSION_IDENTITY_SCHEMA,
      workVersionId: requireWorkVersionId(input.workVersionId),
      projectId,
      kind: input.kind,
      displayName: requireText(input.displayName, "Version display name", 120),
      parentVersionId: input.parent?.workVersionId ?? null,
      parentBaseRevision: input.parent?.revision ?? null,
      parentManifestId: input.parent?.manifestId ?? null,
      parentManifestDigest: input.parent?.manifestDigest ?? null,
      lineageDepth: (input.parent ? 1 : 0) as 0 | 1,
      status: input.status,
      createdByAuthorActionId: requireText(input.createdByAuthorActionId, "Creation author action", 180),
      createdAt: requireTimestamp(input.createdAt),
      currentRevision: requirePositiveInteger(input.currentRevision, "Current revision"),
      headManifestId: requireManifestId(input.headManifestId)
    };
    return { ...body, integrityDigest: hash(canonical(body)) };
  }

  function createReceipt(input: Omit<WorkVersionActionReceipt, "schemaVersion" | "receiptId" | "receiptDigest" | "projectId">): WorkVersionActionReceipt {
    const body = {
      schemaVersion: WORK_VERSION_RECEIPT_SCHEMA,
      receiptId: `work-version-receipt.${hash(`${projectId}:${input.idempotencyKey}`).slice(0, 40)}`,
      action: input.action,
      projectId,
      authorActionId: input.authorActionId,
      idempotencyKey: input.idempotencyKey,
      payloadDigest: input.payloadDigest,
      createdAt: input.createdAt,
      result: input.result
    };
    return { ...body, receiptDigest: hash(canonical(body)) };
  }

  function publishImmutableJson(target: string, value: unknown, label: string) {
    const bytes = `${canonical(value)}\n`;
    const publication = publishFileNoReplace({ rootPath: projectRoot, targetPath: target, content: bytes });
    if (publication === "exists") {
      assertRegularFile(target, label);
      if (readFileSync(target, "utf8") !== bytes) throw new Error(`${label} immutable publication conflict.`);
    }
  }

  function readAndValidateReceipt(target: string): WorkVersionActionReceipt {
    const value = readJson(target, "WorkVersion receipt") as WorkVersionActionReceipt;
    assertExactKeys(value, ["schemaVersion", "receiptId", "action", "projectId", "authorActionId", "idempotencyKey", "payloadDigest", "createdAt", "result", "receiptDigest"], "Receipt");
    if (value.schemaVersion !== WORK_VERSION_RECEIPT_SCHEMA) throw new Error("Unknown WorkVersion receipt schema.");
    if (value.projectId !== projectId) throw new Error("WorkVersion receipt Project mismatch.");
    if (!["create-root", "create-derived", "append-revision", "archive"].includes(value.action)) throw new Error("WorkVersion receipt action is invalid.");
    requireText(value.receiptId, "Receipt identity", 100);
    requireText(value.authorActionId, "Receipt author action", 180);
    requireText(value.idempotencyKey, "Receipt idempotency key", 180);
    requireDigest(value.payloadDigest, "Receipt payload digest");
    requireTimestamp(value.createdAt);
    requireDigest(value.receiptDigest, "Receipt digest");
    if (!value.result || typeof value.result !== "object" || Array.isArray(value.result)) throw new Error("WorkVersion receipt result is invalid.");
    assertExactKeys(value.result, ["identity", "manifest", "revision"], "Receipt result");
    validateIdentity(value.result.identity);
    validateManifest(value.result.manifest);
    validateRevision(value.result.revision);
    const { receiptDigest: _digest, ...body } = value;
    if (hash(canonical(body)) !== value.receiptDigest) throw new Error("WorkVersion receipt integrity digest mismatch.");
    return clone(value);
  }

  function readAndValidateManifest(target: string, expectedId?: string): WorkVersionSnapshotManifest {
    const value = readJson(target, "WorkVersion manifest") as WorkVersionSnapshotManifest;
    validateManifest(value);
    if (expectedId && value.manifestId !== expectedId) throw new Error("WorkVersion manifest identity mismatch.");
    return clone(value);
  }

  function validateManifest(value: WorkVersionSnapshotManifest) {
    assertExactKeys(value, ["schemaVersion", "manifestId", "projectId", "workVersionId", "versionRevision", "createdAt", "createdByAuthorActionId", "ownerSnapshotRefs", "optionalNuwaProvenanceRefs", "completeness", "canonicalDigest", "previousManifestDigest"], "Manifest");
    if (value.schemaVersion !== WORK_VERSION_MANIFEST_SCHEMA) throw new Error("Unknown WorkVersion manifest schema.");
    if (value.projectId !== projectId) throw new Error("WorkVersion manifest Project mismatch.");
    requireManifestId(value.manifestId);
    requireWorkVersionId(value.workVersionId);
    requirePositiveInteger(value.versionRevision, "Manifest revision");
    requireTimestamp(value.createdAt);
    requireText(value.createdByAuthorActionId, "Manifest author action", 180);
    normalizeOwnerSnapshotRefs(value.ownerSnapshotRefs);
    normalizeNuwaRefs(value.optionalNuwaProvenanceRefs);
    if (value.completeness !== "complete") throw new Error("WorkVersion manifest is not complete.");
    requireDigest(value.canonicalDigest, "Manifest digest");
    if (value.previousManifestDigest != null) requireDigest(value.previousManifestDigest, "Previous manifest digest");
    const { manifestId: _id, canonicalDigest: _digest, ...body } = value;
    const expectedDigest = hash(canonical(body));
    if (expectedDigest !== value.canonicalDigest || value.manifestId !== `work-version-manifest.${expectedDigest.slice(0, 40)}`) {
      throw new Error("WorkVersion manifest integrity digest mismatch.");
    }
  }

  function readAndValidateRevision(target: string): WorkVersionRevision {
    const value = readJson(target, "WorkVersion revision") as WorkVersionRevision;
    validateRevision(value);
    return clone(value);
  }

  function validateRevision(value: WorkVersionRevision) {
    assertExactKeys(value, ["schemaVersion", "workVersionId", "revision", "expectedPreviousRevision", "previousRevisionDigest", "manifestId", "semanticDeltaRefs", "authorActionId", "idempotencyKey", "createdAt", "revisionDigest"], "Revision");
    if (value.schemaVersion !== WORK_VERSION_REVISION_SCHEMA) throw new Error("Unknown WorkVersion revision schema.");
    requireWorkVersionId(value.workVersionId);
    requirePositiveInteger(value.revision, "Revision");
    requireNonNegativeInteger(value.expectedPreviousRevision, "Expected previous revision");
    if (value.expectedPreviousRevision !== value.revision - 1) throw new Error("WorkVersion revision predecessor mismatch.");
    if (value.previousRevisionDigest != null) requireDigest(value.previousRevisionDigest, "Previous revision digest");
    requireManifestId(value.manifestId);
    normalizeTextArray(value.semanticDeltaRefs, "Semantic delta reference", 180);
    requireText(value.authorActionId, "Revision author action", 180);
    requireText(value.idempotencyKey, "Revision idempotency key", 180);
    requireTimestamp(value.createdAt);
    requireDigest(value.revisionDigest, "Revision digest");
    const { revisionDigest: _digest, ...body } = value;
    if (hash(canonical(body)) !== value.revisionDigest) throw new Error("WorkVersion revision integrity digest mismatch.");
  }

  function validateIdentity(value: WorkVersionIdentity) {
    assertExactKeys(value, ["schemaVersion", "workVersionId", "projectId", "kind", "displayName", "parentVersionId", "parentBaseRevision", "parentManifestId", "parentManifestDigest", "lineageDepth", "status", "createdByAuthorActionId", "createdAt", "currentRevision", "headManifestId", "integrityDigest"], "Identity");
    if (value.schemaVersion !== WORK_VERSION_IDENTITY_SCHEMA) throw new Error("Unknown WorkVersion identity schema.");
    requireWorkVersionId(value.workVersionId);
    if (value.projectId !== projectId) throw new Error("WorkVersion identity Project mismatch.");
    if (value.kind !== "root" && value.kind !== "derived") throw new Error("WorkVersion kind is invalid.");
    requireText(value.displayName, "Version display name", 120);
    if (value.kind === "root") {
      if (value.parentVersionId != null || value.parentBaseRevision != null || value.parentManifestId != null || value.parentManifestDigest != null || value.lineageDepth !== 0) throw new Error("Root WorkVersion cannot have a parent.");
    } else {
      requireWorkVersionId(value.parentVersionId);
      requirePositiveInteger(value.parentBaseRevision, "Parent base revision");
      requireManifestId(value.parentManifestId);
      requireDigest(value.parentManifestDigest, "Parent manifest digest");
      if (value.lineageDepth !== 1) throw new Error("Derived WorkVersion lineage depth is invalid.");
    }
    if (value.status !== "active" && value.status !== "archived") throw new Error("WorkVersion status is invalid.");
    requireText(value.createdByAuthorActionId, "Creation author action", 180);
    requireTimestamp(value.createdAt);
    requirePositiveInteger(value.currentRevision, "Current revision");
    requireManifestId(value.headManifestId);
    requireDigest(value.integrityDigest, "Identity digest");
    const { integrityDigest: _digest, ...body } = value;
    if (hash(canonical(body)) !== value.integrityDigest) throw new Error("WorkVersion identity integrity digest mismatch.");
  }

  function normalizeCreateRoot(raw: CreateRootCheckpointInput) {
    assertExactKeys(raw, ["displayName", "authorActionId", "idempotencyKey", "expectedRevision", "createdAt", "ownerSnapshotRefs", "optionalNuwaProvenanceRefs"], "Root creation input");
    return {
      displayName: requireText(raw.displayName, "Version display name", 120),
      ...normalizeBaseMutation(raw),
      ownerSnapshotRefs: normalizeOwnerSnapshotRefs(raw.ownerSnapshotRefs),
      optionalNuwaProvenanceRefs: normalizeNuwaRefs(raw.optionalNuwaProvenanceRefs)
    };
  }

  function normalizeCreateDerived(raw: CreateDerivedVersionInput) {
    assertExactKeys(raw, ["displayName", "parentVersionId", "parentBaseRevision", "parentManifestId", "authorActionId", "idempotencyKey", "expectedRevision", "createdAt", "ownerSnapshotRefs", "optionalNuwaProvenanceRefs"], "Derived creation input");
    return {
      displayName: requireText(raw.displayName, "Version display name", 120),
      parentVersionId: requireWorkVersionId(raw.parentVersionId),
      parentBaseRevision: requirePositiveInteger(raw.parentBaseRevision, "Parent base revision"),
      parentManifestId: requireManifestId(raw.parentManifestId),
      ...normalizeBaseMutation(raw),
      ownerSnapshotRefs: normalizeOwnerSnapshotRefs(raw.ownerSnapshotRefs),
      optionalNuwaProvenanceRefs: normalizeNuwaRefs(raw.optionalNuwaProvenanceRefs)
    };
  }

  function normalizeAppend(raw: AppendRevisionInput) {
    assertExactKeys(raw, ["workVersionId", "authorActionId", "idempotencyKey", "expectedRevision", "createdAt", "ownerSnapshotRefs", "optionalNuwaProvenanceRefs", "semanticDeltaRefs"], "Append revision input", ["optionalNuwaProvenanceRefs"]);
    return {
      workVersionId: requireWorkVersionId(raw.workVersionId),
      ...normalizeBaseMutation(raw),
      ownerSnapshotRefs: normalizeOwnerSnapshotRefs(raw.ownerSnapshotRefs),
      optionalNuwaProvenanceRefs: normalizeNuwaRefs(raw.optionalNuwaProvenanceRefs ?? []),
      semanticDeltaRefs: normalizeTextArray(raw.semanticDeltaRefs, "Semantic delta reference", 180)
    };
  }

  function normalizeArchive(raw: ArchiveVersionInput) {
    assertExactKeys(raw, ["workVersionId", "authorActionId", "idempotencyKey", "expectedRevision", "createdAt"], "Archive input");
    return { workVersionId: requireWorkVersionId(raw.workVersionId), ...normalizeBaseMutation(raw) };
  }

  function normalizeBaseMutation(raw: BaseMutationInput) {
    return {
      authorActionId: requireText(raw.authorActionId, "Author action", 180),
      idempotencyKey: requireText(raw.idempotencyKey, "Idempotency key", 180),
      expectedRevision: requireNonNegativeInteger(raw.expectedRevision, "Expected revision"),
      createdAt: requireTimestamp(raw.createdAt)
    };
  }

  function normalizeOwnerSnapshotRefs(raw: OwnerSnapshotRef[]): OwnerSnapshotRef[] {
    if (!Array.isArray(raw) || raw.length !== WORK_VERSION_REQUIRED_OWNER_KINDS.length) throw new Error("WorkVersion snapshot must contain every required owner exactly once and be complete.");
    const refs = raw.map((value) => {
      assertExactKeys(value, ["ownerKind", "ownerIdentity", "projectionSchemaVersion", "revisionToken", "canonicalDigest", "stableReferenceIds", "provenanceReceiptIds", "completeness"], "Owner snapshot ref");
      if (!WORK_VERSION_REQUIRED_OWNER_KINDS.includes(value.ownerKind)) throw new Error("Owner snapshot kind is unsupported.");
      if (value.completeness !== "complete") throw new Error("Owner snapshot completeness must be complete.");
      return {
        ownerKind: value.ownerKind,
        ownerIdentity: requireText(value.ownerIdentity, "Owner identity", 180),
        projectionSchemaVersion: requireText(value.projectionSchemaVersion, "Projection schema version", 120),
        revisionToken: requireText(value.revisionToken, "Owner revision token", 180),
        canonicalDigest: requireDigest(value.canonicalDigest, "Owner canonical digest"),
        stableReferenceIds: normalizeTextArray(value.stableReferenceIds, "Stable reference", 240, true),
        provenanceReceiptIds: normalizeTextArray(value.provenanceReceiptIds, "Provenance receipt", 240),
        completeness: "complete" as const
      };
    });
    const kinds = new Set(refs.map((ref) => ref.ownerKind));
    if (kinds.size !== WORK_VERSION_REQUIRED_OWNER_KINDS.length || WORK_VERSION_REQUIRED_OWNER_KINDS.some((kind) => !kinds.has(kind))) {
      throw new Error("WorkVersion snapshot owner kinds are incomplete or duplicated.");
    }
    return refs.sort((left, right) => WORK_VERSION_REQUIRED_OWNER_KINDS.indexOf(left.ownerKind) - WORK_VERSION_REQUIRED_OWNER_KINDS.indexOf(right.ownerKind));
  }

  function normalizeNuwaRefs(raw: NuwaProvenanceRef[]) {
    if (!Array.isArray(raw) || raw.length > 64) throw new Error("Nuwa provenance references are invalid.");
    return raw.map((value) => {
      assertExactKeys(value, ["runId", "branchId", "stepId", "receiptId", "canonicalDigest"], "Nuwa provenance ref");
      return {
        runId: requireText(value.runId, "Nuwa Run reference", 180),
        branchId: requireText(value.branchId, "Nuwa Branch reference", 180),
        stepId: requireText(value.stepId, "Nuwa Step reference", 180),
        receiptId: requireText(value.receiptId, "Nuwa receipt reference", 180),
        canonicalDigest: requireDigest(value.canonicalDigest, "Nuwa provenance digest")
      };
    }).sort((left, right) => canonical(left).localeCompare(canonical(right)));
  }

  function readJson(target: string, label: string): unknown {
    assertRegularFile(target, label);
    try {
      const source = readFileSync(target, "utf8");
      const value = JSON.parse(source);
      if (source !== `${canonical(value)}\n`) throw new Error(`${label} bytes are not canonical.`);
      return value;
    } catch {
      throw new Error(`${label} is corrupt JSON.`);
    }
  }

  function listJsonFiles(directory: string, recursive = false): string[] {
    if (!existsSync(directory)) return [];
    assertDirectory(directory, "WorkVersion store");
    const files: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("WorkVersion store cannot contain symbolic links.");
      if (entry.isDirectory()) {
        if (recursive) files.push(...listJsonFiles(target, true));
      } else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target);
    }
    return files.sort();
  }
}

function parentSeed(identity: WorkVersionIdentity) {
  return identity.kind === "derived" ? {
    workVersionId: identity.parentVersionId!,
    revision: identity.parentBaseRevision!,
    manifestId: identity.parentManifestId!,
    manifestDigest: identity.parentManifestDigest!
  } : null;
}

function mutationResult(receipt: WorkVersionActionReceipt): WorkVersionMutationResult {
  return clone({ ...receipt.result, receipt });
}

function byRevision(left: WorkVersionActionReceipt, right: WorkVersionActionReceipt) {
  return left.result.revision.revision - right.result.revision.revision;
}

function revisionObjectKey(revision: WorkVersionRevision) {
  return `${revision.workVersionId}:${revision.revision}:${revision.revisionDigest}`;
}

function assertExpectedRevision(identity: WorkVersionIdentity, expectedRevision: number) {
  if (identity.currentRevision !== expectedRevision) throw new Error(`WorkVersion revision conflict: expected ${expectedRevision}, current ${identity.currentRevision}.`);
}

function assertStableIdentity(previous: WorkVersionIdentity, current: WorkVersionIdentity) {
  const stableKeys: (keyof WorkVersionIdentity)[] = ["workVersionId", "projectId", "kind", "displayName", "parentVersionId", "parentBaseRevision", "parentManifestId", "parentManifestDigest", "lineageDepth", "createdByAuthorActionId", "createdAt"];
  for (const key of stableKeys) if (previous[key] !== current[key]) throw new Error(`WorkVersion stable identity changed at ${key}.`);
  if (previous.status === "archived" && current.status !== "archived") throw new Error("Archived WorkVersion cannot become active implicitly.");
}

function assertExactKeys(value: unknown, allowed: string[], label: string, optional: string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const keys = Object.keys(value as object);
  const unknown = keys.filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !optional.includes(key) && !keys.includes(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown field: ${unknown.join(", ")}.`);
  if (missing.length > 0) throw new Error(`${label} is missing field: ${missing.join(", ")}.`);
}

function normalizeTextArray(value: unknown, label: string, maxLength: number, requireOne = false) {
  if (!Array.isArray(value) || value.length > 512 || (requireOne && value.length === 0)) throw new Error(`${label} list is invalid.`);
  const result = value.map((item) => requireText(item, label, maxLength));
  return [...new Set(result)].sort();
}

function requireText(value: unknown, label: string, maxLength: number): string {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireTimestamp(value: unknown): string {
  const text = requireText(value, "Timestamp", 64);
  if (!TIMESTAMP_PATTERN.test(text) || Number.isNaN(Date.parse(text))) throw new Error("Timestamp is invalid.");
  return text;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer.`);
  return Number(value);
}

function requireDigest(value: unknown, label: string): string {
  const text = String(value ?? "");
  if (!HASH_PATTERN.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireWorkVersionId(value: unknown): string {
  const text = requireText(value, "WorkVersion identity", 100);
  if (!/^work-version\.(?:root|derived)\.[a-f0-9]{32}$/u.test(text)) throw new Error("WorkVersion identity is invalid.");
  return text;
}

function requireManifestId(value: unknown): string {
  const text = requireText(value, "Manifest identity", 100);
  if (!/^work-version-manifest\.[a-f0-9]{40}$/u.test(text)) throw new Error("Manifest identity is invalid.");
  return text;
}

function safeObjectName(value: string): string {
  return hash(value);
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(value: unknown): string {
  return JSON.stringify(sortCanonical(value));
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortCanonical(item)]));
  }
  return value;
}

function assertRegularFile(target: string, label: string) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !statSync(target).isFile()) throw new Error(`${label} is missing or invalid.`);
}

function assertDirectory(target: string, label: string) {
  if (!existsSync(target) || lstatSync(target).isSymbolicLink() || !statSync(target).isDirectory()) throw new Error(`${label} is invalid.`);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
