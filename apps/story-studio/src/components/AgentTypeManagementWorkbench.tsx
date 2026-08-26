import { ArrowDown, ArrowUp, Layers3, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AgentTypeBaseCapability, AgentTypeDefinition, AgentTypeFieldKind } from "../lib/localTransport";
import { WorkspaceHeader } from "../product-shell/WorkspaceHeader";

type TypeDraft = {
  typeId: string | null;
  label: string;
  description: string;
  baseCapability: AgentTypeBaseCapability;
  fields: AgentTypeDefinition["fieldDefinitions"];
  status: AgentTypeDefinition["status"];
  revision: number | null;
};

const CAPABILITIES: Array<[AgentTypeBaseCapability, string]> = [["role", "角色"], ["item", "物品"], ["location", "地点"], ["organization", "组织"]];
const FIELD_KINDS: Array<[AgentTypeFieldKind, string]> = [["text", "文本"], ["longText", "长文本"], ["number", "数字"], ["boolean", "是 / 否"], ["date", "日期"], ["enum", "选项"]];

export function AgentTypeManagementWorkbench(props: {
  projectTitle: string;
  customTypes: AgentTypeDefinition[];
  customTypeCounts: Record<string, number>;
  busy: boolean;
  error: string;
  onOpenNavigation(): void;
  onCreate(input: { label: string; description: string; baseCapability: AgentTypeBaseCapability; fieldDefinitions: AgentTypeDefinition["fieldDefinitions"] }): Promise<void>;
  onUpdate(type: AgentTypeDefinition, input: { label: string; description: string; baseCapability: AgentTypeBaseCapability; fieldDefinitions: AgentTypeDefinition["fieldDefinitions"] }): Promise<void>;
  onActivate(type: AgentTypeDefinition): Promise<void>;
  onRetire(type: AgentTypeDefinition): Promise<void>;
  onDelete(type: AgentTypeDefinition): Promise<void>;
}) {
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | { action: "retire" | "delete"; type: AgentTypeDefinition }>(null);
  const editorReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const grouped = useMemo(() => (["draft", "active", "retired"] as const).map((status) => ({ status, types: props.customTypes.filter((type) => type.status === status).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.label.localeCompare(right.label, "zh-CN")) })), [props.customTypes]);
  const editedType = draft?.typeId ? props.customTypes.find((type) => type.typeId === draft.typeId) || null : null;
  const hasUnsavedChanges = Boolean(draft && editedType && !draftMatchesType(draft, editedType));

  function openNew(trigger?: HTMLButtonElement) {
    editorReturnFocusRef.current = trigger || null;
    setDraft({ typeId: null, label: "", description: "", baseCapability: "role", fields: [], status: "draft", revision: null });
  }

  function openType(type: AgentTypeDefinition, trigger?: HTMLButtonElement) {
    editorReturnFocusRef.current = trigger || null;
    setDraft({ typeId: type.typeId, label: type.label, description: type.description, baseCapability: type.baseCapability, fields: type.fieldDefinitions.map((field) => ({ ...field, options: field.options ? [...field.options] : undefined })), status: type.status, revision: type.revision });
  }

  function closeEditor() {
    setConfirmAction(null);
    setDraft(null);
    window.requestAnimationFrame(() => editorReturnFocusRef.current?.focus({ preventScroll: true }));
  }

  async function saveDraft() {
    if (!draft || !draft.label.trim()) return;
    const fieldDefinitions = draft.fields.map((field, index) => ({ ...field, label: field.label.trim(), description: field.description.trim(), displayOrder: index }));
    try {
      if (editedType) await props.onUpdate(editedType, { label: draft.label.trim(), description: draft.description.trim(), baseCapability: draft.baseCapability, fieldDefinitions });
      else await props.onCreate({ label: draft.label.trim(), description: draft.description.trim(), baseCapability: draft.baseCapability, fieldDefinitions });
      closeEditor();
    } catch {
      // The parent keeps the fail-closed repository message visible.
    }
  }

  return <section className="workbench agent-type-management-workbench" data-testid="agent-type-management-workbench">
    <WorkspaceHeader
      projectTitle={props.projectTitle}
      sectionLabel="资料"
      title="自定义类型"
      context="定义作者自己的角色、物品、地点或组织资料结构"
      status="本地目录"
      prototype="hub"
      icon={<Layers3 aria-hidden="true" />}
      onOpenNavigation={props.onOpenNavigation}
      titleAsHeading
      actions={<button type="button" className="primary-action" onClick={(event) => openNew(event.currentTarget)}><Plus />新建类型</button>}
    />

    <main className="agent-type-management-main">
      {props.error && <p className="library-directory-error" role="alert">{props.error}</p>}
      {props.customTypes.length === 0 ? <div className="library-directory-empty"><Layers3 /><strong>还没有自定义类型</strong><small>从草稿开始定义字段，确认后再启用给资料使用。</small></div> : grouped.map((group) => <section className="agent-type-status-group" key={group.status} aria-labelledby={`agent-type-${group.status}`}>
        <header><h2 id={`agent-type-${group.status}`}>{statusLabel(group.status)}</h2><small>{group.types.length}</small></header>
          {group.types.length === 0 ? <p className="agent-type-group-empty">暂无{statusLabel(group.status)}类型</p> : <div className="agent-type-card-list" role="list">
          {group.types.map((type) => <button type="button" role="listitem" className="agent-type-card" key={type.typeId} onClick={(event) => openType(type, event.currentTarget)}>
            <span><strong>{type.label}</strong><small>{capabilityLabel(type.baseCapability)} · {type.fieldDefinitions.filter((field) => field.status === "active").length} 个字段</small></span>
            <span><b>{props.customTypeCounts[type.typeId] || 0}</b><small>已绑定</small></span>
            <span><b>{statusLabel(type.status)}</b><small>{formatUpdatedAt(type.updatedAt)}</small></span>
          </button>)}
        </div>}
      </section>)}
    </main>

    {draft && <div className="dialog-backdrop" role="presentation"><section className="agent-type-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-type-editor-title">
      <header><div><small>{draft.typeId ? statusLabel(draft.status) : "新草稿"}</small><h2 id="agent-type-editor-title">{draft.typeId ? `编辑${draft.label}` : "新建自定义类型"}</h2></div><button type="button" className="icon-action" aria-label="关闭类型编辑" onClick={closeEditor}><X /></button></header>
      <div className="agent-type-editor-scroll">
        <div className="agent-type-editor-basics">
          <label><span>类型名称</span><input autoFocus value={draft.label} maxLength={80} disabled={draft.status === "retired"} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
          <label><span>基础能力</span><select value={draft.baseCapability} disabled={draft.status === "retired" || Boolean(editedType && (props.customTypeCounts[editedType.typeId] || 0) > 0)} onChange={(event) => setDraft({ ...draft, baseCapability: event.target.value as AgentTypeBaseCapability })}>{CAPABILITIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{editedType && (props.customTypeCounts[editedType.typeId] || 0) > 0 && <small>已有绑定对象，基础能力保持不变。</small>}</label>
          <label className="is-wide"><span>说明（可选）</span><textarea value={draft.description} maxLength={500} disabled={draft.status === "retired"} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        </div>

        <section className="agent-type-field-editor" aria-labelledby="agent-type-fields-title">
          <header><div><h3 id="agent-type-fields-title">字段</h3><small>字段值保存在各自资料中；这里仅定义结构。</small></div>{draft.status !== "retired" && <button type="button" className="secondary-action" onClick={() => setDraft({ ...draft, fields: [...draft.fields, createFieldDraft(draft.fields.length)] })}><Plus />添加字段</button>}</header>
          {draft.fields.length === 0 ? <p className="agent-type-group-empty">这个类型还没有自定义字段。</p> : <div className="agent-type-field-list">
            {draft.fields.map((field, index) => <div className={`agent-type-field-row ${field.status === "retired" ? "is-retired" : ""}`} key={field.fieldId}>
              <div className="agent-type-field-order"><button type="button" className="icon-action" aria-label={`上移${field.label || "未命名字段"}`} disabled={draft.status === "retired" || index === 0} onClick={() => setDraft({ ...draft, fields: moveField(draft.fields, index, -1) })}><ArrowUp /></button><button type="button" className="icon-action" aria-label={`下移${field.label || "未命名字段"}`} disabled={draft.status === "retired" || index === draft.fields.length - 1} onClick={() => setDraft({ ...draft, fields: moveField(draft.fields, index, 1) })}><ArrowDown /></button></div>
              <label><span>名称</span><input value={field.label} disabled={draft.status === "retired" || field.status === "retired"} onChange={(event) => setDraft({ ...draft, fields: patchField(draft.fields, field.fieldId, { label: event.target.value }) })} /></label>
              <label><span>字段类型</span><select value={field.kind} disabled={draft.status === "retired" || field.status === "retired" || Boolean(editedType && (props.customTypeCounts[editedType.typeId] || 0) > 0 && editedType.fieldDefinitions.some((candidate) => candidate.fieldId === field.fieldId))} onChange={(event) => setDraft({ ...draft, fields: patchField(draft.fields, field.fieldId, normalizeKindChange(field, event.target.value as AgentTypeFieldKind)) })}>{FIELD_KINDS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="is-wide"><span>说明</span><input value={field.description} disabled={draft.status === "retired" || field.status === "retired"} onChange={(event) => setDraft({ ...draft, fields: patchField(draft.fields, field.fieldId, { description: event.target.value }) })} /></label>
              {field.kind === "enum" && <label className="is-wide"><span>选项（用逗号分隔）</span><input value={(field.options || []).join("，")} disabled={draft.status === "retired" || field.status === "retired" || Boolean(editedType && (props.customTypeCounts[editedType.typeId] || 0) > 0 && editedType.fieldDefinitions.some((candidate) => candidate.fieldId === field.fieldId))} onChange={(event) => setDraft({ ...draft, fields: patchField(draft.fields, field.fieldId, { options: splitOptions(event.target.value), defaultValue: null }) })} /></label>}
              <label><span>默认值（仅建议）</span><DefaultValueInput field={field} disabled={draft.status === "retired" || field.status === "retired" || Boolean(editedType && (props.customTypeCounts[editedType.typeId] || 0) > 0 && editedType.fieldDefinitions.some((candidate) => candidate.fieldId === field.fieldId))} onChange={(defaultValue) => setDraft({ ...draft, fields: patchField(draft.fields, field.fieldId, { defaultValue }) })} /></label>
              <label className="agent-type-required"><input type="checkbox" checked={field.required} disabled={draft.status === "retired" || field.status === "retired" || Boolean(editedType && (props.customTypeCounts[editedType.typeId] || 0) > 0 && editedType.fieldDefinitions.some((candidate) => candidate.fieldId === field.fieldId))} onChange={(event) => setDraft({ ...draft, fields: patchField(draft.fields, field.fieldId, { required: event.target.checked }) })} /><span>必填</span></label>
              {draft.status !== "retired" && <button type="button" className="secondary-action" disabled={field.status === "retired"} onClick={() => setDraft({ ...draft, fields: patchField(draft.fields, field.fieldId, { status: "retired" }) })}><Trash2 />停用字段</button>}
            </div>)}
          </div>}
        </section>

        {editedType?.status === "active" && <section className="agent-type-danger-zone" data-testid="agent-type-danger-zone" aria-labelledby="agent-type-danger-title">
          <div><small>危险操作</small><h3 id="agent-type-danger-title">停用类型</h3><p>当前有 {props.customTypeCounts[editedType.typeId] || 0} 个对象绑定此类型。停用后，已绑定对象保留现有值，但不能再新建或绑定。</p></div>
          <button type="button" className="danger-action" onClick={() => setConfirmAction({ action: "retire", type: editedType })}>停用类型</button>
        </section>}
        {editedType?.status === "draft" && <section className="agent-type-status-actions" data-testid="agent-type-status-actions" aria-label="草稿生命周期操作">
          <button type="button" className="danger-action" onClick={() => setConfirmAction({ action: "delete", type: editedType })}><Trash2 />删除草稿</button>
          <button type="button" className="primary-action" disabled={props.busy || hasUnsavedChanges} title={hasUnsavedChanges ? "请先保存修改，再启用类型" : undefined} onClick={() => void props.onActivate(editedType).then(closeEditor).catch(() => undefined)}>启用类型</button>
        </section>}
      </div>
      <footer>
        <button type="button" className="secondary-action" onClick={closeEditor}>取消</button>
        {draft.status !== "retired" && <button type="button" className="primary-action" disabled={props.busy || !draft.label.trim() || draft.fields.some((field) => !field.label.trim() || (field.kind === "enum" && !(field.options?.length)))} onClick={() => void saveDraft()}><Save />{props.busy ? "正在保存" : draft.typeId ? "保存修改" : "保存草稿"}</button>}
      </footer>
    </section></div>}

    {confirmAction && <div className="dialog-backdrop" role="presentation"><section className="agent-type-confirm-dialog" role="dialog" aria-modal="true" aria-label={confirmAction.action === "retire" ? "停用类型确认" : "删除草稿确认"}>
      <h2>{confirmAction.action === "retire" ? `停用“${confirmAction.type.label}”` : `删除“${confirmAction.type.label}”`}</h2>
      <p>当前有 {props.customTypeCounts[confirmAction.type.typeId] || 0} 个对象绑定这个类型。{confirmAction.action === "retire" ? "已绑定对象仍可打开，但不能再新建或绑定。" : "只有未绑定的草稿可以删除。"}</p>
      <div><button type="button" className="secondary-action" onClick={() => setConfirmAction(null)}>取消</button><button type="button" className="danger-action" disabled={props.busy} onClick={() => void (confirmAction.action === "retire" ? props.onRetire(confirmAction.type) : props.onDelete(confirmAction.type)).then(closeEditor).catch(() => undefined)}>确认</button></div>
    </section></div>}
  </section>;
}

function DefaultValueInput(props: { field: AgentTypeDefinition["fieldDefinitions"][number]; disabled: boolean; onChange(value: string | number | boolean | null): void }) {
  const booleanRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (booleanRef.current) booleanRef.current.indeterminate = props.field.defaultValue === null;
  }, [props.field.defaultValue]);
  if (props.field.kind === "boolean") return <div className="agent-type-boolean-default-control"><label><input ref={booleanRef} type="checkbox" checked={props.field.defaultValue === true} disabled={props.disabled} aria-label="布尔默认值（仅建议）" onChange={(event) => props.onChange(event.target.checked)} /><span>{props.field.defaultValue === null ? "不设置" : props.field.defaultValue ? "建议为是" : "建议为否"}</span></label>{props.field.defaultValue !== null && <button type="button" className="text-action" disabled={props.disabled} onClick={() => props.onChange(null)}>清除建议</button>}</div>;
  if (props.field.kind === "enum") return <select className="agent-type-default-control" value={props.field.defaultValue === null ? "" : String(props.field.defaultValue)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value || null)}><option value="">不设置</option>{(props.field.options || []).map((option) => <option value={option} key={option}>{option}</option>)}</select>;
  if (props.field.kind === "longText") return <textarea className="agent-type-default-control" rows={3} value={props.field.defaultValue === null ? "" : String(props.field.defaultValue)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value === "" ? null : event.target.value)} />;
  return <input className="agent-type-default-control" type={props.field.kind === "number" ? "number" : props.field.kind === "date" ? "date" : "text"} value={props.field.defaultValue === null ? "" : String(props.field.defaultValue)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value === "" ? null : props.field.kind === "number" ? Number(event.target.value) : event.target.value)} />;
}

function createFieldDraft(index: number): AgentTypeDefinition["fieldDefinitions"][number] {
  return { fieldId: `field.ui.${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`, label: "", kind: "text", description: "", required: false, defaultValue: null, status: "active", displayOrder: index };
}

function patchField(fields: AgentTypeDefinition["fieldDefinitions"], fieldId: string, patch: Partial<AgentTypeDefinition["fieldDefinitions"][number]>): AgentTypeDefinition["fieldDefinitions"] {
  return fields.map((field) => field.fieldId === fieldId ? { ...field, ...patch } : field);
}

function moveField(fields: AgentTypeDefinition["fieldDefinitions"], index: number, direction: -1 | 1): AgentTypeDefinition["fieldDefinitions"] {
  const next = [...fields];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  const [field] = next.splice(index, 1);
  next.splice(target, 0, field);
  return next.map((item, displayOrder) => ({ ...item, displayOrder }));
}

function normalizeKindChange(field: AgentTypeDefinition["fieldDefinitions"][number], kind: AgentTypeFieldKind): Partial<AgentTypeDefinition["fieldDefinitions"][number]> {
  return { kind, defaultValue: null, ...(kind === "enum" ? { options: field.options?.length ? field.options : ["选项一"] } : { options: undefined }) };
}

function splitOptions(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/u).map((item) => item.trim()).filter(Boolean))];
}

function draftMatchesType(draft: TypeDraft, type: AgentTypeDefinition): boolean {
  const normalizedFields = draft.fields.map((field, displayOrder) => ({ ...field, label: field.label.trim(), description: field.description.trim(), displayOrder }));
  return draft.label.trim() === type.label
    && draft.description.trim() === type.description
    && draft.baseCapability === type.baseCapability
    && JSON.stringify(normalizedFields) === JSON.stringify(type.fieldDefinitions);
}

function capabilityLabel(value: AgentTypeBaseCapability): string {
  return CAPABILITIES.find(([capability]) => capability === value)?.[1] || value;
}

function statusLabel(value: AgentTypeDefinition["status"]): string {
  return value === "draft" ? "草稿" : value === "active" ? "已启用" : "已停用";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "更新时间未知" : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}
