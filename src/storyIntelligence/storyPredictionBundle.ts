import type {
  NuwaAgentResult,
  NuwaBranchProposal,
  NuwaEvidenceReference,
  NuwaRisk,
  StoryPredictionBranch,
  StorySnapshot
} from "./storyIntelligenceTypes.ts";
import { stableHash } from "./storySnapshotBuilder.ts";

export function createPredictionBranch(input: {
  proposal: NuwaBranchProposal;
  sourceResults: NuwaAgentResult[];
  snapshot: StorySnapshot;
}): StoryPredictionBranch {
  const evidenceById = new Map(
    input.sourceResults.flatMap((result) => result.evidence).map((evidence) => [evidence.evidenceId, evidence])
  );
  const evidence = input.proposal.evidenceIds
    .map((evidenceId) => evidenceById.get(evidenceId))
    .filter((item): item is NuwaEvidenceReference => item !== undefined)
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const roles = input.sourceResults
    .filter((result) => result.proposedBranches.some((branch) => sameProposal(branch, input.proposal)))
    .map((result) => result.role)
    .sort();

  return {
    id: `prediction-${input.proposal.strategy}-${stableHash(input.proposal.affectedNoteRefs).slice(0, 10)}`,
    strategy: input.proposal.strategy,
    title: input.proposal.title,
    summary: input.proposal.summary,
    immediateConsequence: input.proposal.immediateConsequence,
    mediumTermConsequence: input.proposal.mediumTermConsequence,
    longTermPressure: input.proposal.longTermPressure,
    affectedObjects: [...input.proposal.affectedNoteRefs].sort(),
    preservedMysteries: [...new Set(input.proposal.preservedMysteries)].sort(),
    risks: mergeRisks(input.proposal.risks),
    evidence,
    assumptions: [...new Set(input.proposal.assumptions)].sort(),
    unsupported: evidence.length === 0,
    sourceAgentRoles: [...new Set(roles)].sort()
  };
}

export function fallbackPredictionProposals(input: {
  authorGoal: string;
  snapshot: StorySnapshot;
  existingStrategies: string[];
}): NuwaBranchProposal[] {
  const evidenceNote = input.snapshot.currentScene ?? input.snapshot.project;
  const evidenceId = `snapshot-evidence-${evidenceNote.id}`;
  const base = {
    affectedNoteRefs: [...new Set([evidenceNote.relativePath, ...input.snapshot.selectedNoteRefs])].sort(),
    preservedMysteries: input.snapshot.openThreads.map((note) => note.title),
    risks: [] as NuwaRisk[],
    evidenceIds: evidenceNote.evidenceExcerpt === "" ? [] : [evidenceId],
    assumptions: [] as string[],
    sourceRole: "evidence-critic" as const
  };
  const candidates: NuwaBranchProposal[] = [
    {
      id: "fallback-immediate-reveal",
      strategy: "immediate-reveal",
      title: "立即推进一个可验证变化",
      summary: `把“${input.authorGoal}”压缩为当前场景可检查的变化。`,
      immediateConsequence: "当前场景获得明确的叙事转折。",
      mediumTermConsequence: "后续场景需要承担提前揭示的成本。",
      longTermPressure: "仍需维护现有规则和未解线索。",
      ...base
    },
    {
      id: "fallback-partial-clue",
      strategy: "partial-clue",
      title: "只提供部分线索",
      summary: `保留“${input.authorGoal}”的方向，但不确认核心结论。`,
      immediateConsequence: "作者获得行动方向而非完整答案。",
      mediumTermConsequence: "线索需要在后续场景被重新验证。",
      longTermPressure: "未解线索仍需在作者选择下兑现。",
      ...base
    },
    {
      id: "fallback-delayed-reveal",
      strategy: "delayed-reveal",
      title: "延后揭露核心信息",
      summary: `让“${input.authorGoal}”保持为后续章节的压力来源。`,
      immediateConsequence: "当前场景只留下异常和证据缺口。",
      mediumTermConsequence: "角色和事件关系维持等待状态。",
      longTermPressure: "后续章节必须解释为何延后揭露。",
      ...base
    }
  ];

  return candidates.filter((candidate) => !input.existingStrategies.includes(candidate.strategy));
}

function mergeRisks(risks: NuwaRisk[]): NuwaRisk[] {
  return [...new Map(risks.map((risk) => [risk.id, risk])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

function sameProposal(left: NuwaBranchProposal, right: NuwaBranchProposal): boolean {
  return left.strategy === right.strategy && left.affectedNoteRefs.join("|") === right.affectedNoteRefs.join("|");
}
