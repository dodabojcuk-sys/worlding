import { simulateManualStoryInput } from "./domainTemplates/storyWorld/simulation/manualStorySimulation.ts";
import type { ManualSimulationResult } from "./domainTemplates/storyWorld/simulation/simulationTypes.ts";

export type StoryPrototypeScenarioId = "opening" | "direction_change" | "long_term_change";

export type StoryPrototypeScenario = {
  id: StoryPrototypeScenarioId;
  label: string;
  purpose: string;
  input: string;
  presentation: StoryPrototypePresentation;
  result: ManualSimulationResult;
};

export type StoryPrototypePresentation = {
  proposal: string;
  changeType: string;
  baseline: {
    characterState: string[];
    relationshipState: string[];
    worldState: string[];
  };
  evidence: string[];
  impacts: string[];
  risks: string[];
  alternatives: string[];
  decisionOptions: StoryDecisionOption[];
  scene: {
    id: string;
    purpose: string;
    conflict: string;
    beats: string[];
  };
  lockedFacts: string[];
  editable: string[];
};

export type StoryDecisionOption = {
  id: string;
  label: string;
  consequence: string;
  riskLevel: "低" | "中" | "高";
  affectedStoryElements: string[];
  result: {
    choice: string;
    impacts: string[];
    preview: StoryWorldImpactPreview;
    nextStep: "继续场景规划";
  };
};

export type StoryWorldImpactPreview = {
  characters: string[];
  relationships: string[];
  story: string[];
  preserved: string[];
};

export type StoryWorldUpdateProjection = {
  selectedPath: string;
  confirmedChanges: string[];
  affectedCharacters: string[];
  affectedRelationships: string[];
  affectedEvents: string[];
  preservedMysteries: string[];
  nextCreativeAction: "继续场景规划";
};

export type StoryProjectHomeProjection = {
  currentStory: {
    projectName: "雾中灯塔";
    currentChapter: "第三章";
    currentScene: "地下室门前";
    progress: string;
    focus: string;
  };
  continueWriting: {
    primaryAction: "继续当前创作";
    helperText: string;
  };
  worldStatus: {
    recentWorldChanges: string[];
    unresolvedMysteries: string[];
    lockedFacts: string[];
  };
  authorTasks: {
    unfinishedScenes: string[];
    pendingDecisions: string[];
    consistencyIssues: string[];
  };
  characterStatus: {
    importantCharacters: string[];
    recentChanges: string[];
  };
};

export type StoryWritingReturnProjection = {
  updatedWorldState: string[];
  sceneContext: string[];
  nextWritingAction: "继续写这一幕";
};

export type StoryWritingWorkspaceRuntimeProjection = {
  currentScene: {
    chapter: string;
    sceneName: string;
    sceneGoal: string;
    sceneBeats: string[];
  };
  worldContext: {
    affectedCharacters: string[];
    currentRelationships: string[];
    lockedWorldFacts: string[];
    preservedMysteries: string[];
  };
  writingGuidance: {
    shouldHappen: string[];
    mustNotHappen: string[];
    creativeDirections: string[];
  };
  authorControl: {
    primaryAction: "继续写这一幕";
    reminders: string[];
  };
};

export type StoryDraftWorkspaceProjection = {
  sceneContext: {
    chapter: string;
    sceneName: string;
    goal: string;
    beats: string[];
  };
  draftEditor: {
    currentText: string;
    placeholder: string;
  };
  worldGuard: {
    lockedFacts: string[];
    characterState: string[];
    relationshipState: string[];
    forbiddenChanges: string[];
  };
  draftStatus: {
    current: "unsaved";
    available: ["unsaved", "reviewed", "ready_for_commit"];
    labels: {
      unsaved: "未保存";
      reviewed: "已检查";
      ready_for_commit: "可确认";
    };
  };
  authorControl: {
    primaryAction: "继续手写正文";
    reminders: string[];
  };
  consistencyCheck: StoryDraftConsistencyProjection;
  draftResolution: StoryDraftResolutionProjection;
};

export type StoryDraftConsistencyProjection = {
  status: "not_checked";
  primaryAction: "检查这一幕";
  emptyState: string;
  rules: StoryDraftConsistencyRule[];
  authorDecisionPrompts: string[];
};

export type StoryDraftConsistencyRule = {
  id: string;
  issue: string;
  affectedElement: string;
  explanation: string;
  optionalAction: string;
  triggerPhrases: string[];
};

export type StoryDraftResolutionProjection = {
  status: "unresolved" | "revise" | "ready" | "review_impact";
  prompt: string;
  selectedAction: string;
  result: string;
  nextStep: string;
  options: Array<{
    id: "revise" | "mark_ready" | "review_impact";
    label: "继续修改" | "确认这一幕" | "送回影响评审";
    description: string;
  }>;
};

export type StoryProductPrototypeModel = {
  version: "world-os-story-product-prototype-runtime-v1";
  project: {
    title: "雾中灯塔";
    chapter: "第三章";
    scene: "地下室门前";
  };
  primaryAction: "Analyze story input";
  inputPanel: {
    title: "作者输入";
    defaultText: string;
    examples: StoryPrototypeScenario[];
  };
  simulation: ManualSimulationResult;
  tianyiPanel: {
    title: "天意";
    authorDecisionRequired: true;
    proposal: string;
    changeType: string;
    baseline: StoryPrototypePresentation["baseline"];
    evidence: string[];
    impacts: string[];
    risks: string[];
    alternatives: string[];
    decisionOptions: StoryDecisionOption[];
  };
  writingWorkspace: {
    chapterTitle: string;
    scene: {
      id: string;
      purpose: string;
      conflict: string;
      beats: string[];
      lockedFacts: string[];
      editable: string[];
    };
  };
  authorLoop: {
    stages: ["project-home", "writing", "impact-review", "world-update", "writing-return", "draft-workspace"];
    activeStage: "project-home" | "writing" | "impact-review" | "world-update" | "writing-return" | "draft-workspace";
    projectHome: StoryProjectHomeProjection;
    worldUpdate: StoryWorldUpdateProjection;
    writingReturn: StoryWritingReturnProjection;
    writingWorkspaceRuntime: StoryWritingWorkspaceRuntimeProjection;
    draftWorkspace: StoryDraftWorkspaceProjection;
  };
  prototypeLimits: string[];
};

const scenarioInputs: Array<Omit<StoryPrototypeScenario, "result">> = [
  {
    id: "opening",
    label: "简单开头",
    purpose: "验证基础识别",
    input: ["林远住在海边灯塔。", "一天，他收到一封来自十年前的旧信。"].join("\n"),
    presentation: {
      proposal: "处理十年前旧信",
      changeType: "新线索进入",
      baseline: {
        characterState: ["林远住在灯塔附近，但尚未理解旧信含义。"],
        relationshipState: ["林远与灯塔的关系仍是日常守望。"],
        worldState: ["灯塔规则稳定；地下室仍未被触发。"]
      },
      evidence: [
        "旧信已经进入当前输入，但内容仍未完全确认。",
        "林远尚未理解旧信与地下室之间的关系。",
        "灯塔规则仍处于锁定状态，不能由线索输入直接改写。"
      ],
      impacts: [
        "林远获得来自旧信的新信息，但真相仍未确认。",
        "旧信成为进入地下室前的触发线索。",
        "灯塔规则保持锁定，不会因为这段输入自动改写。"
      ],
      risks: [
        "如果旧信直接解释真相，地下室悬念会提前下降。",
        "如果灯塔规则被临时改写，后续世界一致性会变弱。"
      ],
      alternatives: ["立即展示旧信内容", "只露出一条可追踪线索", "延后揭示旧信来源"],
      decisionOptions: [
        {
          id: "full-letter",
          label: "展示旧信内容",
          consequence: "作者会获得更清晰的信息推进，但地下室谜题提前变浅。",
          riskLevel: "中",
          affectedStoryElements: ["林远", "旧信", "地下室悬念"],
          result: {
            choice: "展示旧信内容",
            impacts: ["林远获得明确线索。", "地下室秘密的悬念会下降。"],
            preview: {
              characters: ["林远获得明确线索。"],
              relationships: ["林远与旧信的关系从未知转为指向地下室。"],
              story: ["地下室秘密更快进入明线。"],
              preserved: ["灯塔显影规则保持不变。"]
            },
            nextStep: "继续场景规划"
          }
        },
        {
          id: "partial-clue",
          label: "只露出一条线索",
          consequence: "作者保留谜题压力，同时让林远获得可行动的方向。",
          riskLevel: "低",
          affectedStoryElements: ["林远", "旧信", "灯塔规则"],
          result: {
            choice: "只露出一条线索",
            impacts: ["林远获得部分信息。", "地下室真相仍被保留。"],
            preview: {
              characters: ["林远获得部分信息。"],
              relationships: ["林远与旧信形成可追踪但未确认的联系。"],
              story: ["地下室线继续推进，但真相仍被遮蔽。"],
              preserved: ["地下室核心秘密未公开。", "灯塔规则保持锁定。"]
            },
            nextStep: "继续场景规划"
          }
        },
        {
          id: "delay-letter",
          label: "延后揭示来源",
          consequence: "作者保持最大悬念，但当前场景需要更强的行动理由。",
          riskLevel: "中",
          affectedStoryElements: ["旧信来源", "当前场景动力", "后续章节"],
          result: {
            choice: "延后揭示来源",
            impacts: ["旧信来源延后揭示。", "当前场景需要依靠环境压力推进。"],
            preview: {
              characters: ["林远暂时只感到异常压力。"],
              relationships: ["旧信仍像外部干扰，而不是明确指引。"],
              story: ["当前场景以环境悬疑推进。"],
              preserved: ["旧信来源未公开。", "地下室真相未公开。"]
            },
            nextStep: "继续场景规划"
          }
        }
      ],
      scene: {
        id: "S2 · 地下室门前",
        purpose: "让林远接近秘密，但不要直接揭开真相。",
        conflict: "林远想打开地下室，旧信却只给出模糊方向。",
        beats: ["进入灯塔", "确认旧信线索", "发现门后异常", "停在是否打开的选择前", "以未确认线索收束"]
      },
      lockedFacts: [
        "林远尚不知道地下秘密。",
        "旧信内容未完全确认。",
        "灯塔只在海雾中显影。",
        "潮门不能主动开启。",
        "工业时代技术水平不得自动跃迁。"
      ],
      editable: ["措辞", "节奏", "环境描写", "角色内心"]
    }
  },
  {
    id: "direction_change",
    label: "剧情改变",
    purpose: "验证影响分析",
    input: "林远决定告诉阿岚关于地下室的秘密。",
    presentation: {
      proposal: "告诉阿岚地下室秘密",
      changeType: "角色关系变化",
      baseline: {
        characterState: ["林远知道地下室存在，但仍保留秘密。", "阿岚不知道地下室的核心真相。"],
        relationshipState: ["林远与阿岚仍是普通伙伴，尚未共享秘密。"],
        worldState: ["地下室线索未公开；灯塔规则和已发生事件锁定。"]
      },
      evidence: [
        "阿岚当前不知道地下室核心真相。",
        "林远仍保留秘密，是当前关系张力的来源。",
        "地下室线索尚未公开，所以透露范围会直接改变悬念分配。"
      ],
      impacts: [
        "阿岚会提前进入秘密线，角色关系从旁观转向共谋。",
        "地下室秘密的暴露速度变快，后续悬念需要重新分配。",
        "林远的信任选择会改变第三章之后的关系张力。"
      ],
      risks: [
        "过早告知阿岚会削弱林远独自探索的压力。",
        "如果阿岚立刻相信，会让冲突不足。"
      ],
      alternatives: ["只告诉阿岚一部分线索", "让阿岚误解这条线索", "延后到下一场景再透露"],
      decisionOptions: [
        {
          id: "full-reveal",
          label: "告诉全部",
          consequence: "阿岚立刻进入秘密线，关系推进更快，但悬念损耗明显。",
          riskLevel: "高",
          affectedStoryElements: ["阿岚", "林远", "地下室秘密"],
          result: {
            choice: "告诉全部",
            impacts: ["阿岚获得完整信息。", "地下室秘密提前暴露。"],
            preview: {
              characters: ["阿岚获得完整秘密。"],
              relationships: ["林远与阿岚转向共谋关系。"],
              story: ["地下室线快速推进，悬念明显下降。"],
              preserved: ["灯塔规则不变。"]
            },
            nextStep: "继续场景规划"
          }
        },
        {
          id: "partial-clue",
          label: "透露部分线索",
          consequence: "阿岚获得可行动的信息，但完整秘密仍由林远保留。",
          riskLevel: "中",
          affectedStoryElements: ["阿岚", "关系信任", "悬念"],
          result: {
            choice: "透露部分线索",
            impacts: ["阿岚获得部分信息。", "悬念保留。"],
            preview: {
              characters: ["阿岚获得部分信息。"],
              relationships: ["林远与阿岚的信任增加，但信息不对称仍保留。"],
              story: ["地下室线继续推进。"],
              preserved: ["秘密核心未公开。", "林远仍是第一发现者。"]
            },
            nextStep: "继续场景规划"
          }
        },
        {
          id: "delay-reveal",
          label: "延迟透露",
          consequence: "林远暂时保留主动权，但需要给阿岚一个合理的误导或等待理由。",
          riskLevel: "低",
          affectedStoryElements: ["林远", "阿岚", "下一场景"],
          result: {
            choice: "延迟透露",
            impacts: ["林远暂时保留秘密。", "阿岚的疑问转入下一场景。"],
            preview: {
              characters: ["林远暂时保留秘密。"],
              relationships: ["阿岚的疑问被延后，信任压力增加。"],
              story: ["分享秘密转入下一场景。"],
              preserved: ["地下室秘密仍未进入阿岚视角。"]
            },
            nextStep: "继续场景规划"
          }
        }
      ],
      scene: {
        id: "S2 · 告知边界",
        purpose: "让林远尝试分享秘密，同时保留不确定性。",
        conflict: "林远需要阿岚帮助，但担心秘密扩散。",
        beats: ["提出试探", "阿岚追问", "林远隐去关键事实", "关系出现裂缝", "留下下一步合作条件"]
      },
      lockedFacts: [
        "地下室秘密尚未公开。",
        "林远仍是第一发现者。",
        "阿岚不能无依据掌握完整真相。",
        "已确认事件不能被对话直接取消。"
      ],
      editable: ["对白", "心理拉扯", "节奏压缩", "误导信息"]
    }
  },
  {
    id: "long_term_change",
    label: "长期变化",
    purpose: "验证一致性压力",
    input: "第五章林远失去了守塔人的身份。",
    presentation: {
      proposal: "处理林远失去守塔人身份",
      changeType: "长期身份变化",
      baseline: {
        characterState: ["林远仍被默认视为守塔人。"],
        relationshipState: ["林远与灯塔规则存在合法职责关系。"],
        worldState: ["第五章之后仍可使用守塔人权限，除非作者确认变化。"]
      },
      evidence: [
        "林远的守塔人身份目前仍是后续行动的默认前提。",
        "灯塔进入规则依赖守塔人职责关系。",
        "第五章之后的行动权限会受身份变化影响。"
      ],
      impacts: [
        "林远的社会身份发生变化，后续行动权限会收窄。",
        "守塔人职责线需要新增交接或空缺解释。",
        "第五章之后的灯塔进入权需要重新检查。"
      ],
      risks: [
        "身份变化会影响后续章节的行动合法性。",
        "如果没有替代守塔人，灯塔规则可能出现管理空缺。"
      ],
      alternatives: ["暂时停职", "秘密失去身份但外界未知", "让另一个角色接管守塔职责"],
      decisionOptions: [
        {
          id: "temporary-suspension",
          label: "暂时停职",
          consequence: "身份压力立刻出现，但后续仍保留恢复空间。",
          riskLevel: "中",
          affectedStoryElements: ["林远身份", "灯塔权限", "第五章"],
          result: {
            choice: "暂时停职",
            impacts: ["林远行动权限下降。", "守塔人职责仍可恢复。"],
            preview: {
              characters: ["林远行动权限下降。"],
              relationships: ["林远与灯塔职责暂时断开。"],
              story: ["第五章进入身份压力线。"],
              preserved: ["守塔人身份仍可恢复。"]
            },
            nextStep: "继续场景规划"
          }
        },
        {
          id: "secret-loss",
          label: "秘密失去身份",
          consequence: "外部秩序暂时稳定，但林远内部行动风险上升。",
          riskLevel: "低",
          affectedStoryElements: ["林远", "守塔职责", "隐秘冲突"],
          result: {
            choice: "秘密失去身份",
            impacts: ["林远失去身份但外界未知。", "冲突转为隐性压力。"],
            preview: {
              characters: ["林远失去身份但外界未知。"],
              relationships: ["外部关系暂时稳定，内部冲突增强。"],
              story: ["第五章出现隐性身份风险。"],
              preserved: ["外界仍以旧身份看待林远。"]
            },
            nextStep: "继续场景规划"
          }
        },
        {
          id: "new-keeper",
          label: "另一个角色接管",
          consequence: "世界规则得到补位，但需要引入新的权力关系。",
          riskLevel: "高",
          affectedStoryElements: ["新守塔人", "灯塔规则", "角色关系"],
          result: {
            choice: "另一个角色接管",
            impacts: ["灯塔职责被重新分配。", "林远与新守塔人产生关系压力。"],
            preview: {
              characters: ["新守塔人获得职责。", "林远失去原有权限。"],
              relationships: ["林远与新守塔人产生权力关系。"],
              story: ["灯塔线进入交接冲突。"],
              preserved: ["灯塔规则仍然有效。"]
            },
            nextStep: "继续场景规划"
          }
        }
      ],
      scene: {
        id: "S5 · 身份失效",
        purpose: "表现林远失去守塔人身份后的世界压力。",
        conflict: "林远仍需要进入灯塔，但身份已经不再保护他。",
        beats: ["身份被撤销", "行动权限受阻", "旧规则开始反噬", "角色寻找替代路径", "以新的限制进入下一章"]
      },
      lockedFacts: [
        "身份变化必须来自已确认事件。",
        "灯塔进入规则仍然有效。",
        "后续章节不能默认林远仍有守塔人权限。",
        "世界规则不能自动迁就角色行动。"
      ],
      editable: ["场面调度", "冲突强度", "人物反应", "章节收束"]
    }
  }
];

export function createStoryProductPrototypeModel(
  input: { activeScenarioId?: StoryPrototypeScenarioId } = {}
): StoryProductPrototypeModel {
  const examples = scenarioInputs.map((scenario) => ({
    ...scenario,
    result: simulateManualStoryInput(scenario.input)
  }));
  const activeScenario = examples.find((scenario) => scenario.id === input.activeScenarioId) ?? examples[0];
  const presentation = activeScenario.presentation;
  const defaultOption = getDefaultDecisionOption(presentation.decisionOptions);

  return cloneData({
    version: "world-os-story-product-prototype-runtime-v1",
    project: {
      title: "雾中灯塔",
      chapter: "第三章",
      scene: "地下室门前"
    },
    primaryAction: "Analyze story input",
    inputPanel: {
      title: "作者输入",
      defaultText: activeScenario.input,
      examples
    },
    simulation: activeScenario.result,
    tianyiPanel: {
      title: "天意",
      authorDecisionRequired: activeScenario.result.decisionState.authorDecisionRequired,
      proposal: presentation.proposal,
      changeType: presentation.changeType,
      baseline: presentation.baseline,
      evidence: presentation.evidence,
      impacts: presentation.impacts,
      risks: presentation.risks,
      alternatives: presentation.alternatives,
      decisionOptions: presentation.decisionOptions
    },
    writingWorkspace: {
      chapterTitle: activeScenario.result.uiProjection.activeChapter.title,
      scene: {
        id: presentation.scene.id,
        purpose: presentation.scene.purpose,
        conflict: presentation.scene.conflict,
        beats: presentation.scene.beats,
        lockedFacts: presentation.lockedFacts,
        editable: presentation.editable
      }
    },
    authorLoop: {
      stages: ["project-home", "writing", "impact-review", "world-update", "writing-return", "draft-workspace"],
      activeStage: "project-home",
      projectHome: buildProjectHomeProjection(activeScenario, defaultOption),
      worldUpdate: buildWorldUpdateProjection(defaultOption),
      writingReturn: buildWritingReturnProjection(presentation, defaultOption),
      writingWorkspaceRuntime: buildWritingWorkspaceRuntimeProjection(
        activeScenario.result.uiProjection.activeChapter.title,
        presentation,
        defaultOption
      ),
      draftWorkspace: buildDraftWorkspaceProjection(
        activeScenario.result.uiProjection.activeChapter.title,
        presentation,
        defaultOption
      )
    },
    prototypeLimits: [
      "No generated prose.",
      "No direct world change.",
      "Author decision is required."
    ]
  });
}

function getDefaultDecisionOption(options: StoryDecisionOption[]): StoryDecisionOption {
  return options.find((option) => option.id === "partial-clue") ?? options[0];
}

function buildProjectHomeProjection(
  scenario: StoryPrototypeScenario,
  option: StoryDecisionOption
): StoryProjectHomeProjection {
  const presentation = scenario.presentation;
  const detectedCharacters = scenario.result.worldObjects.characters.map((character) => character.name);
  const importantCharacters = detectedCharacters.length > 0 ? detectedCharacters : ["林远", "阿岚"];

  return {
    currentStory: {
      projectName: "雾中灯塔",
      currentChapter: "第三章",
      currentScene: "地下室门前",
      progress: "第三章进行中",
      focus: `完成 ${presentation.scene.id}`
    },
    continueWriting: {
      primaryAction: "继续当前创作",
      helperText: "从当前场景进入写作，不重新输入故事。"
    },
    worldStatus: {
      recentWorldChanges: [
        ...option.result.preview.characters,
        ...option.result.preview.relationships,
        ...option.result.preview.story
      ],
      unresolvedMysteries: option.result.preview.preserved,
      lockedFacts: presentation.lockedFacts.slice(0, 4)
    },
    authorTasks: {
      unfinishedScenes: [
        presentation.scene.id,
        ...presentation.scene.beats.slice(-2)
      ],
      pendingDecisions: [
        presentation.proposal,
        "草稿检查后由作者决定是否回到影响评审。"
      ],
      consistencyIssues: buildMustNotHappen(presentation, option).slice(0, 3)
    },
    characterStatus: {
      importantCharacters,
      recentChanges: [
        ...option.result.preview.characters,
        ...option.result.preview.relationships
      ]
    }
  };
}

function buildWorldUpdateProjection(option: StoryDecisionOption): StoryWorldUpdateProjection {
  return {
    selectedPath: option.result.choice,
    confirmedChanges: option.result.impacts,
    affectedCharacters: option.result.preview.characters,
    affectedRelationships: option.result.preview.relationships,
    affectedEvents: option.result.preview.story,
    preservedMysteries: option.result.preview.preserved,
    nextCreativeAction: option.result.nextStep
  };
}

function buildWritingReturnProjection(
  presentation: StoryPrototypePresentation,
  option: StoryDecisionOption
): StoryWritingReturnProjection {
  return {
    updatedWorldState: [
      ...option.result.preview.characters,
      ...option.result.preview.relationships,
      ...option.result.preview.story
    ],
    sceneContext: [
      presentation.scene.purpose,
      presentation.scene.conflict,
      ...presentation.scene.beats.slice(0, 3)
    ],
    nextWritingAction: "继续写这一幕"
  };
}

function buildDraftWorkspaceProjection(
  chapterTitle: string,
  presentation: StoryPrototypePresentation,
  option: StoryDecisionOption
): StoryDraftWorkspaceProjection {
  return {
    sceneContext: {
      chapter: chapterTitle,
      sceneName: presentation.scene.id,
      goal: presentation.scene.purpose,
      beats: presentation.scene.beats
    },
    draftEditor: {
      currentText: "",
      placeholder: "在这里手写这一幕正文。系统只保留上下文，不自动生成。"
    },
    worldGuard: {
      lockedFacts: presentation.lockedFacts,
      characterState: option.result.preview.characters,
      relationshipState: option.result.preview.relationships,
      forbiddenChanges: buildMustNotHappen(presentation, option)
    },
    draftStatus: {
      current: "unsaved",
      available: ["unsaved", "reviewed", "ready_for_commit"],
      labels: {
        unsaved: "未保存",
        reviewed: "已检查",
        ready_for_commit: "可确认"
      }
    },
    authorControl: {
      primaryAction: "继续手写正文",
      reminders: [
        "用户手写正文。",
        "不自动生成正文。",
        "不自动更新世界。",
        "正文确认前只改变草稿状态。"
      ]
    },
    consistencyCheck: buildDraftConsistencyProjection(),
    draftResolution: buildDraftResolutionProjection()
  };
}

export function buildDraftResolutionProjection(
  status: StoryDraftResolutionProjection["status"] = "unresolved"
): StoryDraftResolutionProjection {
  const options: StoryDraftResolutionProjection["options"] = [
    {
      id: "revise",
      label: "继续修改",
      description: "保留检查结果，回到正文草稿继续调整。"
    },
    {
      id: "mark_ready",
      label: "确认这一幕",
      description: "确认当前草稿可以继续进入下一步创作。"
    },
    {
      id: "review_impact",
      label: "送回影响评审",
      description: "把草稿里的可能变化带回影响评审，不直接改世界。"
    }
  ];
  const copy: Record<StoryDraftResolutionProjection["status"], {
    selectedAction: string;
    result: string;
    nextStep: string;
  }> = {
    ready: {
      selectedAction: "确认这一幕",
      result: "这一幕可继续",
      nextStep: "继续下一步创作"
    },
    review_impact: {
      selectedAction: "送回影响评审",
      result: "可能影响已送回影响评审",
      nextStep: "重新查看故事影响"
    },
    revise: {
      selectedAction: "继续修改",
      result: "继续修改草稿",
      nextStep: "继续手写正文"
    },
    unresolved: {
      selectedAction: "尚未选择",
      result: "检查完成后等待作者处理",
      nextStep: "选择继续修改、确认这一幕或送回影响评审"
    }
  };

  return {
    status,
    prompt: "检查之后由作者决定草稿去向；不会自动改正文，也不会提交世界变化。",
    selectedAction: copy[status].selectedAction,
    result: copy[status].result,
    nextStep: copy[status].nextStep,
    options
  };
}

function buildDraftConsistencyProjection(): StoryDraftConsistencyProjection {
  return {
    status: "not_checked",
    primaryAction: "检查这一幕",
    emptyState: "写完一段后检查可能影响。检查只提示，不阻止写作。",
    rules: [
      {
        id: "locked-secret-reveal",
        issue: "可能提前揭开地下室秘密。",
        affectedElement: "锁定事实",
        explanation: "当前场景要求保留地下室核心秘密；如果正文直接写出全部真相，悬念会被提前消解。",
        optionalAction: "保留线索，只透露部分信息。",
        triggerPhrases: ["全部真相", "完整真相", "核心秘密", "地下室真相"]
      },
      {
        id: "alan-access-change",
        issue: "阿岚可能获得地下室访问权限。",
        affectedElement: "角色状态",
        explanation: "如果正文把钥匙、入口或完整路径交给阿岚，她会从获得部分信息变成拥有实际进入能力。",
        optionalAction: "改为给阿岚一条模糊线索，保留进入权限在林远手里。",
        triggerPhrases: ["钥匙交给阿岚", "把钥匙给阿岚", "交给阿岚", "入口告诉阿岚"]
      },
      {
        id: "lighthouse-rule-drift",
        issue: "灯塔规则可能被正文改写。",
        affectedElement: "世界规则",
        explanation: "当前世界仍锁定灯塔显影、潮门与工业时代限制；正文不能用便利设定直接绕过这些规则。",
        optionalAction: "把变化写成角色误判或临时现象，不直接改写规则。",
        triggerPhrases: ["规则失效", "灯塔不再", "潮门自动开启", "现代设备", "电梯"]
      },
      {
        id: "new-event-pressure",
        issue: "可能触发新的故事事件。",
        affectedElement: "事件影响",
        explanation: "正文如果写出新的行动或交接，会产生后续需要作者确认的世界变化。",
        optionalAction: "记录为待分析变化，再决定是否进入影响评审。",
        triggerPhrases: ["交给", "打开", "带走", "离开灯塔", "公开"]
      }
    ],
    authorDecisionPrompts: [
      "继续保留当前草稿",
      "回到影响评审",
      "调整正文后再检查"
    ]
  };
}

function buildWritingWorkspaceRuntimeProjection(
  chapterTitle: string,
  presentation: StoryPrototypePresentation,
  option: StoryDecisionOption
): StoryWritingWorkspaceRuntimeProjection {
  return {
    currentScene: {
      chapter: chapterTitle,
      sceneName: presentation.scene.id,
      sceneGoal: presentation.scene.purpose,
      sceneBeats: presentation.scene.beats
    },
    worldContext: {
      affectedCharacters: option.result.preview.characters,
      currentRelationships: option.result.preview.relationships,
      lockedWorldFacts: presentation.lockedFacts,
      preservedMysteries: option.result.preview.preserved
    },
    writingGuidance: {
      shouldHappen: [
        option.result.choice,
        ...option.result.impacts,
        presentation.scene.conflict
      ],
      mustNotHappen: buildMustNotHappen(presentation, option),
      creativeDirections: presentation.editable
    },
    authorControl: {
      primaryAction: "继续写这一幕",
      reminders: [
        "不自动生成正文。",
        "不自动改变世界。",
        "只围绕已确认的世界状态继续写。"
      ]
    }
  };
}

function buildMustNotHappen(
  presentation: StoryPrototypePresentation,
  option: StoryDecisionOption
): string[] {
  const preserved = option.result.preview.preserved.map((item) => {
    if (item.includes("秘密核心")) return "不能直接公开地下室核心秘密。";
    if (item.includes("地下室核心")) return "不能直接公开地下室核心秘密。";
    if (item.includes("第一发现者")) return "不能取消林远第一发现者位置。";
    if (item.includes("灯塔规则")) return "不能改写灯塔规则。";
    if (item.includes("旧信来源")) return "不能提前解释旧信来源。";
    if (item.includes("外界")) return "不能让外界立刻知道真实身份变化。";

    return `不能推翻：${item}`;
  });

  return [...preserved, ...presentation.lockedFacts.slice(0, 2)];
}

function cloneData<T>(value: T): T {
  return structuredClone(value);
}
