export const CHARACTER_STATE_PROJECTION_VERSION = "tianyan-character-state-projection/v1" as const;

export type CharacterCognitiveAuthority =
  | "confirmed_knowledge"
  | "belief"
  | "suspicion"
  | "misinformation"
  | "unknown"
  | "contradiction";

export type CharacterStateScope = {
  projectId: string;
  projectVersion: string;
  branchId: string;
  narrativePosition: number;
  worldTime: { kind: "exact" | "relative" | "range" | "unknown"; label: string; sortKey: number | null };
  sceneId: string | null;
  sourceRevision: string;
};

export type CharacterStateEvidence = {
  claimId: string;
  characterId: string;
  category: "physical" | "location" | "possession" | "knowledge" | "belief" | "goal" | "commitment" | "perceived_relation";
  statement: string;
  value: string;
  authority: CharacterCognitiveAuthority | "world_fact" | "author_planned" | "candidate";
  learnedAtEventId: string | null;
  sourceAnchorIds: string[];
  sourceRevision: string;
  branchId: string;
  narrativePosition: number;
  worldTime: CharacterStateScope["worldTime"];
  sceneId: string | null;
  scope: "character_private" | "participants" | "public" | "author_only";
  stale: boolean;
  conflictGroupId: string | null;
  subjectCharacterId?: string | null;
};

export type CharacterStateProjectionInput = {
  character: { id: string; name: string; revision: string };
  scope: CharacterStateScope;
  evidence: CharacterStateEvidence[];
};

export type CharacterStateProjection = CharacterStateScope & {
  version: typeof CHARACTER_STATE_PROJECTION_VERSION;
  characterId: string;
  characterName: string;
  characterRevision: string;
  projectionRevision: string;
  physicalState: CharacterStateEvidence[];
  locationState: CharacterStateEvidence[];
  possessionState: CharacterStateEvidence[];
  knowledgeState: CharacterStateEvidence[];
  beliefState: CharacterStateEvidence[];
  goalState: CharacterStateEvidence[];
  commitmentState: CharacterStateEvidence[];
  perceivedRelationshipState: CharacterStateEvidence[];
  openQuestions: CharacterStateEvidence[];
  conflicts: CharacterStateEvidence[];
  staleSources: CharacterStateEvidence[];
  plannedState: CharacterStateEvidence[];
  candidateState: CharacterStateEvidence[];
  provenance: Array<{ claimId: string; eventId: string | null; sourceAnchorIds: string[]; sourceRevision: string }>;
};

export type KnowledgeBoundaryClaim = {
  claimId: string;
  characterId: string;
  statement: string;
  assertedAs: "world_fact" | "character_knowledge" | "belief";
  sourceClaimId: string | null;
  branchId: string;
  narrativePosition: number;
};

export type KnowledgeBoundaryFinding = {
  claimId: string;
  outcome: "verified" | "author_judgment" | "missing_evidence" | "boundary_violation" | "source_conflict" | "stale_source";
  reason: string;
  sourceAnchorIds: string[];
};

export type KnowledgeBoundaryReceipt = {
  version: "tianyan-character-knowledge-boundary-receipt/v1";
  tool: "validate_character_knowledge_boundary";
  classification: "read";
  owner: "CharacterStateProjectionPort";
  receiptId: string;
  findings: KnowledgeBoundaryFinding[];
  writes: 0;
  providerCalls: 0;
};

export const CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION = {
  name: "validate_character_knowledge_boundary",
  authorFacingLabel: "检查角色知识边界",
  classification: "read",
  inputSchema: {
    type: "object",
    required: ["projection", "claims"],
    properties: {
      projection: { type: "CharacterStateProjection" },
      claims: { type: "KnowledgeBoundaryClaim[]" }
    }
  },
  outputSchema: { type: "KnowledgeBoundaryReceipt", outcomes: ["verified", "author_judgment", "missing_evidence", "boundary_violation", "source_conflict", "stale_source"] },
  owner: "CharacterStateProjectionPort",
  scope: "project + branch + narrative position + world time + character",
  timeoutMs: 2_000,
  idempotency: "same projection revision and claims produce the same receipt",
  receipt: "tianyan-character-knowledge-boundary-receipt/v1",
  failureBehavior: "fail closed with missing evidence, boundary violation, conflict, or stale source"
} as const;

export interface CharacterStateProjectionPort {
  projectCharacterState(input: CharacterStateProjectionInput): CharacterStateProjection;
  projectCharacterKnowledge(input: CharacterStateProjectionInput): CharacterStateEvidence[];
  compareCharacterStates(before: CharacterStateProjection, after: CharacterStateProjection): CharacterStateDifference[];
  explainStateTransition(before: CharacterStateProjection, after: CharacterStateProjection): string[];
  validateKnowledgeBoundary(projection: CharacterStateProjection, claims: KnowledgeBoundaryClaim[]): KnowledgeBoundaryReceipt;
  listUnsupportedClaims(projection: CharacterStateProjection): CharacterStateEvidence[];
  getProjectionProvenance(projection: CharacterStateProjection): CharacterStateProjection["provenance"];
}

export type CharacterStateDifference = { claimId: string; category: CharacterStateEvidence["category"]; before: string | null; after: string | null; eventId: string | null; authority: CharacterStateEvidence["authority"] };

export function createCharacterStateProjectionPort(): CharacterStateProjectionPort {
  return {
    projectCharacterState,
    projectCharacterKnowledge: (input) => projectCharacterState(input).knowledgeState,
    compareCharacterStates,
    explainStateTransition,
    validateKnowledgeBoundary,
    listUnsupportedClaims: (projection) => [...projection.openQuestions, ...projection.conflicts, ...projection.staleSources],
    getProjectionProvenance: (projection) => structuredClone(projection.provenance)
  };
}

export function projectCharacterState(input: CharacterStateProjectionInput): CharacterStateProjection {
  const scoped = input.evidence
    .filter((item) => item.characterId === input.character.id && item.branchId === input.scope.branchId)
    .filter((item) => item.narrativePosition <= input.scope.narrativePosition)
    .filter((item) => item.worldTime.sortKey === null || input.scope.worldTime.sortKey === null || item.worldTime.sortKey <= input.scope.worldTime.sortKey)
    .filter((item) => item.sceneId === null || input.scope.sceneId === null || item.sceneId === input.scope.sceneId)
    .sort(compareEvidence);
  const current = scoped.filter((item) => !item.stale && item.sourceAnchorIds.length > 0);
  const ordinary = current.filter((item) => item.authority !== "author_planned" && item.authority !== "candidate");
  const byCategory = (category: CharacterStateEvidence["category"]) => ordinary.filter((item) => item.category === category);
  const openQuestions = scoped.filter((item) => item.authority === "unknown" || item.sourceAnchorIds.length === 0);
  const conflicts = current.filter((item) => item.authority === "contradiction" || item.conflictGroupId !== null);
  const staleSources = scoped.filter((item) => item.stale);
  const projectionBase = {
    version: CHARACTER_STATE_PROJECTION_VERSION,
    ...input.scope,
    characterId: input.character.id,
    characterName: input.character.name,
    characterRevision: input.character.revision,
    physicalState: byCategory("physical"),
    locationState: byCategory("location"),
    possessionState: byCategory("possession"),
    knowledgeState: byCategory("knowledge").filter((item) => item.authority === "confirmed_knowledge"),
    beliefState: [...byCategory("belief"), ...byCategory("knowledge").filter((item) => item.authority === "belief" || item.authority === "suspicion" || item.authority === "misinformation")],
    goalState: byCategory("goal"),
    commitmentState: byCategory("commitment"),
    perceivedRelationshipState: byCategory("perceived_relation"),
    openQuestions,
    conflicts,
    staleSources,
    plannedState: current.filter((item) => item.authority === "author_planned"),
    candidateState: current.filter((item) => item.authority === "candidate"),
    provenance: scoped.map((item) => ({ claimId: item.claimId, eventId: item.learnedAtEventId, sourceAnchorIds: [...item.sourceAnchorIds], sourceRevision: item.sourceRevision }))
  };
  return { ...projectionBase, projectionRevision: stableDigest(projectionBase) };
}

export function compareCharacterStates(before: CharacterStateProjection, after: CharacterStateProjection): CharacterStateDifference[] {
  assertComparable(before, after);
  const beforeMap = new Map(allCurrent(before).map((item) => [item.claimId, item]));
  const afterMap = new Map(allCurrent(after).map((item) => [item.claimId, item]));
  return [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort().flatMap((claimId) => {
    const left = beforeMap.get(claimId);
    const right = afterMap.get(claimId);
    if (left?.value === right?.value && left?.authority === right?.authority) return [];
    const item = right || left!;
    return [{ claimId, category: item.category, before: left?.value ?? null, after: right?.value ?? null, eventId: right?.learnedAtEventId ?? left?.learnedAtEventId ?? null, authority: right?.authority ?? left!.authority }];
  });
}

export function explainStateTransition(before: CharacterStateProjection, after: CharacterStateProjection): string[] {
  return compareCharacterStates(before, after).map((item) => `${categoryLabel(item.category)}：${item.before ?? "未知"} → ${item.after ?? "不再有效"}${item.eventId ? `；由事件 ${item.eventId} 形成` : "；缺少事件依据"}`);
}

export function validateKnowledgeBoundary(projection: CharacterStateProjection, claims: KnowledgeBoundaryClaim[]): KnowledgeBoundaryReceipt {
  const evidence = new Map([...allCurrent(projection), ...projection.openQuestions, ...projection.conflicts, ...projection.staleSources].map((item) => [item.claimId, item]));
  const findings = claims.map((claim): KnowledgeBoundaryFinding => {
    if (claim.characterId !== projection.characterId || claim.branchId !== projection.branchId || claim.narrativePosition > projection.narrativePosition) return finding(claim, "boundary_violation", "混入了另一角色、分支或未来叙事位置的信息。", []);
    if (!claim.sourceClaimId) return finding(claim, "missing_evidence", "缺少可追溯的来源锚点。", []);
    const source = evidence.get(claim.sourceClaimId);
    if (!source || source.sourceAnchorIds.length === 0) return finding(claim, "missing_evidence", "没有证据证明角色在当前范围内知道这件事。", []);
    if (source.stale) return finding(claim, "stale_source", "来源版本已变化，旧结论不能作为当前知识。", source.sourceAnchorIds);
    if (source.conflictGroupId || source.authority === "contradiction") return finding(claim, "source_conflict", "当前存在两份互相矛盾的有效来源。", source.sourceAnchorIds);
    if (source.scope === "author_only" || (source.subjectCharacterId && source.subjectCharacterId !== projection.characterId)) return finding(claim, "boundary_violation", "把作者全知或另一角色的秘密错误地共享给了当前角色。", source.sourceAnchorIds);
    if (claim.assertedAs === "world_fact" && ["belief", "suspicion", "misinformation", "unknown"].includes(source.authority)) return finding(claim, "boundary_violation", "信念、怀疑或错误信息不能冒充世界事实。", source.sourceAnchorIds);
    if (source.authority === "belief" || source.authority === "suspicion") return finding(claim, "author_judgment", "这是角色的相信或怀疑，需要作者判断，不能升级为事实。", source.sourceAnchorIds);
    return finding(claim, "verified", "来源、分支与叙事位置均支持该角色在当前范围内知道此事。", source.sourceAnchorIds);
  });
  return { version: "tianyan-character-knowledge-boundary-receipt/v1", tool: "validate_character_knowledge_boundary", classification: "read", owner: "CharacterStateProjectionPort", receiptId: `knowledge-boundary-${stableDigest({ projectionRevision: projection.projectionRevision, claims })}`, findings, writes: 0, providerCalls: 0 };
}

function allCurrent(projection: CharacterStateProjection): CharacterStateEvidence[] {
  return [projection.physicalState, projection.locationState, projection.possessionState, projection.knowledgeState, projection.beliefState, projection.goalState, projection.commitmentState, projection.perceivedRelationshipState, projection.plannedState, projection.candidateState].flat();
}

function compareEvidence(left: CharacterStateEvidence, right: CharacterStateEvidence): number { return left.narrativePosition - right.narrativePosition || left.claimId.localeCompare(right.claimId); }
function assertComparable(left: CharacterStateProjection, right: CharacterStateProjection) { if (left.projectId !== right.projectId || left.characterId !== right.characterId || left.branchId !== right.branchId) throw new Error("Character State projections must share project, character and branch."); }
function finding(claim: KnowledgeBoundaryClaim, outcome: KnowledgeBoundaryFinding["outcome"], reason: string, sourceAnchorIds: string[]): KnowledgeBoundaryFinding { return { claimId: claim.claimId, outcome, reason, sourceAnchorIds: [...sourceAnchorIds] }; }
function categoryLabel(value: CharacterStateEvidence["category"]): string { return ({ physical: "身体状态", location: "所在位置", possession: "持有物", knowledge: "已知内容", belief: "相信或怀疑", goal: "目标", commitment: "承诺", perceived_relation: "关系认知" } as const)[value]; }
function stableDigest(value: unknown): string { const text = JSON.stringify(sortValue(value)); let hash = 2_166_136_261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16_777_619); } return (hash >>> 0).toString(16).padStart(8, "0"); }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)])); return value; }
