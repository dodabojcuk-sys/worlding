import { AlertTriangle, ArrowLeft, CheckCircle2, FileKey2, Link2, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";

const completeFixture = {
  envelopeId: "provider-envelope-fixture-tide-letter",
  projectId: "fixture.project.tide-letter",
  sessionId: "fixture.session.creative-01",
  archiveRecordId: "fixture.archive.author-message-01",
  budgetReservationId: "provider-reservation-fixture-01",
  dispatchReceiptId: "fixture.dispatch-01",
  frozenResponseId: "fixture.frozen-response-01",
  strictProjectionId: "fixture.strict-projection-01",
  toolReceiptIds: ["fixture.tool.context", "fixture.tool.event", "fixture.tool.character", "fixture.tool.sources"],
  candidateReceiptIds: ["fixture.candidate-review-01"],
  impactReviewReceiptIds: ["fixture.impact-review-01"],
  replayStatus: "completed",
  integrityHash: "830cc2ad0d8405483b23c5216c3fa822b59b1013a3b5dd17b1bd6fa5cbf758ac"
};

export function ReplayEnvelopeDiagnosticsView(props: { missingReference: boolean; onBack(): void }) {
  const missing = props.missingReference ? "archive:fixture.archive.author-message-01" : null;
  return <main className="replay-envelope-diagnostics" data-testid="replay-envelope-diagnostics" data-replay-status={missing ? "missing-reference" : "ready"}>
    <header><button type="button" className="icon-action" aria-label="返回数据首页" onClick={props.onBack}><ArrowLeft /></button><div><small>诊断工具 · 隔离 Fixture</small><h1>Replay-safe Provider Receipt Envelope</h1><p>只显示稳定身份、receipt 引用与完整性；不含 raw body、prompt 或凭据。</p></div><span className={missing ? "is-blocked" : "is-ready"}>{missing ? <AlertTriangle /> : <CheckCircle2 />}{missing ? "Fail closed" : "可离线重放"}</span></header>
    <section className="replay-envelope-sequence" aria-label="receipt 持久化顺序">{[
      ["作者原话与来源", completeFixture.archiveRecordId],
      ["Provider budget 预留", completeFixture.budgetReservationId],
      ["dispatch 前回执", completeFixture.dispatchReceiptId],
      ["response 冻结身份", completeFixture.frozenResponseId],
      ["strict projection", completeFixture.strictProjectionId],
      ["Candidate / Impact", `${completeFixture.candidateReceiptIds[0]} → ${completeFixture.impactReviewReceiptIds[0]}`]
    ].map(([label, id], index) => <article className={missing && index === 0 ? "is-missing" : ""} key={label}><span>{index + 1}</span><div><strong>{label}</strong><small>{id}</small></div>{missing && index === 0 ? <AlertTriangle /> : <CheckCircle2 />}</article>)}</section>
    {missing ? <section className="replay-envelope-gap" role="alert"><AlertTriangle /><div><strong>完整性验证失败</strong><p>缺失 owner 引用：<code>{missing}</code>。系统不会伪造默认值，也不会重新调用 Provider。</p></div></section> : <section className="replay-envelope-ready"><RotateCcw /><div><strong>刷新与 server 重启后仍可重建</strong><p>Replay 只读已持久化的引用链，Provider 调用 0，新预算预留 0。</p></div></section>}
    <section className="replay-envelope-grid"><article><FileKey2 /><strong>稳定身份</strong><dl><div><dt>Envelope</dt><dd>{completeFixture.envelopeId}</dd></div><div><dt>Project</dt><dd>{completeFixture.projectId}</dd></div><div><dt>Session</dt><dd>{completeFixture.sessionId}</dd></div></dl></article><article><Link2 /><strong>工具回执顺序</strong><ol>{completeFixture.toolReceiptIds.map((id) => <li key={id}>{id}</li>)}</ol></article><article><ShieldCheck /><strong>完整性</strong><p><code>{completeFixture.integrityHash}</code></p><small>{missing ? "Mismatch / missing reference → blocked" : "SHA-256 verified"}</small></article><article><LockKeyhole /><strong>安全导出</strong><ul><li>raw Provider body: excluded</li><li>prompt: excluded</li><li>credentials: excluded</li><li>private story body: excluded</li></ul></article></section>
  </main>;
}
