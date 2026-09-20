import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioCanonReadProjection } from "../../src/storyControlSurface/storyStudioCanonReadProjection.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import {
  WORK_VERSION_REQUIRED_OWNER_KINDS,
  createStoryStudioWorkVersionAuthority,
  type OwnerSnapshotRef
} from "../../src/storyWorkspace/workVersionAuthority.ts";

test("Canon read projection keeps healthy empty, invalid record, and verified records distinct", () => {
  const fixture = createFixture("ready-states");
  try {
    assert.deepEqual(fixture.projection.listVerifiedCanonEvents({ projectId: fixture.projectId }), {
      status: "ready",
      eventIds: [],
      invalidRecordCount: 0
    });

    const chain = createVerifiedCanon(fixture, "合法作者确认事件");
    const spoof = fixture.workspace.createWorldObject({
      projectId: fixture.projectId,
      type: "event",
      title: "只有确认外观的无效记录",
      status: "committed",
      tags: ["作者确认"]
    });

    assert.deepEqual(fixture.projection.listVerifiedCanonEvents({ projectId: fixture.projectId }), {
      status: "ready",
      eventIds: [chain.canon.id],
      invalidRecordCount: 1
    });
    const detail = fixture.projection.readVerifiedCanonEvent({ projectId: fixture.projectId, eventId: chain.canon.id });
    assert.equal(detail.status, "ready");
    if (detail.status === "ready") assert.equal(detail.event.id, chain.canon.id);
    assert.deepEqual(fixture.projection.readVerifiedCanonEvent({ projectId: fixture.projectId, eventId: spoof.id }), {
      status: "error",
      error: {
        kind: "invalid-record",
        message: "这条事件未通过作者确认链验证，未作为正式事实读取。"
      }
    });
  } finally {
    fixture.cleanup();
  }
});

test("Canon read projection classifies parse, I/O, authority, and project-boundary failures", async (t) => {
  await t.test("malformed authority JSON is a distinct parse failure", () => {
    const fixture = createFixture("parse");
    try {
      const chain = createVerifiedCanon(fixture, "损坏 JSON");
      const changeSetPath = authorityPaths(fixture.projectPath, chain.review.id, chain.changeSet.id).changeSet;
      writeFileSync(changeSetPath, "{\n", "utf8");
      assertFailure(fixture.projection.listVerifiedCanonEvents({ projectId: fixture.projectId }), "parse-failure");
      assertFailure(fixture.projection.readVerifiedCanonEvent({ projectId: fixture.projectId, eventId: chain.canon.id }), "parse-failure");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("authority repository I/O fault stays visible", () => {
    const fixture = createFixture("io");
    try {
      const chain = createVerifiedCanon(fixture, "I/O 故障");
      const intentPath = authorityPaths(fixture.projectPath, chain.review.id, chain.changeSet.id).intent;
      rmSync(intentPath);
      mkdirSync(intentPath);
      assertFailure(fixture.projection.listVerifiedCanonEvents({ projectId: fixture.projectId }), "repository-io");
      assertFailure(fixture.projection.readVerifiedCanonEvent({ projectId: fixture.projectId, eventId: chain.canon.id }), "repository-io");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("multiple operation claimants are an authority failure", () => {
    const fixture = createFixture("authority");
    try {
      const chain = createVerifiedCanon(fixture, "权威冲突");
      const duplicate = fixture.workspace.createWorldObject({
        projectId: fixture.projectId,
        type: "event",
        title: "重复 claimant",
        status: "committed",
        tags: ["作者确认"]
      });
      const duplicatePath = path.join(fixture.projectPath, duplicate.relativeId);
      writeFileSync(duplicatePath, addFrontmatter(readFileSync(duplicatePath, "utf8"), {
        source_change_set_id: String(chain.canon.properties.source_change_set_id),
        source_change_set_revision: String(chain.canon.properties.source_change_set_revision),
        author_decision_ref: String(chain.canon.properties.author_decision_ref),
        apply_operation_key: String(chain.canon.properties.apply_operation_key),
        apply_intent_hash: String(chain.canon.properties.apply_intent_hash)
      }), "utf8");
      assertFailure(fixture.projection.listVerifiedCanonEvents({ projectId: fixture.projectId }), "authority-failure");
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("wrong project remains a project-boundary failure", () => {
    const fixture = createFixture("project-boundary");
    try {
      assertFailure(fixture.projection.listVerifiedCanonEvents({ projectId: "missing-project" }), "project-boundary");
      assertFailure(fixture.projection.readVerifiedCanonEvent({ projectId: "missing-project", eventId: "event.missing" }), "project-boundary");
    } finally {
      fixture.cleanup();
    }
  });
});

test("Event Canon certification is WorkVersion-scoped, revision-bound, and read-only", () => {
  const fixture = createFixture("event-certification");
  try {
    const versions = createVersions(fixture.projectPath);
    const rootEvent = createVerifiedCanon(fixture, "主线正式事件", versions.root.identity.workVersionId);
    const derivedEvent = createVerifiedCanon(fixture, "IF 版本正式事件", versions.derived.identity.workVersionId);

    const eventPath = path.join(fixture.projectPath, rootEvent.canon.relativeId);
    const beforeHash = fileHash(eventPath);
    assert.deepEqual(fixture.projection.certifyEventRead({
      projectId: fixture.projectId,
      workVersionId: versions.root.identity.workVersionId,
      eventId: rootEvent.canon.id,
      expectedRevision: rootEvent.canon.revisionToken
    }), {
      projectId: fixture.projectId,
      workVersionId: versions.root.identity.workVersionId,
      ownerKind: "event",
      entityId: rootEvent.canon.id,
      revision: rootEvent.canon.revisionToken,
      authorityClass: "canon",
      admissionResult: { status: "admitted", code: "verified-owner-admission" }
    });
    assert.equal(fileHash(eventPath), beforeHash);

    const certifiedDerived = fixture.projection.certifyEventRead({
      projectId: fixture.projectId,
      workVersionId: versions.derived.identity.workVersionId,
      eventId: derivedEvent.canon.id
    });
    assert.equal(certifiedDerived.authorityClass, "derived-canon");
    assert.deepEqual(certifiedDerived.admissionResult, { status: "admitted", code: "verified-owner-admission" });

    assert.deepEqual(fixture.projection.certifyEventRead({
      projectId: fixture.projectId,
      workVersionId: versions.derived.identity.workVersionId,
      eventId: rootEvent.canon.id
    }).admissionResult, { status: "rejected", code: "work-version-mismatch" });
    assert.deepEqual(fixture.projection.certifyEventRead({
      projectId: fixture.projectId,
      workVersionId: versions.root.identity.workVersionId,
      eventId: derivedEvent.canon.id
    }).admissionResult, { status: "rejected", code: "work-version-mismatch" });
    assert.deepEqual(fixture.projection.certifyEventRead({
      projectId: fixture.projectId,
      workVersionId: versions.root.identity.workVersionId,
      eventId: rootEvent.canon.id,
      expectedRevision: "stale-revision"
    }).admissionResult, { status: "rejected", code: "revision-mismatch" });

    let eventReadCount = 0;
    const readWorldObject = fixture.workspace.readWorldObject.bind(fixture.workspace);
    const unstableProjection = createStoryStudioCanonReadProjection({
      workspace: {
        ...fixture.workspace,
        readWorldObject(readInput) {
          const event = readWorldObject(readInput);
          if (readInput.objectId !== rootEvent.canon.id || ++eventReadCount === 1) return event;
          return { ...event, revisionToken: `${event.revisionToken}.changed-during-certification` };
        }
      },
      authorControl: fixture.authorControl
    });
    assert.deepEqual(unstableProjection.certifyEventRead({
      projectId: fixture.projectId,
      workVersionId: versions.root.identity.workVersionId,
      eventId: rootEvent.canon.id
    }).admissionResult, { status: "rejected", code: "revision-mismatch" });
  } finally {
    fixture.cleanup();
  }
});

test("Event Canon certification rejects non-Owner claims and preserves authority failures", async (t) => {
  await t.test("draft, planned, and spoof committed Events remain unverified", () => {
    const fixture = createFixture("event-certification-rejections");
    try {
      const versions = createVersions(fixture.projectPath);
      const draft = fixture.workspace.createWorldObject({
        projectId: fixture.projectId,
        type: "event",
        title: "仅用于草稿",
        status: "draft",
        tags: ["作者草稿"]
      });
      const planned = fixture.workspace.createPlanningEvent({ projectId: fixture.projectId, title: "仅用于规划" });
      const spoof = fixture.workspace.createWorldObject({
        projectId: fixture.projectId,
        type: "event",
        title: "伪造正式事件",
        status: "committed",
        tags: ["作者确认"]
      });
      for (const event of [draft, planned, spoof]) {
        const certification = fixture.projection.certifyEventRead({
          projectId: fixture.projectId,
          workVersionId: versions.root.identity.workVersionId,
          eventId: event.id
        });
        assert.equal(certification.authorityClass, "unverified");
        assert.deepEqual(certification.admissionResult, { status: "rejected", code: "owner-rejected" });
      }
    } finally {
      fixture.cleanup();
    }
  });

  await t.test("authority and repository failures stay visible", () => {
    const fixture = createFixture("event-certification-failures");
    try {
      const versions = createVersions(fixture.projectPath);
      const chain = createVerifiedCanon(fixture, "认证故障", versions.root.identity.workVersionId);
      const duplicate = fixture.workspace.createWorldObject({
        projectId: fixture.projectId,
        type: "event",
        title: "重复 claimant",
        status: "committed",
        tags: ["作者确认"]
      });
      const duplicatePath = path.join(fixture.projectPath, duplicate.relativeId);
      writeFileSync(duplicatePath, addFrontmatter(readFileSync(duplicatePath, "utf8"), {
        source_change_set_id: String(chain.canon.properties.source_change_set_id),
        source_change_set_revision: String(chain.canon.properties.source_change_set_revision),
        author_decision_ref: String(chain.canon.properties.author_decision_ref),
        apply_operation_key: String(chain.canon.properties.apply_operation_key),
        apply_intent_hash: String(chain.canon.properties.apply_intent_hash)
      }), "utf8");
      const authorityFailure = fixture.projection.certifyEventRead({
        projectId: fixture.projectId,
        workVersionId: versions.root.identity.workVersionId,
        eventId: chain.canon.id
      });
      assert.equal(authorityFailure.admissionResult.status, "error");
      if (authorityFailure.admissionResult.status === "error") {
        assert.equal(authorityFailure.admissionResult.error.kind, "authority-failure");
      }

      rmSync(duplicatePath);
      const intentPath = authorityPaths(fixture.projectPath, chain.review.id, chain.changeSet.id).intent;
      rmSync(intentPath);
      mkdirSync(intentPath);
      const repositoryFailure = fixture.projection.certifyEventRead({
        projectId: fixture.projectId,
        workVersionId: versions.root.identity.workVersionId,
        eventId: chain.canon.id
      });
      assert.equal(repositoryFailure.admissionResult.status, "error");
      if (repositoryFailure.admissionResult.status === "error") {
        assert.equal(repositoryFailure.admissionResult.error.kind, "repository-io");
      }
    } finally {
      fixture.cleanup();
    }
  });
});

function createFixture(name: string) {
  const root = mkdtempSync(path.join(tmpdir(), `story-studio-canon-read-projection-${name}-`));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "mist-lighthouse";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  workspace.createProject({ title: "雾中灯塔", folderSlug: projectId });
  return {
    root,
    rootPath,
    stateFilePath,
    projectId,
    projectPath: path.join(rootPath, projectId),
    workspace,
    authorControl,
    projection: createStoryStudioCanonReadProjection({ workspace, authorControl }),
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function createVerifiedCanon(fixture: ReturnType<typeof createFixture>, title: string, workVersionId?: string) {
  const planning = fixture.workspace.createPlanningEvent({ projectId: fixture.projectId, title });
  const review = fixture.authorControl.createPlanningEventImpactReview({ projectId: fixture.projectId, planningEventId: planning.id });
  fixture.authorControl.chooseImpactRoute({ projectId: fixture.projectId, reviewId: review.id, optionId: review.options[0].id, action: "adopt" });
  const changeSet = fixture.authorControl.createAuthorChangeSet({
    projectId: fixture.projectId,
    reviewId: review.id,
    ...(workVersionId ? { workVersionId } : {})
  });
  fixture.authorControl.applyAuthorChangeSet({ projectId: fixture.projectId, changeSetId: changeSet.id });
  const canon = fixture.workspace.listWorldObjects({ projectId: fixture.projectId, type: "event" })
    .map((event) => fixture.workspace.readWorldObject({ projectId: fixture.projectId, objectId: event.id }))
    .find((event) => event.properties.source_change_set_id === changeSet.id)!;
  assert.ok(canon);
  return { planning, review, changeSet, canon };
}

function createVersions(projectPath: string) {
  const authority = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath });
  const root = authority.createRootCheckpoint({
    displayName: "主线",
    authorActionId: "author.canon-certification.root",
    idempotencyKey: "canon-certification-root",
    expectedRevision: 0,
    createdAt: "2026-09-20T00:00:00.000Z",
    ownerSnapshotRefs: completeOwnerRefs("root"),
    optionalNuwaProvenanceRefs: []
  });
  const derived = authority.createDerivedVersion({
    displayName: "IF 版本",
    parentVersionId: root.identity.workVersionId,
    parentBaseRevision: root.identity.currentRevision,
    parentManifestId: root.identity.headManifestId,
    authorActionId: "author.canon-certification.derived",
    idempotencyKey: "canon-certification-derived",
    expectedRevision: 0,
    createdAt: "2026-09-20T00:01:00.000Z",
    ownerSnapshotRefs: completeOwnerRefs("derived"),
    optionalNuwaProvenanceRefs: []
  });
  return { root, derived };
}

function completeOwnerRefs(seed: string): OwnerSnapshotRef[] {
  return WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind, index) => ({
    ownerKind,
    ownerIdentity: `${ownerKind}.canon-certification`,
    projectionSchemaVersion: `${ownerKind}/fixture-v1`,
    revisionToken: `${seed}.revision.${index + 1}`,
    canonicalDigest: digest(`${seed}:${ownerKind}`),
    stableReferenceIds: [`${ownerKind}.ref.canon-certification`],
    provenanceReceiptIds: [`receipt.${ownerKind}.${seed}`],
    completeness: "complete"
  }));
}

function fileHash(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function authorityPaths(projectPath: string, reviewId: string, changeSetId: string) {
  const changeSetRoot = path.join(projectPath, ".world-os", "author-control", "change-sets");
  return {
    review: path.join(projectPath, ".world-os", "author-control", "impact-reviews", `${reviewId}.json`),
    changeSet: path.join(changeSetRoot, `${changeSetId}.json`),
    intent: path.join(changeSetRoot, `${changeSetId}.apply-intent.v1.json`)
  };
}

function addFrontmatter(source: string, fields: Record<string, string>): string {
  return source.replace("---\n", `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n`);
}

function assertFailure(value: { status: string; error?: { kind: string } }, kind: string): void {
  assert.equal(value.status, "error");
  assert.equal(value.error?.kind, kind);
}
