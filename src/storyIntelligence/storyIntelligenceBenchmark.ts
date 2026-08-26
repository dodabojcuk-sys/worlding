import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createNuwaPlan } from "./nuwaPlanner.ts";
import { runDeterministicNuwaPlan } from "./nuwaRunner.ts";
import { buildStorySnapshot, stableJson } from "./storySnapshotBuilder.ts";
import { synthesizeNuwaResults } from "./nuwaSynthesis.ts";
import type {
  NuwaAgentResult,
  StoryIntelligenceBenchmarkCase,
  StoryIntelligenceBenchmarkResult
} from "./storyIntelligenceTypes.ts";

export function runStoryIntelligenceBenchmark(input: {
  workspacePath: string;
  cases: StoryIntelligenceBenchmarkCase[];
  outputPath?: string;
  outputDirectory?: string;
}): StoryIntelligenceBenchmarkResult {
  const results = input.cases.map((benchmarkCase) => runCase(input.workspacePath, benchmarkCase));
  const output: StoryIntelligenceBenchmarkResult = {
    version: "world-os-story-intelligence-benchmark-v1",
    runner: "deterministic",
    cases: results,
    aggregate: {
      caseCount: results.length,
      passedCaseCount: results.filter((item) => item.passed).length,
      entityCoverage: mean(results.map((item) => Number(item.metrics.entityCoverage))),
      affectedObjectRecall: results.every((item) => item.metrics.affectedObjectRecall === true),
      evidenceTraceability: results.every((item) => item.metrics.evidenceTraceability === true),
      ruleConflictDetection: results.filter((item) => item.metrics.ruleConflictDetection === true).length,
      timelineDependencyCoverage: results.filter((item) => item.metrics.timelineDependencyCoverage === true).length,
      branchDiversity: mean(results.map((item) => Number(item.metrics.branchDiversity))),
      branchDuplication: results.reduce((total, item) => total + Number(item.metrics.branchDuplication), 0),
      agentDisagreementVisibility: results.filter((item) => item.metrics.agentDisagreementVisibility === true).length,
      authorDecisionBoundary: results.every((item) => item.metrics.authorDecisionBoundary === true)
    },
    limitations: ["deterministic-baseline-only", "not-model-quality-evidence"],
    executionFacts: {
      liveModelExecutions: 0,
      modelQualityComparison: "not-performed"
    },
    metricClassification: {
      evidenceTraceability: "deterministic-assertion",
      ruleConflictDetection: "deterministic-assertion",
      authorDecisionBoundary: "deterministic-assertion",
      entityCoverage: "machine-scored-heuristic",
      affectedObjectRecall: "machine-scored-heuristic",
      timelineDependencyCoverage: "machine-scored-heuristic",
      branchDiversity: "machine-scored-heuristic",
      authorUsefulness: "requires-human-review",
      narrativeOriginality: "requires-human-review",
      emotionalDepth: "requires-human-review",
      modelSuperiority: "unavailable"
    }
  };

  if (input.outputPath) {
    mkdirSync(path.dirname(input.outputPath), { recursive: true });
    writeFileSync(input.outputPath, `${stableJson(output)}\n`, "utf8");
  }
  if (input.outputDirectory) {
    mkdirSync(path.join(input.outputDirectory, "cases"), { recursive: true });
    writeFileSync(path.join(input.outputDirectory, "benchmark-results.json"), `${stableJson(output)}\n`, "utf8");
    writeFileSync(path.join(input.outputDirectory, "benchmark-summary.md"), benchmarkSummary(output), "utf8");
    for (const item of output.cases) {
      writeFileSync(path.join(input.outputDirectory, "cases", `${item.id}.json`), `${stableJson(item)}\n`, "utf8");
    }
  }
  return output;
}

function benchmarkSummary(result: StoryIntelligenceBenchmarkResult): string {
  return [
    "# Story Intelligence Benchmark v1",
    "",
    "## Scope",
    "",
    "This report records deterministic contract checks only. It is not evidence of model-backed story intelligence quality.",
    "",
    "## Result",
    "",
    `- Runner: ${result.runner}`,
    `- Cases: ${result.aggregate.caseCount}`,
    `- Passed: ${result.aggregate.passedCaseCount}`,
    `- Evidence traceability: ${result.aggregate.evidenceTraceability}`,
    `- Author decision boundary: ${result.aggregate.authorDecisionBoundary}`,
    `- Live model executions: ${result.executionFacts.liveModelExecutions}`,
    `- Model-quality comparison: ${result.executionFacts.modelQualityComparison}`,
    "",
    "## Limits",
    "",
    ...result.limitations.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

function runCase(workspacePath: string, benchmarkCase: StoryIntelligenceBenchmarkCase) {
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: benchmarkCase.authorGoal });
  const originalResults = runDeterministicNuwaPlan({ plan, snapshot });
  const results = mutateBenchmarkResults(originalResults, benchmarkCase);
  const bundle = synthesizeNuwaResults({ plan, snapshot, results });
  const rawProposalCount = results.reduce((total, result) => total + result.proposedBranches.length, 0);
  const metrics = {
    entityCoverage: snapshot.selectedNoteRefs.length === 0
      ? 1
      : Number((new Set(bundle.branches.flatMap((branch) => branch.affectedObjects)).size / snapshot.selectedNoteRefs.length).toFixed(3)),
    affectedObjectRecall: bundle.branches.some((branch) => branch.affectedObjects.length > 0),
    unsupportedInferenceCount: bundle.unsupportedAssumptions.length,
    evidenceTraceability: bundle.branches.every((branch) => branch.unsupported || branch.evidence.length > 0),
    ruleConflictDetection: bundle.branches.some((branch) => branch.risks.some((risk) => risk.id === "risk-locked-rule-drift")),
    timelineDependencyCoverage: bundle.branches.some((branch) => branch.longTermPressure.length > 0),
    branchDiversity: new Set(bundle.branches.map((branch) => branch.strategy)).size,
    branchDuplication: Math.max(0, rawProposalCount - bundle.branches.length),
    agentDisagreementVisibility: bundle.disagreements.length > 0,
    authorDecisionBoundary: bundle.authorDecisionRequired === true && bundle.branches.every((branch) => branch.unsupported === false || branch.assumptions.length >= 0)
  };
  const passed = expectedMetricsPass(benchmarkCase, metrics);

  return { id: benchmarkCase.id, metrics, passed };
}

function mutateBenchmarkResults(results: NuwaAgentResult[], benchmarkCase: StoryIntelligenceBenchmarkCase): NuwaAgentResult[] {
  const copy = structuredClone(results);
  const critic = copy.find((result) => result.role === "evidence-critic");
  if (benchmarkCase.expected.requiresUnsupportedAssumption && critic) {
    critic.unsupportedAssumptions.push("Benchmark-only invented fact is not backed by Markdown.");
    critic.findings.push({
      id: `${critic.taskId}-benchmark-unsupported`,
      category: "evidence",
      summary: "Benchmark-only invented fact is unsupported.",
      affectedNoteRefs: [],
      evidenceIds: [],
      support: "unsupported",
      claim: { key: "benchmark-invented-fact", value: "unsupported" }
    });
  }
  if (benchmarkCase.expected.requiresDisagreement && copy.length >= 2) {
    copy[0].findings.push({
      id: `${copy[0].taskId}-benchmark-claim-a`,
      category: "continuity",
      summary: "Benchmark disagreement prefers delaying the reveal.",
      affectedNoteRefs: copy[0].evidence.slice(0, 1).map((item) => item.relativePath),
      evidenceIds: copy[0].evidence.slice(0, 1).map((item) => item.evidenceId),
      support: "supported",
      claim: { key: "benchmark-reveal-timing", value: "delayed" }
    });
    copy[1].findings.push({
      id: `${copy[1].taskId}-benchmark-claim-b`,
      category: "character",
      summary: "Benchmark disagreement prefers revealing the clue now.",
      affectedNoteRefs: copy[1].evidence.slice(0, 1).map((item) => item.relativePath),
      evidenceIds: copy[1].evidence.slice(0, 1).map((item) => item.evidenceId),
      support: "supported",
      claim: { key: "benchmark-reveal-timing", value: "immediate" }
    });
  }
  if (benchmarkCase.expected.requiresDuplicateMerge && copy[0]?.proposedBranches[0]) {
    copy[0].proposedBranches.push({
      ...copy[0].proposedBranches[0],
      id: `${copy[0].proposedBranches[0].id}-duplicate`
    });
  }
  return copy;
}

function expectedMetricsPass(
  benchmarkCase: StoryIntelligenceBenchmarkCase,
  metrics: Record<string, number | boolean>
): boolean {
  if (metrics.evidenceTraceability !== true || metrics.authorDecisionBoundary !== true) return false;
  if (benchmarkCase.expected.requiresRuleConflict && metrics.ruleConflictDetection !== true) return false;
  if (benchmarkCase.expected.requiresLongTermPressure && metrics.timelineDependencyCoverage !== true) return false;
  if (benchmarkCase.expected.requiresUnsupportedAssumption && Number(metrics.unsupportedInferenceCount) === 0) return false;
  if (benchmarkCase.expected.requiresDisagreement && metrics.agentDisagreementVisibility !== true) return false;
  if (benchmarkCase.expected.requiresDuplicateMerge && Number(metrics.branchDuplication) === 0) return false;
  return true;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(3));
}
