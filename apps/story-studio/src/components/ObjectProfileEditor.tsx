import { useMemo } from "react";

import {
  STORY_STUDIO_OBJECT_PROFILE_VERSION,
  type StoryStudioObjectProfile,
  type StoryStudioObjectProfileObjectType,
  type StoryStudioProfileConfidence,
  type StoryStudioProfileField,
  type StoryStudioProfileSource
} from "../../../../src/storyContracts/storyStudioObjectProfile.ts";

type ProfileFieldDefinition = { key: string; label: string; hint: string; multiline?: boolean };

const PROFILE_FIELDS: Record<Extract<StoryStudioObjectProfileObjectType, "character" | "item" | "location">, ProfileFieldDefinition[]> = {
  character: [
    { key: "story-role", label: "故事定位", hint: "作者已经确认的角色作用或位置。" },
    { key: "summary", label: "一句话简介", hint: "可直接被作者阅读的中性描述。", multiline: true },
    { key: "life", label: "生平", hint: "只填写当前范围已经建立的内容。", multiline: true },
    { key: "motivation", label: "动机", hint: "尚未确定时保留为空或未知。", multiline: true }
  ],
  item: [
    { key: "category", label: "类别", hint: "例如工具、信物、文件或未知。" },
    { key: "purpose", label: "故事定位 / 用途", hint: "它在当前故事中的作用。", multiline: true },
    { key: "description", label: "介绍", hint: "外观、来源或已知限制。", multiline: true }
  ],
  location: [
    { key: "location-type", label: "地点类型", hint: "例如港口、房间、城市或未知。" },
    { key: "description", label: "简介", hint: "当前来源能够支持的空间描述。", multiline: true },
    { key: "atmosphere", label: "氛围", hint: "作者确认或来源明确的感受。", multiline: true },
    { key: "region", label: "所属区域", hint: "用于只读地点拓扑分组，不是第二地图数据。" }
  ]
};

const PROFILE_GROUPS: Record<Extract<StoryStudioObjectProfileObjectType, "character" | "item" | "location">, Array<{ title: string; keys: string[] }>> = {
  character: [{ title: "人物摘要", keys: ["story-role", "summary"] }, { title: "人物设定", keys: ["life", "motivation"] }],
  item: [{ title: "物品摘要", keys: ["category", "purpose", "description"] }],
  location: [{ title: "地点摘要", keys: ["location-type", "description", "atmosphere", "region"] }]
};

export function createEmptyObjectProfile(objectType: StoryStudioObjectProfileObjectType): StoryStudioObjectProfile {
  const definitions = PROFILE_FIELDS[objectType as keyof typeof PROFILE_FIELDS] || [];
  return {
    version: STORY_STUDIO_OBJECT_PROFILE_VERSION,
    objectType,
    fields: Object.fromEntries(definitions.map((field) => [field.key, createField(field.label)])),
    unresolvedQuestions: [],
    warnings: [],
    authorConfirmed: false
  };
}

export function profileFieldDefinitions(objectType: StoryStudioObjectProfileObjectType): string[] {
  return (PROFILE_FIELDS[objectType as keyof typeof PROFILE_FIELDS] || []).map((field) => field.key);
}

export function profileFromAgentValue(value: unknown, objectType: StoryStudioObjectProfileObjectType): StoryStudioObjectProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return createEmptyObjectProfile(objectType);
  const candidate = value as Partial<StoryStudioObjectProfile>;
  const base = createEmptyObjectProfile(objectType);
  const fields = candidate.fields && typeof candidate.fields === "object" && !Array.isArray(candidate.fields)
    ? Object.fromEntries(Object.entries(candidate.fields).map(([key, field]) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) return [key, base.fields[key] || createField(profileLabel(key))];
      const sourceField = field as Partial<StoryStudioProfileField>;
      return [key, {
        label: typeof sourceField.label === "string" && sourceField.label.trim() ? sourceField.label : base.fields[key]?.label || profileLabel(key),
        value: profileValue(sourceField.value),
        source: profileSource(sourceField.source),
        confidence: profileConfidence(sourceField.confidence),
        sourceAnchors: Array.isArray(sourceField.sourceAnchors) ? sourceField.sourceAnchors.filter((item): item is string => typeof item === "string") : []
      } satisfies StoryStudioProfileField];
    }))
    : base.fields;
  return {
    ...base,
    ...candidate,
    version: STORY_STUDIO_OBJECT_PROFILE_VERSION,
    objectType,
    fields,
    unresolvedQuestions: stringList(candidate.unresolvedQuestions),
    warnings: stringList(candidate.warnings),
    authorConfirmed: candidate.authorConfirmed === true
  };
}

export function ObjectProfileEditor(props: {
  objectType: StoryStudioObjectProfileObjectType;
  profile: StoryStudioObjectProfile;
  onChange(profile: StoryStudioObjectProfile): void;
  editable?: boolean;
  compact?: boolean;
  testId?: string;
}) {
  const definitions = useMemo(() => PROFILE_FIELDS[props.objectType as keyof typeof PROFILE_FIELDS] || [], [props.objectType]);
  const groups = PROFILE_GROUPS[props.objectType as keyof typeof PROFILE_GROUPS] || [];
  if (!definitions.length) return null;

  function updateField(key: string, patch: Partial<StoryStudioProfileField>) {
    props.onChange({ ...props.profile, fields: { ...props.profile.fields, [key]: { ...(props.profile.fields[key] || createField(profileLabel(key))), ...patch } } });
  }

  return <section className={`object-profile-editor${props.compact ? " is-compact" : ""}`} data-testid={props.testId || "object-profile-editor"}>
    <header className="object-profile-editor-header">
      <div><strong>核心资料档案</strong><small>版本化派生 profile；不替代对象、事件、Canon 或 Relation owner。</small></div>
      <span className={props.profile.authorConfirmed ? "profile-confirmed" : "profile-unconfirmed"}>{props.profile.authorConfirmed ? "作者已确认" : "待作者确认"}</span>
    </header>
    {groups.map((group) => <fieldset className="object-profile-group" key={group.title}>
      <legend>{group.title}</legend>
      {group.keys.map((key) => {
        const definition = definitions.find((item) => item.key === key);
        if (!definition) return null;
        const field = props.profile.fields[key] || createField(definition.label);
        const value = Array.isArray(field.value) ? field.value.join("、") : field.value == null ? "" : String(field.value);
        return <div className="object-profile-field" key={key} data-profile-key={key}>
          <label><span>{field.label || definition.label}</span>{definition.multiline ? <textarea value={value} readOnly={props.editable === false} placeholder={definition.hint} onChange={(event) => updateField(key, { value: event.target.value, source: "author", confidence: "unknown" })} /> : <input value={value} readOnly={props.editable === false} placeholder={definition.hint} onChange={(event) => updateField(key, { value: event.target.value, source: "author", confidence: "unknown" })} />}<small>{definition.hint}</small></label>
          <div className="object-profile-field-meta"><span>{sourceLabel(field.source)}</span><select aria-label={`${field.label || definition.label}可信度`} value={field.confidence} disabled={props.editable === false} onChange={(event) => updateField(key, { confidence: event.target.value as StoryStudioProfileConfidence })}><option value="high">高</option><option value="medium">中</option><option value="low">低</option><option value="unknown">未知</option></select></div>
        </div>;
      })}
    </fieldset>)}
    {(props.profile.unresolvedQuestions.length > 0 || props.profile.warnings.length > 0) && <div className="object-profile-notices">
      {props.profile.unresolvedQuestions.map((question) => <p key={`question-${question}`}><strong>待确认</strong>{question}</p>)}
      {props.profile.warnings.map((warning) => <p key={`warning-${warning}`}><strong>来源提示</strong>{warning}</p>)}
    </div>}
  </section>;
}

function createField(label: string): StoryStudioProfileField {
  return { label, value: null, source: "author", confidence: "unknown", sourceAnchors: [] };
}

function profileLabel(key: string): string {
  return key.split(/[._-]/u).filter(Boolean).map((part) => part[0].toLocaleUpperCase("en-US") + part.slice(1)).join(" ") || key;
}

function profileValue(value: unknown): StoryStudioProfileField["value"] {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value as StoryStudioProfileField["value"];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return null;
}

function profileSource(value: unknown): StoryStudioProfileSource {
  return value === "agent" || value === "source-anchor" || value === "author" ? value : "author";
}

function profileConfidence(value: unknown): StoryStudioProfileConfidence {
  return value === "high" || value === "medium" || value === "low" || value === "unknown" ? value : "unknown";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sourceLabel(value: StoryStudioProfileSource): string {
  return value === "source-anchor" ? "来源锚点" : value === "agent" ? "天意候选" : "作者填写";
}
