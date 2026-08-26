import { AlertTriangle, Archive, Check, ChevronLeft, FilePlus2, GitFork, History, Link2, Plus, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { RelationEvidence, RelationRecord, RelationTypeDefinition, WorldObjectSummary } from "../lib/localTransport";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";
import { RelationGraphProjection } from "./RelationGraphProjection";

export type RelationView = "all" | "pending" | "confirmed" | "history";
export type RelationPresentation = "list" | "graph";
type RelationDirection = "forward" | "reverse" | "both" | "none";

type CandidateInput = {
  sourceObjectId: string;
  targetObjectId: string;
  relationTypeId: string;
  direction: RelationDirection;
  evidenceRefs: RelationEvidence[];
};
type DuplicateInput = Omit<CandidateInput, "evidenceRefs"> & { relationLabelSnapshot: string };

export function RelationAuthoringWorkbench(props: {
  projectTitle: string;
  objects: WorldObjectSummary[];
  relations: RelationRecord[];
  relationTypes: RelationTypeDefinition[];
  view: RelationView;
  presentation: RelationPresentation;
  relationId: string | null;
  query: string;
  busy?: boolean;
  onOpenNavigation(): void;
  onView(view: RelationView): void;
  onPresentation(presentation: RelationPresentation): void;
  onOpenRelation(relationId: string | null): void;
  onOpenObject(object: WorldObjectSummary): void;
  onCreate(input: CandidateInput): Promise<void>;
  onConfirm(relation: RelationRecord): Promise<void>;
  onReject(relation: RelationRecord): Promise<void>;
  onArchive(relation: RelationRecord): Promise<void>;
  onAppendEvidence(relation: RelationRecord, evidenceRefs: RelationEvidence[]): Promise<void>;
  onCorrect(relation: RelationRecord, input: CandidateInput): Promise<void>;
  onFindDuplicates(input: DuplicateInput): Promise<{ suggestions: RelationRecord[]; history: RelationRecord[] }>;
}) {
  const headingRef = useRef<HTMLElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const selected = props.relationId ? props.relations.find((relation) => relation.relationId === props.relationId) || null : null;
  const visible = useMemo(() => filterRelations(props.relations, props.view, props.query, props.objects), [props.objects, props.query, props.relations, props.view]);

  useEffect(() => {
    if (props.relationId && !selected) props.onOpenRelation(null);
  }, [props.relationId, props.onOpenRelation, selected]);

  if (selected) return <RelationDetail
    relation={selected}
    objects={props.objects}
    relationTypes={props.relationTypes}
    busy={props.busy}
    onBack={() => props.onOpenRelation(null)}
    onConfirm={props.onConfirm}
    onReject={props.onReject}
    onArchive={props.onArchive}
    onAppendEvidence={props.onAppendEvidence}
    onCorrect={props.onCorrect}
    onFindDuplicates={props.onFindDuplicates}
  />;

  return <section className="workbench relation-authoring-workbench" data-testid="relation-authoring-workbench">
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="资料"
      title="关系"
      context="先建立候选，再由作者确认；图谱仅投影现有关系。"
      status="本地关系库"
      prototype="hub"
      icon={<GitFork aria-hidden="true" />}
      onOpenNavigation={props.onOpenNavigation}
      titleRef={headingRef}
      titleAsHeading
      titleTestId="relation-authoring-heading"
      actions={<button type="button" className="primary-action" onClick={() => setCreateOpen((open) => !open)} aria-expanded={createOpen} aria-controls="relation-create-panel"><Plus />新建关系</button>}
    />
    <main className="relation-authoring-main" aria-label="关系资料库">
      {createOpen && <RelationCandidateForm id="relation-create-panel" objects={props.objects} relationTypes={props.relationTypes} submitLabel="保存候选" onCancel={() => setCreateOpen(false)} onFindDuplicates={props.onFindDuplicates} onSubmit={async (input) => { await props.onCreate(input); setCreateOpen(false); }} />}
      <div className="relation-presentation-tabs" role="tablist" aria-label="关系查看方式">
        <button type="button" role="tab" aria-selected={props.presentation === "list"} className={props.presentation === "list" ? "is-active" : ""} onClick={() => props.onPresentation("list")}>列表</button>
        <button type="button" role="tab" aria-selected={props.presentation === "graph"} className={props.presentation === "graph" ? "is-active" : ""} onClick={() => props.onPresentation("graph")}>图谱</button>
      </div>
      {props.presentation === "graph" ? <RelationGraphProjection objects={props.objects} relations={props.relations} query={props.query} onOpenObject={props.onOpenObject} onOpenRelation={(nextId) => props.onOpenRelation(nextId)} /> : <>
      <div className="relation-view-tabs" role="tablist" aria-label="关系状态">
        {(["all", "pending", "confirmed", "history"] as RelationView[]).map((view) => <button key={view} type="button" role="tab" aria-selected={props.view === view} className={props.view === view ? "is-active" : ""} onClick={() => props.onView(view)}>{relationViewLabel(view)}<small>{countForView(props.relations, view)}</small></button>)}
      </div>
      {props.query.trim() && <p className="relation-search-note"><Search aria-hidden="true" />搜索同时匹配资料对象与关系类型；结果仅来自当前作品的既有读模型。</p>}
      {visible.length ? <div className="relation-list" role="list">{visible.map((relation) => <RelationRow key={relation.relationId} relation={relation} objects={props.objects} onOpen={() => props.onOpenRelation(relation.relationId)} />)}</div> : <div className="relation-empty"><Link2 aria-hidden="true" /><strong>{props.query.trim() ? "没有匹配的关系" : "这里还没有关系"}</strong><small>从两个已有资料对象建立一个候选关系；确认前不会作为已确认事实呈现。</small></div>}
      </>}
    </main>
  </section>;
}

function RelationDetail(props: {
  relation: RelationRecord;
  objects: WorldObjectSummary[];
  relationTypes: RelationTypeDefinition[];
  busy?: boolean;
  onBack(): void;
  onConfirm(relation: RelationRecord): Promise<void>;
  onReject(relation: RelationRecord): Promise<void>;
  onArchive(relation: RelationRecord): Promise<void>;
  onAppendEvidence(relation: RelationRecord, evidenceRefs: RelationEvidence[]): Promise<void>;
  onCorrect(relation: RelationRecord, input: CandidateInput): Promise<void>;
  onFindDuplicates(input: DuplicateInput): Promise<{ suggestions: RelationRecord[]; history: RelationRecord[] }>;
}) {
  const [error, setError] = useState("");
  const [appendOpen, setAppendOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const source = objectLabel(props.objects, props.relation.sourceObjectId);
  const target = objectLabel(props.objects, props.relation.targetObjectId);
  const typeLabel = props.relation.currentTypeLabel || props.relation.relationLabelSnapshot;
  const run = async (operation: () => Promise<void>) => {
    setError("");
    try { await operation(); } catch (cause) { setError(messageOf(cause)); }
  };
  const canReview = props.relation.reviewState === "candidate" && !props.relation.archived;
  const canManageConfirmed = props.relation.reviewState === "confirmed" && !props.relation.archived;
  return <section className="workbench relation-authoring-workbench relation-detail-workbench" data-testid="relation-detail-workbench">
    <WorkspaceHeader projectTitle="" sectionLabel="资料" title="关系详情" context="关系语义由 Relation repository 保持唯一所有权。" status={relationStateLabel(props.relation)} prototype="workbench" icon={<GitFork aria-hidden="true" />} actions={<button type="button" className="secondary-action" onClick={props.onBack}><ChevronLeft />返回列表</button>} />
    <main className="relation-authoring-main relation-detail-main" aria-label="关系详情">
      <article className="relation-detail-card">
        <header><span className="relation-state-badge" data-state={props.relation.archived ? "archived" : props.relation.reviewState}>{relationStateLabel(props.relation)}</span><small>修订 {props.relation.revision}</small></header>
        <div className="relation-detail-flow"><strong>{source}</strong><span aria-label={directionLabel(props.relation.direction)}>{directionGlyph(props.relation.direction)}</span><em>{typeLabel}</em><span aria-hidden="true">→</span><strong>{target}</strong></div>
        <p>来源与目标均为稳定资料对象引用。类型快照只读显示；若类型已停用，既有关系仍保留其原始记录。</p>
      </article>
      {error && <p className="relation-operation-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</p>}
      <section className="relation-evidence-section" aria-labelledby="relation-evidence-heading"><header><div><h2 id="relation-evidence-heading">证据与审查</h2><small>确认时会重新验证可用性；未知或过期证据不会被静默接受。</small></div></header><EvidenceList relation={props.relation} /></section>
      {canReview && <section className="relation-review-actions" aria-label="候选审查操作"><div><strong>候选尚未成为已确认事实</strong><small>确认会调用现有服务器重校验；失败时候选会保留，供补充证据后再次审查。</small></div><span><button type="button" className="secondary-action" disabled={props.busy} onClick={() => void run(() => props.onReject(props.relation))}><X />拒绝候选</button><button type="button" className="primary-action" disabled={props.busy} onClick={() => void run(() => props.onConfirm(props.relation))}><Check />确认关系</button></span></section>}
      {canManageConfirmed && <section className="relation-confirmed-actions" aria-label="已确认关系操作"><header><div><h2>后续操作</h2><small>不直接编辑已确认语义。更正会新建候选并显式标记替代关系。</small></div></header><div className="relation-action-buttons"><button type="button" className="secondary-action" onClick={() => setAppendOpen((open) => !open)} aria-expanded={appendOpen} aria-controls="relation-append-evidence">追加证据</button><button type="button" className="secondary-action" onClick={() => setCorrectionOpen((open) => !open)} aria-expanded={correctionOpen} aria-controls="relation-correction-form">创建更正候选</button><button type="button" className="danger-action" disabled={props.busy} onClick={() => { if (window.confirm("归档后不会恢复为可编辑关系。继续归档？")) void run(() => props.onArchive(props.relation)); }}><Archive />归档关系</button></div>
        {appendOpen && <EvidenceForm id="relation-append-evidence" submitLabel="追加现有证据" onCancel={() => setAppendOpen(false)} onSubmit={async (evidenceRefs) => { await run(() => props.onAppendEvidence(props.relation, evidenceRefs)); setAppendOpen(false); }} />}
        {correctionOpen && <RelationCandidateForm id="relation-correction-form" objects={props.objects} relationTypes={props.relationTypes} initial={props.relation} submitLabel="保存更正候选" onCancel={() => setCorrectionOpen(false)} onFindDuplicates={props.onFindDuplicates} onSubmit={async (input) => { await run(() => props.onCorrect(props.relation, input)); setCorrectionOpen(false); }} />}
      </section>}
      {props.relation.archived && <p className="relation-archived-note"><History aria-hidden="true" />该关系已归档，只读保留在历史记录中。</p>}
    </main>
  </section>;
}

function RelationCandidateForm(props: { id: string; objects: WorldObjectSummary[]; relationTypes: RelationTypeDefinition[]; initial?: RelationRecord; submitLabel: string; onCancel(): void; onFindDuplicates(input: DuplicateInput): Promise<{ suggestions: RelationRecord[]; history: RelationRecord[] }>; onSubmit(input: CandidateInput): Promise<void> }) {
  const activeTypes = props.relationTypes.filter((type) => type.lifecycle === "active");
  const [sourceObjectId, setSourceObjectId] = useState(props.initial?.sourceObjectId || "");
  const [targetObjectId, setTargetObjectId] = useState(props.initial?.targetObjectId || "");
  const [relationTypeId, setRelationTypeId] = useState(props.initial?.relationTypeId || activeTypes[0]?.relationTypeId || "");
  const [direction, setDirection] = useState<RelationDirection>(props.initial?.direction || "forward");
  const [evidenceText, setEvidenceText] = useState("");
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<RelationRecord[]>([]);
  const [duplicateHistory, setDuplicateHistory] = useState<RelationRecord[]>([]);
  const [duplicatesChecked, setDuplicatesChecked] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!sourceObjectId || !targetObjectId || !relationTypeId) return setError("请选择来源、关系类型和目标资料。");
    if (sourceObjectId === targetObjectId) return setError("来源与目标不能是同一份资料。");
    let evidenceRefs: RelationEvidence[] = [];
    if (evidenceText.trim()) {
      try { const parsed: unknown = JSON.parse(evidenceText); evidenceRefs = Array.isArray(parsed) ? parsed as RelationEvidence[] : [parsed as RelationEvidence]; } catch { return setError("附加证据必须是现有证据结构的 JSON，不会把自由文本伪造成可确认来源。"); }
    }
    try { await props.onSubmit({ sourceObjectId, targetObjectId, relationTypeId, direction, evidenceRefs }); } catch (cause) { setError(messageOf(cause)); }
  };
  const selectedType = activeTypes.find((type) => type.relationTypeId === relationTypeId)?.label || "关系";
  const checkDuplicates = async () => {
    setError("");
    if (!sourceObjectId || !targetObjectId || !relationTypeId) return setError("先选择来源、关系类型和目标，再检查重复建议。");
    try {
      const result = await props.onFindDuplicates({ sourceObjectId, targetObjectId, relationTypeId, direction, relationLabelSnapshot: selectedType });
      setDuplicates(result.suggestions); setDuplicateHistory(result.history); setDuplicatesChecked(true);
    } catch (cause) { setError(messageOf(cause)); }
  };
  return <form id={props.id} className="relation-candidate-form" onSubmit={(event) => void submit(event)}><header><div><h2>{props.initial ? "创建更正候选" : "新建关系候选"}</h2><small>保存后仍须在详情中由作者确认；不会自动写入已确认关系。</small></div></header><div className="relation-form-grid"><ObjectSelect label="来源资料" value={sourceObjectId} objects={props.objects} onChange={setSourceObjectId} /><label>关系类型<select value={relationTypeId} onChange={(event) => setRelationTypeId(event.target.value)} required><option value="">选择已启用类型</option>{activeTypes.map((type) => <option key={type.relationTypeId} value={type.relationTypeId}>{type.label}</option>)}</select></label><label>方向<select value={direction} onChange={(event) => setDirection(event.target.value as RelationDirection)}><option value="forward">来源 → 目标</option><option value="reverse">目标 → 来源</option><option value="both">双向</option><option value="none">无方向</option></select></label><ObjectSelect label="目标资料" value={targetObjectId} objects={props.objects} onChange={setTargetObjectId} /></div><p className="relation-preview" aria-live="polite">预览：{objectLabel(props.objects, sourceObjectId)} {directionGlyph(direction)} <strong>{selectedType}</strong> → {objectLabel(props.objects, targetObjectId)}</p><button type="button" className="secondary-action relation-duplicate-action" onClick={() => void checkDuplicates()}>检查重复建议</button>{duplicatesChecked && <div className="relation-duplicate-suggestions" role="status"><strong>重复建议</strong><small>{duplicates.length ? `发现 ${duplicates.length} 条当前匹配关系。` : "没有当前匹配关系。"}{duplicateHistory.length ? ` 另有 ${duplicateHistory.length} 条历史记录。` : ""} 建议仅供比较；你仍可保存独立候选，不会自动合并。</small>{duplicates.map((relation) => <span key={relation.relationId}>{objectLabel(props.objects, relation.sourceObjectId)} {directionGlyph(relation.direction)} {relation.currentTypeLabel || relation.relationLabelSnapshot} → {objectLabel(props.objects, relation.targetObjectId)}</span>)}</div>}<EvidenceInput value={evidenceText} onChange={setEvidenceText} /><p className="relation-manual-evidence"><ShieldCheck aria-hidden="true" />保存时会由现有 owner 自动记录“作者手动建立”证据；附加证据只接受已有来源锚点、已确认事件或旧图来源结构。</p>{error && <p className="relation-operation-error" role="alert"><AlertTriangle aria-hidden="true" />{error}</p>}<footer><button type="button" className="secondary-action" onClick={props.onCancel}>取消</button><button type="submit" className="primary-action">{props.submitLabel}</button></footer></form>;
}

function EvidenceForm(props: { id: string; submitLabel: string; onCancel(): void; onSubmit(evidenceRefs: RelationEvidence[]): Promise<void> }) {
  const [value, setValue] = useState(""); const [error, setError] = useState("");
  return <form id={props.id} className="relation-evidence-form" onSubmit={(event) => { event.preventDefault(); setError(""); try { const parsed: unknown = JSON.parse(value); const refs = Array.isArray(parsed) ? parsed as RelationEvidence[] : [parsed as RelationEvidence]; if (!refs.length) throw new Error("至少需要一项现有证据。"); void props.onSubmit(refs); } catch (cause) { setError(messageOf(cause)); } }}><EvidenceInput value={value} onChange={setValue} />{error && <p className="relation-operation-error" role="alert">{error}</p>}<footer><button type="button" className="secondary-action" onClick={props.onCancel}>取消</button><button type="submit" className="primary-action">{props.submitLabel}</button></footer></form>;
}

function EvidenceInput(props: { value: string; onChange(value: string): void }) { return <label className="relation-evidence-input">附加证据（可选）<textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={'粘贴既有证据 JSON，例如 source-anchor、confirmed-event 或 legacy-unanchored。\n不会将自由文本写成可确认事实。'} /><small>原文锚点与已确认事件会在确认/追加时重新验证；旧图来源仅保留为未锚定历史证据。</small></label>; }

function ObjectSelect(props: { label: string; value: string; objects: WorldObjectSummary[]; onChange(value: string): void }) {
  const [query, setQuery] = useState("");
  const matches = props.objects.filter((object) => `${object.title} ${object.id} ${object.type}`.toLocaleLowerCase("zh-CN").includes(query.trim().toLocaleLowerCase("zh-CN")));
  return <label>{props.label}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索已有资料" aria-label={`${props.label} 搜索`} /><select value={props.value} onChange={(event) => props.onChange(event.target.value)} required><option value="">选择已有资料</option>{matches.map((object) => <option key={object.id} value={object.id}>{object.title || "未命名资料"} · {object.id}</option>)}</select></label>;
}

function RelationRow(props: { relation: RelationRecord; objects: WorldObjectSummary[]; onOpen(): void }) { const source = objectLabel(props.objects, props.relation.sourceObjectId); const target = objectLabel(props.objects, props.relation.targetObjectId); return <button type="button" role="listitem" className="relation-list-row" data-relation-id={props.relation.relationId} onClick={props.onOpen}><span className="relation-row-endpoint"><strong>{source}</strong><small>来源</small></span><span className="relation-row-link" aria-label={directionLabel(props.relation.direction)}>{directionGlyph(props.relation.direction)}<em>{props.relation.currentTypeLabel || props.relation.relationLabelSnapshot}</em></span><span className="relation-row-endpoint"><strong>{target}</strong><small>目标</small></span><span className="relation-row-meta"><b data-state={props.relation.archived ? "archived" : props.relation.reviewState}>{relationStateLabel(props.relation)}</b><small>{evidenceSummary(props.relation)} · 修订 {props.relation.revision}</small></span></button>; }

function EvidenceList(props: { relation: RelationRecord }) { const warnings = new Map(props.relation.evidenceWarnings.map((warning) => [warning.index, warning])); return <div className="relation-evidence-list" role="list">{props.relation.evidenceRefs.map((evidence, index) => { const warning = warnings.get(index); return <div role="listitem" key={`${evidence.kind}:${index}`}><span data-status={warning?.status || "current"}>{evidenceKindLabel(evidence.kind)}</span><small>{warning?.message || "当前证据已保留。"}</small></div>; })}</div>; }

function filterRelations(relations: RelationRecord[], view: RelationView, query: string, objects: WorldObjectSummary[]) { const normalized = query.trim().toLocaleLowerCase("zh-CN"); return relations.filter((relation) => { if (view === "pending" && (relation.reviewState !== "candidate" || relation.archived)) return false; if (view === "confirmed" && (relation.reviewState !== "confirmed" || relation.archived)) return false; if (view === "history" && !(relation.archived || relation.reviewState === "rejected")) return false; if (!normalized) return true; return [objectLabel(objects, relation.sourceObjectId), objectLabel(objects, relation.targetObjectId), relation.currentTypeLabel, relation.relationLabelSnapshot].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(normalized); }); }
function countForView(relations: RelationRecord[], view: RelationView) { return filterRelations(relations, view, "", []).length; }
function relationViewLabel(view: RelationView) { return view === "all" ? "全部" : view === "pending" ? "待确认" : view === "confirmed" ? "已确认" : "历史"; }
function objectLabel(objects: WorldObjectSummary[], id: string) { return objects.find((object) => object.id === id)?.title || "已失效资料引用"; }
function directionGlyph(direction: RelationDirection) { return direction === "forward" ? "→" : direction === "reverse" ? "←" : direction === "both" ? "↔" : "—"; }
function directionLabel(direction: RelationDirection) { return direction === "forward" ? "来源指向目标" : direction === "reverse" ? "目标指向来源" : direction === "both" ? "双向关系" : "无方向关系"; }
function relationStateLabel(relation: RelationRecord) { return relation.archived ? "已归档" : relation.reviewState === "candidate" ? "待确认" : relation.reviewState === "confirmed" ? "已确认" : "已拒绝"; }
function evidenceKindLabel(kind: string) { return kind === "manual-author" ? "作者手动建立" : kind === "source-anchor" ? "原文锚点" : kind === "confirmed-event" ? "已确认事件" : kind === "legacy-unanchored" ? "旧图来源（未锚定）" : "不支持的旧证据"; }
function evidenceSummary(relation: RelationRecord) { return relation.evidenceWarnings.length ? "存在待处理证据" : `${relation.evidenceRefs.length} 项证据`; }
function messageOf(cause: unknown) { return cause instanceof Error ? cause.message : "关系操作未完成。"; }
