import type { SceneWorkspaceViewModel, SceneBlockView } from "./nuwaSceneWorkspaceModel";

export interface NuwaUnifiedSceneWorkspaceProps {
  viewModel: SceneWorkspaceViewModel;
  busy: boolean;
  /** 已保存正文编辑（失焦自动保存由容器负责） */
  selectedNodeId: string | null;
  onSelectNode(nodeId: string): void;
  onEditBlock?(nodeId: string, blockIndex: number, text: string): void;
  /** 打开角色知情（characterId 为稳定 ID；title 仅展示） */
  onOpenCharacter(characterId: string | null, title: string): void;
}

function NarrativeBlock(props: { nodeId: string; block: SceneBlockView; blockIndex: number; selected: boolean; onEditBlock?: (nodeId: string, blockIndex: number, text: string) => void; onOpenCharacter(characterId: string | null, title: string): void }) {
  const { block } = props;
  if (block.kind === "dialogue") {
    return <div className="nuwa-dialogue-row">
      <button type="button" className="nuwa-avatar" aria-label={`查看 ${block.characterTitle ?? "角色"} 的知情`} onClick={() => props.onOpenCharacter(null, block.characterTitle ?? "")}><span aria-hidden="true">{(block.characterTitle ?? "?").slice(0, 1)}</span></button>
      <div className="nuwa-dialogue-main">
        <button type="button" className="nuwa-speaker" onClick={() => props.onOpenCharacter(null, block.characterTitle ?? "")}>{block.characterTitle ?? "未知"}</button>
        <div className="nuwa-dialogue-bubble">
          <input className="nuwa-block-input is-dialogue" value={block.text} aria-label={`对白 ${props.nodeId.slice(-4)}-${props.blockIndex + 1}`} onChange={(event) => props.onEditBlock?.(props.nodeId, props.blockIndex, event.target.value)} />
          {block.heardByTitles.length ? <small className="nuwa-heard">（{block.heardByTitles.join("、")} 听在耳中）</small> : null}
        </div>
      </div>
    </div>;
  }
  return <div className={`nuwa-block-row is-${block.kind}`}>
    <input className={`nuwa-block-input is-${block.kind}`} value={block.text} aria-label={`${block.kind} ${props.nodeId.slice(-4)}-${props.blockIndex + 1}`} onChange={(event) => props.onEditBlock?.(props.nodeId, props.blockIndex, event.target.value)} />
  </div>;
}

/** 统一场景正文：已保存分支正文与 Run 候选连续呈现为一段可读故事。
 * 节点边界只做弱分隔；候选以轻量徽标区分，不比正文更突出。 */
export function NuwaUnifiedSceneWorkspace(props: NuwaUnifiedSceneWorkspaceProps) {
  const vm = props.viewModel;
  return <section className="nuwa-unified-scene" data-testid="nuwa-unified-scene-workspace" data-run-state={vm.runState}>
    <div className="nuwa-unified-scene-body" data-testid="nuwa-unified-scene-body">
      {vm.persistedNodes.map((node, nodeIndex) => <section key={node.nodeId} className="nuwa-scene-node" data-node-state={node.reviewState} data-selected={props.selectedNodeId === node.nodeId || undefined}>
        <button type="button" className="nuwa-scene-node-boundary" onClick={() => props.onSelectNode(node.nodeId)}>
          <span className="nuwa-scene-node-title">{node.title}</span>
          <small>{node.reviewState === "branch-adopted" ? "已采纳" : props.selectedNodeId === node.nodeId ? "当前节点 · 草稿" : "草稿"}</small>
        </button>
        <div className="nuwa-scene-node-content">
          {node.blocks.map((block, blockIndex) => <NarrativeBlock key={blockIndex} nodeId={node.nodeId} block={block} blockIndex={blockIndex} selected={props.selectedNodeId === node.nodeId} onEditBlock={props.onEditBlock} onOpenCharacter={props.onOpenCharacter} />)}
        </div>
        {nodeIndex < vm.persistedNodes.length - 1 ? <div className="nuwa-scene-node-divider" aria-hidden="true" /> : null}
      </section>)}

      {vm.liveRunSteps.length > 0 ? <section className="nuwa-scene-candidate" data-testid="nuwa-run-candidate" data-candidate-count={vm.liveRunSteps.length}>
        <p className="nuwa-scene-candidate-badge"><small>排演候选 · 尚未保存</small></p>
        {vm.liveRunSteps.map((step) => <div key={step.sequence} className="nuwa-run-step">
          {step.speech ? <div className="nuwa-dialogue-row is-candidate">
            <span className="nuwa-avatar" aria-hidden="true"><span>{step.actorTitle.slice(0, 1)}</span></span>
            <div className="nuwa-dialogue-main">
              <span className="nuwa-speaker">{step.actorTitle}</span>
              <div className="nuwa-dialogue-bubble"><p className="nuwa-run-step-speech">{step.speech}</p></div>
            </div>
          </div> : null}
          {step.actionText ? <p className="nuwa-block-row is-action nuwa-run-step-action">{step.actionText}</p> : null}
          <details className="nuwa-run-step-detail"><summary>推演过程</summary><p><small>意图：{step.intent}</small></p><p><small>结果：{step.observableResult}</small></p></details>
        </div>)}
      </section> : null}
    </div>
  </section>;
}
