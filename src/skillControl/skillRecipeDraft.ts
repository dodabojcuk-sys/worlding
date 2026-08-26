import type { SkillManifest, SkillPermissions } from "./skillManifest.ts";

export type SkillPortR0 = {
  name: string;
  kind: string;
  required: boolean;
};

export type SkillPackageR0 = {
  skillId: string;
  displayName: string;
  version: string;
  publisher: string;
  source: "builtin" | "local-fixture" | "reviewed-external";
  exactCommitOrDigest: string;
  license: string;
  compatibility: string[];
  inputs: SkillPortR0[];
  outputs: SkillPortR0[];
  requiredPredecessors: string[];
  optionalSuccessors: string[];
  capabilities: string[];
  permissions: SkillPermissions;
  sideEffects: string[];
  modelRequirements: string[];
  estimatedCostClass: "none" | "low" | "medium" | "high";
  trustStatus: "trusted-local" | "review-required" | "blocked";
  installStatus: "present" | "not-installed";
};

export type RecipeDependencyEdgeR0 = { from: string; to: string; required: boolean };
export type RecipeBindingR0 = { fromSkillId: string; fromPort: string; toSkillId: string; toPort: string };

export type RecipeValidationResultR0 = {
  valid: boolean;
  missingDependencies: string[];
  cycleErrors: string[];
  incompatibleVersions: string[];
  ioErrors: string[];
  permissionUnion: SkillPermissions;
};

export type RecipeDraftR0 = {
  version: "tianyan-skill-recipe-draft-r0";
  orderedSkillRefs: string[];
  dependencyEdges: RecipeDependencyEdgeR0[];
  inputOutputBindings: RecipeBindingR0[];
  permissionUnion: SkillPermissions;
  missingDependencies: string[];
  cycleErrors: string[];
  incompatibleVersions: string[];
  authorQuestion: string;
  target: { kind: "tianyi-session" | "nuwa-scenario"; id: string };
  draftRevision: number;
  validation: RecipeValidationResultR0;
};

const emptyPermissions = (): SkillPermissions => ({ readProject: false, writeProject: false, readMemory: false, writeMemory: false, useNetwork: false, useApiKey: false, executeLocalCommand: false });

export function skillPackageFromManifest(manifest: SkillManifest, overrides: Partial<Pick<SkillPackageR0, "inputs" | "outputs" | "requiredPredecessors" | "optionalSuccessors" | "source" | "exactCommitOrDigest" | "license" | "trustStatus" | "installStatus">> = {}): SkillPackageR0 {
  return {
    skillId: manifest.id,
    displayName: manifest.name,
    version: manifest.version,
    publisher: "Tianyan",
    source: overrides.source || "builtin",
    exactCommitOrDigest: overrides.exactCommitOrDigest || "local-manifest",
    license: overrides.license || "project-owned descriptor",
    compatibility: ["story-studio", "tianyi-session", "nuwa-scenario"],
    inputs: overrides.inputs || [{ name: "context", kind: "story-context", required: true }],
    outputs: overrides.outputs || [{ name: "proposal", kind: "author-proposal", required: false }],
    requiredPredecessors: overrides.requiredPredecessors || [],
    optionalSuccessors: overrides.optionalSuccessors || [],
    capabilities: manifest.capabilities.slice(),
    permissions: structuredClone(manifest.permissions),
    sideEffects: ["none; descriptor-only"],
    modelRequirements: [],
    estimatedCostClass: "none",
    trustStatus: overrides.trustStatus || "trusted-local",
    installStatus: overrides.installStatus || "present"
  };
}

export function createRecipeDraft(input: { authorQuestion: string; target: RecipeDraftR0["target"]; skills?: SkillPackageR0[] }): RecipeDraftR0 {
  const orderedSkillRefs = (input.skills || []).map((skill) => skill.skillId);
  const draft = emptyDraft(input.authorQuestion, input.target, orderedSkillRefs);
  return recomputeDraft(draft, input.skills || []);
}

export function addSkillToRecipe(draft: RecipeDraftR0, skill: SkillPackageR0, catalog: SkillPackageR0[] = [skill]): RecipeDraftR0 {
  if (draft.orderedSkillRefs.includes(skill.skillId)) return draft;
  return recomputeDraft({ ...draft, orderedSkillRefs: [...draft.orderedSkillRefs, skill.skillId], draftRevision: draft.draftRevision + 1 }, [...catalog, skill]);
}

export function moveSkillInRecipe(draft: RecipeDraftR0, skillId: string, direction: "up" | "down"): RecipeDraftR0 {
  const index = draft.orderedSkillRefs.indexOf(skillId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= draft.orderedSkillRefs.length) return draft;
  const orderedSkillRefs = draft.orderedSkillRefs.slice();
  [orderedSkillRefs[index], orderedSkillRefs[target]] = [orderedSkillRefs[target], orderedSkillRefs[index]];
  return { ...draft, orderedSkillRefs, draftRevision: draft.draftRevision + 1 };
}

export function removeSkillFromRecipe(draft: RecipeDraftR0, skillId: string): RecipeDraftR0 {
  if (!draft.orderedSkillRefs.includes(skillId)) return draft;
  return { ...draft, orderedSkillRefs: draft.orderedSkillRefs.filter((id) => id !== skillId), draftRevision: draft.draftRevision + 1 };
}

export function validateRecipeDraft(draft: RecipeDraftR0, catalog: SkillPackageR0[]): RecipeValidationResultR0 {
  const byId = new Map(catalog.map((skill) => [skill.skillId, skill]));
  const selected = draft.orderedSkillRefs.map((id) => byId.get(id)).filter((skill): skill is SkillPackageR0 => Boolean(skill));
  const missingDependencies = draft.orderedSkillRefs.filter((id) => !byId.has(id));
  const dependencyEdges: RecipeDependencyEdgeR0[] = [];
  const ioErrors: string[] = [];
  const incompatibleVersions: string[] = [];
  const permissionUnion = emptyPermissions();
  for (const skill of selected) {
    Object.keys(permissionUnion).forEach((key) => { const permission = key as keyof SkillPermissions; permissionUnion[permission] = permissionUnion[permission] || skill.permissions[permission]; });
    for (const predecessor of skill.requiredPredecessors) {
      dependencyEdges.push({ from: predecessor, to: skill.skillId, required: true });
      if (!byId.has(predecessor)) missingDependencies.push(`${skill.skillId}←${predecessor}`);
    }
  }
  for (let index = 1; index < selected.length; index += 1) {
    const previous = selected[index - 1];
    const current = selected[index];
    const sharedPort = current.inputs.find((input) => input.required && previous.outputs.some((output) => output.kind === input.kind));
    if (!sharedPort && current.inputs.some((input) => input.required)) ioErrors.push(`${previous.skillId}→${current.skillId}: 输入输出类型不兼容`);
    if (current.requiredPredecessors.includes(previous.skillId)) dependencyEdges.push({ from: previous.skillId, to: current.skillId, required: true });
    if (current.version.split(".")[0] !== previous.version.split(".")[0]) incompatibleVersions.push(`${previous.skillId}@${previous.version} 与 ${current.skillId}@${current.version}`);
  }
  const cycleErrors = detectCycles([...dependencyEdges, ...draft.dependencyEdges]);
  return { valid: !missingDependencies.length && !cycleErrors.length && !incompatibleVersions.length && !ioErrors.length, missingDependencies: [...new Set(missingDependencies)], cycleErrors, incompatibleVersions, ioErrors, permissionUnion };
}

function emptyDraft(authorQuestion: string, target: RecipeDraftR0["target"], orderedSkillRefs: string[]): RecipeDraftR0 {
  const validation = { valid: true, missingDependencies: [], cycleErrors: [], incompatibleVersions: [], ioErrors: [], permissionUnion: emptyPermissions() };
  return { version: "tianyan-skill-recipe-draft-r0", orderedSkillRefs, dependencyEdges: [], inputOutputBindings: [], permissionUnion: validation.permissionUnion, missingDependencies: [], cycleErrors: [], incompatibleVersions: [], authorQuestion, target, draftRevision: 1, validation };
}

function recomputeDraft(draft: RecipeDraftR0, catalog: SkillPackageR0[]): RecipeDraftR0 {
  const validation = validateRecipeDraft(draft, catalog);
  return { ...draft, permissionUnion: validation.permissionUnion, missingDependencies: validation.missingDependencies, cycleErrors: validation.cycleErrors, incompatibleVersions: validation.incompatibleVersions, validation };
}

function detectCycles(edges: RecipeDependencyEdgeR0[]): string[] {
  const graph = new Map<string, string[]>();
  edges.forEach((edge) => graph.set(edge.from, [...(graph.get(edge.from) || []), edge.to]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[] = [];
  const visit = (node: string, path: string[]) => {
    if (visiting.has(node)) { cycles.push([...path.slice(path.indexOf(node)), node].join(" → ")); return; }
    if (visited.has(node)) return;
    visiting.add(node);
    (graph.get(node) || []).forEach((next) => visit(next, [...path, node]));
    visiting.delete(node);
    visited.add(node);
  };
  graph.forEach((_next, node) => visit(node, []));
  return [...new Set(cycles)];
}
