export type ReviewContextStage = "candidate" | "impact" | "confirmation" | "receipt";

type ReviewContextSummaryProps = {
  context: {
    project: { displayName: string };
    source: { displayName: string; versionLabel: string; freshness: "current" };
    writeTarget: { displayName: string };
    safety: string;
  };
  stage: ReviewContextStage;
  technical: Array<{ label: string; value: string | null | undefined }>;
};

const stageCopy: Record<ReviewContextStage, { title: string; description: string }> = {
  candidate: { title: "事件候选 · 第 1/3 步", description: "候选正在等待作者审查，尚未写入故事事实。" },
  impact: { title: "影响审查 · 第 2/3 步", description: "正在核对影响和未知项，尚未写入故事事实。" },
  confirmation: { title: "作者确认 · 第 3/3 步", description: "确认前请核对目标和影响；确认后才会进入正式写入链。" },
  receipt: { title: "作者确认回执", description: "正式事件已通过唯一写入链创建，并保留来源追溯。" }
};

export function ReviewContextSummary({ context, stage, technical }: ReviewContextSummaryProps) {
  const copy = stageCopy[stage];
  return <section className="tianyi-review-context" aria-label="审查上下文">
    <header><strong>{copy.title}</strong><span role="status">{copy.description}</span></header>
    <dl>
      <div><dt>当前作品</dt><dd>{context.project.displayName}</dd></div>
      <div><dt>故事来源</dt><dd>{context.source.displayName}</dd></div>
      <div><dt>来源版本</dt><dd>{context.source.versionLabel} · {context.source.freshness === "current" ? "当前" : "已过期"}</dd></div>
      <div><dt>确认后写入</dt><dd>{context.writeTarget.displayName}</dd></div>
    </dl>
    <p className="tianyi-review-context-safety">状态：{context.safety}</p>
    <details className="tianyi-review-context-technical"><summary>技术信息</summary><dl>{technical.filter((item) => item.value).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></details>
  </section>;
}
