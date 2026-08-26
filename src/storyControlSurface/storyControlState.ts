import {
  buildDraftResolutionProjection,
  createStoryProductPrototypeModel,
  type StoryProductPrototypeModel,
  type StoryPrototypeScenario,
  type StoryPrototypeScenarioId
} from "../storyProductPrototypeState.ts";
import type { StoryDecisionOption, StoryPrototypePresentation } from "../storyProductPrototypeState.ts";
import type {
  StoryControlActionName,
  StoryControlActor,
  StoryControlAnalysisState,
  StoryControlConsistencyReport,
  StoryControlDraftResolutionAction,
  StoryControlDraftResolutionState,
  StoryControlDraftState,
  StoryControlPathId,
  StoryControlStage,
  StoryControlState,
  StoryControlWorldUpdateState
} from "./storyControlTypes.ts";

const defaultScenarioId: StoryPrototypeScenarioId = "opening";

export function createInitialStoryControlState(): StoryControlState {
  const model = buildPrototypeModel(defaultScenarioId, "project-home");
  const scenario = getScenario(model, defaultScenarioId);
  const option = getDefaultOption(scenario);

  return buildState({
    action: "getProjectHome",
    draftText: "",
    logicalStep: 0,
    scenario,
    selectedPathId: undefined,
    selectedOptionId: undefined,
    stage: "project-home"
  });
}

export function selectScenarioId(rawText: string): StoryPrototypeScenarioId {
  const normalized = normalizeText(rawText);

  if (normalized.includes("第五章") || normalized.includes("身份")) return "long_term_change";
  if (normalized.includes("阿岚") || normalized.includes("地下室")) return "direction_change";

  return defaultScenarioId;
}

export function getScenario(model: StoryProductPrototypeModel, id: StoryPrototypeScenarioId): StoryPrototypeScenario {
  return model.inputPanel.examples.find((scenario) => scenario.id === id) ?? model.inputPanel.examples[0];
}

export function getDefaultOption(scenario: StoryPrototypeScenario): StoryDecisionOption {
  return scenario.presentation.decisionOptions.find((option) => option.id === "partial-clue")
    ?? scenario.presentation.decisionOptions[0];
}

export function resolvePathOption(
  scenario: StoryPrototypeScenario,
  pathId: StoryControlPathId
): StoryDecisionOption | undefined {
  if (pathId === "keep_current_world") return undefined;

  const optionHints: Record<Exclude<StoryControlPathId, "keep_current_world">, string[]> = {
    partial_clue: ["partial-clue", "secret-loss"],
    delayed_reveal: ["delay-reveal", "delay-letter", "temporary-suspension"]
  };
  const hints = optionHints[pathId];

  return scenario.presentation.decisionOptions.find((option) => hints.includes(option.id))
    ?? scenario.presentation.decisionOptions[0];
}

export function createAnalysisState(scenario: StoryPrototypeScenario): StoryControlAnalysisState {
  const result = scenario.result;
  const presentation = scenario.presentation;

  return {
    worldObjects: {
      characters: result.worldObjects.characters.map((character) => ({ id: character.id, name: character.name })),
      locations: result.worldObjects.locations.map((location) => ({ id: location.id, name: location.name })),
      events: result.worldObjects.events.map((event) => ({ id: event.id, summary: event.summary })),
      clues: result.worldObjects.clues.map((clue) => ({ id: clue.id, text: clue.text }))
    },
    impactReview: {
      proposal: presentation.proposal,
      changeType: presentation.changeType,
      decisionRequired: result.decisionState.authorDecisionRequired,
      evidence: presentation.evidence,
      impacts: presentation.impacts,
      risks: presentation.risks,
      alternatives: presentation.alternatives
    }
  };
}

export function createWorldUpdateState(option?: StoryDecisionOption): StoryControlWorldUpdateState {
  if (!option) {
    return {
      selectedPath: "保持当前世界",
      confirmedChanges: [],
      affectedCharacters: [],
      affectedRelationships: [],
      affectedEvents: [],
      preservedMysteries: [],
      prototypeOnly: true
    };
  }

  return {
    selectedPath: option.result.choice,
    confirmedChanges: option.result.impacts,
    affectedCharacters: option.result.preview.characters,
    affectedRelationships: option.result.preview.relationships,
    affectedEvents: option.result.preview.story,
    preservedMysteries: option.result.preview.preserved,
    prototypeOnly: true
  };
}

export function createDraftResolutionState(
  action?: StoryControlDraftResolutionAction
): StoryControlDraftResolutionState {
  if (action === "revise") {
    return {
      status: "revise",
      primaryAction: "继续修改",
      result: "继续修改草稿",
      nextStep: "继续手写正文",
      requiresImpactReview: false,
      prototypeOnly: true
    };
  }

  if (action === "mark_ready") {
    return {
      status: "ready",
      primaryAction: "确认这一幕",
      result: "这一幕可继续",
      nextStep: "继续下一步创作",
      requiresImpactReview: false,
      prototypeOnly: true
    };
  }

  if (action === "review_impact") {
    return {
      status: "review_impact",
      primaryAction: "送回影响评审",
      result: "送回影响评审",
      nextStep: "重新查看故事影响",
      requiresImpactReview: true,
      prototypeOnly: true
    };
  }

  return {
    status: "unresolved",
    primaryAction: "等待作者处理",
    result: "等待作者处理草稿检查结果",
    nextStep: "选择继续修改、确认这一幕或送回影响评审",
    requiresImpactReview: false,
    prototypeOnly: true
  };
}

export function createDraftState(
  text = "",
  consistency?: StoryControlConsistencyReport,
  resolution: StoryControlDraftResolutionState = createDraftResolutionState()
): StoryControlDraftState {
  return {
    text,
    status: resolution.status === "ready"
      ? "ready"
      : consistency && consistency.status !== "not_checked" ? "checked" : text.length > 0 ? "unsaved" : "empty",
    consistency: consistency ?? {
      status: "not_checked",
      issues: [],
      summary: "Draft has not been checked."
    },
    resolution
  };
}

export function checkDraftText(
  presentation: StoryPrototypePresentation,
  option: StoryDecisionOption | undefined,
  draftText: string
): StoryControlConsistencyReport {
  const normalized = normalizeText(draftText);
  const rules = buildConsistencyRules(presentation, option);
  const issues = rules.filter((rule) => rule.triggerPhrases.some((phrase) => normalized.includes(normalizeText(phrase))))
    .map(({ triggerPhrases: _triggerPhrases, ...issue }) => issue);

  if (draftText.trim().length === 0) {
    return {
      status: "not_checked",
      issues: [],
      summary: "No draft text to check."
    };
  }

  if (issues.length === 0) {
    return {
      status: "clear",
      issues: [],
      summary: "No obvious story consistency issue detected."
    };
  }

  return {
    status: "has_issues",
    issues,
    summary: `Detected ${issues.length} possible story impact${issues.length === 1 ? "" : "s"}.`
  };
}

export function buildState(input: {
  action: StoryControlActionName;
  actor?: StoryControlActor;
  draftText: string;
  logicalStep: number;
  scenario: StoryPrototypeScenario;
  selectedPathId?: StoryControlPathId;
  selectedOptionId?: string;
  stage: StoryControlStage;
  consistency?: StoryControlConsistencyReport;
  draftResolution?: StoryControlDraftResolutionState;
  previousHistory?: StoryControlState["history"];
}): StoryControlState {
  const selectedOption = input.selectedOptionId
    ? input.scenario.presentation.decisionOptions.find((option) => option.id === input.selectedOptionId)
    : undefined;
  const draftResolution = input.draftResolution ?? createDraftResolutionState();
  const model = buildPrototypeModel(input.scenario.id, input.stage, input.draftText, selectedOption, draftResolution);
  const decisionStatus = input.selectedPathId === "keep_current_world"
    ? "rejected"
    : selectedOption
      ? "accepted"
      : "pending";
  const history = input.previousHistory ?? [];
  const nextStateCore = {
    action: input.action,
    actor: input.actor ?? "user",
    consistency: input.consistency,
    decisionStatus,
    draftResolution: input.draftResolution,
    draftText: input.draftText,
    selectedOption,
    stage: input.stage
  };
  return {
    version: "world-os-story-control-state-v1",
    project: {
      title: "雾中灯塔",
      currentChapter: "第三章",
      currentScene: "地下室门前"
    },
    stage: input.stage,
    scenarioId: input.scenario.id,
    rawStoryText: input.scenario.input,
    selectedPathId: input.selectedPathId,
    selectedOptionId: input.selectedOptionId,
    authorDecision: {
      status: decisionStatus,
      selectedPathId: input.selectedPathId,
      selectedOptionId: input.selectedOptionId,
      label: selectedOption?.label,
      consequences: selectedOption ? selectedOption.result.impacts : []
    },
    analysis: createAnalysisState(input.scenario),
    worldUpdate: decisionStatus === "accepted" ? createWorldUpdateState(selectedOption) : createWorldUpdateState(),
    draft: createDraftState(input.draftText, input.consistency, draftResolution),
    ui: {
      prototypeModel: model
    },
    logicalStep: input.logicalStep,
    history: input.logicalStep === 0
      ? history
      : [
          ...history,
          {
            logicalStep: input.logicalStep,
            actor: nextStateCore.actor,
            action: input.action,
            stage: input.stage,
            summary: summarizeAction(input.action, input.stage),
            operation: describeOperation(nextStateCore)
          }
        ]
  };
}

export function getScenarioFromState(state: StoryControlState): StoryPrototypeScenario {
  const model = buildPrototypeModel(state.scenarioId, state.stage, state.draft.text);
  return getScenario(model, state.scenarioId);
}

export function getSelectedOptionFromState(state: StoryControlState): StoryDecisionOption | undefined {
  const scenario = getScenarioFromState(state);

  return state.selectedOptionId
    ? scenario.presentation.decisionOptions.find((option) => option.id === state.selectedOptionId)
    : undefined;
}

function buildPrototypeModel(
  scenarioId: StoryPrototypeScenarioId,
  stage: StoryControlStage,
  draftText = "",
  selectedOption?: StoryDecisionOption,
  draftResolution: StoryControlDraftResolutionState = createDraftResolutionState()
): StoryProductPrototypeModel {
  const model = createStoryProductPrototypeModel({ activeScenarioId: scenarioId });
  model.authorLoop.activeStage = stage;
  model.authorLoop.draftWorkspace.draftEditor.currentText = draftText;
  model.authorLoop.draftWorkspace.draftResolution = buildDraftResolutionProjection(draftResolution.status);

  if (selectedOption) {
    model.authorLoop.worldUpdate = createWorldUpdateState(selectedOption);
    model.authorLoop.writingReturn = {
      updatedWorldState: [
        ...selectedOption.result.preview.characters,
        ...selectedOption.result.preview.relationships,
        ...selectedOption.result.preview.story
      ],
      sceneContext: [
        model.writingWorkspace.scene.purpose,
        model.writingWorkspace.scene.conflict,
        ...model.writingWorkspace.scene.beats.slice(0, 3)
      ],
      nextWritingAction: "继续写这一幕"
    };
    model.authorLoop.writingWorkspaceRuntime.worldContext.affectedCharacters = selectedOption.result.preview.characters;
    model.authorLoop.writingWorkspaceRuntime.worldContext.currentRelationships = selectedOption.result.preview.relationships;
    model.authorLoop.writingWorkspaceRuntime.worldContext.preservedMysteries = selectedOption.result.preview.preserved;
    model.authorLoop.draftWorkspace.worldGuard.characterState = selectedOption.result.preview.characters;
    model.authorLoop.draftWorkspace.worldGuard.relationshipState = selectedOption.result.preview.relationships;
  }

  return model;
}

function buildConsistencyRules(presentation: StoryPrototypePresentation, option?: StoryDecisionOption): Array<{
  issue: string;
  affectedElement: string;
  explanation: string;
  optionalAction: string;
  triggerPhrases: string[];
}> {
  return [
    {
      issue: "可能提前揭开地下室秘密。",
      affectedElement: "锁定事实",
      explanation: "当前场景要求保留地下室核心秘密；如果正文直接写出全部真相，悬念会被提前消解。",
      optionalAction: "保留线索，只透露部分信息。",
      triggerPhrases: ["全部真相", "完整真相", "核心秘密", "地下室真相"]
    },
    {
      issue: "阿岚可能获得地下室访问权限。",
      affectedElement: "角色状态",
      explanation: "如果正文把钥匙、入口或完整路径交给阿岚，她会从获得部分信息变成拥有实际进入能力。",
      optionalAction: "改为给阿岚一条模糊线索，保留进入权限在林远手里。",
      triggerPhrases: ["钥匙交给阿岚", "把钥匙给阿岚", "交给阿岚", "入口告诉阿岚"]
    },
    {
      issue: "灯塔规则可能被正文改写。",
      affectedElement: "世界规则",
      explanation: "当前世界仍锁定灯塔显影、潮门与工业时代限制；正文不能用便利设定直接绕过这些规则。",
      optionalAction: "把变化写成角色误判或临时现象，不直接改写规则。",
      triggerPhrases: ["规则失效", "灯塔不再", "潮门自动开启", "现代设备", "电梯"]
    },
    {
      issue: "可能触发新的故事事件。",
      affectedElement: "事件影响",
      explanation: "正文如果写出新的行动或交接，会产生后续需要作者确认的世界变化。",
      optionalAction: "记录为待分析变化，再决定是否进入影响评审。",
      triggerPhrases: ["交给", "打开", "带走", "离开灯塔", "公开"]
    },
    ...buildProtectedFactRules(presentation, option)
  ];
}

function buildProtectedFactRules(
  presentation: StoryPrototypePresentation,
  option?: StoryDecisionOption
): Array<{
  issue: string;
  affectedElement: string;
  explanation: string;
  optionalAction: string;
  triggerPhrases: string[];
}> {
  const preserved = option?.result.preview.preserved ?? [];
  const protectedFacts = [...presentation.lockedFacts.slice(0, 2), ...preserved];

  return protectedFacts.map((fact, index) => ({
    issue: `可能触碰锁定事实：${fact}`,
    affectedElement: "锁定事实",
    explanation: `当前路径仍要求保留：${fact}`,
    optionalAction: "保留该事实，必要时回到影响评审。",
    triggerPhrases: [`破坏锁定事实${index + 1}`]
  }));
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s/g, "");
}

function summarizeAction(action: StoryControlActionName, stage: StoryControlStage): string {
  return `${action} -> ${stage}`;
}

function describeOperation(input: {
  action: StoryControlActionName;
  actor: StoryControlActor;
  consistency?: StoryControlConsistencyReport;
  decisionStatus: "pending" | "accepted" | "rejected";
  draftResolution?: StoryControlDraftResolutionState;
  draftText: string;
  selectedOption?: StoryDecisionOption;
  stage: StoryControlStage;
}): StoryControlState["history"][number]["operation"] {
  const stageLabel = getStageLabel(input.stage);
  const optionLabel = input.selectedOption?.result.choice ?? input.selectedOption?.label;

  if (input.action === "getProjectHome") {
    return operation(input.actor, "打开项目", stageLabel, "看到当前创作入口", "继续当前创作");
  }

  if (input.action === "continueCurrentWriting") {
    return operation(input.actor, "继续当前创作", stageLabel, "进入当前章节与场景", "分析这一段");
  }

  if (input.action === "analyzeStoryInput") {
    return operation(input.actor, "分析故事输入", stageLabel, "发现故事影响", "等待作者选择");
  }

  if (input.action === "chooseStoryPath") {
    if (input.decisionStatus === "rejected") {
      return operation(input.actor, "选择故事路径", stageLabel, "保持当前世界", "回到作者输入");
    }

    return operation(
      input.actor,
      "选择故事路径",
      stageLabel,
      optionLabel ? `已选择：${optionLabel}` : "等待作者选择",
      "预览世界更新"
    );
  }

  if (input.action === "applyWorldUpdatePreview") {
    return operation(input.actor, "确认世界更新", stageLabel, "世界变化已显像", "继续场景规划");
  }

  if (input.action === "enterWritingWorkspace") {
    return operation(input.actor, "继续场景规划", stageLabel, "写作上下文已更新", "继续写这一幕");
  }

  if (input.action === "enterDraftWorkspace") {
    return operation(input.actor, "进入草稿工作台", stageLabel, "草稿上下文已打开", "继续手写正文");
  }

  if (input.action === "updateDraftText") {
    return operation(
      input.actor,
      "写入草稿",
      stageLabel,
      input.draftText.trim().length > 0 ? "草稿已写入本地状态" : "草稿仍为空",
      "检查这一幕"
    );
  }

  if (input.action === "checkDraftConsistency") {
    const issueCount = input.consistency?.issues.length ?? 0;
    const result =
      input.consistency?.status === "has_issues"
        ? `发现 ${issueCount} 个可能影响`
        : input.consistency?.status === "clear"
          ? "未发现明显冲突"
          : "没有可检查的正文";

    return operation(input.actor, "检查草稿", stageLabel, result, "等待作者决定");
  }

  if (input.action === "resolveDraft") {
    return operation(
      input.actor,
      "处理草稿",
      stageLabel,
      input.draftResolution?.result ?? "等待作者处理草稿检查结果",
      input.draftResolution?.nextStep ?? "选择草稿处理方式"
    );
  }

  return operation(input.actor, "读取当前状态", stageLabel, "当前状态已同步", "继续当前创作");
}

function operation(
  actor: StoryControlActor,
  actionLabel: string,
  stageLabel: string,
  result: string,
  nextStep: string
): StoryControlState["history"][number]["operation"] {
  return {
    actorLabel: getActorLabel(actor),
    actionLabel,
    stageLabel,
    result,
    nextStep
  };
}

function getActorLabel(actor: StoryControlActor): string {
  const labels: Record<StoryControlActor, string> = {
    api: "接口",
    codex: "Codex",
    playwright: "Playwright",
    skill: "能力",
    user: "作者"
  };

  return labels[actor];
}

function getStageLabel(stage: StoryControlStage): string {
  const labels: Record<StoryControlStage, string> = {
    "draft-workspace": "草稿工作台",
    "impact-review": "影响评审",
    "project-home": "项目首页",
    "world-update": "世界更新",
    "writing": "写作状态",
    "writing-return": "写作工作台"
  };

  return labels[stage];
}
