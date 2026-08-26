import { stableHash } from "./storySnapshotBuilder.ts";
import type {
  NuwaAgentResult,
  NuwaCandidateFutureRun,
  StoryPredictionBranch,
  StoryPredictionBundle,
  StorySnapshot
} from "./storyIntelligenceTypes.ts";

const CANDIDATE_STRATEGIES: StoryPredictionBranch["strategy"][] = [
  "immediate-reveal",
  "partial-clue",
  "delayed-reveal"
];

export type NuwaCandidateAuthorViewModel = {
  direction: string;
  keyAction: string;
  directResult: string;
  downstreamImpact: string;
  causalDifference: string;
  risks: string[];
  unknowns: string[];
  knowledgeBoundary: string;
};

/**
 * Deliberately separates author language from the deterministic receipt. Seeds,
 * run ids and hashes remain available in the technical projection but never
 * become the visible explanation of a future.
 */
export function createNuwaCandidateAuthorViewModel(input: { candidate: NuwaCandidateFutureRun }): NuwaCandidateAuthorViewModel {
  const { candidate } = input;
  const branch = candidate.branch;
  const clean = (value: string) => value
    .replace(/\b(?:seed|run\s*pack|snapshot|trace|hash|candidateId|branchId)\b[^，。；\n]*/giu, "")
    .replace(/“[^”]{0,160}”/gu, "这次作者问题")
    .replace(/\s{2,}/gu, " ")
    .trim();
  const immediate = clean(branch.immediateConsequence);
  const medium = clean(branch.mediumTermConsequence);
  const long = clean(branch.longTermPressure);
  const common = {
    risks: branch.risks.map((risk) => clean(risk.summary)).filter(Boolean),
    unknowns: branch.preservedMysteries.map(clean).filter(Boolean),
    knowledgeBoundary: clean(candidate.knowledgeBoundary.rule)
  };
  if (branch.strategy === "immediate-reveal") return {
    direction: "立即把一个可验证后果放到台前",
    keyAction: immediate || "在当前场景确认一个小而明确的转折。",
    directResult: immediate || "当前场景出现可验证的变化。",
    downstreamImpact: medium || "后续章节更早承担揭示后的连锁压力。",
    causalDifference: "信息更快成为场景压力，后续承担更早揭示的代价。",
    ...common
  };
  if (branch.strategy === "partial-clue") return {
    direction: "推进一条可行动线索，保留核心秘密",
    keyAction: immediate || "只推进局部线索到可验证边缘。",
    directResult: immediate || "人物获得足够行动的线索，但不会知道全部答案。",
    downstreamImpact: medium || "线索在后续章节继续要求验证与回收。",
    causalDifference: "相比立即揭示，信息只推进到可验证边缘，悬念仍保留。",
    ...common
  };
  if (branch.strategy === "delayed-reveal") return {
    direction: "暂不揭示核心事实，让异常继续积累",
    keyAction: immediate || "保留当前未知，只让异常留下可追踪痕迹。",
    directResult: immediate || "当前场景变化最小，但读者能感到压力累积。",
    downstreamImpact: long || "后续兑现压力增大，核心事实需要更强的回收时机。",
    causalDifference: "相比前两条，当前场景变化最小，后续兑现压力最大。",
    ...common
  };
  return {
    direction: clean(branch.title) || "保留一条待核验的候选未来",
    keyAction: immediate || "在当前资料边界内推进一次局部选择。",
    directResult: immediate || "形成一个可追溯的局部后果。",
    downstreamImpact: medium || long || "后续影响待作者继续核验。",
    causalDifference: "这条路线只改变局部因果，不把候选写入正史。",
    ...common
  };
}

/**
 * A narrow compatibility helper: specialist runs may return one branch when a
 * brief only allows one role. The author loop still needs three comparable
 * futures, so missing strategies are derived as explicit, labelled variants
 * of the same evidence-backed branch. This remains a candidate projection and
 * never writes a world object.
 */
export function ensureAuthorLoopBranches(bundle: StoryPredictionBundle, count = 3): StoryPredictionBranch[] {
  const existing = [...bundle.branches];
  const fallback = existing[0];
  if (!fallback) throw new Error("Author loop requires at least one validated Nuwa branch.");
  for (const strategy of CANDIDATE_STRATEGIES.slice(0, count)) {
    if (existing.some((branch) => branch.strategy === strategy)) continue;
    existing.push({
      ...structuredClone(fallback),
      id: `derived-${strategy}-${stableHash({ bundle: bundle.runId, strategy }).slice(0, 10)}`,
      strategy,
      title: strategyLabel(strategy),
      summary: `${fallback.summary}（${strategyLabel(strategy)}）`,
      immediateConsequence: strategy === "immediate-reveal" ? "在当前检查点形成一个可验证转折。" : fallback.immediateConsequence,
      mediumTermConsequence: strategy === "partial-clue" ? "只推进局部线索，等待后续验证。" : fallback.mediumTermConsequence,
      longTermPressure: strategy === "delayed-reveal" ? "保留核心未知，给后续章节留下兑现压力。" : fallback.longTermPressure
    });
  }
  return existing
    .filter((branch, index, all) => all.findIndex((candidate) => candidate.strategy === branch.strategy) === index)
    .slice(0, count);
}

export function createAuthorLoopCandidate(input: {
  candidateId: string;
  parentRunId: string;
  childRunId: string;
  seed: number;
  snapshot: StorySnapshot;
  branch: StoryPredictionBranch;
  status?: NuwaCandidateFutureRun["status"];
}): NuwaCandidateFutureRun {
  const currentScene = input.snapshot.currentScene?.title || input.snapshot.project.title;
  const checkpoint = `检查点：${currentScene} · seed ${input.seed}`;
  const sourceRefs = [...new Set(input.branch.evidence.map((evidence) => evidence.noteId))].sort();
  const actorDecisionSequence = [
    `监督者将问题限定在“${input.branch.title}”。`,
    `${actorLabel(input.snapshot)}在当前资料边界内做出一次局部选择。`,
    `结果停在${input.branch.strategy}策略，不提前确认未知事实。`
  ];
  const beatEvolution = [
    `起点：${currentScene}（${input.snapshot.snapshotHash.slice(0, 12)}）`,
    `转折：${input.branch.immediateConsequence}`,
    `后续压力：${input.branch.longTermPressure}`
  ];
  const stateDiff = [
    `候选状态：${input.branch.strategy}`,
    `影响对象：${input.branch.affectedObjects.length} 项资料引用`,
    `与正史关系：待作者确认`
  ];
  const causalChain = [input.branch.immediateConsequence, input.branch.mediumTermConsequence, input.branch.longTermPressure];
  const unknownBeforeCheckpoint = [
    "相关事件尚未发生时，角色不能使用该事件之后才会获得的信息。",
    ...input.branch.preservedMysteries.map((mystery) => `未解线索：${mystery}`)
  ];
  const traceHash = stableHash({
    candidateId: input.candidateId,
    childRunId: input.childRunId,
    seed: input.seed,
    snapshotHash: input.snapshot.snapshotHash,
    branch: input.branch
  });
  return {
    version: "story-studio-nuwa-candidate-future-run/v1",
    candidateId: input.candidateId,
    runId: input.childRunId,
    parentRunId: input.parentRunId,
    seed: input.seed,
    snapshotHash: input.snapshot.snapshotHash,
    startingRevision: input.snapshot.snapshotHash,
    branchId: input.branch.id,
    branch: structuredClone(input.branch),
    actorDecisionSequence,
    beatEvolution,
    stateDiff,
    causalChain,
    checkpoint,
    unresolvedRisks: input.branch.risks.map((risk) => risk.summary),
    sourceRefs,
    traceHash,
    knowledgeBoundary: {
      rule: "角色只能使用当前快照与事件发生前已知的资料。",
      unknownBeforeCheckpoint
    },
    cost: { modelCalls: 0, provider: "deterministic", estimatedUsd: 0 },
    status: input.status ?? "candidate"
  };
}

function strategyLabel(strategy: StoryPredictionBranch["strategy"]): string {
  return ({
    "immediate-reveal": "候选一 · 立即推进",
    "partial-clue": "候选二 · 局部线索",
    "delayed-reveal": "候选三 · 延后揭露",
    "preserve-current": "保留当前状态",
    custom: "自定义候选"
  } as Record<StoryPredictionBranch["strategy"], string>)[strategy];
}

function actorLabel(snapshot: StorySnapshot): string {
  return snapshot.notes.find((note) => note.type === "character")?.title || "当前角色";
}

/** Kept exported for tests that need to prove deterministic candidate traces. */
export function candidateTraceFromResults(results: NuwaAgentResult[], seed: number): string {
  return stableHash({ seed, results });
}
