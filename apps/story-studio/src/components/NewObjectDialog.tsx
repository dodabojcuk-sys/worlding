import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileText, ListTree, ShieldCheck, Sparkles, Wand2, X } from "lucide-react";
import { useState } from "react";

import type { AgentRecognitionProposal, AgentTypeDefinition, CardTemplate, WorldObjectType } from "../lib/localTransport";
import type { StoryStudioObjectProfile } from "../../../../src/storyContracts/storyStudioObjectProfile.ts";
import { WORLD_OBJECT_TYPES } from "../worldObjectCatalog";
import { ObjectProfileEditor, createEmptyObjectProfile, profileFromAgentValue } from "./ObjectProfileEditor";

export type CharacterCreationInput = {
  mode: "guided" | "freeform" | "template";
  subtype: string;
  background: string;
  personality: string;
  appearance: string;
  portraitFile: File | null;
  coverFile: File | null;
  templateId?: string;
  templateExpectedHash?: string;
};

export type AgentTypeCreationInput = { agentTypeId: string | null; fieldValues: Record<string, string | number | boolean | null> };
export type ObjectCreationPath = "agent" | "extract" | "manual";
export type AgentDraftRequestInput = { mode: "draft" | "extract"; authorIntent: string; sourceScope: string; sourceText: string };
export type AgentDraftApplication = { objectType: "character" | "item" | "location"; title: string; aliases: string[]; tags: string[]; status: string; body: string; profile: StoryStudioObjectProfile };
export type AgentDraftEditInput = { suggestedName: string; aliases: string[]; profile: StoryStudioObjectProfile; uncertainties: string[] };

export function NewObjectDialog(props: {
  type: WorldObjectType;
  title: string;
  templates: CardTemplate[];
  agentTypes: AgentTypeDefinition[];
  initialAgentTypeId?: string | null;
  error: string;
  busy: boolean;
  onType(value: WorldObjectType): void;
  onTitle(value: string): void;
  onCreate(input: CharacterCreationInput | null, agentType: AgentTypeCreationInput, profile: StoryStudioObjectProfile | null): void;
  onRequestAgentDraft?(input: AgentDraftRequestInput & { objectType: "character" | "item" | "location" }): Promise<AgentRecognitionProposal>;
  onEditAgentDraft?(proposal: AgentRecognitionProposal, input: AgentDraftEditInput): Promise<AgentRecognitionProposal>;
  onConfirmAgentDraft?(proposal: AgentRecognitionProposal, application: AgentDraftApplication): Promise<void>;
  onIgnoreAgentDraft?(proposal: AgentRecognitionProposal): Promise<void>;
  onClose(): void;
}) {
  const [path, setPath] = useState<ObjectCreationPath>("agent");
  const [route, setRoute] = useState<CharacterCreationInput["mode"]>("guided");
  const [subtype, setSubtype] = useState("");
  const [background, setBackground] = useState("");
  const [personality, setPersonality] = useState("");
  const [appearance, setAppearance] = useState("");
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [guidedStep, setGuidedStep] = useState(0);
  const [templateId, setTemplateId] = useState(props.templates[0]?.id || "");
  const [agentTypeId, setAgentTypeId] = useState(props.initialAgentTypeId || "");
  const [agentFieldValues, setAgentFieldValues] = useState<Record<string, string | number | boolean | null>>({});
  const [manualProfile, setManualProfile] = useState<StoryStudioObjectProfile>(() => createEmptyObjectProfile(props.type));
  const [agentIntent, setAgentIntent] = useState("");
  const [agentSourceText, setAgentSourceText] = useState("");
  const [agentSourceScope, setAgentSourceScope] = useState("当前作者范围");
  const [agentProposal, setAgentProposal] = useState<AgentRecognitionProposal | null>(null);
  const [agentReviewTitle, setAgentReviewTitle] = useState("");
  const [agentReviewAliases, setAgentReviewAliases] = useState("");
  const [agentReviewProfile, setAgentReviewProfile] = useState<StoryStudioObjectProfile>(() => createEmptyObjectProfile(props.type));
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const selectedTemplate = props.templates.find((template) => template.id === templateId) || null;
  const isCharacter = props.type === "character";
  const selectedAgentType = props.agentTypes.find((type) => type.typeId === agentTypeId && type.status === "active") || null;
  const compatibleAgentTypes = props.agentTypes.filter((type) => !type.builtin && type.status === "active" && sourceTypeForCapability(type.baseCapability) === props.type);
  const missingRequired = selectedAgentType?.fieldDefinitions.some((field) => field.status === "active" && field.required && (agentFieldValues[field.fieldId] === undefined || agentFieldValues[field.fieldId] === null || agentFieldValues[field.fieldId] === "")) || false;
  const agentCreationInput = (): AgentTypeCreationInput => ({ agentTypeId: selectedAgentType?.typeId || null, fieldValues: selectedAgentType ? agentFieldValues : {} });

  function selectObjectType(value: WorldObjectType) {
    setAgentTypeId("");
    setAgentFieldValues({});
    setAgentProposal(null);
    setAgentError("");
    setManualProfile(createEmptyObjectProfile(value));
    props.onType(value);
  }

  async function requestAgentDraft() {
    if (!props.onRequestAgentDraft || !isAgentObjectType(props.type)) return;
    if (!agentIntent.trim() && !agentSourceText.trim()) {
      setAgentError("请先填写作者想法或当前文本范围。");
      return;
    }
    setAgentBusy(true);
    setAgentError("");
    try {
      const proposal = await props.onRequestAgentDraft({ objectType: props.type, mode: path === "extract" ? "extract" : "draft", authorIntent: agentIntent, sourceScope: agentSourceScope, sourceText: agentSourceText });
      setAgentProposal(proposal);
      setAgentReviewTitle(proposal.suggestedName);
      setAgentReviewAliases(readSuggestedAliases(proposal));
      setAgentReviewProfile(profileFromAgentValue(proposal.suggestedFields.proposedProfile, props.type));
    } catch (cause) {
      setAgentError(cause instanceof Error ? cause.message : "无法形成待审草稿。");
    } finally {
      setAgentBusy(false);
    }
  }

  async function saveAgentDraftEdit() {
    if (!agentProposal || !props.onEditAgentDraft) return;
    setAgentBusy(true);
    setAgentError("");
    try {
      const next = await props.onEditAgentDraft(agentProposal, {
        suggestedName: agentReviewTitle.trim(),
        aliases: splitLocalList(agentReviewAliases),
        profile: agentReviewProfile,
        uncertainties: agentProposal.uncertainties
      });
      setAgentProposal(next);
    } catch (cause) {
      setAgentError(cause instanceof Error ? cause.message : "无法保存草稿修改。");
    } finally {
      setAgentBusy(false);
    }
  }

  async function confirmAgentDraft() {
    if (!agentProposal || !props.onConfirmAgentDraft || !isAgentObjectType(props.type) || !agentReviewTitle.trim()) return;
    setAgentBusy(true);
    setAgentError("");
    try {
      await props.onConfirmAgentDraft(agentProposal, {
        objectType: props.type,
        title: agentReviewTitle.trim(),
        aliases: splitLocalList(agentReviewAliases),
        tags: [],
        status: "active",
        body: profileBody(agentReviewProfile),
        profile: { ...agentReviewProfile, authorConfirmed: true }
      });
    } catch (cause) {
      setAgentError(cause instanceof Error ? cause.message : "作者确认保存失败。");
      setAgentBusy(false);
    }
  }

  async function ignoreAgentDraft() {
    if (!agentProposal || !props.onIgnoreAgentDraft) return;
    setAgentBusy(true);
    setAgentError("");
    try {
      await props.onIgnoreAgentDraft(agentProposal);
      setAgentProposal(null);
    } catch (cause) {
      setAgentError(cause instanceof Error ? cause.message : "无法归档此待审草稿。");
    } finally {
      setAgentBusy(false);
    }
  }

  function submitCharacter() {
    props.onCreate({
      mode: route,
      subtype,
      background,
      personality,
      appearance,
      portraitFile,
      coverFile,
      ...(route === "template" && selectedTemplate ? { templateId: selectedTemplate.id, templateExpectedHash: selectedTemplate.revisionToken } : {})
    }, agentCreationInput(), { ...manualProfile, authorConfirmed: true });
  }

  return <div className="dialog-backdrop" role="presentation">
    <section className="new-object-dialog character-create-dialog" role="dialog" aria-modal="true" aria-labelledby="new-object-title" data-testid="new-object-dialog">
      <button type="button" className="quiet-close" onClick={props.onClose} aria-label="关闭新建资料"><X /></button>
      <p className="eyebrow">资料库</p>
      <h2 id="new-object-title">{isCharacter ? "新建角色资料" : "新建一份资料"}</h2>
      <p>{isCharacter ? "从作者想法形成待审资料，再由作者确认写入当前项目。" : "选择资料类型，再从作者化字段开始填写。"}</p>
      <div className="object-type-grid" role="listbox" aria-label="资料类型">
        {WORLD_OBJECT_TYPES.map((item) => {
          const Icon = item.icon;
          return <button type="button" role="option" aria-selected={props.type === item.value && !agentTypeId} className={props.type === item.value && !agentTypeId ? "is-selected" : ""} onClick={() => selectObjectType(item.value)} key={item.value}>
            <Icon /><span>{item.label}</span>{props.type === item.value && <Check />}
          </button>;
        })}
      </div>
      {compatibleAgentTypes.length > 0 && <div className="custom-object-type-grid" role="listbox" aria-label="自定义资料类型"><small>自定义类型</small>{compatibleAgentTypes.map((type) => <button type="button" role="option" aria-selected={agentTypeId === type.typeId} className={agentTypeId === type.typeId ? "is-selected" : ""} onClick={() => { setAgentTypeId(type.typeId); setAgentFieldValues({}); props.onType(sourceTypeForCapability(type.baseCapability)); }} key={type.typeId}>{type.label}{agentTypeId === type.typeId && <Check />}</button>)}</div>}
      <label className="dialog-field">
        <span>资料名称</span>
        <input autoFocus value={props.title} maxLength={80} onChange={(event) => props.onTitle(event.target.value)} placeholder="例如：林远、旧灯塔、地下室秘密" data-testid="new-object-title-input" />
      </label>

      <section className="creation-path-section" aria-label="资料形成方式">
        <header><strong>先选择资料形成方式</strong><small>Agent 只产生待审草稿；正式资料仍由作者确认。</small></header>
        <div className="creation-path-grid">
          <button type="button" className={path === "agent" ? "is-selected" : ""} onClick={() => { setPath("agent"); setAgentProposal(null); setAgentError(""); }} data-testid="object-path-agent"><Sparkles /><strong>让天意起草</strong><small>从作者想法形成候选字段</small></button>
          <button type="button" className={path === "extract" ? "is-selected" : ""} onClick={() => { setPath("extract"); setAgentProposal(null); setAgentError(""); }} disabled={!isAgentObjectType(props.type)} data-testid="object-path-extract"><FileText /><strong>从当前文本提取</strong><small>标记来源范围，再进入审查</small></button>
          <button type="button" className={path === "manual" ? "is-selected" : ""} onClick={() => { setPath("manual"); setAgentProposal(null); setAgentError(""); }} data-testid="object-path-manual"><ShieldCheck /><strong>手动创建</strong><small>作者直接填写已确认内容</small></button>
        </div>
      </section>

      {path !== "manual" && isAgentObjectType(props.type) && !agentProposal && <section className="agent-draft-request" data-testid="agent-draft-request">
        <p className="agent-boundary-note"><Sparkles />当前只展示隔离确定性 fixture；真实 Provider 未连接，不会调用外部模型。</p>
        <label className="dialog-field"><span>{path === "extract" ? "作者说明（可选）" : "作者想法"}</span><textarea value={agentIntent} onChange={(event) => setAgentIntent(event.target.value)} placeholder={path === "extract" ? "说明希望从文本中确认什么。" : "例如：她守着旧灯塔，知道一条没人相信的航线。"} data-testid="agent-draft-intent" /></label>
        <label className="dialog-field"><span>{path === "extract" ? "当前文本范围" : "参考文本（可选）"}</span><textarea value={agentSourceText} onChange={(event) => setAgentSourceText(event.target.value)} placeholder={path === "extract" ? "粘贴一次性审查范围；不会读取整个项目。" : "可以留空；留空时候选会明确标记为低置信度。"} data-testid="agent-draft-source" /></label>
        <label className="dialog-field"><span>来源范围标签</span><input value={agentSourceScope} maxLength={120} onChange={(event) => setAgentSourceScope(event.target.value)} data-testid="agent-draft-scope" /></label>
        <button type="button" className="primary-action dialog-primary" disabled={agentBusy || (!agentIntent.trim() && !agentSourceText.trim())} onClick={() => void requestAgentDraft()} data-testid="agent-draft-submit">{agentBusy ? "正在形成待审草稿" : "形成待审草稿"}<ArrowRight /></button>
        {agentError && <p className="form-error" role="alert" data-testid="agent-draft-error">{agentError}</p>}
      </section>}

      {path !== "manual" && isAgentObjectType(props.type) && agentProposal && <AgentDraftReview proposal={agentProposal} title={agentReviewTitle} aliases={agentReviewAliases} profile={agentReviewProfile} busy={agentBusy} error={agentError} onTitle={setAgentReviewTitle} onAliases={setAgentReviewAliases} onProfile={setAgentReviewProfile} onEdit={() => void saveAgentDraftEdit()} onConfirm={() => void confirmAgentDraft()} onIgnore={() => void ignoreAgentDraft()} />}

      {path === "manual" && isAgentObjectType(props.type) && <ObjectProfileEditor objectType={props.type} profile={manualProfile} onChange={(profile) => setManualProfile(profile)} testId="manual-object-profile" />}

      {selectedAgentType && <section className="new-object-agent-fields"><header><strong>{selectedAgentType.label}字段</strong><small>默认值仅作建议；确认创建后才会保存。</small></header>{selectedAgentType.fieldDefinitions.filter((field) => field.status === "active").map((field) => <NewObjectAgentField key={field.fieldId} field={field} value={agentFieldValues[field.fieldId]} onChange={(value) => setAgentFieldValues((current) => ({ ...current, [field.fieldId]: value }))} />)}</section>}

      {path === "manual" && isCharacter && <>
        <div className="character-route-grid" role="radiogroup" aria-label="角色创建方式">
          <button type="button" className={route === "guided" ? "is-selected" : ""} onClick={() => { setRoute("guided"); setGuidedStep(0); }} data-testid="creation-route-guided"><Wand2 /><strong>引导创建</strong><small>逐步填写背景、性格与外观</small></button>
          <button type="button" className={route === "freeform" ? "is-selected" : ""} onClick={() => setRoute("freeform")} data-testid="creation-route-freeform"><FileText /><strong>自由创建</strong><small>从空白 Markdown 卡片开始</small></button>
          <button type="button" className={route === "template" ? "is-selected" : ""} onClick={() => setRoute("template")} disabled={props.templates.length === 0} data-testid="creation-route-template"><ListTree /><strong>本地模板</strong><small>{props.templates.length ? "应用结构，不覆盖已有值" : "尚无本地模板"}</small></button>
        </div>
        <label className="dialog-field"><span>角色子类型（可选）</span><input value={subtype} maxLength={80} onChange={(event) => setSubtype(event.target.value)} placeholder="例如：调查者" data-testid="character-subtype-input" /></label>
        <div className="creation-image-inputs">
          <label className="dialog-field"><span>角色肖像（可选）</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setPortraitFile(event.target.files?.[0] || null)} /><small>{portraitFile?.name || "确认创建前只保存在当前窗口。"}</small></label>
          <label className="dialog-field"><span>卡片封面（可选）</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setCoverFile(event.target.files?.[0] || null)} /><small>{coverFile?.name || "与角色肖像是独立引用。"}</small></label>
        </div>

        {route === "guided" && <section className="guided-character-steps" data-testid="guided-character-flow">
          <div className="guided-step-indicator">{["背景", "性格", "外观", "预览"].map((label, index) => <span className={index === guidedStep ? "is-active" : index < guidedStep ? "is-complete" : ""} key={label}>{index + 1} · {label}</span>)}</div>
          {guidedStep === 0 && <label className="dialog-field"><span>背景与出身</span><textarea value={background} onChange={(event) => setBackground(event.target.value)} placeholder="只写你已经确定的设定，也可以留空。" /></label>}
          {guidedStep === 1 && <label className="dialog-field"><span>性格</span><textarea value={personality} onChange={(event) => setPersonality(event.target.value)} placeholder="行动倾向、矛盾或习惯。" /></label>}
          {guidedStep === 2 && <label className="dialog-field"><span>外观</span><textarea value={appearance} onChange={(event) => setAppearance(event.target.value)} placeholder="外观与辨识特征。" /></label>}
          {guidedStep === 3 && <CreationPreview title={props.title} subtype={subtype} rows={[["背景与出身", background], ["性格", personality], ["外观", appearance], ["Markdown 内容槽位", "背景、性格、外观"], ["属性与卡片区块", "核心属性组、身份信息、关系占位"], ["角色肖像 / 卡片封面", selectedImageSummary(portraitFile, coverFile)], ["不会自动写入", "角色经历、秘密、关系事实或 AI 生成内容"]]} />}
          <div className="guided-step-actions">{guidedStep > 0 && <button type="button" className="secondary-action" onClick={() => setGuidedStep((step) => step - 1)}><ArrowLeft />上一步</button>}{guidedStep < 3 ? <button type="button" className="primary-action" onClick={() => setGuidedStep((step) => step + 1)}>继续<ArrowRight /></button> : <button type="button" className="primary-action" disabled={!props.title.trim() || props.busy || missingRequired} onClick={submitCharacter} data-testid="create-guided-character">{props.busy ? "正在创建" : "创建角色"}<ArrowRight /></button>}</div>
        </section>}

        {route === "freeform" && <section className="character-route-preview"><CreationPreview title={props.title} subtype={subtype} rows={[["正文", "空白 Markdown 正文"], ["构成", "核心信息属性组、身份信息与关系区块"], ["角色肖像 / 卡片封面", selectedImageSummary(portraitFile, coverFile)], ["不会自动写入", "背景、性格、外观、秘密或关系事实"]]} /><button type="button" className="primary-action dialog-primary" disabled={!props.title.trim() || props.busy || missingRequired} onClick={submitCharacter} data-testid="create-freeform-character">{props.busy ? "正在创建" : "创建空白角色卡"}<ArrowRight /></button></section>}

        {route === "template" && <section className="character-route-preview" data-testid="local-template-creation">
          <label className="dialog-field"><span>本地模板</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{props.templates.map((template) => <option value={template.id} key={template.id}>{template.label}</option>)}</select></label>
          {selectedTemplate && <CreationPreview title={props.title} subtype={subtype} rows={[["内容槽位", selectedTemplate.sections.map((section) => section.label).join(" · ") || "无"], ["属性定义", selectedTemplate.propertyDefinitions.map((property) => property.label).join(" · ") || "无"], ["卡片区块", `${selectedTemplate.blocks.length} 个模板区块，加角色核心构成`], ["角色肖像 / 卡片封面", selectedImageSummary(portraitFile, coverFile)], ["不会从模板写入", "角色值、正文、对象引用、图片或 AI 内容"]]} />}
          <button type="button" className="primary-action dialog-primary" disabled={!props.title.trim() || !selectedTemplate || props.busy || missingRequired} onClick={submitCharacter} data-testid="create-template-character">{props.busy ? "正在创建" : "按模板创建"}<ArrowRight /></button>
        </section>}
      </>}

      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      {path === "manual" && !isCharacter && <button type="button" className="primary-action dialog-primary" disabled={!props.title.trim() || props.busy || missingRequired} onClick={() => props.onCreate(null, agentCreationInput(), { ...manualProfile, authorConfirmed: true })}>
        {props.busy ? "正在创建" : "新建资料"}<ArrowRight />
      </button>}
    </section>
  </div>;
}

function AgentDraftReview(props: {
  proposal: AgentRecognitionProposal;
  title: string;
  aliases: string;
  profile: StoryStudioObjectProfile;
  busy: boolean;
  error: string;
  onTitle(value: string): void;
  onAliases(value: string): void;
  onProfile(profile: StoryStudioObjectProfile): void;
  onEdit(): void;
  onConfirm(): void;
  onIgnore(): void;
}) {
  const proposedRelations = readSuggestedArray(props.proposal, "proposedRelations");
  return <section className="agent-draft-review" data-testid="agent-draft-review">
    <header><div><span className="eyebrow">作者审查</span><h3>待审资料草稿</h3><p>来源、未知和重复提示必须由作者决定；确认前不会写入正式资料。</p></div><span className="agent-draft-status">{props.proposal.status === "edited" ? "草稿已修改" : "候选待审"}</span></header>
    <div className="agent-review-boundary"><AlertTriangle /><span><strong>确定性隔离 fixture</strong><small>不是 Provider 成功状态，也不会自动确认 Relation 或 Canon。</small></span></div>
    <label className="dialog-field"><span>建议名称</span><input value={props.title} maxLength={120} onChange={(event) => props.onTitle(event.target.value)} data-testid="agent-draft-title" /></label>
    <label className="dialog-field"><span>别名</span><input value={props.aliases} onChange={(event) => props.onAliases(event.target.value)} placeholder="用逗号分隔" data-testid="agent-draft-aliases" /></label>
    <ObjectProfileEditor objectType={props.profile.objectType as "character" | "item" | "location"} profile={props.profile} onChange={props.onProfile} testId="agent-draft-profile" />
    <section className="agent-review-evidence"><h4>来源与不确定性</h4><p><strong>来源锚点</strong>{props.proposal.evidence.length ? props.proposal.evidence.map((item) => item.sourceRef).join(" · ") : "未建立来源锚点"}</p>{props.proposal.uncertainties.map((item) => <p key={item}><strong>待确认</strong>{item}</p>)}</section>
    {props.proposal.duplicateMatches.length > 0 && <section className="agent-review-duplicates"><h4>可能重复</h4>{props.proposal.duplicateMatches.map((item) => <p key={item.objectId}><strong>{item.displayName}</strong><span>{item.reason}</span></p>)}</section>}
    {proposedRelations.length > 0 && <section className="agent-review-relations"><h4>关系候选</h4><p>关系只作为候选展示；确认资料不会自动确认关系。</p>{proposedRelations.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</section>}
    {props.error && <p className="form-error" role="alert">{props.error}</p>}
    <footer className="agent-review-actions"><button type="button" className="text-action" disabled={props.busy} onClick={props.onIgnore}>暂不保存</button><button type="button" className="secondary-action" disabled={props.busy || !props.title.trim()} onClick={props.onEdit}>保存草稿修改</button><button type="button" className="primary-action" disabled={props.busy || !props.title.trim()} onClick={props.onConfirm} data-testid="agent-draft-confirm"><ShieldCheck />确认保存为资料</button></footer>
  </section>;
}

function CreationPreview(props: { title: string; subtype: string; rows: Array<[string, string]> }) {
  return <div className="character-creation-preview" data-testid="character-creation-preview"><header><strong>{props.title.trim() || "未命名角色"}</strong><span>{props.subtype.trim() || "角色"}</span></header>{props.rows.map(([label, value]) => <dl key={label}><dt>{label}</dt><dd>{value.trim() || "未填写"}</dd></dl>)}</div>;
}

function selectedImageSummary(portrait: File | null, cover: File | null): string {
  return `肖像：${portrait?.name || "未选择"}；封面：${cover?.name || "未选择"}`;
}

function isAgentObjectType(value: WorldObjectType): value is "character" | "item" | "location" {
  return value === "character" || value === "item" || value === "location";
}

function splitLocalList(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/u).map((item) => item.trim()).filter(Boolean))];
}

function readSuggestedAliases(proposal: AgentRecognitionProposal): string {
  const value = proposal.suggestedFields.proposedAliases;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
}

function readSuggestedArray(proposal: AgentRecognitionProposal, key: string): string[] {
  const value = proposal.suggestedFields[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map(String) : [];
}

function profileBody(profile: StoryStudioObjectProfile): string {
  const rows = Object.values(profile.fields)
    .filter((field) => field.value !== null && field.value !== "" && (!Array.isArray(field.value) || field.value.length > 0))
    .map((field) => `## ${field.label}\n\n${Array.isArray(field.value) ? field.value.join("、") : String(field.value)}`);
  return rows.join("\n\n") || "## 资料摘要\n\n尚未建立；待作者继续补充。";
}

function NewObjectAgentField(props: { field: AgentTypeDefinition["fieldDefinitions"][number]; value: string | number | boolean | null | undefined; onChange(value: string | number | boolean | null): void }) {
  const label = <span>{props.field.label}{props.field.required ? " *" : ""}</span>;
  if (props.field.kind === "longText") return <label className="dialog-field">{label}<textarea value={String(props.value ?? "")} placeholder={props.field.defaultValue === null ? "" : `建议：${String(props.field.defaultValue)}`} onChange={(event) => props.onChange(event.target.value || null)} /></label>;
  if (props.field.kind === "boolean") return <label className="dialog-field">{label}<select value={props.value === undefined || props.value === null ? "" : String(props.value)} onChange={(event) => props.onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">未填写</option><option value="true">是</option><option value="false">否</option></select></label>;
  if (props.field.kind === "enum") return <label className="dialog-field">{label}<select value={String(props.value ?? "")} onChange={(event) => props.onChange(event.target.value || null)}><option value="">未填写</option>{(props.field.options || []).map((option) => <option value={option} key={option}>{option}</option>)}</select></label>;
  return <label className="dialog-field">{label}<input type={props.field.kind === "number" ? "number" : props.field.kind === "date" ? "date" : "text"} value={props.value === undefined || props.value === null ? "" : String(props.value)} placeholder={props.field.defaultValue === null ? "" : `建议：${String(props.field.defaultValue)}`} onChange={(event) => props.onChange(event.target.value === "" ? null : props.field.kind === "number" ? Number(event.target.value) : event.target.value)} /></label>;
}

function sourceTypeForCapability(capability: AgentTypeDefinition["baseCapability"]): WorldObjectType {
  return capability === "role" ? "character" : capability === "item" ? "item" : capability === "location" ? "location" : "faction";
}
