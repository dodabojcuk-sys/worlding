import type { TianyiNuwaExecutionBrief } from "../../lib/localTransport";

export function TianyiBriefSourceSummary(props: { brief: TianyiNuwaExecutionBrief }) {
  const receiptCount = props.brief.selectedContextReceiptIds.length;
  const archiveCount = props.brief.selectedArchiveMessageRefs.length;
  const memoryCount = props.brief.approvedMemoryRefs.length;
  const additionalCount = receiptCount + archiveCount + memoryCount;

  return <section className="tianyi-brief-source-summary" aria-label="执行简报来源范围">
    <strong>来源范围</strong>
    <dl>
      <div><dt>当前上下文</dt><dd>1</dd></div>
      <div><dt>额外授权来源</dt><dd>{additionalCount}</dd></div>
      <div><dt>上下文回执</dt><dd>{receiptCount}</dd></div>
      <div><dt>历史消息</dt><dd>{archiveCount}</dd></div>
      <div><dt>已授权记忆</dt><dd>{memoryCount}</dd></div>
    </dl>
  </section>;
}
