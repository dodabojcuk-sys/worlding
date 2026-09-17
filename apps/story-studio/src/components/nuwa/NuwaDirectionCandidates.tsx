import type { LiveRunStepView } from "./nuwaSceneWorkspaceModel";

const DIRECTION_LABELS = ["A", "B", "C", "D", "E", "F"];

function excerpt(text: string, limit = 46): string {
  const compact = text.replace(/\s+/gu, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

export interface NuwaDirectionCandidatesProps {
  steps: LiveRunStepView[];
  /** Run 处于活动状态时该区域才出现 */
  visible: boolean;
  busy: boolean;
  onInspect(): void;
}

/** 场景级走向候选：把当前 Run 的真实候选步骤投影为方向卡。
 * 没有真实候选时显示诚实空态；不构造虚构方向。 */
export function NuwaDirectionCandidates(props: NuwaDirectionCandidatesProps) {
  if (!props.visible) return null;
  return <section className="nuwa-direction" data-testid="nuwa-direction-candidates" aria-label="接下来的走向">
    <header className="nuwa-direction-header">
      <h3>接下来的走向</h3>
      <span>排演候选给出的场景级方向；采纳前不会写入正文。</span>
    </header>
    {props.steps.length === 0 ? <p className="nuwa-direction-empty">还没有场景走向候选；运行一步排演后，这里会出现由候选步骤投影的方向。</p> :
      <div className="nuwa-direction-grid">
        {props.steps.slice(0, 3).map((step, index) => <article key={step.sequence} className="nuwa-direction-card">
          <span className="nuwa-direction-badge" aria-hidden="true">{DIRECTION_LABELS[index] ?? "·"}</span>
          <div className="nuwa-direction-body">
            <h4>{step.actorTitle} · {excerpt(step.speech ?? step.actionText ?? step.intent)}</h4>
            <p>{excerpt(step.observableResult, 64)}</p>
            <details className="nuwa-direction-detail">
              <summary>推演过程</summary>
              <p><small>意图：{step.intent}</small></p>
              <p><small>结果：{step.observableResult}</small></p>
            </details>
          </div>
        </article>)}
      </div>}
  </section>;
}
