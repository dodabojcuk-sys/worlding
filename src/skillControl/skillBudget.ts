export type SkillBudget = {
  version: "world-os-skill-budget-v1";
  global: {
    maxInputTokensPerCall?: number;
    maxOutputTokensPerCall?: number;
    maxLogicalCostPerRun?: number;
  };
  perSkill: Record<string, SkillBudgetRule>;
};

export type SkillBudgetRule = {
  enabled: boolean;
  maxInputTokensPerCall?: number;
  maxOutputTokensPerCall?: number;
  maxCallsPerRun?: number;
  estimatedInputPricePer1k?: number;
  estimatedOutputPricePer1k?: number;
};

export type SkillRunUsage = {
  inputTokens: number;
  outputTokens: number;
  calls: number;
};

export type SkillRunCostEstimate = {
  skillId: string;
  allowed: boolean;
  logicalCost: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  violations: string[];
};

export function createDefaultSkillBudget(): SkillBudget {
  return {
    version: "world-os-skill-budget-v1",
    global: {},
    perSkill: {
      memory_palace: {
        enabled: true,
        maxCallsPerRun: 100
      },
      "story-memory-recall": {
        enabled: true,
        maxCallsPerRun: 1
      }
    }
  };
}

export function estimateSkillRunCost(
  budget: SkillBudget,
  skillId: string,
  usage: SkillRunUsage
): SkillRunCostEstimate {
  const rule = budget.perSkill[skillId];
  const violations: string[] = [];

  if (!rule || !rule.enabled) {
    violations.push("skill_disabled");
  }

  const inputLimit = rule?.maxInputTokensPerCall ?? budget.global.maxInputTokensPerCall;
  const outputLimit = rule?.maxOutputTokensPerCall ?? budget.global.maxOutputTokensPerCall;
  const callLimit = rule?.maxCallsPerRun;
  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;
  const calls = usage.calls;
  const logicalCost = roundCost(
    ((inputTokens / 1000) * (rule?.estimatedInputPricePer1k ?? 0) +
      (outputTokens / 1000) * (rule?.estimatedOutputPricePer1k ?? 0)) *
      calls
  );

  if (inputLimit !== undefined && inputTokens > inputLimit) {
    violations.push("input_tokens_exceed_limit");
  }
  if (outputLimit !== undefined && outputTokens > outputLimit) {
    violations.push("output_tokens_exceed_limit");
  }
  if (callLimit !== undefined && calls > callLimit) {
    violations.push("calls_exceed_limit");
  }
  if (budget.global.maxLogicalCostPerRun !== undefined && logicalCost > budget.global.maxLogicalCostPerRun) {
    violations.push("logical_cost_exceed_limit");
  }

  return {
    skillId,
    allowed: violations.length === 0,
    logicalCost,
    inputTokens,
    outputTokens,
    calls,
    violations
  };
}

function roundCost(value: number): number {
  return Number(value.toFixed(6));
}
