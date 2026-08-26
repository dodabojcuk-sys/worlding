import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { analyzeStoryImpactReport } from "../../src/domainTemplates/storyWorld/analysis/index.ts";
import { createStoryWorldTemplate } from "../../src/domainTemplates/storyWorld/index.ts";
import { createStoryAuthorIntent } from "../../src/domainTemplates/storyWorld/intent/index.ts";

test("StoryEvidenceExplanation resolves deterministic evidence for every impact", async () => {
  assert.equal(existsSync("src/domainTemplates/storyWorld/evidence/index.ts"), true, "evidence index must exist");
  const { resolveStoryEvidenceBundle } = await import("../../src/domainTemplates/storyWorld/evidence/index.ts");
  const project = createProject();
  const report = analyzeStoryImpactReport(project, createDiscoveryIntent());
  const beforeProject = structuredClone(project);
  const beforeReport = structuredClone(report);
  const bundleA = resolveStoryEvidenceBundle(project, report);
  const bundleB = resolveStoryEvidenceBundle(project, report);

  assert.deepEqual(bundleA, bundleB);
  assert.deepEqual(project, beforeProject);
  assert.deepEqual(report, beforeReport);
  assert.equal(bundleA.version, "world-os-story-evidence-bundle-v1");
  assert.equal(bundleA.intentId, "evidence-intent-1");
  assert.equal(bundleA.canModifyWorld, false);
  assert.equal(bundleA.deterministic, true);
  assert.deepEqual(bundleA.coverage, {
    totalImpacts: 7,
    explainedImpacts: 7,
    unexplainedImpactRefs: []
  });

  const impactRefs = impactRefsFromReport(report);
  const evidenceRefs = [
    ...bundleA.characterEvidence,
    ...bundleA.eventEvidence,
    ...bundleA.relationshipEvidence,
    ...bundleA.worldRuleEvidence
  ].map((item) => item.impactRef).sort();

  assert.deepEqual(evidenceRefs, impactRefs);
  for (const item of [
    ...bundleA.characterEvidence,
    ...bundleA.eventEvidence,
    ...bundleA.relationshipEvidence,
    ...bundleA.worldRuleEvidence,
    ...bundleA.historyEvidence
  ]) {
    assert.ok(item.summary.trim().length > 0, `missing summary for ${item.evidenceId}`);
    assert.ok(item.explanation.trim().length > 0, `missing explanation for ${item.evidenceId}`);
    assert.ok(item.sources.length > 0, `missing sources for ${item.evidenceId}`);
    for (const source of item.sources) {
      assert.ok(source.sourceId.trim().length > 0, `missing sourceId for ${item.evidenceId}`);
      assert.ok(source.sourcePath.trim().length > 0, `missing sourcePath for ${item.evidenceId}`);
      assert.ok(source.label.trim().length > 0, `missing label for ${item.evidenceId}`);
    }
  }
});

test("StoryEvidenceExplanation makes source traces visible to the author", async () => {
  assert.equal(existsSync("src/domainTemplates/storyWorld/evidence/index.ts"), true, "evidence index must exist");
  const { resolveStoryEvidenceBundle } = await import("../../src/domainTemplates/storyWorld/evidence/index.ts");
  const project = createProject();
  const report = analyzeStoryImpactReport(project, createDiscoveryIntent());
  const bundle = resolveStoryEvidenceBundle(project, report);

  assert.deepEqual(bundle.characterEvidence.map((item) => item.impactRef), [
    "character:a-lan:knowledge_change",
    "character:lin-yuan:knowledge_change"
  ]);
  assert.deepEqual(bundle.characterEvidence[0].sources.map((source) => source.sourcePath), [
    "characters.a-lan"
  ]);
  assert.deepEqual(bundle.eventEvidence[0].sources.map((source) => source.sourcePath), [
    "events.event-3",
    "chapters.chapter-3"
  ]);
  assert.deepEqual(bundle.relationshipEvidence.map((item) => item.sources[0].sourcePath), [
    "relationships.a-lan->lin-yuan",
    "relationships.lin-yuan->a-lan"
  ]);
  assert.deepEqual(bundle.worldRuleEvidence.map((item) => item.sources[0].sourcePath), [
    "locations.old-lighthouse",
    "rules.worldRules.潮门不能主动开启"
  ]);
  assert.deepEqual(bundle.historyEvidence.map((item) => item.sources[0].sourcePath), [
    "events.event-3",
    "keyframes.keyframe-2",
    "openLoops.loop-1"
  ]);
});

test("StoryEvidenceProjection turns evidence into non-black-box author explanations", async () => {
  assert.equal(existsSync("src/domainTemplates/storyWorld/evidence/index.ts"), true, "evidence index must exist");
  const { projectStoryEvidenceForAuthor, resolveStoryEvidenceBundle } = await import(
    "../../src/domainTemplates/storyWorld/evidence/index.ts"
  );
  const project = createProject();
  const report = analyzeStoryImpactReport(project, createDiscoveryIntent());
  const projectionA = projectStoryEvidenceForAuthor(resolveStoryEvidenceBundle(project, report));
  const projectionB = projectStoryEvidenceForAuthor(resolveStoryEvidenceBundle(project, report));

  assert.deepEqual(projectionA, projectionB);
  assert.equal(projectionA.version, "world-os-story-evidence-projection-v1");
  assert.equal(projectionA.intentId, "evidence-intent-1");
  assert.equal(projectionA.summary, "7/7 impacts have traceable story evidence.");
  assert.deepEqual(projectionA.sections.map((section) => [section.id, section.title, section.items.length]), [
    ["character", "Character evidence", 2],
    ["event", "Event evidence", 1],
    ["relationship", "Relationship evidence", 2],
    ["world_rule", "World rule evidence", 2],
    ["history", "History evidence", 3]
  ]);
  assert.deepEqual(projectionA.unexplainedImpactRefs, []);

  const projectionText = JSON.stringify(projectionA);
  assert.match(projectionText, /阿岚/);
  assert.match(projectionText, /旧灯塔下层等待作者确认/);
  assert.match(projectionText, /潮门不能主动开启/);
  assert.doesNotMatch(projectionText, /black box|AI said|LLM|model guessed|magic/i);
});


function createProject() {
  return createStoryWorldTemplate().createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
}

function createDiscoveryIntent() {
  return createStoryAuthorIntent({
    id: "evidence-intent-1",
    content: "让林远发现旧灯塔地下室的秘密，但保持潮门不能主动开启。",
    source: "author",
    targetScope: "event",
    createdAtLogical: 41,
    relatedCharacters: ["lin-yuan", "a-lan"],
    relatedEvents: ["event-3"],
    relatedLocations: ["old-lighthouse"]
  });
}

function impactRefsFromReport(report: ReturnType<typeof analyzeStoryImpactReport>): string[] {
  return [
    ...report.affectedCharacters.map((impact) => `character:${impact.characterId}:${impact.category}`),
    ...report.affectedEvents.map((impact) => `event:${impact.eventId}:${impact.category}`),
    ...report.affectedRelationships.map(
      (impact) => `relationship:${impact.sourceId}->${impact.targetId}:${impact.category}`
    ),
    ...report.affectedRules.map((impact) => `world_rule:${impact.rule}:${impact.category}`)
  ].sort();
}

function readSourceTree(root: string): string {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = `${root}/${entry}`;
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return readSourceTree(path);
      }

      return path.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}
