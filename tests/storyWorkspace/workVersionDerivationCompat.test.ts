import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync, lstatSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryWorkspace } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import {
  WORK_VERSION_REQUIRED_OWNER_KINDS,
  createStoryStudioWorkVersionAuthority,
  type OwnerSnapshotRef
} from "../../src/storyWorkspace/workVersionAuthority.ts";

const digestHex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function ownerRefs(): OwnerSnapshotRef[] {
  const stamp = `t-${Math.random().toString(36).slice(2, 10)}`;
  return WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind) => ({
    ownerKind,
    ownerIdentity: `${ownerKind}:${stamp}`,
    projectionSchemaVersion: `${ownerKind}-projection/test`,
    revisionToken: `rev-${stamp}`,
    canonicalDigest: digestHex(`${ownerKind}:${stamp}`),
    stableReferenceIds: [`${ownerKind}:ref:${stamp}`],
    provenanceReceiptIds: [],
    completeness: "complete" as const
  }));
}

function baseInput() {
  return {
    authorActionId: "author.derivation-compat",
    idempotencyKey: `idem-${Math.random().toString(36).slice(2, 12)}`,
    expectedRevision: 0,
    createdAt: "2026-09-16T16:00:00.000Z",
    ownerSnapshotRefs: ownerRefs(),
    optionalNuwaProvenanceRefs: [] as []
  };
}

const derivation = { purpose: "nuwa-branch" as const, originRunId: "nuwa-run-20260916a", originHandoffId: "nuwa-n1-handoff.abc123" };

test("a derived WorkVersion may carry a nuwa-branch derivation and keeps it stable across revisions", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-derivation-compat-"));
  createStoryWorkspace({ rootPath: root, title: "潮痕来信 兼容" });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: root });
  const mainline = authority.createRootCheckpoint({ ...baseInput(), displayName: "主线" });
  const branch = authority.createDerivedVersion({
    ...baseInput(),
    displayName: "女娲分支 · 兼容测试",
    parentVersionId: mainline.identity.workVersionId,
    parentBaseRevision: mainline.identity.currentRevision,
    parentManifestId: mainline.identity.headManifestId,
    derivation
  });
  assert.equal(branch.identity.derivation?.purpose, "nuwa-branch");
  assert.equal(branch.identity.derivation?.originRunId, "nuwa-run-20260916a");
  const appended = authority.appendRevision({
    workVersionId: branch.identity.workVersionId,
    expectedRevision: branch.identity.currentRevision,
    authorActionId: "author.derivation-compat.append",
    idempotencyKey: `idem-append-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: "2026-09-16T16:05:00.000Z",
    ownerSnapshotRefs: ownerRefs(),
    semanticDeltaRefs: ["nuwa-branch:checkpoint"]
  });
  assert.equal(appended.identity.derivation?.originRunId, "nuwa-run-20260916a");
  const reread = authority.getVersion(branch.identity.workVersionId);
  assert.deepEqual(reread.identity.derivation, derivation);
});

test("root creation input rejects a derivation field outright", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-derivation-root-"));
  createStoryWorkspace({ rootPath: root, title: "潮痕来信 root" });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: root });
  assert.throws(
    () => authority.createRootCheckpoint({ ...baseInput(), displayName: "x", derivation } as never),
    /unknown field: derivation/i
  );
});

test("append input cannot smuggle a different derivation", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-derivation-append-"));
  createStoryWorkspace({ rootPath: root, title: "潮痕来信 append" });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: root });
  const mainline = authority.createRootCheckpoint({ ...baseInput(), displayName: "主线" });
  const branch = authority.createDerivedVersion({
    ...baseInput(), displayName: "分支", parentVersionId: mainline.identity.workVersionId,
    parentBaseRevision: mainline.identity.currentRevision, parentManifestId: mainline.identity.headManifestId, derivation
  });
  assert.throws(
    () => authority.appendRevision({
      workVersionId: branch.identity.workVersionId,
      expectedRevision: branch.identity.currentRevision,
      authorActionId: "author.derivation-compat.bad",
      idempotencyKey: `idem-bad-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: "2026-09-16T16:06:00.000Z",
      ownerSnapshotRefs: ownerRefs(),
      semanticDeltaRefs: [],
      derivation: { purpose: "nuwa-branch", originRunId: "run.other", originHandoffId: null }
    } as never),
    /unknown field: derivation/i
  );
});

test("unknown derivation purposes are rejected", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-derivation-purpose-"));
  createStoryWorkspace({ rootPath: root, title: "潮痕来信 purpose" });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: root });
  const mainline = authority.createRootCheckpoint({ ...baseInput(), displayName: "主线" });
  assert.throws(
    () => authority.createDerivedVersion({
      ...baseInput(), displayName: "分支", parentVersionId: mainline.identity.workVersionId,
      parentBaseRevision: mainline.identity.currentRevision, parentManifestId: mainline.identity.headManifestId,
      derivation: { purpose: "multiverse", originRunId: "run.z", originHandoffId: null }
    } as never),
    /derivation purpose/i
  );
});

test("legacy v1 identities without a derivation key still verify and are never rewritten or projected on read", () => {
  const legacyRoot = mkdtempSync(path.join(tmpdir(), "tianyan-derivation-legacy-"));
  createStoryWorkspace({ rootPath: legacyRoot, title: "潮痕来信 legacy" });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: legacyRoot });
  const created = authority.createRootCheckpoint({ ...baseInput(), displayName: "旧主线" });
  const receiptPath = authority.persistencePaths().receiptPath(created.receipt.idempotencyKey);
  const stored = JSON.parse(readFileSync(receiptPath, "utf8") as string) as { result: { identity: Record<string, unknown> } };
  assert.equal("derivation" in stored.result.identity, false, "fresh root receipts must not gain a derivation key");
  const verified = authority.getVersion(created.identity.workVersionId);
  assert.equal("derivation" in (verified.identity as Record<string, unknown>), false, "reading must not inject a derivation projection");
  const before = readFileSync(receiptPath);
  authority.listVersions();
  authority.verifyVersionIntegrity(created.identity.workVersionId);
  authority.projectVersionStaleness(created.identity.workVersionId);
  assert.equal(Buffer.compare(before, readFileSync(receiptPath)), 0, "reads must not rewrite receipt bytes");
  assert.ok(existsSync(receiptPath) && !lstatSync(receiptPath).isSymbolicLink());
});

test("unknown extra identity fields keep being rejected (strictness preserved)", () => {
  const tamperedRoot = mkdtempSync(path.join(tmpdir(), "tianyan-derivation-tamper-"));
  createStoryWorkspace({ rootPath: tamperedRoot, title: "潮痕来信 tamper" });
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: tamperedRoot });
  const created = authority.createRootCheckpoint({ ...baseInput(), displayName: "防篡改" });
  const receiptPath = authority.persistencePaths().receiptPath(created.receipt.idempotencyKey);
  const parsed = JSON.parse(readFileSync(receiptPath, "utf8") as string) as Record<string, unknown>;
  (parsed.result as { identity: Record<string, unknown> }).identity.secretField = "should-fail";
  // Recompute the receipt digest so the tamper reaches the identity validator
  // itself rather than being caught earlier by the receipt digest check.
  const { receiptDigest: _omit, ...body } = parsed;
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  parsed.receiptDigest = digestHex(canonical(body));
  // readJson demands canonical bytes, so persist the receipt in canonical form.
  writeFileSync(receiptPath, `${canonical(parsed)}\n`, "utf8");
  assert.throws(() => authority.getVersion(created.identity.workVersionId), /unknown field/i);
});
