import { createPredictionBranch, fallbackPredictionProposals } from "./storyPredictionBundle.ts";
import type {
  NuwaAgentResult,
  NuwaBranchProposal,
  NuwaDisagreement,
  NuwaEvidenceReference,
  NuwaFinding,
  NuwaPlan,
  StoryPredictionBundle,
  StorySnapshot
} from "./storyIntelligenceTypes.ts";

export function synthesizeNuwaResults(input: {
  plan: NuwaPlan;
  snapshot: StorySnapshot;
  results: NuwaAgentResult[];
}): StoryPredictionBundle {
  if (input.plan.snapshotHash !== input.snapshot.snapshotHash) {
    throw new Error("Nuwa synthesis rejected a stale plan snapshot.");
  }

  const results = input.results.map((result) => validateNuwaAgentResult(result, input.plan, input.snapshot));
  const resultRoles = new Set(results.map((result) => result.role));
  const missingRequiredRoles = input.plan.tasks
    .filter((task) => task.requirement === "required" && !resultRoles.has(task.role))
    .map((task) => task.role);
  const missingOptionalRoles = input.plan.tasks
    .filter((task) => task.requirement === "optional" && !resultRoles.has(task.role))
    .map((task) => task.role);
  if (missingRequiredRoles.length > 0) {
    throw new Error(`Nuwa synthesis requires validated results for: ${missingRequiredRoles.join(", ")}.`);
  }
  const proposals = mergeEquivalentProposals(results.flatMap((result) => result.proposedBranches));
  const completedProposals = (proposals.length > 0
    ? proposals
    : fallbackPredictionProposals({
      authorGoal: input.plan.authorGoal,
      snapshot: input.snapshot,
      existingStrategies: proposals.map((proposal) => proposal.strategy)
    }).slice(0, 1))
    .slice(0, input.plan.budget.maxBundleBranches);
  const evidence = uniqueEvidence(results.flatMap((result) => result.evidence));
  const branches = completedProposals
    .map((proposal) => createPredictionBranch({ proposal, sourceResults: results, snapshot: input.snapshot }))
    .sort((left, right) => left.strategy.localeCompare(right.strategy) || left.id.localeCompare(right.id));

  if (branches.length < 1 || branches.length > 5) {
    throw new Error("Nuwa synthesis must expose between one and five distinct candidate paths.");
  }

  return {
    version: "world-os-story-prediction-bundle-v1",
    runId: input.plan.runId,
    snapshotHash: input.snapshot.snapshotHash,
    authorGoal: input.plan.authorGoal,
    branches,
    sharedEvidence: evidence,
    disagreements: detectDisagreements(results.flatMap((result) => result.findings)),
    unsupportedAssumptions: [...new Set(results.flatMap((result) => result.unsupportedAssumptions))].sort(),
    authorDecisionRequired: true,
    runnerLabel: input.plan.runner === "deterministic" ? "本地规则推演" : "外部结果待核验",
    deterministic: input.plan.runner === "deterministic",
    coverage: {
      completeness: missingOptionalRoles.length > 0 ? "partial" : "complete",
      validatedResultCount: results.length,
      missingRequiredRoles,
      missingOptionalRoles
    }
  };
}

export function validateNuwaAgentResult(result: NuwaAgentResult, plan: NuwaPlan, snapshot: StorySnapshot): NuwaAgentResult {
  assertNuwaResultShape(result);
  const task = plan.tasks.find((candidate) => candidate.taskId === result.taskId);
  if (!task) throw new Error(`Nuwa result references unknown task: ${result.taskId}.`);
  if (result.runId !== plan.runId) throw new Error(`Nuwa result has a different run id: ${result.taskId}.`);
  if (result.snapshotHash !== snapshot.snapshotHash) throw new Error(`Nuwa result is stale: ${result.taskId}.`);
  if (result.role !== task.role) throw new Error(`Nuwa result role does not match task: ${result.taskId}.`);
  if (result.writeScope !== "none") throw new Error(`Nuwa result attempts write access: ${result.taskId}.`);

  if (result.proposedBranches.length > task.maximumBranchProposals) {
    throw new Error(`Nuwa result exceeds branch budget: ${result.taskId}.`);
  }
  if (result.evidence.length > task.maximumEvidenceExcerpts) {
    throw new Error(`Nuwa result exceeds evidence budget: ${result.taskId}.`);
  }
  const allowedNotes = new Map(snapshot.notes
    .filter((note) => task.allowedNoteRefs.includes(note.relativePath))
    .map((note) => [`snapshot-evidence-${note.id}`, note]));
  const availableEvidenceIds = new Set(allowedNotes.keys());
  const evidence = result.evidence.map((item) => {
    const note = allowedNotes.get(item.evidenceId);
    if (!note || item.relativePath !== note.relativePath || item.noteId !== note.id || item.excerpt !== note.evidenceExcerpt) {
      throw new Error(`Nuwa result contains invalid evidence: ${result.taskId}.`);
    }
    return structuredClone(item);
  });
  const findingNormalization = result.findings.map((finding) => normalizeFinding(finding, availableEvidenceIds));
  const unsupported = [
    ...result.unsupportedAssumptions,
    ...findingNormalization.filter((finding) => finding.support === "unsupported").map((finding) => finding.summary)
  ];

  return {
    ...structuredClone(result),
    evidence,
    findings: findingNormalization,
    proposedBranches: result.proposedBranches.map((proposal) => ({
      ...proposal,
      evidenceIds: proposal.evidenceIds.filter((id) => availableEvidenceIds.has(id)),
      assumptions: [...new Set(proposal.assumptions)].sort()
    })),
    unsupportedAssumptions: [...new Set(unsupported)].sort()
  };
}

function assertNuwaResultShape(value: NuwaAgentResult): void {
  if (!isPlainRecord(value) || value.version !== "world-os-nuwa-agent-result-v1") {
    throw new Error("Nuwa result does not match world-os-nuwa-agent-result-v1.");
  }
  rejectDangerousKeys(value);
  const allowedTopLevel = new Set(["version", "runId", "snapshotHash", "taskId", "role", "findings", "proposedBranches", "risks", "evidence", "unsupportedAssumptions", "confidence", "writeScope"]);
  if (Object.keys(value).some((key) => !allowedTopLevel.has(key))) {
    throw new Error("Nuwa result contains unexpected executable or data fields.");
  }
  for (const field of ["runId", "snapshotHash", "taskId", "role", "confidence", "writeScope"] as const) {
    if (typeof value[field] !== "string") throw new Error(`Nuwa result field is invalid: ${field}.`);
  }
  for (const field of ["findings", "proposedBranches", "risks", "evidence", "unsupportedAssumptions"] as const) {
    if (!Array.isArray(value[field])) throw new Error(`Nuwa result field is invalid: ${field}.`);
  }
  if (!value.evidence.every((item) => isPlainRecord(item)
    && typeof item.evidenceId === "string"
    && typeof item.noteId === "string"
    && typeof item.relativePath === "string"
    && typeof item.excerpt === "string")) {
    throw new Error("Nuwa result evidence shape is invalid.");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function rejectDangerousKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) rejectDangerousKeys(item);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new Error("Nuwa result contains a forbidden object key.");
    }
    rejectDangerousKeys(child);
  }
}

function normalizeFinding(finding: NuwaFinding, availableEvidenceIds: Set<string>): NuwaFinding {
  const evidenceIds = finding.evidenceIds.filter((id) => availableEvidenceIds.has(id));
  return {
    ...structuredClone(finding),
    evidenceIds,
    support: evidenceIds.length > 0 && finding.support === "supported" ? "supported" : "unsupported"
  };
}

function mergeEquivalentProposals(proposals: NuwaBranchProposal[]): NuwaBranchProposal[] {
  const byKey = new Map<string, NuwaBranchProposal>();
  for (const proposal of proposals) {
    const key = `${proposal.strategy}|${[...proposal.affectedNoteRefs].sort().join("|")}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, structuredClone(proposal));
      continue;
    }
    byKey.set(key, {
      ...current,
      evidenceIds: [...new Set([...current.evidenceIds, ...proposal.evidenceIds])].sort(),
      risks: [...new Map([...current.risks, ...proposal.risks].map((risk) => [risk.id, risk])).values()].sort((left, right) => left.id.localeCompare(right.id)),
      assumptions: [...new Set([...current.assumptions, ...proposal.assumptions])].sort()
    });
  }
  return [...byKey.values()].sort((left, right) => left.strategy.localeCompare(right.strategy) || left.id.localeCompare(right.id));
}

function uniqueEvidence(evidence: NuwaEvidenceReference[]): NuwaEvidenceReference[] {
  return [...new Map(evidence.map((item) => [item.evidenceId, item])).values()]
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function detectDisagreements(findings: NuwaFinding[]): NuwaDisagreement[] {
  const candidates = findings.filter((finding) => finding.claim && finding.support === "supported");
  const byClaim = new Map<string, NuwaFinding[]>();
  for (const finding of candidates) {
    const key = finding.claim?.key;
    if (!key) continue;
    byClaim.set(key, [...(byClaim.get(key) ?? []), finding]);
  }

  return [...byClaim.entries()]
    .filter(([, group]) => new Set(group.map((finding) => finding.claim?.value)).size > 1)
    .map(([claimKey, group], index) => ({
      id: `nuwa-disagreement-${index + 1}-${claimKey}`,
      claimKey,
      positions: group
        .map((finding) => ({
          role: roleFromFindingId(finding.id),
          value: finding.claim?.value ?? "",
          findingId: finding.id
        }))
        .sort((left, right) => left.role.localeCompare(right.role) || left.value.localeCompare(right.value)),
      resolution: "author-review-required" as const
    }))
    .sort((left, right) => left.claimKey.localeCompare(right.claimKey));
}

function roleFromFindingId(findingId: string): NuwaAgentResult["role"] {
  const matched = ["continuity", "character-arc", "causality", "foreshadowing", "tension", "evidence-critic"]
    .find((role) => findingId.includes(role));
  return (matched ?? "evidence-critic") as NuwaAgentResult["role"];
}
