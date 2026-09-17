/** 纯投影层：将分支节点与 Run 步骤合并为统一的场景工作面读模型。
 * 无副作用、无依赖；同输入必得同输出。 */

export type SceneBlockKind = "narration" | "description" | "action" | "dialogue" | "psychology";

export interface SceneBlockView {
  kind: SceneBlockKind;
  /** 显示用的角色名（非内部 ID） */
  characterTitle: string | null;
  text: string;
  /** dialogue 专用 */
  heardByTitles: string[];
  delivery: "spoken" | "aside";
  /** 来源标记 */
  source: "persisted" | "run-candidate";
  /** persisted 块的 contentRevision；run-candidate 为 0 */
  contentRevision: number;
}

export interface SceneNodeView {
  nodeId: string;
  title: string;
  blocks: SceneBlockView[];
  reviewState: "draft" | "branch-adopted";
  sceneKey: string;
}

export interface LiveRunStepView {
  sequence: number;
  actorTitle: string;
  intent: string;
  speech: string | null;
  actionText: string | null;
  observableResult: string;
}

export type NuwaRunState = "none" | "ready" | "running" | "paused" | "completed" | "blocked";

export interface SceneWorkspaceViewModel {
  sceneTitle: string;
  sceneKey: string;
  /** 已保存正文（可编辑） */
  persistedNodes: SceneNodeView[];
  /** Run 候选内容（只读，待采纳） */
  liveRunSteps: LiveRunStepView[];
  runState: NuwaRunState;
}

// ── 投影函数 ──

export function projectBranchNodesToScene(nodes: Array<{ nodeId: string; title: string; blocks: Array<{ kind: string; characterId?: string | null; speakerId?: string; text: string; heardBy?: string[]; delivery?: string }>; reviewState: string; sceneKey: string; contentRevision: number }>, characterTitles: Map<string, string>): SceneNodeView[] {
  return nodes.map((node) => ({
    nodeId: node.nodeId,
    title: node.title,
    sceneKey: node.sceneKey,
    reviewState: node.reviewState === "branch-adopted" ? "branch-adopted" as const : "draft" as const,
    blocks: node.blocks.map((block) => {
      const kind = ["narration", "description", "action", "dialogue", "psychology"].includes(block.kind) ? block.kind as SceneBlockKind : "narration";
      const speakerTitle = block.kind === "dialogue" && block.speakerId ? characterTitles.get(block.speakerId) ?? block.speakerId : null;
      const charTitle = (block.kind === "action" || block.kind === "psychology") && block.characterId ? characterTitles.get(block.characterId) ?? block.characterId : null;
      return {
        kind,
        characterTitle: speakerTitle ?? charTitle,
        text: block.text,
        heardByTitles: (block.heardBy ?? []).map((id: string) => characterTitles.get(id) ?? id),
        delivery: (block.delivery === "aside" ? "aside" : "spoken") as "spoken" | "aside",
        source: "persisted" as const,
        contentRevision: node.contentRevision
      };
    })
  }));
}

export function projectRunStepsToLiveBlocks(steps: Array<{ sequence: number; actorId: string; intent: string; speech: string | null; action: { action: string; targetId: string | null } | null; observableResult: string }>, characterTitles: Map<string, string>): LiveRunStepView[] {
  return steps.map((step) => ({
    sequence: step.sequence,
    actorTitle: characterTitles.get(step.actorId) ?? step.actorId,
    intent: step.intent,
    speech: step.speech,
    actionText: step.action?.action ?? null,
    observableResult: step.observableResult
  }));
}

export function composeNuwaSceneWorkspace(input: {
  sceneKey: string;
  sceneTitle: string;
  branchNodes: SceneNodeView[];
  runSteps: LiveRunStepView[];
  runState: NuwaRunState;
}): SceneWorkspaceViewModel {
  return {
    sceneTitle: input.sceneTitle,
    sceneKey: input.sceneKey,
    persistedNodes: input.branchNodes,
    liveRunSteps: input.runSteps,
    runState: input.runState
  };
}
