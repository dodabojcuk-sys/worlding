import type {
  NuwaAgentResult,
  NuwaAgentRole,
  NuwaAgentTask,
  NuwaBranchProposal,
  NuwaEvidenceReference,
  NuwaFinding,
  NuwaPlan,
  NuwaRisk,
  StorySnapshot
} from "./storyIntelligenceTypes.ts";

export function runDeterministicNuwaPlan(input: {
  plan: NuwaPlan;
  snapshot: StorySnapshot;
}): NuwaAgentResult[] {
  if (input.plan.snapshotHash !== input.snapshot.snapshotHash) {
    throw new Error("Nuwa plan snapshot hash does not match the supplied Story Snapshot.");
  }

  return input.plan.tasks.map((task) => runDeterministicNuwaTask({ task, plan: input.plan, snapshot: input.snapshot }));
}

export function runDeterministicNuwaTask(input: {
  task: NuwaAgentTask;
  plan: NuwaPlan;
  snapshot: StorySnapshot;
}): NuwaAgentResult {
  const evidence = taskEvidence(input.task, input.snapshot);
  const unsupportedAssumptions = input.task.role === "evidence-critic"
    ? unsupportedGoalAssumptions(input.plan.authorGoal, input.snapshot)
    : [];
  const findings = roleFindings({ task: input.task, snapshot: input.snapshot, evidence, unsupportedAssumptions });
  const risks = roleRisks({ role: input.task.role, snapshot: input.snapshot, evidence });

  return {
    version: "world-os-nuwa-agent-result-v1",
    runId: input.plan.runId,
    snapshotHash: input.snapshot.snapshotHash,
    taskId: input.task.taskId,
    role: input.task.role,
    findings,
    proposedBranches: roleBranches({
      task: input.task,
      authorGoal: input.plan.authorGoal,
      snapshot: input.snapshot,
      evidence,
      risks
    }).slice(0, input.task.maximumBranchProposals),
    risks,
    evidence,
    unsupportedAssumptions,
    confidence: unsupportedAssumptions.length > 0 ? "low" : evidence.length >= 2 ? "high" : "medium",
    writeScope: "none"
  };
}

function taskEvidence(task: NuwaAgentTask, snapshot: StorySnapshot): NuwaEvidenceReference[] {
  const notesByPath = new Map(snapshot.notes.map((note) => [note.relativePath, note]));

  return task.allowedNoteRefs
    .map((relativePath) => notesByPath.get(relativePath))
    .filter((note): note is NonNullable<typeof note> => note !== undefined)
    .filter((note) => note.evidenceExcerpt !== "")
    .slice(0, task.maximumEvidenceExcerpts)
    .map((note) => ({
      evidenceId: `snapshot-evidence-${note.id}`,
      noteId: note.id,
      relativePath: note.relativePath,
      title: note.title,
      excerpt: note.evidenceExcerpt,
      noteType: note.type
    }));
}

function roleFindings(input: {
  task: NuwaAgentTask;
  snapshot: StorySnapshot;
  evidence: NuwaEvidenceReference[];
  unsupportedAssumptions: string[];
}): NuwaFinding[] {
  const evidenceIds = input.evidence.map((item) => item.evidenceId);
  const affectedNoteRefs = input.evidence.map((item) => item.relativePath);
  const supported = (summary: string, claim?: NuwaFinding["claim"]): NuwaFinding => ({
    id: `${input.task.taskId}-finding-1`,
    category: categoryForRole(input.task.role),
    summary,
    affectedNoteRefs,
    evidenceIds,
    support: evidenceIds.length > 0 ? "supported" : "unsupported",
    ...(claim ? { claim } : {})
  });
  const findings: NuwaFinding[] = [];

  if (input.task.role === "continuity") {
    findings.push(supported(
      input.snapshot.lockedRules.length > 0
        ? `The proposal must preserve ${input.snapshot.lockedRules.length} locked world rule(s).`
        : "No locked rule was found in the selected Markdown scope.",
      { key: "world-rule-preservation", value: input.snapshot.lockedRules.length > 0 ? "required" : "not-recorded" }
    ));
  } else if (input.task.role === "character-arc") {
    findings.push(supported("Character changes should remain tied to the selected scene evidence.", {
      key: "character-change-scope",
      value: "scene-bounded"
    }));
  } else if (input.task.role === "causality") {
    findings.push(supported("The author goal creates a proposal chain, not a committed future event.", {
      key: "future-status",
      value: "author-review-required"
    }));
  } else if (input.task.role === "foreshadowing") {
    findings.push(supported(
      input.snapshot.openThreads.length > 0
        ? `${input.snapshot.openThreads.length} unresolved thread(s) should remain visible across candidate paths.`
        : "No unresolved thread was recorded in the Markdown snapshot.",
      { key: "mystery-preservation", value: input.snapshot.openThreads.length > 0 ? "preserve" : "not-recorded" }
    ));
  } else if (input.task.role === "tension") {
    findings.push(supported("Candidate paths should expose a different cost or pressure, not only a different label.", {
      key: "dramatic-pressure", value: "required"
    }));
  } else {
    findings.push(supported("Every supported claim must cite a Markdown note excerpt.", {
      key: "evidence-policy", value: "required"
    }));
    for (const [index, assumption] of input.unsupportedAssumptions.entries()) {
      findings.push({
        id: `${input.task.taskId}-unsupported-${index + 1}`,
        category: "evidence",
        summary: `Unsupported assumption: ${assumption}`,
        affectedNoteRefs: [],
        evidenceIds: [],
        support: "unsupported",
        claim: { key: "unsupported-assumption", value: assumption }
      });
    }
  }

  return findings;
}

function roleRisks(input: {
  role: NuwaAgentRole;
  snapshot: StorySnapshot;
  evidence: NuwaEvidenceReference[];
}): NuwaRisk[] {
  const evidenceIds = input.evidence.map((item) => item.evidenceId);
  if (input.role === "continuity" && input.snapshot.lockedRules.length > 0) {
    return [{
      id: "risk-locked-rule-drift",
      level: "high",
      summary: "A candidate could conflict with a locked Markdown world rule.",
      evidenceIds
    }];
  }
  if (input.role === "foreshadowing" && input.snapshot.openThreads.length > 0) {
    return [{
      id: "risk-mystery-collapse",
      level: "medium",
      summary: "A candidate could resolve an open mystery before the author intends.",
      evidenceIds
    }];
  }
  if (input.role === "tension") {
    return [{
      id: "risk-low-pressure",
      level: "medium",
      summary: "A candidate could advance information without meaningful resistance or cost.",
      evidenceIds
    }];
  }
  return [];
}

function roleBranches(input: {
  task: NuwaAgentTask;
  authorGoal: string;
  snapshot: StorySnapshot;
  evidence: NuwaEvidenceReference[];
  risks: NuwaRisk[];
}): NuwaBranchProposal[] {
  const base = {
    affectedNoteRefs: input.evidence.map((item) => item.relativePath),
    preservedMysteries: input.snapshot.openThreads.map((item) => item.title),
    risks: input.risks,
    evidenceIds: input.evidence.map((item) => item.evidenceId),
    assumptions: [] as string[],
    sourceRole: input.task.role
  };

  if (input.task.role === "causality" || input.task.role === "character-arc") {
    return [{
      id: `${input.task.taskId}-partial-clue`,
      strategy: "partial-clue",
      title: "保留核心谜题，只推进可行动线索",
      summary: `围绕“${input.authorGoal}”提供部分可验证信息，但不把提案写入世界。`,
      immediateConsequence: "当前场景获得一个可行动的局部变化。",
      mediumTermConsequence: "后续事件需要继续引用相同的 Markdown 证据。",
      longTermPressure: "作者仍需决定何时让核心秘密进入明线。",
      ...base
    }];
  }

  if (input.task.role === "foreshadowing" || input.task.role === "continuity") {
    return [{
      id: `${input.task.taskId}-delayed-reveal`,
      strategy: "delayed-reveal",
      title: "延后揭露，保留未解线索",
      summary: `暂不确认“${input.authorGoal}”中的核心事实，让既有线索继续积累压力。`,
      immediateConsequence: "本章只留下可追踪的异常或证据缺口。",
      mediumTermConsequence: "未解线索继续约束后续场景的揭露速度。",
      longTermPressure: "延后答案会提高后续章节必须兑现线索的压力。",
      ...base
    }];
  }

  if (input.task.role === "tension") {
    return [{
      id: `${input.task.taskId}-immediate-reveal`,
      strategy: "immediate-reveal",
      title: "立即揭示一项可验证后果",
      summary: `让“${input.authorGoal}”在当前场景形成清晰转折，同时标出悬念成本。`,
      immediateConsequence: "当前场景的选择压力立刻上升。",
      mediumTermConsequence: "后续冲突需要承担更早揭示带来的代价。",
      longTermPressure: "过早揭示可能压缩仍未解决的谜题空间。",
      ...base
    }];
  }

  return [];
}

function categoryForRole(role: NuwaAgentRole): NuwaFinding["category"] {
  if (role === "character-arc") return "character";
  if (role === "causality") return "causality";
  if (role === "foreshadowing") return "foreshadowing";
  if (role === "tension") return "tension";
  if (role === "evidence-critic") return "evidence";
  return "continuity";
}

function unsupportedGoalAssumptions(authorGoal: string, snapshot: StorySnapshot): string[] {
  const snapshotText = snapshot.notes
    .flatMap((note) => [note.title, note.evidenceExcerpt])
    .join("\n");
  const candidateTerms = ["龙族", "飞船", "人工智能", "时间机器", "现代设备"];

  return candidateTerms
    .filter((term) => authorGoal.includes(term) && !snapshotText.includes(term))
    .map((term) => `“${term}” is not present in the Markdown snapshot.`);
}
