/**
 * Static, presentation-only capability presets for Tianyi's work dock.
 * Presets describe bounded requests; they do not own data, invoke a runtime,
 * or grant permission to write any semantic owner.
 */
export type TianyiContextualSpaceId =
  | "world"
  | "tianyi"
  | "event-line"
  | "multiverse"
  | "nuwa"
  | "library"
  | "writing"
  | "data";

export type TianyiContextualCapability = {
  id: string;
  label: string;
  description: string;
  kind: "read" | "plan" | "candidate";
};

export type TianyiContextualCapabilityDefinition = {
  space: TianyiContextualSpaceId;
  displayName: string;
  scopeLabel: string;
  capabilities: readonly TianyiContextualCapability[];
};

const capability = (id: string, label: string, description: string, kind: TianyiContextualCapability["kind"] = "read"): TianyiContextualCapability => ({ id, label, description, kind });

export const TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY: readonly TianyiContextualCapabilityDefinition[] = [
  { space: "world", displayName: "世界", scopeLabel: "当前世界与来源", capabilities: [capability("world-summary", "整理当前世界", "只读汇总已确认对象、规则与来源"), capability("world-gaps", "找出资料缺口", "列出缺少来源或仍待确认的部分"), capability("world-candidates", "提出资料候选", "候选先留在审查，不自动写入资料") ] },
  { space: "tianyi", displayName: "天意", scopeLabel: "当前天意会话", capabilities: [capability("session-summary", "整理当前会话", "把本次对话压缩成带来源的摘要"), capability("session-dedupe", "查找重复线索", "比较当前会话中的重复内容"), capability("session-questions", "列出未解决问题", "保留作者仍需判断的问题") ] },
  { space: "event-line", displayName: "事件线", scopeLabel: "当前节点、因果与开放问题", capabilities: [capability("event-selection-read", "读取当前选择", "读取当前 Event 节点、来源与版本"), capability("event-causality-check", "检查明确因果", "只检查已有明确因果边，不把相邻当因果"), capability("event-open-questions", "查找开放问题", "汇总当前节点和集点的来源锚定问题"), capability("event-knowledge-boundary", "检查角色所知边界", "只读比较角色参与和已知来源"), capability("event-pacing-conflict", "解释局部节奏与冲突", "基于已有证据形成局部解释，未知时明确标记"), capability("event-follow-up-candidate", "生成后续候选", "形成带来源的候选，等待作者审查", "candidate") ] },
  { space: "multiverse", displayName: "多元", scopeLabel: "当前派生范围", capabilities: [capability("multiverse-compare", "比较派生版本", "只读比较不同视角或分支"), capability("multiverse-pov", "转换叙事视角", "生成待审的视角方案", "candidate"), capability("multiverse-localize", "准备本地化方向", "输出不覆盖主线的本地化建议", "plan") ] },
  { space: "nuwa", displayName: "女娲", scopeLabel: "当前排演、临时走向与作者来源", capabilities: [capability("nuwa-step-explain", "解释当前步骤", "解释来源、角色当时所知与可能变化"), capability("nuwa-knowledge-boundary", "检查角色知识边界", "只读检查未来知识、跨角色秘密和未授权来源"), capability("nuwa-forbidden-change", "查找违反禁止事项的变化", "对照作者明确禁止改变的内容"), capability("nuwa-branch-diff", "列出两个结果的差异", "比较事件、行动、知识、信念、来源与规则冲突"), capability("nuwa-unsupported-source", "查找没有来源的变化", "列出缺失、冲突或过期来源，并阻止送审"), capability("nuwa-steering", "准备导演纠正", "只准备影响后续步骤的可逆指令", "plan"), capability("nuwa-candidates", "准备候选送审", "整理临时走向、作者来源与影响范围，进入既有审查流程", "candidate") ] },
  { space: "library", displayName: "资料", scopeLabel: "当前资料、状态与关系", capabilities: [capability("library-character-boundary", "检查角色知识边界", "只读验证当前角色可知信息与来源范围"), capability("library-character-unknown", "列出明确未知", "不把没有证据视为已经知道"), capability("library-character-conflict", "查找来源冲突", "同时保留冲突两侧并等待作者判断"), capability("library-character-relation-view", "查看关系认知差异", "区分 Relation truth 与双方角色理解"), capability("library-character-state-candidate", "准备状态补充候选", "只进入既有 Candidate/Impact Review", "candidate"), capability("library-organize", "整理未归类资料", "按现有资料 owner 提出整理建议", "candidate"), capability("library-duplicates", "查找重复资料", "只读比较对象、来源与版本"), capability("library-richness", "检查资料完整度", "显示已知范围和缺少来源的部分") ] },
  { space: "writing", displayName: "创作", scopeLabel: "当前文稿、单元与产物", capabilities: [capability("writing-package", "整理当前文稿", "把当前文稿与叙事单元整理成摘要"), capability("writing-direction", "提出创作方向", "输出作者可审查的下一步方向", "plan"), capability("writing-receipts", "检查产物回执", "查看现有输出与来源回执") ] },
  { space: "data", displayName: "数据", scopeLabel: "当前作品的只读投影", capabilities: [capability("data-fate-explain", "解释当前轨迹", "只读解释当前角色的实际、规划和候选轨迹"), capability("data-fate-turning-points", "列出关键转折", "按稳定 Event ID 列出有来源的状态变化"), capability("data-fate-compare", "对照实际与规划", "不把规划或候选当成已发生"), capability("data-fate-gaps", "查找证据缺口", "列出未知时间、冲突和过期来源"), capability("data-fate-knowledge", "检查角色知识越界", "只读对照角色当时可知信息"), capability("data-fate-unsupported-state", "查找缺少 Event 支持的状态", "不插值，不自动修补"), capability("data-fate-source-candidate", "准备来源补充候选", "候选仍需进入既有 Candidate/Impact Review", "candidate") ] }
] as const;

export function getTianyiContextualCapability(space: string): TianyiContextualCapabilityDefinition {
  return TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.find((definition) => definition.space === space) ?? TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.find((definition) => definition.space === "tianyi")!;
}
