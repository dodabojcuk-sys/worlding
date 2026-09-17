import { CirclePause, CirclePlay, OctagonX, Play } from "lucide-react";

import type { SceneWorkspaceViewModel } from "./nuwaSceneWorkspaceModel";

export interface NuwaUnifiedSceneWorkspaceProps {
  viewModel: SceneWorkspaceViewModel;
  branchDisplayName: string;
  worldTimeLabel: string;
  /** 紧凑 Run 控制 */
  onStep(): void;
  onContinuous(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  busy: boolean;
  /** 导演提示 */
  cue: string;
  onCueChange(value: string): void;
  onSendCue(): void;
  /** 已保存正文编辑 */
  selectedNodeId: string | null;
  onEditBlock?(nodeId: string, blockIndex: number, text: string): void;
  /** 检查器 */
  onOpenInspector(characterTitle: string): void;
}

/** 统一场景工作面：已保存分支正文与 Run 候选内容连续呈现。 */
export function NuwaUnifiedSceneWorkspace(props: NuwaUnifiedSceneWorkspaceProps) {
  const vm = props.viewModel;
  const runActive = vm.runState === "running" || vm.runState === "paused";
  const totalSteps = vm.liveRunSteps.length;
  return <section className="nuwa-unified-scene" data-testid="nuwa-unified-scene-workspace" data-run-state={vm.runState}>
    <header className="nuwa-unified-scene-header">
      <div><small>当前场景</small><h2>{vm.sceneTitle}</h2></div>
      <span className="nuwa-unified-scene-meta">分支：{props.branchDisplayName} · 世界时间：{props.worldTimeLabel}</span>
    </header>

    {runActive ? <nav className="nuwa-run-toolbar-compact" aria-label="排演控制">
      <span>状态：{vm.runState === "running" ? "排演中" : "已暂停"}</span>
      <span>步骤：{totalSteps}</span>
      {vm.runState === "ready" ? <><button type="button" disabled={props.busy} onClick={props.onStep}>单步</button><button type="button" disabled={props.busy} onClick={props.onContinuous}>连续运行</button></> : null}
      {vm.runState === "running" ? <><button type="button" disabled={props.busy} onClick={props.onContinuous}>连续</button><button type="button" disabled={props.busy} onClick={props.onPause}><CirclePause size={14} />暂停</button></> : null}
      {vm.runState === "paused" ? <button type="button" disabled={props.busy} onClick={props.onResume}><CirclePlay size={14} />继续</button> : null}
      <button type="button" className="danger-action" disabled={props.busy} onClick={props.onStop}><OctagonX size={14} />停止</button>
    </nav> : null}

    <div className="nuwa-unified-scene-body" data-testid="nuwa-unified-scene-body">
      {vm.persistedNodes.map((node) => <article key={node.nodeId} className="nuwa-unified-scene-node" data-node-state={node.reviewState}>
        <h3>{node.title} <small>{node.reviewState === "branch-adopted" ? "已采纳" : "草稿"}</small></h3>
        {node.blocks.map((block, blockIndex) => {
          if (block.kind === "dialogue") return <div key={blockIndex} className="nuwa-dialogue-row">
            <button type="button" className="nuwa-avatar" onClick={() => props.onOpenInspector(block.characterTitle ?? "?")}><span>{(block.characterTitle ?? "?").slice(0, 1)}</span></button>
            <div className="nuwa-dialogue-main">
              <button type="button" className="nuwa-speaker" onClick={() => props.onOpenInspector(block.characterTitle ?? "?")}>{block.characterTitle ?? "未知"}</button>
              <input className="nuwa-block-input is-dialogue" value={block.text} aria-label={`对白 ${node.nodeId.slice(-4)}-${blockIndex + 1}`} onChange={(event) => props.onEditBlock?.(node.nodeId, blockIndex, event.target.value)} />
            </div>
          </div>;
          return <div key={blockIndex} className={`nuwa-block-row is-${block.kind}`}>
            <input className={`nuwa-block-input is-${block.kind}`} value={block.text} aria-label={`${block.kind} ${node.nodeId.slice(-4)}-${blockIndex + 1}`} onChange={(event) => props.onEditBlock?.(node.nodeId, blockIndex, event.target.value)} />
          </div>;
        })}
      </article>)}

      {vm.liveRunSteps.length > 0 ? <article className="nuwa-unified-scene-node is-run-candidate" data-candidate-count={vm.liveRunSteps.length}>
        <h3><small>排演候选 · 尚未保存</small></h3>
        {vm.liveRunSteps.map((step) => <div key={step.sequence} className="nuwa-run-step">
          <div className="nuwa-run-step-header"><small>步骤 {step.sequence}</small><span>{step.actorTitle}</span></div>
          {step.speech ? <div className="nuwa-dialogue-row"><span className="nuwa-avatar"><span>{step.actorTitle.slice(0, 1)}</span></span><div className="nuwa-dialogue-main"><span className="nuwa-speaker">{step.actorTitle}</span><p className="nuwa-block-input is-dialogue" style={{ border: 0, background: "transparent", padding: 0 }}>{step.speech}</p></div></div> : null}
          {step.actionText ? <p className="nuwa-block-row is-action"><span className="nuwa-block-input is-action">{step.actionText}</span></p> : null}
          <details className="nuwa-run-step-detail"><summary>推演过程</summary><p><small>意图：{step.intent}</small></p><p><small>结果：{step.observableResult}</small></p></details>
        </div>)}
      </article> : null}
    </div>

    <footer className="nuwa-unified-scene-composer">
      <form onSubmit={(event) => { event.preventDefault(); props.onSendCue(); }}>
        <label><span>给当前排演的提示</span><textarea value={props.cue} onChange={(event) => props.onCueChange(event.target.value)} rows={2} maxLength={800} placeholder="例如：让下一步先确认声音来源。" /></label>
        <button type="submit" className="primary-action" disabled={props.busy || !props.cue.trim()}><Play size={14} />加入后续步骤</button>
      </form>
    </footer>
  </section>;
}
