import { createMemoryPalaceSkill } from "../memorySkills/memoryPalaceSkill.ts";
import type { MemoryEntry, MemoryEntryKind, MemorySkillAdapter } from "../memorySkills/memorySkillContract.ts";
import { createDefaultSkillBudget, estimateSkillRunCost, type SkillBudget } from "../skillControl/skillBudget.ts";
import { createDefaultSkillPolicy, resolveEnabledSkills, type SkillPolicy } from "../skillControl/skillPolicy.ts";
import { createDefaultSkillRegistry, getSkillManifest, type SkillRegistry } from "../skillControl/skillRegistry.ts";
import type { SkillToggle } from "../skillControl/skillToggle.ts";
import {
  STORY_MEMORY_RECALL_LIMITS,
  STORY_MEMORY_RECALL_SKILL_ID
} from "../skillControl/storyMemoryRecallSkillManifest.ts";
import {
  createDefaultPluginRegistry,
  createSkillRuntime,
  type SkillExecutionResult,
  type SkillPlugin,
  type SkillPluginRegistry
} from "./skillRuntime.ts";

export type StoryMemoryRecallStatus =
  | "available"
  | "disabled"
  | "policy-denied"
  | "budget-blocked"
  | "plugin-unavailable"
  | "execution-failed"
  | "invalid-context"
  | "invalid-reference"
  | "completed";

export type StoryMemoryRecallAllowedReference = {
  evidenceId: string;
  noteId: string;
  relativePath: string;
  title: string;
  excerpt: string;
  noteType: string;
};

export type StoryMemoryRecallInput = {
  operationId: string;
  nuwaTaskId: string;
  projectId: string;
  chapterId?: string;
  sceneId?: string;
  query: string;
  taskPurpose: string;
  allowedReferences: StoryMemoryRecallAllowedReference[];
  openThreadIds: string[];
  lockedRuleIds: string[];
};

export type StoryMemoryRecallReference = StoryMemoryRecallAllowedReference & {
  rank: number;
  matchReason: string;
};

export type StoryMemoryRecallPluginOutput = {
  status: "completed" | "invalid-reference";
  query: string;
  references: StoryMemoryRecallReference[];
  excludedReferenceCount: number;
  rejectedReferenceCount: number;
  limits: typeof STORY_MEMORY_RECALL_LIMITS;
};

export type StoryMemoryRecallCapabilityResult = {
  status: StoryMemoryRecallStatus;
  operationId: string;
  query: string;
  references: StoryMemoryRecallReference[];
  excludedReferenceCount: number;
  rejectedReferenceCount: number;
  limits: typeof STORY_MEMORY_RECALL_LIMITS;
  control: {
    installed: boolean;
    enabled: boolean;
    policy: "allowed" | "denied" | "not-evaluated";
    budget: "allowed" | "blocked" | "not-evaluated";
    manifestVersion: string;
    domain: string;
    writeAuthority: "none";
    networkAuthority: "none";
  };
  execution?: SkillExecutionResult;
  diagnostic?: string;
};

export type ExecuteStoryMemoryRecallInput = {
  request: StoryMemoryRecallInput;
  skillRegistry?: SkillRegistry;
  pluginRegistry?: SkillPluginRegistry;
  policy?: SkillPolicy;
  budget?: SkillBudget;
  toggles?: SkillToggle[];
  memoryAdapterFactory?: (entries: MemoryEntry[]) => MemorySkillAdapter;
};

const DEFAULT_TOGGLE: SkillToggle = {
  skillId: STORY_MEMORY_RECALL_SKILL_ID,
  state: "active",
  priority: 10,
  fallbackSkillIds: [],
  modeVisibility: "all"
};

export function createStoryMemoryRecallSkillPlugin(input: {
  memoryAdapterFactory?: (entries: MemoryEntry[]) => MemorySkillAdapter;
} = {}): SkillPlugin {
  return {
    id: STORY_MEMORY_RECALL_SKILL_ID,
    manifest: {
      name: "Story Memory Recall",
      version: "1.0.0",
      domain: "retrieval"
    },
    entry(rawInput, context): StoryMemoryRecallPluginOutput {
      const request = parseStoryMemoryRecallInput(rawInput);
      assertReadOnlySandbox(context.capabilities);
      const allowedByKey = new Map(request.allowedReferences.map((reference) => [referenceKey(reference), reference]));
      const entries = request.allowedReferences.map((reference, index) => toMemoryEntry(request, reference, index));
      const memory = (input.memoryAdapterFactory ?? ((initialEntries) => createMemoryPalaceSkill({ entries: initialEntries })))(entries);
      const recall = memory.searchMemory({
        projectId: request.projectId,
        query: recallQuery(request.query),
        limit: STORY_MEMORY_RECALL_LIMITS.maxReferences
      });
      const references: StoryMemoryRecallReference[] = [];
      let rejectedReferenceCount = 0;

      for (const hit of recall.results.slice(0, STORY_MEMORY_RECALL_LIMITS.maxReferences)) {
        const metadata = hit.entry.metadata;
        const candidate = {
          evidenceId: readMetadataText(metadata, "evidenceId"),
          noteId: readMetadataText(metadata, "noteId"),
          relativePath: hit.entry.sourceRef,
          title: readMetadataText(metadata, "title"),
          excerpt: hit.entry.text,
          noteType: readMetadataText(metadata, "noteType")
        };
        const allowed = allowedByKey.get(referenceKey(candidate));
        if (!allowed || allowed.excerpt !== candidate.excerpt || allowed.title !== candidate.title || allowed.noteType !== candidate.noteType) {
          rejectedReferenceCount += 1;
          continue;
        }
        references.push({
          ...structuredClone(allowed),
          excerpt: allowed.excerpt.slice(0, STORY_MEMORY_RECALL_LIMITS.maxExcerptChars),
          rank: references.length + 1,
          matchReason: [...hit.matchedBy].sort().join("+") || "project"
        });
      }

      return {
        status: rejectedReferenceCount > 0 ? "invalid-reference" : "completed",
        query: request.query,
        references,
        excludedReferenceCount: Math.max(0, request.allowedReferences.length - references.length),
        rejectedReferenceCount,
        limits: STORY_MEMORY_RECALL_LIMITS
      };
    }
  };
}

export async function executeStoryMemoryRecallSkill(
  input: ExecuteStoryMemoryRecallInput
): Promise<StoryMemoryRecallCapabilityResult> {
  const skillRegistry = input.skillRegistry ?? createDefaultSkillRegistry();
  const pluginRegistry = input.pluginRegistry ?? createDefaultPluginRegistry();
  const policy = input.policy ?? createDefaultSkillPolicy();
  const budget = input.budget ?? createDefaultSkillBudget();
  const toggles = input.toggles ?? [DEFAULT_TOGGLE];
  let manifestVersion = "unknown";
  let domain = "retrieval";

  try {
    const manifest = getSkillManifest(skillRegistry, STORY_MEMORY_RECALL_SKILL_ID);
    manifestVersion = manifest.version;
    domain = manifest.domain;
    if (!isReadOnlyRecallManifest(manifest)) {
      return capabilityResult(input.request, "policy-denied", {
        manifestVersion,
        domain,
        policy: "denied",
        diagnostic: "The manifest requests authority outside read-only local recall."
      });
    }
  } catch {
    return capabilityResult(input.request, "plugin-unavailable", {
      manifestVersion,
      domain,
      diagnostic: "The canonical Skill manifest is unavailable."
    });
  }

  const installed = pluginRegistry.installed.find((item) => item.id === STORY_MEMORY_RECALL_SKILL_ID);
  if (!installed || !installed.enabled) {
    return capabilityResult(input.request, "plugin-unavailable", {
      manifestVersion,
      domain,
      installed: Boolean(installed),
      enabled: Boolean(installed?.enabled),
      diagnostic: "The built-in local plugin is unavailable."
    });
  }

  const toggle = toggles.find((item) => item.skillId === STORY_MEMORY_RECALL_SKILL_ID);
  if (!toggle || toggle.state !== "active") {
    return capabilityResult(input.request, "disabled", {
      manifestVersion,
      domain,
      installed: true,
      enabled: false,
      diagnostic: "Memory recall is disabled by the current Skill toggle."
    });
  }

  const resolved = resolveEnabledSkills({
    registry: skillRegistry,
    policy,
    toggles,
    domain: "retrieval",
    mode: "compiler",
    operation: "read"
  }).find((item) => item.skillId === STORY_MEMORY_RECALL_SKILL_ID && item.state === "active" && item.canRead);
  if (!resolved) {
    return capabilityResult(input.request, "policy-denied", {
      manifestVersion,
      domain,
      installed: true,
      enabled: true,
      policy: "denied",
      diagnostic: "Skill Control denied local recall under the current policy."
    });
  }

  let request: StoryMemoryRecallInput;
  try {
    request = parseStoryMemoryRecallInput(input.request as unknown as Record<string, unknown>);
  } catch (error) {
    return capabilityResult(input.request, "invalid-context", {
      manifestVersion,
      domain,
      installed: true,
      enabled: true,
      policy: "allowed",
      diagnostic: error instanceof Error ? error.message : String(error)
    });
  }

  const estimate = estimateSkillRunCost(budget, STORY_MEMORY_RECALL_SKILL_ID, {
    inputTokens: estimateTokens(request),
    outputTokens: Math.ceil((STORY_MEMORY_RECALL_LIMITS.maxReferences * STORY_MEMORY_RECALL_LIMITS.maxExcerptChars) / 4),
    calls: 1
  });
  if (!estimate.allowed) {
    return capabilityResult(request, "budget-blocked", {
      manifestVersion,
      domain,
      installed: true,
      enabled: true,
      policy: "allowed",
      budget: "blocked",
      diagnostic: `Skill budget blocked recall: ${estimate.violations.join(", ")}.`
    });
  }

  const plugin = createStoryMemoryRecallSkillPlugin({ memoryAdapterFactory: input.memoryAdapterFactory });
  const runtime = createSkillRuntime({
    pluginRegistry,
    catalog: { [STORY_MEMORY_RECALL_SKILL_ID]: plugin },
    skillRegistry,
    policy,
    toggles
  });
  const execution = await runtime.run({
    pluginId: STORY_MEMORY_RECALL_SKILL_ID,
    input: request as unknown as Record<string, unknown>,
    runtimeContext: { mode: "simple" }
  });
  if (!execution.ok || !execution.output || !isPluginOutput(execution.output.value)) {
    return capabilityResult(request, "execution-failed", {
      manifestVersion,
      domain,
      installed: true,
      enabled: true,
      policy: "allowed",
      budget: "allowed",
      execution,
      diagnostic: execution.error?.message ?? "Skill Runtime returned an invalid normalized output."
    });
  }

  const output = structuredClone(execution.output.value);
  return {
    status: output.status,
    operationId: request.operationId,
    query: output.query,
    references: output.references,
    excludedReferenceCount: output.excludedReferenceCount,
    rejectedReferenceCount: output.rejectedReferenceCount,
    limits: output.limits,
    control: {
      installed: true,
      enabled: true,
      policy: "allowed",
      budget: "allowed",
      manifestVersion,
      domain,
      writeAuthority: "none",
      networkAuthority: "none"
    },
    execution
  };
}

export function projectStoryMemoryRecallForProduct(result: StoryMemoryRecallCapabilityResult): {
  status: StoryMemoryRecallStatus;
  copy: string;
  returnedReferenceCount: number;
} {
  const count = result.references.length;
  if (result.status === "completed") {
    return { status: result.status, copy: `证据召回：已从当前故事资料中找到 ${count} 条可核验来源。`, returnedReferenceCount: count };
  }
  if (result.status === "disabled") {
    return { status: result.status, copy: "证据召回：未启用额外资料召回。", returnedReferenceCount: 0 };
  }
  if (result.status === "budget-blocked") {
    return { status: result.status, copy: "证据召回：本次未执行额外资料召回。", returnedReferenceCount: 0 };
  }
  return { status: result.status, copy: "证据召回：部分资料未参与本次核验。", returnedReferenceCount: count };
}

export function projectStoryMemoryRecallForCompiler(result: StoryMemoryRecallCapabilityResult) {
  return {
    capability: STORY_MEMORY_RECALL_SKILL_ID,
    manifest: { version: result.control.manifestVersion, domain: result.control.domain },
    installed: result.control.installed,
    enabled: result.control.enabled,
    policy: result.control.policy,
    budget: result.control.budget,
    plugin: "built-in local deterministic",
    task: "evidence-critic",
    runStatus: result.status,
    returnedReferences: result.references.length,
    rejectedReferences: result.rejectedReferenceCount,
    excludedReferences: result.excludedReferenceCount,
    limits: structuredClone(result.limits),
    writeAuthority: result.control.writeAuthority,
    networkAuthority: result.control.networkAuthority,
    traceCorrelation: result.operationId
  };
}

function capabilityResult(
  request: StoryMemoryRecallInput,
  status: StoryMemoryRecallStatus,
  overrides: Partial<StoryMemoryRecallCapabilityResult["control"]> & {
    diagnostic?: string;
    execution?: SkillExecutionResult;
  }
): StoryMemoryRecallCapabilityResult {
  return {
    status,
    operationId: typeof request.operationId === "string" ? request.operationId : "unavailable",
    query: typeof request.query === "string" ? request.query : "",
    references: [],
    excludedReferenceCount: Array.isArray(request.allowedReferences) ? request.allowedReferences.length : 0,
    rejectedReferenceCount: 0,
    limits: STORY_MEMORY_RECALL_LIMITS,
    control: {
      installed: overrides.installed ?? false,
      enabled: overrides.enabled ?? false,
      policy: overrides.policy ?? "not-evaluated",
      budget: overrides.budget ?? "not-evaluated",
      manifestVersion: overrides.manifestVersion ?? "unknown",
      domain: overrides.domain ?? "retrieval",
      writeAuthority: "none",
      networkAuthority: "none"
    },
    ...(overrides.execution ? { execution: overrides.execution } : {}),
    ...(overrides.diagnostic ? { diagnostic: overrides.diagnostic } : {})
  };
}

function parseStoryMemoryRecallInput(input: Record<string, unknown>): StoryMemoryRecallInput {
  const operationId = requiredText(input.operationId, "operationId");
  const nuwaTaskId = requiredText(input.nuwaTaskId, "nuwaTaskId");
  const projectId = requiredText(input.projectId, "projectId");
  const query = requiredText(input.query, "query");
  const taskPurpose = requiredText(input.taskPurpose, "taskPurpose");
  const allowedReferences = input.allowedReferences;
  if (!Array.isArray(allowedReferences) || allowedReferences.length > 32) {
    throw new Error("allowedReferences must be a bounded array.");
  }
  const parsed = allowedReferences.map((reference, index) => parseAllowedReference(reference, index));
  if (!Array.isArray(input.openThreadIds) || !input.openThreadIds.every((item) => typeof item === "string")) {
    throw new Error("openThreadIds must be a string array.");
  }
  if (!Array.isArray(input.lockedRuleIds) || !input.lockedRuleIds.every((item) => typeof item === "string")) {
    throw new Error("lockedRuleIds must be a string array.");
  }
  return {
    operationId,
    nuwaTaskId,
    projectId,
    ...(typeof input.chapterId === "string" && input.chapterId ? { chapterId: input.chapterId } : {}),
    ...(typeof input.sceneId === "string" && input.sceneId ? { sceneId: input.sceneId } : {}),
    query,
    taskPurpose,
    allowedReferences: parsed,
    openThreadIds: [...input.openThreadIds].sort(),
    lockedRuleIds: [...input.lockedRuleIds].sort()
  };
}

function parseAllowedReference(value: unknown, index: number): StoryMemoryRecallAllowedReference {
  if (!isRecord(value)) throw new Error(`allowedReferences[${index}] must be an object.`);
  const relativePath = requiredText(value.relativePath, `allowedReferences[${index}].relativePath`);
  if (relativePath.startsWith("/") || relativePath.split(/[\\/]+/).includes("..")) {
    throw new Error(`allowedReferences[${index}] has an unsafe path.`);
  }
  const excerpt = requiredText(value.excerpt, `allowedReferences[${index}].excerpt`);
  if (excerpt.length > 2_000) throw new Error(`allowedReferences[${index}] excerpt is too large.`);
  return {
    evidenceId: requiredText(value.evidenceId, `allowedReferences[${index}].evidenceId`),
    noteId: requiredText(value.noteId, `allowedReferences[${index}].noteId`),
    relativePath,
    title: requiredText(value.title, `allowedReferences[${index}].title`),
    excerpt,
    noteType: requiredText(value.noteType, `allowedReferences[${index}].noteType`)
  };
}

function toMemoryEntry(
  request: StoryMemoryRecallInput,
  reference: StoryMemoryRecallAllowedReference,
  index: number
): MemoryEntry {
  return {
    id: `story-recall-${String(index + 1).padStart(3, "0")}`,
    projectId: request.projectId,
    chapterId: request.chapterId,
    sourceRef: reference.relativePath,
    kind: memoryKind(reference.noteType),
    text: reference.excerpt,
    tags: [...new Set([reference.noteType, ...queryTerms(reference.title)])].sort(),
    importance: 1,
    createdAt: "1970-01-01T00:00:00.000Z",
    metadata: {
      evidenceId: reference.evidenceId,
      noteId: reference.noteId,
      title: reference.title,
      noteType: reference.noteType
    }
  };
}

function recallQuery(query: string): string {
  const terms = queryTerms(query);
  return terms.length > 0 ? terms.join(" ") : query;
}

function queryTerms(value: string): string[] {
  const terms = new Set<string>();
  for (const word of value.toLocaleLowerCase().match(/[a-z0-9_-]{2,}/g) ?? []) terms.add(word);
  for (const segment of value.match(/[\p{Script=Han}]+/gu) ?? []) {
    if (segment.length === 1) terms.add(segment);
    for (let index = 0; index < segment.length - 1; index += 1) terms.add(segment.slice(index, index + 2));
  }
  return [...terms].sort().slice(0, 24);
}

function memoryKind(noteType: string): MemoryEntryKind {
  if (noteType === "character") return "character_state";
  if (noteType === "rule") return "world_rule";
  if (noteType === "thread") return "open_loop";
  if (noteType === "event" || noteType === "chapter" || noteType === "scene") return "timeline";
  return "story_fact";
}

function referenceKey(reference: Pick<StoryMemoryRecallAllowedReference, "evidenceId" | "noteId" | "relativePath">): string {
  return `${reference.evidenceId}|${reference.noteId}|${reference.relativePath}`;
}

function readMetadataText(metadata: Record<string, unknown>, key: string): string {
  return typeof metadata[key] === "string" ? metadata[key] : "";
}

function requiredText(value: unknown, name: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name} is required.`);
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPluginOutput(value: unknown): value is StoryMemoryRecallPluginOutput {
  return isRecord(value)
    && (value.status === "completed" || value.status === "invalid-reference")
    && typeof value.query === "string"
    && Array.isArray(value.references)
    && typeof value.excludedReferenceCount === "number"
    && typeof value.rejectedReferenceCount === "number";
}

function isReadOnlyRecallManifest(manifest: ReturnType<typeof getSkillManifest>): boolean {
  return manifest.adapterStatus === "executable"
    && manifest.providerType === "builtin"
    && manifest.permissions.readProject
    && manifest.permissions.readMemory
    && !manifest.permissions.writeProject
    && !manifest.permissions.writeMemory
    && !manifest.permissions.useNetwork
    && !manifest.permissions.useApiKey
    && !manifest.permissions.executeLocalCommand;
}

function assertReadOnlySandbox(capabilities: {
  externalAccess: false;
  workspaceWrite: false;
}): void {
  if (capabilities.externalAccess !== false || capabilities.workspaceWrite !== false) {
    throw new Error("Story memory recall requires a read-only local Skill sandbox.");
  }
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}
