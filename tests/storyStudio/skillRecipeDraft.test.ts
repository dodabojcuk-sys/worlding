import assert from "node:assert/strict";
import test from "node:test";

import {
  addSkillToRecipe,
  createRecipeDraft,
  removeSkillFromRecipe,
  skillPackageFromManifest,
  validateRecipeDraft,
  type SkillPackageR0
} from "../../src/skillControl/skillRecipeDraft.ts";

const permissions = { readProject: true, writeProject: false, readMemory: false, writeMemory: false, useNetwork: false, useApiKey: false, executeLocalCommand: false };
const first: SkillPackageR0 = { skillId: "fixture.read", displayName: "读取上下文", version: "1.0.0", publisher: "fixture", source: "local-fixture", exactCommitOrDigest: "fixture", license: "MIT", compatibility: ["story-studio"], inputs: [{ name: "question", kind: "author-question", required: true }], outputs: [{ name: "context", kind: "story-context", required: true }], requiredPredecessors: [], optionalSuccessors: ["fixture.review"], capabilities: ["read"], permissions, sideEffects: ["none"], modelRequirements: [], estimatedCostClass: "none", trustStatus: "trusted-local", installStatus: "present" };
const second: SkillPackageR0 = { ...first, skillId: "fixture.review", displayName: "生成建议", requiredPredecessors: ["fixture.read"], inputs: [{ name: "context", kind: "story-context", required: true }], outputs: [{ name: "proposal", kind: "author-proposal", required: false }] };

test("recipe draft validates dependency, I/O, and permission union without execution", () => {
  const draft = createRecipeDraft({ authorQuestion: "检查人物动机", target: { kind: "tianyi-session", id: "session.fixture" }, skills: [first, second] });
  assert.equal(draft.validation.valid, true);
  assert.deepEqual(draft.permissionUnion, permissions);
  assert.deepEqual(draft.orderedSkillRefs, ["fixture.read", "fixture.review"]);
  assert.equal(draft.draftRevision, 1);
});
test("recipe draft rejects missing dependencies, cycles, and incompatible I/O", () => {
  const cycleA = { ...first, skillId: "cycle.a", requiredPredecessors: ["cycle.b"] };
  const cycleB = { ...second, skillId: "cycle.b", requiredPredecessors: ["cycle.a"], inputs: [{ name: "other", kind: "other", required: true }] };
  const draft = createRecipeDraft({ authorQuestion: "测试", target: { kind: "nuwa-scenario", id: "scenario.fixture" }, skills: [cycleA, cycleB] });
  const result = validateRecipeDraft(draft, [cycleA, cycleB]);
  assert.equal(result.valid, false);
  assert.ok(result.cycleErrors.length > 0);
  assert.ok(result.ioErrors.length > 0);
  const missing = validateRecipeDraft({ ...draft, orderedSkillRefs: ["missing.skill"] }, [first]);
  assert.ok(missing.missingDependencies.includes("missing.skill"));
});

test("recipe operations are structural drafts and never expose an execution method", () => {
  const draft = createRecipeDraft({ authorQuestion: "检查", target: { kind: "tianyi-session", id: "s" } });
  const withSkill = addSkillToRecipe(draft, skillPackageFromManifest({ id: "fixture", name: "Fixture", domain: "analysis", providerType: "builtin", description: "fixture", version: "1.0.0", adapterStatus: "descriptor_only", capabilities: [], entrypoints: [], permissions, defaultEnabled: false, userConfigurable: true }));
  assert.deepEqual(Object.keys(withSkill).sort(), ["authorQuestion", "cycleErrors", "dependencyEdges", "draftRevision", "incompatibleVersions", "inputOutputBindings", "missingDependencies", "orderedSkillRefs", "permissionUnion", "target", "validation", "version"].sort());
  assert.equal("execute" in withSkill, false);
  assert.deepEqual(removeSkillFromRecipe(withSkill, "fixture").orderedSkillRefs, []);
});
