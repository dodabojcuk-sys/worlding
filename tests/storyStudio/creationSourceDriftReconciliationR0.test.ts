import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCreationSourceDriftCompareR0, validateCreationSourceReconciliationSelection } from "../../src/storyCreation/creationSourceDriftR0.ts";
import { adaptLegacyNuwaCreationHandoff, LEGACY_NUWA_CREATION_BLOCKED_MESSAGE } from "../../src/storyCreation/legacyNuwaCreationHandoffAdapter.ts";
import { normalizeWorkVersionOutputArtifactSource } from "../../src/storyCreation/workVersionBoundOutputArtifact.ts";

const digest = (value: string) => value.repeat(64).slice(0, 64);
const realityMapPath = "docs/research/TIANYAN_MAINLINE_LINEAGE_AND_CAPABILITY_REALITY_MAP_R0.json";

function compareInput() {
  return {
    baseRevision: 1,
    currentRevision: 3,
    baseManifestDigest: digest("a"),
    currentManifestDigest: digest("b"),
    baseOwnerDigests: {
      "event-hierarchy": digest("1"), "story-structure": digest("2"), "character-state": digest("3"),
      "world-state": digest("4"), relation: digest("5"), "source-anchors": digest("6")
    },
    currentOwnerDigests: {
      "event-hierarchy": digest("7"), "story-structure": digest("8"), "character-state": digest("3"),
      "world-state": digest("4"), relation: digest("5"), "source-anchors": digest("9")
    }
  };
}

test("Creation compare reuses shared owner-backed digest classification", () => {
  const compare = buildCreationSourceDriftCompareR0(compareInput());
  assert.equal(compare.schemaVersion, "tianyan-owner-referenced-semantic-compare/r0");
  assert.equal(compare.ownerDigestChanges.find((entry) => entry.ownerKind === "event-hierarchy")?.changed, true);
  assert.equal(compare.ownerDigestChanges.find((entry) => entry.ownerKind === "character-state")?.changed, false);
});

test("only author-confirmable source differences may be selected", () => {
  const compare = buildCreationSourceDriftCompareR0(compareInput());
  assert.deepEqual(validateCreationSourceReconciliationSelection(compare, compare.confirmableDifferenceIds.slice(0, 2)), compare.confirmableDifferenceIds.slice(0, 2).sort());
  assert.throws(() => validateCreationSourceReconciliationSelection(compare, ["creation.source-diff.world-time"]), /no longer available/);
});

test("missing and concurrent comparisons fail closed", () => {
  const missing = buildCreationSourceDriftCompareR0({ ...compareInput(), missingReference: true });
  const concurrency = buildCreationSourceDriftCompareR0({ ...compareInput(), concurrentCurrentRevision: 4 });
  assert.equal(missing.status, "blocked_missing_reference");
  assert.equal(concurrency.status, "blocked_concurrency");
  assert.throws(() => validateCreationSourceReconciliationSelection(concurrency, ["creation.source-diff.story-unit.old-name-purpose"]), /主线已再次更新/);
});

test("reconciliation receipt requires unchanged prose digests and root source", () => {
  const base = {
    schemaVersion: "tianyan-work-version-output-artifact-source/r0" as const,
    sourceKind: "work-version" as const,
    projectId: "project.fixture",
    workVersionId: "work-version.root.fixture",
    workVersionKind: "root" as const,
    pinnedRevision: 3,
    manifestId: "work-version-manifest.fixture",
    manifestDigest: digest("a"),
    selectedStoryUnitRefs: [{ unitId: "story-unit.fixture", unitVersion: "v1" }],
    selectedEventRefs: [{ eventId: "event.fixture", eventRevision: "v1" }],
    sourceAnchorRefs: ["source-anchor.fixture"],
    neutralStoryPackageId: "package.fixture",
    neutralStoryPackageDigest: `sha256:${digest("b")}` as const,
    sourceOwnerReceiptRefs: ["receipt.fixture"],
    creationOperationReceipt: { operationId: "creation.fixture", idempotencyKey: "creation.fixture", payloadDigest: `sha256:${digest("c")}` as const },
    sourceReconciliationReceipt: {
      schemaVersion: "tianyan-creation-source-reconciliation-receipt/r0" as const,
      artifactId: "artifact.fixture", originalArtifactRevisionId: "artifact-revision.old", newArtifactRevisionId: "artifact-revision.new",
      sourceWorkVersionId: "work-version.root.fixture", fromRevision: 1, fromManifestDigest: digest("d"), toRevision: 3,
      toManifestDigest: digest("a"), semanticDiffDigest: `sha256:${digest("e")}` as const,
      bodyDigestBefore: `sha256:${digest("f")}` as const, bodyDigestAfter: `sha256:${digest("f")}` as const,
      confirmedDifferenceIds: ["difference.fixture"], unresolvedDifferenceIds: ["unknown.fixture"], idempotencyKey: "reconcile.fixture",
      executionStage: "artifact_revision_appended" as const, expectedWorkVersionReceiptId: "work-version-receipt.fixture", blockedReason: null,
      createdAt: "2026-08-25T09:20:00.000Z"
    },
    createdAt: "2026-08-25T09:20:00.000Z"
  };
  assert.equal(normalizeWorkVersionOutputArtifactSource(base)?.sourceReconciliationReceipt?.toRevision, 3);
  assert.throws(() => normalizeWorkVersionOutputArtifactSource({ ...base, sourceReconciliationReceipt: { ...base.sourceReconciliationReceipt, bodyDigestAfter: `sha256:${digest("0")}` } }), /cannot auto-rewrite/);
});

test("Creation UI exposes author language, semantic groups and explicit confirmation", () => {
  const source = readFileSync("apps/story-studio/src/components/work-version-creation/WorkVersionBoundCreationWorkspace.tsx", "utf8");
  for (const phrase of ["这份创作稿不会自动变化", "新增内容", "已删除内容", "发生变化", "保持不变", "未知项", "来源冲突", "缺少证据", "继续沿用第", "重新核对到第", "建立新的创作稿修订", "正文未自动改写"]) assert.match(source, new RegExp(phrase));
  assert.doesNotMatch(source, />\s*(?:rebase|manifest|owner|revision ledger|snapshot resolver|optimistic concurrency)\s*</iu);
});

test("Creation return snapshot persists semantic selection with scroll and focus", () => {
  const source = readFileSync("apps/story-studio/src/components/work-version-creation/WorkVersionBoundCreationWorkspace.tsx", "utf8");
  for (const token of ["scrollTop", "focus", "selectionStart", "selectionEnd", "sourceExpanded", "selectedDifferenceIds"]) assert.match(source, new RegExp(token));
  assert.match(source, /sessionStorage\.setItem\(returnKey/);
});

test("server and Work Dock keep the bounded offline reconciliation action", () => {
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const dock = readFileSync("apps/story-studio/src/components/TianyiQuickAssistant.tsx", "utf8");
  assert.match(server, /reconcile-source/);
  assert.match(server, /selectedDifferenceIds/);
  assert.match(dock, /离线创作来源助手/);
  assert.match(dock, /REAL_PROVIDER_CALLS=0/);
  assert.doesNotMatch(server, /CreationSourceReconciliationRepository|CreationSemanticCompareRepository/);
});

test("Creation exposes missing, corrupt and concurrency compare projections without a write route", () => {
  const workspace = readFileSync("apps/story-studio/src/components/work-version-creation/WorkVersionBoundCreationWorkspace.tsx", "utf8");
  const transport = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
  assert.match(workspace, /requestedFixtureCase === "concurrency"/);
  assert.match(transport, /"missing" \| "corrupt" \| "concurrency"/);
  assert.doesNotMatch(workspace, /operate\("advance-root-for-concurrency/);
});

test("mainline capability reality map covers every audited capability and product space", () => {
  const realityMap = JSON.parse(readFileSync(realityMapPath, "utf8")) as {
    schemaVersion: string;
    verdict: string;
    git: { localDefaultBranchRefPresent: boolean; remoteRefsPresent: boolean; defaultBranchAheadBehindAvailable: boolean; mainlineMergePerformed: boolean };
    capabilities: Array<{ id: string; gitClassification: string; productReality: string }>;
    spaces: Array<{ id: string }>;
    implementationGate: { passed: boolean; creationNormalRoutePilot: string; formalDefaultBranchStatus: string };
  };
  assert.equal(realityMap.schemaVersion, "tianyan-mainline-lineage-capability-reality-map/r0");
  assert.equal(realityMap.verdict, "NORMAL_ROUTE_ON_CURRENT_DEVELOPMENT_BRANCH_DEFAULT_BRANCH_NOT_PROVEN");
  assert.deepEqual(realityMap.capabilities.map((entry) => entry.id).sort(), [
    "character-fate", "character-state", "contextual-work-dock", "creation-source-reconciliation",
    "creation-work-version-source", "event-semantic-hierarchy", "multiverse-single-derived",
    "normal-project-event-creation-handoff", "nuwa-bounded-rehearsal", "tianyi-two-modes", "work-version-authority"
  ]);
  assert.deepEqual(realityMap.spaces.map((entry) => entry.id), ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "creation", "data"]);
  for (const entry of realityMap.capabilities) {
    assert.equal(entry.gitClassification, "DEVELOPMENT_BRANCH_ONLY");
    assert.ok(["NORMAL_ROUTE_ON_DEV_BRANCH_ONLY", "NORMAL_ROUTE_ON_CURRENT_DEVELOPMENT_BRANCH", "CURRENT_DEVELOPMENT_BRANCH_NORMAL_ROUTE", "SHARED_SERVICE_ONLY", "FIXTURE_ONLY_UI"].includes(entry.productReality));
  }
  assert.equal(realityMap.git.localDefaultBranchRefPresent, false);
  assert.equal(realityMap.git.remoteRefsPresent, false);
  assert.equal(realityMap.git.defaultBranchAheadBehindAvailable, false);
  assert.equal(realityMap.git.mainlineMergePerformed, false);
  assert.equal(realityMap.implementationGate.passed, true);
  assert.equal(realityMap.implementationGate.creationNormalRoutePilot, "PASS_ON_CURRENT_DEVELOPMENT_BRANCH");
  assert.equal(realityMap.implementationGate.formalDefaultBranchStatus, "NOT_PROVEN_ON_DEFAULT_BRANCH");
});

test("normal Creation source route is distinct from the fixture-only compatibility route", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");
  const creationHome = readFileSync("apps/story-studio/src/components/CreationHome.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/components/work-version-creation/WorkVersionBoundCreationWorkspace.tsx", "utf8");
  assert.match(app, /productMode === "writing"[\s\S]*?<CreationHome/);
  assert.match(app, /fixtureKind === "work-version-creation"[\s\S]*?<WorkVersionBoundCreationWorkspace/);
  assert.match(app, /routeKind="normal"/);
  assert.match(app, /"root-confirm"/);
  assert.match(server, /\/__local\/story-studio\/creation\/source/);
  assert.match(server, /TIANYAN_WORK_VERSION_CREATION_FIXTURE_R0 !== "1"/);
  assert.match(server, /WorkVersion Creation Fixture is disabled for this runtime/);
  assert.doesNotMatch(server, /\/__local\/story-studio\/work-versions(?:\/|\")/);
  assert.match(creationHome, /buildNeutralStoryPackage\(/);
  assert.doesNotMatch(creationHome, /workVersion\s*:/);
  assert.match(workspace, /data-testid="creation-root-create-confirm"/);
  assert.match(workspace, /onClick=\{\(\) => navigateView\("root-confirm"\)\}/);
  assert.match(workspace, /operate\("create-root"\)[\s\S]*?navigateView\("source"\)/);
});

test("Creation has zero direct Nuwa UI imports and legacy Nuwa Run identity is quarantined before persistence", () => {
  const creationOwnedFiles = [
    "apps/story-studio/src/components/CreationHome.tsx",
    "apps/story-studio/src/components/CreationLegacyHome.tsx",
    "apps/story-studio/src/components/CreationMediaManager.tsx",
    "apps/story-studio/src/components/CreationPluginCenter.tsx",
    "apps/story-studio/src/components/CreationStartDialog.tsx",
    "apps/story-studio/src/components/OutputArtifactWorkbench.tsx",
    "apps/story-studio/src/components/work-version-creation/WorkVersionBoundCreationWorkspace.tsx"
  ];
  const directNuwaImports = creationOwnedFiles.flatMap((path) => readFileSync(path, "utf8").split("\n").filter((line) => /^import\b.*(?:nuwa|Nuwa)/u.test(line)));
  assert.equal(directNuwaImports.length, 0);

  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  assert.match(app, /function sendStandalonePossibilityToCreation/);
  assert.match(app, /adaptLegacyNuwaCreationHandoff/);
  assert.match(app, /searchParams\.set\("legacySource", "blocked"\)/);
  assert.doesNotMatch(app, /sourceKind: "nuwa-candidate"/);
  assert.doesNotMatch(app, /ownerId: "nuwa-runpack"/);
  assert.doesNotMatch(app, /generationBrief: \{ origin: "nuwa-standalone", runId/);
});

test("legacy Nuwa handoff adapts complete stable source and drops every runtime identity", () => {
  const result = adaptLegacyNuwaCreationHandoff({
    projectId: "legacy-project",
    runId: "legacy-run",
    runPackId: "nuwa-runpack",
    temporaryBranchId: "temp-branch",
    rehearsalStepId: "step-1",
    simulationReceiptId: "receipt-1",
    stableSource: {
      projectId: "project.stable",
      workVersionId: "work-version.root.stable",
      workVersionRevision: 2,
      manifestId: "manifest.stable",
      manifestDigest: digest("a"),
      storyUnitRefs: [{ unitId: "story-unit.stable", unitVersion: "unit-r1" }],
      eventRefs: [{ eventId: "event.stable", eventRevision: "event-r1" }],
      sourceAnchorRefs: ["source-anchor.stable"]
    }
  });
  assert.equal(result.status, "adapted");
  if (result.status !== "adapted") return;
  assert.equal(result.removedLegacyIdentityCount, 5);
  assert.doesNotMatch(JSON.stringify(result.source), /legacy-run|nuwa-runpack|temp-branch|step-1|receipt-1/u);
});

test("legacy Nuwa run-only handoff fails closed without fabricating a stable source", () => {
  const result = adaptLegacyNuwaCreationHandoff({ projectId: "legacy-project", runId: "legacy-run", runPackId: "nuwa-runpack" });
  assert.deepEqual(result, {
    status: "blocked_incomplete_source",
    authorMessage: LEGACY_NUWA_CREATION_BLOCKED_MESSAGE,
    removedLegacyIdentityCount: 0
  });
});
