import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createStoryWorkspace, createWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import {
  WORK_VERSION_REQUIRED_OWNER_KINDS,
  createStoryStudioWorkVersionAuthority,
  type OwnerSnapshotRef
} from "../../src/storyWorkspace/workVersionAuthority.ts";
import {
  resolveWorkVersionOwnerSnapshotRefs,
  type WorkVersionOwnerProjectionBundle
} from "../../src/storyWorkspace/workVersionSnapshotResolver.ts";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function fixtureWorkspace(label: string) {
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), `tianyan-work-version-${label}-`));
  const workspace = createStoryWorkspace({ rootPath: projectRoot, title: `潮痕来信 ${label}` });
  createWorkspaceNote(projectRoot, { id: "story-unit.tide-letter", type: "story-unit", title: "潮痕来信", body: "# 潮痕来信\n" });
  createWorkspaceNote(projectRoot, { id: "event.tide-letter", type: "event", title: "雾港来信", status: "committed", body: "# 雾港来信\n" });
  createWorkspaceNote(projectRoot, { id: "character.shen-yan", type: "character", title: "沈砚", status: "active", body: "# 沈砚\n" });
  return { projectRoot, projectId: workspace.project.id };
}

function completeOwnerRefs(seed: string): OwnerSnapshotRef[] {
  const bundle = Object.fromEntries(WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind, index) => [ownerKind, {
    ownerIdentity: `${ownerKind}.tide-letter`,
    projectionSchemaVersion: `${ownerKind}/fixture-v1`,
    revisionToken: `${seed}.revision.${index + 1}`,
    stableReferenceIds: [`${ownerKind}.ref.tide-letter`],
    provenanceReceiptIds: [`receipt.${ownerKind}.${seed}`],
    canonicalProjection: { fixture: "tide-letter-read-only", ownerKind, seed, stableFacts: [`${ownerKind}.ref.tide-letter`] }
  }])) as WorkVersionOwnerProjectionBundle;
  return resolveWorkVersionOwnerSnapshotRefs(bundle);
}

function createRoot(projectRoot: string, seed = "r1") {
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot });
  return authority.createRootCheckpoint({
    displayName: "原始主线检查点",
    authorActionId: `author.root.${seed}`,
    idempotencyKey: `idempotency.root.${seed}`,
    expectedRevision: 0,
    createdAt: "2026-08-24T01:00:00.000Z",
    ownerSnapshotRefs: completeOwnerRefs(seed),
    optionalNuwaProvenanceRefs: []
  });
}

test("creates one root and one single-parent derived identity idempotently", () => {
  const { projectRoot, projectId } = fixtureWorkspace("identity");
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot });
  const root = createRoot(projectRoot);
  const duplicate = createRoot(projectRoot);
  const derived = authority.createDerivedVersion({
    displayName: "灯塔 IF 线",
    parentVersionId: root.identity.workVersionId,
    parentBaseRevision: 1,
    parentManifestId: root.identity.headManifestId,
    authorActionId: "author.derived.1",
    idempotencyKey: "idempotency.derived.1",
    expectedRevision: 0,
    createdAt: "2026-08-24T01:05:00.000Z",
    ownerSnapshotRefs: completeOwnerRefs("derived-r1"),
    optionalNuwaProvenanceRefs: [{ runId: "nuwa.tide-letter", branchId: "branch.temp.1", stepId: "step.4", receiptId: "receipt.nuwa.4", canonicalDigest: digest("nuwa-step-4") }]
  });

  assert.deepEqual(duplicate, root);
  assert.equal(root.identity.projectId, projectId);
  assert.equal(root.identity.kind, "root");
  assert.equal(root.identity.currentRevision, 1);
  assert.equal(derived.identity.kind, "derived");
  assert.equal(derived.identity.parentVersionId, root.identity.workVersionId);
  assert.equal(derived.identity.parentBaseRevision, 1);
  assert.equal(derived.identity.parentManifestId, root.identity.headManifestId);
  assert.equal(derived.identity.lineageDepth, 1);
  assert.equal(authority.listVersions().length, 2);
});

test("rejects incomplete snapshots, key reuse with another payload, derived parents, and revision conflicts", () => {
  const { projectRoot } = fixtureWorkspace("guards");
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot });
  const refs = completeOwnerRefs("invalid");
  refs[3] = { ...refs[3], completeness: "missing" };
  assert.throws(() => authority.createRootCheckpoint({ displayName: "不完整", authorActionId: "author.bad", idempotencyKey: "idem.bad", expectedRevision: 0, createdAt: "2026-08-24T02:00:00.000Z", ownerSnapshotRefs: refs, optionalNuwaProvenanceRefs: [] }), /complete|snapshot/i);

  const root = createRoot(projectRoot, "guard-root");
  assert.throws(() => authority.createRootCheckpoint({ displayName: "另一个根", authorActionId: "author.other", idempotencyKey: "idem.other", expectedRevision: 0, createdAt: "2026-08-24T02:01:00.000Z", ownerSnapshotRefs: completeOwnerRefs("other"), optionalNuwaProvenanceRefs: [] }), /root.*already|one root/i);
  assert.throws(() => authority.appendRevision({ workVersionId: root.identity.workVersionId, expectedRevision: 0, authorActionId: "author.conflict", idempotencyKey: "idem.conflict", createdAt: "2026-08-24T02:02:00.000Z", ownerSnapshotRefs: completeOwnerRefs("conflict"), semanticDeltaRefs: [] }), /revision conflict/i);

  const derived = authority.createDerivedVersion({ displayName: "派生", parentVersionId: root.identity.workVersionId, parentBaseRevision: 1, parentManifestId: root.identity.headManifestId, authorActionId: "author.derived.guard", idempotencyKey: "idem.derived.guard", expectedRevision: 0, createdAt: "2026-08-24T02:03:00.000Z", ownerSnapshotRefs: completeOwnerRefs("derived-guard"), optionalNuwaProvenanceRefs: [] });
  assert.throws(() => authority.createDerivedVersion({ displayName: "二级派生", parentVersionId: derived.identity.workVersionId, parentBaseRevision: 1, parentManifestId: derived.identity.headManifestId, authorActionId: "author.depth2", idempotencyKey: "idem.depth2", expectedRevision: 0, createdAt: "2026-08-24T02:04:00.000Z", ownerSnapshotRefs: completeOwnerRefs("depth2"), optionalNuwaProvenanceRefs: [] }), /derived-from-derived|lineage depth/i);

  assert.throws(() => authority.createDerivedVersion({ displayName: "不同载荷", parentVersionId: root.identity.workVersionId, parentBaseRevision: 1, parentManifestId: root.identity.headManifestId, authorActionId: "author.changed", idempotencyKey: "idem.derived.guard", expectedRevision: 0, createdAt: "2026-08-24T02:05:00.000Z", ownerSnapshotRefs: completeOwnerRefs("changed"), optionalNuwaProvenanceRefs: [] }), /idempotency.*different payload/i);
});

test("appends immutable revisions, projects stale without sync, and archives explicitly", () => {
  const { projectRoot } = fixtureWorkspace("stale");
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot });
  const root = createRoot(projectRoot, "stale-root");
  const derived = authority.createDerivedVersion({ displayName: "静态派生", parentVersionId: root.identity.workVersionId, parentBaseRevision: 1, parentManifestId: root.identity.headManifestId, authorActionId: "author.stale.derived", idempotencyKey: "idem.stale.derived", expectedRevision: 0, createdAt: "2026-08-24T03:00:00.000Z", ownerSnapshotRefs: completeOwnerRefs("stale-derived"), optionalNuwaProvenanceRefs: [] });
  const manifestOnePath = authority.persistencePaths().manifestPath(root.identity.headManifestId);
  const manifestOneBytes = readFileSync(manifestOnePath, "utf8");

  const next = authority.appendRevision({ workVersionId: root.identity.workVersionId, expectedRevision: 1, authorActionId: "author.root.r2", idempotencyKey: "idem.root.r2", createdAt: "2026-08-24T03:05:00.000Z", ownerSnapshotRefs: completeOwnerRefs("stale-root-r2"), semanticDeltaRefs: ["delta.fixture.owner-projection-change"] });
  const repeated = authority.appendRevision({ workVersionId: root.identity.workVersionId, expectedRevision: 1, authorActionId: "author.root.r2", idempotencyKey: "idem.root.r2", createdAt: "2026-08-24T03:05:00.000Z", ownerSnapshotRefs: completeOwnerRefs("stale-root-r2"), semanticDeltaRefs: ["delta.fixture.owner-projection-change"] });

  assert.deepEqual(repeated, next);
  assert.equal(readFileSync(manifestOnePath, "utf8"), manifestOneBytes);
  assert.equal(authority.getVersion(root.identity.workVersionId).identity.currentRevision, 2);
  assert.equal(authority.getVersion(root.identity.workVersionId).identity.headManifestId, next.identity.headManifestId);
  assert.equal(authority.getVersion(derived.identity.workVersionId).identity.currentRevision, 1);
  assert.deepEqual(authority.projectVersionStaleness(derived.identity.workVersionId), { state: "stale", parentVersionId: root.identity.workVersionId, pinnedRevision: 1, currentParentRevision: 2, pinnedManifestId: root.identity.headManifestId, currentParentManifestId: next.identity.headManifestId });

  const archived = authority.archiveVersion({ workVersionId: derived.identity.workVersionId, expectedRevision: 1, authorActionId: "author.archive.derived", idempotencyKey: "idem.archive.derived", createdAt: "2026-08-24T03:10:00.000Z" });
  assert.equal(archived.identity.status, "archived");
  assert.equal(archived.identity.currentRevision, 2);
  assert.equal(authority.getVersion(derived.identity.workVersionId).identity.parentBaseRevision, 1);
});

test("fails closed for changed or missing committed manifests and broken chains", () => {
  const corruptFixture = fixtureWorkspace("corrupt");
  const corruptAuthority = createStoryStudioWorkVersionAuthority({ projectRoot: corruptFixture.projectRoot });
  const corruptRoot = createRoot(corruptFixture.projectRoot, "corrupt-root");
  const corruptManifestPath = corruptAuthority.persistencePaths().manifestPath(corruptRoot.identity.headManifestId);
  writeFileSync(corruptManifestPath, `${readFileSync(corruptManifestPath, "utf8")} `, "utf8");
  assert.throws(() => corruptAuthority.verifyVersionIntegrity(corruptRoot.identity.workVersionId), /integrity|digest|manifest/i);

  const missingFixture = fixtureWorkspace("missing");
  const missingAuthority = createStoryStudioWorkVersionAuthority({ projectRoot: missingFixture.projectRoot });
  const missingRoot = createRoot(missingFixture.projectRoot, "missing-root");
  unlinkSync(missingAuthority.persistencePaths().manifestPath(missingRoot.identity.headManifestId));
  assert.throws(() => missingAuthority.getVersion(missingRoot.identity.workVersionId), /missing.*manifest|manifest.*missing/i);

  const parentFixture = fixtureWorkspace("missing-parent");
  const parentAuthority = createStoryStudioWorkVersionAuthority({ projectRoot: parentFixture.projectRoot });
  const parentRoot = createRoot(parentFixture.projectRoot, "missing-parent-root");
  const parentDerived = parentAuthority.createDerivedVersion({ displayName: "缺失来源的派生", parentVersionId: parentRoot.identity.workVersionId, parentBaseRevision: 1, parentManifestId: parentRoot.identity.headManifestId, authorActionId: "author.missing-parent.derived", idempotencyKey: "idem.missing-parent.derived", expectedRevision: 0, createdAt: "2026-08-24T02:10:00.000Z", ownerSnapshotRefs: completeOwnerRefs("missing-parent-derived"), optionalNuwaProvenanceRefs: [] });
  unlinkSync(parentAuthority.persistencePaths().manifestPath(parentRoot.identity.headManifestId));
  assert.equal(parentAuthority.projectVersionStaleness(parentDerived.identity.workVersionId).state, "blocked_missing_reference");
  assert.throws(() => parentAuthority.verifyVersionIntegrity(parentDerived.identity.workVersionId), /missing|parent|manifest/i);
});

test("recovers identical identity in another process and writes only its project sub-aggregate", () => {
  const { projectRoot } = fixtureWorkspace("restart");
  const before = listProjectFiles(projectRoot);
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot });
  const root = createRoot(projectRoot, "restart-root");
  const after = listProjectFiles(projectRoot);
  const changedOutsideAuthority = [...after].filter((entry) => !before.has(entry) && !entry.startsWith(".world-os/work-versions/"));
  assert.deepEqual(changedOutsideAuthority, []);

  const childSource = [
    `import { createStoryStudioWorkVersionAuthority } from ${JSON.stringify(new URL("../../src/storyWorkspace/workVersionAuthority.ts", import.meta.url).href)};`,
    "const authority = createStoryStudioWorkVersionAuthority({ projectRoot: process.argv[1] });",
    "const recovered = authority.recoverVersionAuthority();",
    "const version = authority.getVersion(process.argv[2]);",
    "process.stdout.write(JSON.stringify({ recovered, identity: version.identity }));"
  ].join("\n");
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", childSource, projectRoot, root.identity.workVersionId], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  const recovered = JSON.parse(child.stdout);
  assert.equal(recovered.identity.integrityDigest, root.identity.integrityDigest);
  assert.equal(recovered.recovered.versionCount, 1);
  assert.equal(recovered.recovered.integrity, "verified");
});

test("strict manifests exclude raw bodies and no Nuwa or DerivedEventLine path auto-creates versions", () => {
  const { projectRoot } = fixtureWorkspace("exclusion");
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot });
  const refs = completeOwnerRefs("secret");
  const secretMarker = "sk-secret-provider-response-prompt-private-body";
  (refs[0] as OwnerSnapshotRef & { rawResponse?: string }).rawResponse = secretMarker;
  assert.throws(() => authority.createRootCheckpoint({ displayName: "含秘密", authorActionId: "author.secret", idempotencyKey: "idem.secret", expectedRevision: 0, createdAt: "2026-08-24T04:00:00.000Z", ownerSnapshotRefs: refs, optionalNuwaProvenanceRefs: [] }), /unknown.*field|snapshot.*field|raw/i);

  const nuwaSource = readFileSync(path.join(process.cwd(), "src/storyIntelligence/nuwaRunPack.ts"), "utf8");
  const boundedSource = readFileSync(path.join(process.cwd(), "src/storyIntelligence/nuwaBoundedScenarioRuntime.ts"), "utf8");
  const derivedSource = readFileSync(path.join(process.cwd(), "src/storyCreation/derivedEventLineR1.ts"), "utf8");
  for (const source of [nuwaSource, boundedSource, derivedSource]) {
    assert.doesNotMatch(source, /createStoryStudioWorkVersionAuthority|createRootCheckpoint|createDerivedVersion/);
  }
  assert.equal(existsSync(path.join(projectRoot, ".world-os", "work-versions")), false);
});

test("owner projection resolver is deterministic and rejects missing slices or sensitive bodies", () => {
  const first = completeOwnerRefs("deterministic");
  const second = completeOwnerRefs("deterministic");
  assert.deepEqual(second, first);
  assert.equal(first.length, 9);

  const missing = Object.fromEntries(WORK_VERSION_REQUIRED_OWNER_KINDS.slice(1).map((ownerKind) => [ownerKind, {
    ownerIdentity: `${ownerKind}.missing`, projectionSchemaVersion: "fixture/v1", revisionToken: "r1",
    stableReferenceIds: [`${ownerKind}.ref`], provenanceReceiptIds: [], canonicalProjection: { ownerKind }
  }])) as unknown as WorkVersionOwnerProjectionBundle;
  assert.throws(() => resolveWorkVersionOwnerSnapshotRefs(missing), /missing required slice|project/i);

  const sensitive = Object.fromEntries(WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind) => [ownerKind, {
    ownerIdentity: `${ownerKind}.sensitive`, projectionSchemaVersion: "fixture/v1", revisionToken: "r1",
    stableReferenceIds: [`${ownerKind}.ref`], provenanceReceiptIds: [], canonicalProjection: ownerKind === "project" ? { apiKey: "forbidden" } : { ownerKind }
  }])) as WorkVersionOwnerProjectionBundle;
  assert.throws(() => resolveWorkVersionOwnerSnapshotRefs(sensitive), /forbidden field apiKey/i);
});

function listProjectFiles(root: string, relative = ""): Set<string> {
  const result = new Set<string>();
  const directory = path.join(root, relative);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const item = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) for (const nested of listProjectFiles(root, item)) result.add(nested);
    else result.add(item);
  }
  return result;
}
