export const NUWA_N1_ATTENTION_VERSION = "tianyan-nuwa-n1-attention/v1" as const;

export type NuwaN1AttentionCandidate = {
  key: string;
  kind: "knowledge" | "belief";
  sourceId: string;
  summary: string;
  required: boolean;
  serializedBytes: number;
};

export type NuwaN1AttentionSelection = {
  version: typeof NUWA_N1_ATTENTION_VERSION;
  algorithm: "permission-first-lexical-utf8/v1";
  selected: Array<{ key: string; kind: "knowledge" | "belief"; sourceId: string; reason: "current-scene-required" | "goal-keyword-match" | "scene-keyword-match" | "stable-authorized-fallback" }>;
  excluded: { count: number; reasonCounts: Array<{ reason: "lower-relevance-within-budget"; count: number }> };
  budget: { estimator: "utf8-byte-upper-bound/v1"; maxInputTokens: number; baseBytes: number; sourceBudgetBytes: number; selectedSourceBytes: number; outputReserveTokens: number; requiredOverflow: boolean };
};

/** Selects only from a caller-supplied, already-authorized role source set.
 * Ranking cannot grant access because this function never accepts denied IDs. */
export function selectNuwaN1Attention(input: {
  goal: string;
  sceneLabel: string;
  candidates: NuwaN1AttentionCandidate[];
  baseBytes: number;
  maxInputTokens: number;
  outputReserveTokens: number;
  metadataReserveBytes?: number;
}): NuwaN1AttentionSelection {
  const metadataReserveBytes = Math.max(256, input.metadataReserveBytes ?? 900);
  const sourceBudgetBytes = Math.max(0, input.maxInputTokens - input.baseBytes - metadataReserveBytes);
  const goalTerms = lexicalTerms(input.goal);
  const sceneTerms = lexicalTerms(input.sceneLabel);
  const ranked = input.candidates.map((candidate) => {
    const terms = lexicalTerms(`${candidate.summary} ${candidate.sourceId}`);
    const goalScore = overlap(goalTerms, terms);
    const sceneScore = overlap(sceneTerms, terms);
    const reason = candidate.required ? "current-scene-required" as const
      : goalScore > 0 ? "goal-keyword-match" as const
        : sceneScore > 0 ? "scene-keyword-match" as const
          : "stable-authorized-fallback" as const;
    return { candidate, goalScore, sceneScore, reason };
  }).sort((left, right) => Number(right.candidate.required) - Number(left.candidate.required)
    || right.goalScore - left.goalScore
    || right.sceneScore - left.sceneScore
    || left.candidate.kind.localeCompare(right.candidate.kind, "en")
    || left.candidate.sourceId.localeCompare(right.candidate.sourceId, "en")
    || left.candidate.key.localeCompare(right.candidate.key, "en"));

  const requiredBytes = ranked.filter((item) => item.candidate.required).reduce((sum, item) => sum + item.candidate.serializedBytes, 0);
  const requiredOverflow = requiredBytes > sourceBudgetBytes;
  let selectedSourceBytes = 0;
  const selected: NuwaN1AttentionSelection["selected"] = [];
  if (!requiredOverflow) {
    for (const item of ranked) {
      if (selectedSourceBytes + item.candidate.serializedBytes > sourceBudgetBytes) continue;
      selectedSourceBytes += item.candidate.serializedBytes;
      selected.push({ key: item.candidate.key, kind: item.candidate.kind, sourceId: item.candidate.sourceId, reason: item.reason });
    }
  }
  const excludedCount = input.candidates.length - selected.length;
  return {
    version: NUWA_N1_ATTENTION_VERSION,
    algorithm: "permission-first-lexical-utf8/v1",
    selected,
    excluded: { count: excludedCount, reasonCounts: excludedCount ? [{ reason: "lower-relevance-within-budget", count: excludedCount }] : [] },
    budget: { estimator: "utf8-byte-upper-bound/v1", maxInputTokens: input.maxInputTokens, baseBytes: input.baseBytes, sourceBudgetBytes, selectedSourceBytes, outputReserveTokens: input.outputReserveTokens, requiredOverflow }
  };
}

function lexicalTerms(value: string): Set<string> {
  const normalized = String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  const terms = new Set(normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}]{2}/gu) ?? []);
  for (const segment of normalized.match(/[\p{Script=Han}]{3,}/gu) ?? []) {
    const characters = [...segment];
    for (let index = 0; index < characters.length - 1; index += 1) terms.add(`${characters[index]}${characters[index + 1]}`);
  }
  return terms;
}

function overlap(query: Set<string>, source: Set<string>): number {
  let score = 0;
  for (const term of query) if (source.has(term)) score += Math.min(12, [...term].length);
  return score;
}
