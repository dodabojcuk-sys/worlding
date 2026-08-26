import { AlertTriangle, ArrowLeft, Check, GitMerge, RefreshCw, UserRoundPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AgentProposalCharacterApplication, AgentRecognitionProposal, AgentRecognitionProposalValue, WorldObject } from "../../lib/localTransport";
import type { TianyiManagedAgent } from "./TianyiConversationRail";

export type TianyiAgentProposalOperations = {
  edit(input: { proposal: AgentRecognitionProposal; suggestedName: string; suggestedFields: Record<string, AgentRecognitionProposalValue>; uncertainties: string[] }): Promise<AgentRecognitionProposal>;
  ignore(input: { proposal: AgentRecognitionProposal; recognitionError: boolean }): Promise<AgentRecognitionProposal>;
  confirm(input: { proposal: AgentRecognitionProposal; character: AgentProposalCharacterApplication }): Promise<AgentRecognitionProposal>;
  merge(input: { proposal: AgentRecognitionProposal; target: TianyiManagedAgent; character: AgentProposalCharacterApplication }): Promise<AgentRecognitionProposal>;
};

export function TianyiAgentProposalReview(props: {
  proposal: AgentRecognitionProposal;
  agents: TianyiManagedAgent[];
  sceneLabel: string;
  busy?: boolean;
  operations: TianyiAgentProposalOperations;
  onApplied(): Promise<void> | void;
  onReload(): Promise<void> | void;
  onOpenAgent(agentId: string): void;
  onBack(): void;
}) {
  const [suggestedName, setSuggestedName] = useState(props.proposal.suggestedName);
  const [suggestedFieldsText, setSuggestedFieldsText] = useState(() => JSON.stringify(props.proposal.suggestedFields, null, 2));
  const [uncertaintiesText, setUncertaintiesText] = useState(() => props.proposal.uncertainties.join("\n"));
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [action, setAction] = useState<"save" | "confirm" | "merge" | "ignore" | "incorrect" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSuggestedName(props.proposal.suggestedName);
    setSuggestedFieldsText(JSON.stringify(props.proposal.suggestedFields, null, 2));
    setUncertaintiesText(props.proposal.uncertainties.join("\n"));
    setMergeTargetId("");
    setError("");
  }, [props.proposal]);

  const terminal = ["confirmed", "merged", "ignored"].includes(props.proposal.status);
  const applying = props.proposal.status === "confirming" || props.proposal.status === "merging" || action !== null || Boolean(props.busy);
  const selectedTarget = props.agents.find((agent) => agent.id === mergeTargetId) || null;
  const parsed = useMemo(() => parseDraft({ suggestedFieldsText, uncertaintiesText }), [suggestedFieldsText, uncertaintiesText]);
  const canApply = !terminal && !applying && parsed.ok;

  const useAction = async (kind: NonNullable<typeof action>, work: () => Promise<AgentRecognitionProposal>) => {
    setAction(kind);
    setError("");
    try {
      const updated = await work();
      if (updated.status === "confirmed" || updated.status === "merged") await props.onApplied();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setAction(null);
    }
  };
  const character = (): AgentProposalCharacterApplication => buildCharacterApplication(suggestedName, parsed.ok ? parsed.suggestedFields : {}, props.proposal.evidence);

  return <section className="tianyi-agent-proposal-review" aria-label="人物识别审查">
    <header className="tianyi-agent-proposal-review-header">
      <button type="button" className="secondary-action" onClick={props.onBack}><ArrowLeft />返回对话</button>
      <div><small>人物识别 · 作者审查</small><h1>{props.proposal.suggestedName}</h1><p>{sourceLabel(props.proposal, props.sceneLabel)} · {statusLabel(props.proposal)}</p></div>
      <span className={`tianyi-agent-proposal-status is-${props.proposal.status}`}>{statusLabel(props.proposal)}</span>
    </header>

    {props.proposal.lastError && <div className="tianyi-agent-proposal-alert" role="alert"><AlertTriangle /><span><strong>上次应用未完成</strong>{props.proposal.lastError.message}</span></div>}
    {error && <div className="tianyi-agent-proposal-alert" role="alert"><AlertTriangle /><span><strong>操作没有完成</strong>{error}<button type="button" className="text-action" onClick={() => void props.onReload()}>重新读取最新版本</button></span></div>}
    {props.proposal.activeApplication && <div className="tianyi-agent-proposal-alert is-pending" role="status"><RefreshCw /><span><strong>正在恢复此前的确认</strong>该操作会继续使用原来的应用身份，不会创建第二个人物。</span></div>}

    {terminal ? <TerminalProposal proposal={props.proposal} onOpenAgent={props.onOpenAgent} onBack={props.onBack} /> : <div className="tianyi-agent-proposal-sheet">
      <section className="tianyi-agent-proposal-section"><h2>建议人物</h2><label><span>人物名称</span><input value={suggestedName} onChange={(event) => setSuggestedName(event.target.value)} disabled={applying} /></label></section>
      <section className="tianyi-agent-proposal-section"><h2>建议字段</h2><p>这些字段来自识别结果；确认前可以由作者修改。没有自动写入正式人物。</p><textarea aria-label="建议字段" value={suggestedFieldsText} onChange={(event) => setSuggestedFieldsText(event.target.value)} disabled={applying} />{!parsed.ok && <small className="is-error">{parsed.error}</small>}</section>
      <section className="tianyi-agent-proposal-section"><h2>来源与依据</h2><p className="tianyi-agent-proposal-source">{sourceLabel(props.proposal, props.sceneLabel)}</p><ul className="tianyi-agent-proposal-evidence">{props.proposal.evidence.map((evidence) => <li key={`${evidence.sourceRef}:${evidence.excerpt}`}><strong>来源记录</strong><p>{evidence.excerpt}</p><small>稳定来源引用：{evidence.sourceRef}</small></li>)}</ul><small>来源回执已绑定；它不是对原文的逐字复制。</small></section>
      <section className="tianyi-agent-proposal-section"><h2>不确定与可能重复</h2><label><span>仍需确认的问题（每行一项）</span><textarea aria-label="仍需确认的问题" value={uncertaintiesText} onChange={(event) => setUncertaintiesText(event.target.value)} disabled={applying} /></label>{props.proposal.duplicateMatches.length > 0 ? <ul className="tianyi-agent-proposal-duplicates">{props.proposal.duplicateMatches.map((match) => <li key={match.objectId}><strong>{match.displayName}</strong><span>{match.reason}</span></li>)}</ul> : <p>目前没有找到需要作者比对的同名人物。</p>}</section>
      <section className="tianyi-agent-proposal-section"><h2>审查状态</h2><dl><div><dt>当前版本</dt><dd>第 {props.proposal.revision} 版</dd></div><div><dt>来源回执</dt><dd>已保留来源依据</dd></div><div><dt>更新时间</dt><dd>{formatTime(props.proposal.updatedAt)}</dd></div></dl></section>
      <footer className="tianyi-agent-proposal-actions">
        <button type="button" className="secondary-action" disabled={!canApply} onClick={() => void useAction("save", async () => props.operations.edit({ proposal: props.proposal, suggestedName, suggestedFields: parsed.ok ? parsed.suggestedFields : {}, uncertainties: parsed.ok ? parsed.uncertainties : [] }))}><Check />保存修改</button>
        <button type="button" className="secondary-action" disabled={!canApply} onClick={() => void useAction("incorrect", async () => props.operations.ignore({ proposal: props.proposal, recognitionError: true }))}><X />标记识别错误</button>
        <button type="button" className="secondary-action" disabled={!canApply} onClick={() => void useAction("ignore", async () => props.operations.ignore({ proposal: props.proposal, recognitionError: false }))}><X />暂不采用</button>
        <button type="button" className="primary-action" disabled={!canApply} onClick={() => void useAction("confirm", async () => props.operations.confirm({ proposal: props.proposal, character: character() }))}><UserRoundPlus />确认创建人物</button>
      </footer>
      <section className="tianyi-agent-proposal-merge"><h2>合并到已有 Agent</h2><p>重名不会自动合并。请由作者明确选择要补充的正式人物。</p><div><select aria-label="选择要合并的人物" value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} disabled={applying}><option value="">选择已有 Agent</option>{props.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.title}</option>)}</select><button type="button" className="secondary-action" disabled={!canApply || !selectedTarget} onClick={() => selectedTarget && void useAction("merge", async () => props.operations.merge({ proposal: props.proposal, target: selectedTarget, character: character() }))}><GitMerge />确认合并</button></div></section>
    </div>}
  </section>;
}

function TerminalProposal(props: { proposal: AgentRecognitionProposal; onOpenAgent(id: string): void; onBack(): void }) {
  if (props.proposal.status === "ignored") return <div className="tianyi-agent-proposal-terminal"><X /><strong>这条识别已被作者忽略</strong><p>它不会创建人物，也不会写入事件线或 Canon。</p><button type="button" className="secondary-action" onClick={props.onBack}>返回对话</button></div>;
  const target = props.proposal.targetObjectRef;
  return <div className="tianyi-agent-proposal-terminal"><Check /><strong>{props.proposal.status === "merged" ? "已合并到正式人物" : "已创建正式人物"}</strong><p>人物资料由现有正式对象 Owner 保存；本提案只保留应用回执。</p>{target && <button type="button" className="primary-action" onClick={() => props.onOpenAgent(target.objectId)}>打开人物 Agent</button>}</div>;
}

function parseDraft(input: { suggestedFieldsText: string; uncertaintiesText: string }): { ok: true; suggestedFields: Record<string, AgentRecognitionProposalValue>; uncertainties: string[] } | { ok: false; error: string } {
  try {
    const value = JSON.parse(input.suggestedFieldsText) as unknown;
    if (!value || Array.isArray(value) || typeof value !== "object") return { ok: false, error: "建议字段需要是一个对象。" };
    return { ok: true, suggestedFields: value as Record<string, AgentRecognitionProposalValue>, uncertainties: input.uncertaintiesText.split("\n").map((item) => item.trim()).filter(Boolean) };
  } catch { return { ok: false, error: "建议字段暂时无法读取；请修正后再保存。" }; }
}

function buildCharacterApplication(title: string, fields: Record<string, AgentRecognitionProposalValue>, evidence: AgentRecognitionProposal["evidence"]): AgentProposalCharacterApplication {
  const value = (key: string) => typeof fields[key] === "string" ? fields[key] as string : "";
  const list = (key: string) => Array.isArray(fields[key]) ? (fields[key] as unknown[]).filter((item): item is string => typeof item === "string") : [];
  const safeTitle = title.trim();
  const fieldLines = Object.entries(fields).filter(([key]) => !["status", "tags", "aliases"].includes(key)).map(([key, value]) => `- ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  return { title: safeTitle, status: value("status") || "active", tags: list("tags").length ? list("tags") : ["天意识别确认"], aliases: list("aliases"), body: [`# ${safeTitle}`, "", "## 识别依据", ...evidence.map((item) => item.excerpt), ...(fieldLines.length ? ["", "## 作者确认的建议", ...fieldLines] : [])].join("\n") };
}

export function statusLabel(proposal: AgentRecognitionProposal): string {
  if (proposal.lastError) return "可重试";
  return ({ pending: "待确认", edited: "已编辑", confirming: "确认中", confirmed: "已确认", merging: "合并中", merged: "已合并", ignored: "已忽略" })[proposal.status];
}

function sourceLabel(proposal: AgentRecognitionProposal, sceneLabel: string): string { return `${sceneLabel || "当前记录"} · ${proposal.sourceWorkspace === "tianyi" ? "天意记录" : "来源记录"}`; }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "刚刚更新" : date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" }); }
function messageOf(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "当前操作没有完成；不会把未完成状态当作成功。";
  return /revision conflict|revision changed|changed before/i.test(message) ? "人物资料或提案已经变化；请重新读取后再比较，当前修改没有被静默应用。" : message;
}
