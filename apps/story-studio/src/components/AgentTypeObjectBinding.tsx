import { AlertTriangle, Layers3, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AgentTypeDefinition, WorldObject } from "../lib/localTransport";
import { agentTypeFieldValueKey, authorFacingObjectTypeLabel, objectTypeLabel } from "../worldObjectCatalog";

export function AgentTypeObjectBinding(props: {
  object: WorldObject;
  agentTypes: AgentTypeDefinition[];
  busy: boolean;
  error: string;
  onSave(input: { agentTypeId: string | null; fieldValues: Record<string, string | number | boolean | null> }): Promise<void>;
}) {
  const currentType = props.object.agentTypeId ? props.agentTypes.find((type) => type.typeId === props.object.agentTypeId) || null : null;
  const compatibleCapability = capabilityForSource(props.object.type);
  const compatibleTypes = props.agentTypes.filter((type) => !type.builtin && type.status === "active" && type.baseCapability === compatibleCapability);
  const [selectedTypeId, setSelectedTypeId] = useState(props.object.agentTypeId || "");
  const [values, setValues] = useState<Record<string, string | number | boolean | null>>(() => valuesForType(props.object, currentType));
  const selectedType = useMemo(() => props.agentTypes.find((type) => type.typeId === selectedTypeId) || null, [props.agentTypes, selectedTypeId]);
  const label = authorFacingObjectTypeLabel({ sourceType: props.object.type, agentTypeId: props.object.agentTypeId, agentTypes: props.agentTypes });
  const bindingLabel = selectedType?.label || label.label;
  const bindingStatus = selectedType ? selectedType.status === "active" ? "已启用" : "已停用" : "未绑定";

  useEffect(() => {
    setSelectedTypeId(props.object.agentTypeId || "");
    setValues(valuesForType(props.object, props.object.agentTypeId ? props.agentTypes.find((type) => type.typeId === props.object.agentTypeId) || null : null));
  }, [props.object.id, props.object.revisionToken, props.object.agentTypeId, props.agentTypes]);

  function chooseType(typeId: string) {
    setSelectedTypeId(typeId);
    const type = props.agentTypes.find((candidate) => candidate.typeId === typeId) || null;
    setValues(typeId === props.object.agentTypeId ? valuesForType(props.object, type) : {});
  }

  const missingRequired = selectedType?.fieldDefinitions.filter((field) => field.status === "active" && field.required && isEmpty(values[field.fieldId])) || [];
  const changed = selectedTypeId !== (props.object.agentTypeId || "") || selectedType?.fieldDefinitions.some((field) => field.status === "active" && (values[field.fieldId] ?? null) !== rawObjectFieldValue(props.object, field.fieldId));

  return <section className="agent-type-object-binding" data-testid="agent-type-object-binding">
    <header><span><Layers3 /><strong>自定义类型</strong></span><small>{bindingLabel} · {bindingStatus}</small></header>
    {compatibleCapability ? <>
      <label className="agent-type-binding-select"><span>资料类型</span><select value={selectedTypeId} disabled={props.busy} onChange={(event) => chooseType(event.target.value)}>
        <option value="">使用内置类型（{objectTypeLabel(props.object.type)}）</option>
        {currentType?.status === "retired" && <option value={currentType.typeId}>{currentType.label}（已停用）</option>}
        {compatibleTypes.filter((type) => type.typeId !== currentType?.typeId || currentType.status !== "retired").map((type) => <option value={type.typeId} key={type.typeId}>{type.label}</option>)}
      </select></label>
      {selectedType && <div className="agent-type-object-fields">
        {selectedType.status === "retired" && <p className="agent-type-binding-note"><AlertTriangle />这个类型已停用；已有值保留在来源详情中。可以切换到内置类型或其他已启用类型。</p>}
        {selectedType.fieldDefinitions.filter((field) => field.status === "active").map((field) => <AgentFieldInput key={field.fieldId} field={field} value={values[field.fieldId]} disabled={props.busy || selectedType.status === "retired"} onChange={(value) => setValues((current) => ({ ...current, [field.fieldId]: value }))} />)}
        {selectedType.fieldDefinitions.some((field) => field.status === "active" && field.required && isEmpty(values[field.fieldId])) && <small className="agent-type-required-note">带“必填”的字段需要在首次绑定前完成；后来新增的必填字段会标记为待填写。</small>}
      </div>}
      {props.error && <p className="inline-error" role="alert">{props.error}</p>}
      <button type="button" className="secondary-action agent-type-binding-save" disabled={props.busy || !changed || (selectedTypeId !== (props.object.agentTypeId || "") && missingRequired.length > 0) || Boolean(selectedType && selectedType.status === "retired" && selectedTypeId === props.object.agentTypeId)} onClick={() => void props.onSave({ agentTypeId: selectedTypeId || null, fieldValues: selectedType ? values : {} }).catch(() => undefined)}><Save />{props.busy ? "正在保存" : "保存类型与字段"}</button>
    </> : <p className="agent-type-binding-note">{objectTypeLabel(props.object.type)}沿用内置资料投影，不会自动映射成角色、物品、地点或组织类型。</p>}
    <details className="card-technical-details"><summary>来源与技术详情</summary>
      <dl className="property-row"><dt>source type</dt><dd>{props.object.type}</dd></dl>
      <dl className="property-row"><dt>agentTypeId</dt><dd>{props.object.agentTypeId || "未绑定"}</dd></dl>
      <dl className="property-row"><dt>type revision</dt><dd>{currentType?.revision ?? "—"}</dd></dl>
      <dl className="property-row"><dt>object revision</dt><dd>{props.object.revisionToken}</dd></dl>
      {currentType?.fieldDefinitions.filter((field) => field.status === "retired" && rawObjectFieldValue(props.object, field.fieldId) !== null).map((field) => <dl className="property-row" key={field.fieldId}><dt>{field.label}（已停用）</dt><dd>{String(rawObjectFieldValue(props.object, field.fieldId))}</dd></dl>)}
    </details>
  </section>;
}

function AgentFieldInput(props: { field: AgentTypeDefinition["fieldDefinitions"][number]; value: string | number | boolean | null | undefined; disabled: boolean; onChange(value: string | number | boolean | null): void }) {
  const pending = props.field.required && isEmpty(props.value);
  const common = <><span>{props.field.label}{props.field.required ? " *" : ""}</span>{props.field.description && <small>{props.field.description}</small>}{pending && <em>待填写</em>}{props.field.defaultValue !== null && isEmpty(props.value) && <small>建议值：{String(props.field.defaultValue)}</small>}</>;
  if (props.field.kind === "longText") return <label className="is-wide">{common}<textarea value={String(props.value ?? "")} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value || null)} /></label>;
  if (props.field.kind === "boolean") return <label>{common}<select value={props.value === undefined || props.value === null ? "" : String(props.value)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">未填写</option><option value="true">是</option><option value="false">否</option></select></label>;
  if (props.field.kind === "enum") return <label>{common}<select value={String(props.value ?? "")} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value || null)}><option value="">未填写</option>{(props.field.options || []).map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
  return <label>{common}<input type={props.field.kind === "number" ? "number" : props.field.kind === "date" ? "date" : "text"} value={props.value === undefined || props.value === null ? "" : String(props.value)} disabled={props.disabled} onChange={(event) => props.onChange(event.target.value === "" ? null : props.field.kind === "number" ? Number(event.target.value) : event.target.value)} /></label>;
}

function capabilityForSource(sourceType: WorldObject["type"]): AgentTypeDefinition["baseCapability"] | null {
  return sourceType === "character" ? "role" : sourceType === "item" ? "item" : sourceType === "location" ? "location" : sourceType === "faction" ? "organization" : null;
}

function valuesForType(object: WorldObject, type: AgentTypeDefinition | null): Record<string, string | number | boolean | null> {
  if (!type) return {};
  return Object.fromEntries(type.fieldDefinitions.filter((field) => field.status === "active").map((field) => [field.fieldId, rawObjectFieldValue(object, field.fieldId)]).filter(([, value]) => value !== null));
}

function rawObjectFieldValue(object: WorldObject, fieldId: string): string | number | boolean | null {
  return object.agentTypeFieldValues?.[agentTypeFieldValueKey(fieldId)] ?? null;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
