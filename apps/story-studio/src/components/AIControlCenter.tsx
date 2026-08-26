import {
  Archive,
  Bug,
  BookOpenText,
  Box,
  Braces,
  BrainCircuit,
  CheckCircle2,
  Copy,
  ChevronRight,
  Database,
  Download,
  Eye,
  EyeOff,
  FileOutput,
  FolderOpen,
  Gauge,
  HardDrive,
  KeyRound,
  LayoutPanelLeft,
  Network,
  Palette,
  PanelLeftClose,
  RefreshCw,
  Search,
  RotateCcw,
  Settings2,
  Sparkles,
  TextCursorInput,
  Trash2,
  Workflow,
  X
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type { ModelServiceStatus, ProviderProfileProjection, ProviderSessionConnection, StorageTransparency } from "../lib/localTransport";
import {
  MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS,
  normalizeProviderCredentialInput
} from "../lib/providerCredentialInput";
import {
  DEFAULT_CONTROL_CENTER_PREFERENCES,
  getBrowserPreferenceStorage,
  type AppearancePreferences,
  type ControlCenterPreferences,
} from "../lib/controlCenterPreferences";
import type { ControlCenterSkill } from "../lib/skillRegistryProjection";
import { createLocalDiagnosticService, type DiagnosticContext } from "../storyDiagnostics/localDiagnosticService";

export type ControlCenterSection =
  | "providers"
  | "models"
  | "tianyi"
  | "skills"
  | "workflows"
  | "context"
  | "appearance"
  | "font"
  | "editor"
  | "sidebar"
  | "shortcuts"
  | "storage"
  | "storage-usage"
  | "backup"
  | "export"
  | "diagnostics"
  | "logs"
  | "version"
  | "recovery";

export type ContextBudgetSnapshot = {
  sourceCount: number;
  estimatedSize: string;
  compressionStatus: "not-enabled";
};

const navigation: Array<{
  label: string;
  items: Array<{ id: ControlCenterSection; label: string; icon: typeof Settings2 }>;
}> = [
  {
    label: "AI",
    items: [
      { id: "providers", label: "Provider", icon: Network },
      { id: "models", label: "Models", icon: BrainCircuit },
      { id: "skills", label: "Skills", icon: Sparkles },
      { id: "workflows", label: "Workflows", icon: Workflow },
      { id: "context", label: "Context", icon: Gauge }
    ]
  },
  {
    label: "工作区",
    items: [
      { id: "appearance", label: "外观", icon: Palette },
      { id: "font", label: "字体", icon: TextCursorInput },
      { id: "editor", label: "编辑区域", icon: BookOpenText },
      { id: "sidebar", label: "侧栏", icon: LayoutPanelLeft }
    ]
  },
  {
    label: "存储",
    items: [
      { id: "storage", label: "当前位置", icon: HardDrive },
      { id: "backup", label: "备份", icon: Archive },
      { id: "export", label: "导出", icon: FileOutput },
      { id: "diagnostics", label: "诊断", icon: Bug }
    ]
  }
];

export function AIControlCenter(props: {
  open: boolean;
  preferences: ControlCenterPreferences;
  skills: ControlCenterSkill[];
  contextBudget: ContextBudgetSnapshot;
  storage: StorageTransparency | null;
  storageLoading: boolean;
  storageError: string;
  storageActionBusy: boolean;
  modelServiceStatus: ModelServiceStatus | null;
  providerConnection: ProviderSessionConnection | null;
  providerBusy: boolean;
  providerError: string;
  onPreferences(preferences: ControlCenterPreferences): void;
  onRefreshStorage(): void;
  onRevealStorage(): void;
  onSaveProviderProfile(input: { expectedRevision: number; displayName: string; baseUrl: string; modelId: string; enabled: boolean; apiKey?: string }): Promise<ProviderProfileProjection>;
  onReloadProviderProfile(): Promise<ProviderProfileProjection>;
  onDiscoverProviderModels(): Promise<{ models: string[]; profile: ProviderProfileProjection }>;
  onRevealProviderCredential(): Promise<{ credential: string; expiresInMs: number }>;
  onTestProvider(): Promise<{ modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }>;
  onMinimalInference(): Promise<{ modelId: string; content: string; finishReason: string | null; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null; traceId: string | null; profile: ProviderProfileProjection }>;
  onDisableProvider(): Promise<ProviderProfileProjection>;
  onClearProviderCredential(): Promise<ProviderProfileProjection>;
  onClose(): void;
}) {
  const [section, setSection] = useState<ControlCenterSection>("providers");

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return <div className="control-center-backdrop" role="presentation">
    <section className="ai-control-center" role="dialog" aria-modal="true" aria-labelledby="ai-control-center-title" data-testid="ai-control-center" data-ui-font-size={props.preferences.appearance.uiFontSize}>
      <header className="control-center-header">
        <span><Settings2 /><span><strong id="ai-control-center-title">控制中心</strong><small>AI、工作区与存储边界</small></span></span>
        <button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭控制中心"><X /></button>
      </header>
      <aside className="control-center-navigation" aria-label="控制中心分类">
        {navigation.map((group) => <section key={group.label}>
          <h2>{group.label}</h2>
          {group.items.map((item) => {
            const Icon = item.icon;
            return <button type="button" className={section === item.id ? "is-active" : ""} onClick={() => setSection(item.id)} key={item.id}><Icon /><span>{item.label}</span><ChevronRight /></button>;
          })}
        </section>)}
      </aside>
      <main className="control-center-content">
        <ControlCenterSurface
          section={section}
          preferences={props.preferences}
          skills={props.skills}
          contextBudget={props.contextBudget}
          storage={props.storage}
          storageLoading={props.storageLoading}
          storageError={props.storageError}
          storageActionBusy={props.storageActionBusy}
          modelServiceStatus={props.modelServiceStatus}
          providerConnection={props.providerConnection}
          providerBusy={props.providerBusy}
          providerError={props.providerError}
          onPreferences={props.onPreferences}
          onRefreshStorage={props.onRefreshStorage}
          onRevealStorage={props.onRevealStorage}
          onSaveProviderProfile={props.onSaveProviderProfile}
          onReloadProviderProfile={props.onReloadProviderProfile}
          onDiscoverProviderModels={props.onDiscoverProviderModels}
          onRevealProviderCredential={props.onRevealProviderCredential}
          onTestProvider={props.onTestProvider}
          onMinimalInference={props.onMinimalInference}
          onDisableProvider={props.onDisableProvider}
          onClearProviderCredential={props.onClearProviderCredential}
          onSection={setSection}
        />
      </main>
    </section>
  </div>;
}

export type ControlCenterSurfaceProps = {
  section: ControlCenterSection;
  preferences: ControlCenterPreferences;
  skills: ControlCenterSkill[];
  contextBudget: ContextBudgetSnapshot;
  storage: StorageTransparency | null;
  storageLoading: boolean;
  storageError: string;
  storageActionBusy: boolean;
  modelServiceStatus: ModelServiceStatus | null;
  providerConnection: ProviderSessionConnection | null;
  providerBusy: boolean;
  providerError: string;
  onPreferences(preferences: ControlCenterPreferences): void;
  onRefreshStorage(): void;
  onRevealStorage(): void;
  onSaveProviderProfile(input: { expectedRevision: number; displayName: string; baseUrl: string; modelId: string; enabled: boolean; apiKey?: string }): Promise<ProviderProfileProjection>;
  onReloadProviderProfile(): Promise<ProviderProfileProjection>;
  onDiscoverProviderModels(): Promise<{ models: string[]; profile: ProviderProfileProjection }>;
  onRevealProviderCredential(): Promise<{ credential: string; expiresInMs: number }>;
  onTestProvider(): Promise<{ modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }>;
  onMinimalInference(): Promise<{ modelId: string; content: string; finishReason: string | null; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null; traceId: string | null; profile: ProviderProfileProjection }>;
  onDisableProvider(): Promise<ProviderProfileProjection>;
  onClearProviderCredential(): Promise<ProviderProfileProjection>;
  onSection(section: ControlCenterSection): void;
};

export function ControlCenterSurface(props: ControlCenterSurfaceProps) {
  if (props.section === "providers") return <ProviderSettingsV2
    status={props.modelServiceStatus}
    connection={props.providerConnection}
    busy={props.providerBusy}
    error={props.providerError}
    onSave={props.onSaveProviderProfile}
    onReload={props.onReloadProviderProfile}
    onTest={props.onTestProvider}
    onDisable={props.onDisableProvider}
    onClearCredential={props.onClearProviderCredential}
    onDiscoverModels={props.onDiscoverProviderModels}
    onRevealCredential={props.onRevealProviderCredential}
  />;
  if (props.section === "models") return <ModelCatalogSettings status={props.modelServiceStatus} busy={props.providerBusy} error={props.providerError} onDiscover={props.onDiscoverProviderModels} onReload={props.onReloadProviderProfile} onSave={props.onSaveProviderProfile} onTest={props.onTestProvider} onMinimalInference={props.onMinimalInference} />;
  if (props.section === "tianyi") return <TianyiModelSettings status={props.modelServiceStatus} />;
  if (props.section === "skills") return <SkillSettings skills={props.skills} />;
  if (props.section === "workflows") return <WorkflowSettings />;
  if (props.section === "context") return <ContextSettings snapshot={props.contextBudget} />;
  if (props.section === "appearance") return <AppearanceOverview appearance={props.preferences.appearance} onSection={props.onSection} onReset={() => props.onPreferences({ ...props.preferences, appearance: structuredClone(DEFAULT_CONTROL_CENTER_PREFERENCES.appearance) })} />;
  if (props.section === "font") return <TypographySettings preferences={props.preferences} onPreferences={props.onPreferences} />;
  if (props.section === "editor") return <AppearanceChoice title="编辑区域" description="只调整章节、场景和长文本的阅读列宽；窄屏会自动限制在视口内。" impact="影响：写作正文与天意长回答的最大宽度。" value={props.preferences.appearance.editorWidth} options={[['focus', '专注'], ['standard', '标准'], ['wide', '宽'], ['full', '铺满']]} onValue={(editorWidth) => updateAppearance(props, { editorWidth })} onReset={() => updateAppearance(props, { editorWidth: DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.editorWidth })} />;
  if (props.section === "sidebar") return <SidebarSettings preferences={props.preferences} onPreferences={props.onPreferences} />;
  if (props.section === "shortcuts") return <ShortcutSettings />;
  if (props.section === "storage") return <StorageSettings status={props.storage} loading={props.storageLoading} error={props.storageError} busy={props.storageActionBusy} onRefresh={props.onRefreshStorage} onReveal={props.onRevealStorage} />;
  if (props.section === "storage-usage") return <StorageUsageSettings status={props.storage} />;
  if (props.section === "backup") return <BackupSettings status={props.storage} onReveal={props.onRevealStorage} />;
  if (props.section === "diagnostics" || props.section === "logs") return <DiagnosticSettings view={props.section} />;
  if (props.section === "version") return <VersionSettings status={props.modelServiceStatus} storage={props.storage} />;
  if (props.section === "recovery") return <RecoverySettings status={props.modelServiceStatus} storage={props.storage} />;
  return <ExportSettings />;
}

function browserDiagnosticStorage() {
  return getBrowserPreferenceStorage();
}

function diagnosticContext(): DiagnosticContext {
  return {
    appVersion: "story-studio-local",
    branch: "current-local-branch",
    head: "current-local-head",
    tree: "current-local-tree",
    browser: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
    runtime: typeof window === "undefined" ? "unknown" : window.location.origin,
    route: typeof window === "undefined" ? null : window.location.pathname,
    persistenceHealth: "unknown",
    ownerHashes: {}
  };
}

function DiagnosticSettings(props: { view: "diagnostics" | "logs" }) {
  const [service] = useState(() => createLocalDiagnosticService({ storage: browserDiagnosticStorage() }));
  const [events, setEvents] = useState(() => service.list());
  const refresh = () => setEvents(service.list());
  const copy = () => {
    const value = service.summary(diagnosticContext());
    const pending = navigator.clipboard?.writeText(value);
    void pending?.then(refresh).catch(() => undefined);
  };
  const exportPackage = () => {
    const payload = service.exportPackage(diagnosticContext());
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tianyan-diagnostic-package.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const isLogs = props.view === "logs";
  return <SettingsSurface eyebrow={`本地 / ${isLogs ? "日志" : "诊断"}`} title={isLogs ? "日志" : "诊断与恢复"} description="日志只保存在本机环形缓冲区，不上传遥测，也不记录正文、完整 Prompt、导入原文或凭据。">
    <section className="diagnostic-summary-card" aria-label="本地诊断摘要"><header><span><Bug /><strong>本地诊断服务</strong></span><em>{events.length} 条近期记录</em></header><p>保留最近 7 天，最多 20 MB；超限后自动移除最旧记录。</p>{events.at(-1) ? <small>最近：{events.at(-1)?.category} · {events.at(-1)?.errorCode || "无错误编号"} · {events.at(-1)?.summary}</small> : <small>尚未记录诊断事件。</small>}</section>
    <div className="diagnostic-action-row"><button type="button" className="secondary-action" onClick={copy}><Copy />复制诊断摘要</button><button type="button" className="secondary-action" onClick={exportPackage}><Download />导出诊断包</button><button type="button" className="text-action danger-text" onClick={() => { service.clear(); refresh(); }}><Trash2 />清除本机诊断</button></div>
    <div className="control-boundary-note"><Bug /><span><strong>脱敏边界</strong><small>仅保留路由、操作类别、错误编号、trace/session/run 标识与状态摘要；对象正文和密钥永不进入诊断包。</small></span></div>
  </SettingsSurface>;
}

function ProviderSettings(props: {
  preferences: ControlCenterPreferences;
  status: ModelServiceStatus | null;
  connection: ProviderSessionConnection | null;
  busy: boolean;
  error: string;
  onSave(input: { expectedRevision: number; displayName: string; baseUrl: string; modelId: string; enabled: boolean; apiKey?: string }): Promise<ProviderProfileProjection>;
  onReload(): Promise<ProviderProfileProjection>;
  onDiscoverModels(): Promise<{ models: string[]; profile: ProviderProfileProjection }>;
  onRevealCredential(): Promise<{ credential: string; expiresInMs: number }>;
  onTest(modelId?: string): Promise<{ modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }>;
  onDisable(): Promise<ProviderProfileProjection>;
  onClearCredential(): Promise<ProviderProfileProjection>;
  onPreferences(preferences: ControlCenterPreferences): void;
}) {
  const profile = props.status?.profile?.profile || null;
  const credential = props.status?.profile?.credential || null;
  const [displayName, setDisplayName] = useState(profile?.displayName || "硅基流动");
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl || "https://api.siliconflow.cn/v1");
  const [modelId, setModelId] = useState(profile?.modelId || "");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [revealedCredential, setRevealedCredential] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [credentialError, setCredentialError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [actionNotice, setActionNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const siliconFlow = props.status?.providers.find((provider) => provider.id === "siliconflow") || null;
  const availableModels = profile?.availableModels || [];
  const filteredModels = availableModels.filter((candidate) => candidate.toLocaleLowerCase("zh-CN").includes(modelSearch.trim().toLocaleLowerCase("zh-CN")));
  const history = props.status?.profile?.history || [];
  const activeProfile = props.connection
    ? props.status?.profiles.find((candidate) => candidate.id === props.connection?.profileId) || null
    : siliconFlow?.configured ? props.status?.profiles[0] || null : null;

  useEffect(() => {
    setDisplayName(profile?.displayName || "硅基流动");
    setBaseUrl(profile?.baseUrl || "https://api.siliconflow.cn/v1");
    setModelId(profile?.modelId || "");
    setRevealedCredential("");
  }, [profile?.updatedAt, profile?.displayName, profile?.baseUrl, profile?.modelId]);

  useEffect(() => {
    if (!revealedCredential) return undefined;
    const hide = () => setRevealedCredential("");
    const timer = window.setTimeout(hide, 12_000);
    const onVisibilityChange = () => { if (document.visibilityState !== "visible") hide(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", hide);
    };
  }, [revealedCredential]);

  async function saveProfile() {
    const cleanName = displayName.trim();
    const cleanUrl = baseUrl.trim();
    if (!cleanName) { setProfileError("请填写 Provider 显示名称。"); return; }
    if (!isHttpUrl(cleanUrl)) { setProfileError("Base URL 必须是 http 或 https 地址。"); return; }
    try {
      const normalizedCredential = apiKey.trim() ? normalizeProviderCredentialInput(apiKey) : undefined;
      const saved = await props.onSave({
        expectedRevision: props.status?.profile?.revision ?? 0,
        displayName: cleanName,
        baseUrl: cleanUrl.replace(/\/$/u, ""),
        modelId: modelId.trim(),
        enabled: profile?.enabled !== false,
        ...(normalizedCredential ? { apiKey: normalizedCredential } : {})
      });
      setApiKey("");
      setApiKeyVisible(false);
      setCredentialError("");
      setProfileError("");
      setActionNotice({ tone: "success", text: `已保存到本机 · 配置修订 r${saved.revision}${normalizedCredential ? " · 凭据已更新" : ""}` });
    } catch (cause) {
      setCredentialError(cause instanceof Error ? cause.message : "API Key 输入异常。");
      setActionNotice({ tone: "error", text: cause instanceof Error ? cause.message : "保存失败，原配置未确认改变。" });
    }
  }

  async function loadModels() {
    try {
      const result = await props.onDiscoverModels();
      setActionNotice({ tone: "success", text: `已获取 ${result.models.length} 个可用模型` });
    } catch (cause) {
      setActionNotice({ tone: "error", text: cause instanceof Error ? cause.message : "获取模型失败。" });
    }
  }

  async function testConnection() {
    try {
      const result = await props.onTest();
      setActionNotice({ tone: "success", text: `连接成功 · ${result.modelId} · ${result.availableModelCount} 个可用模型` });
    } catch (cause) {
      setActionNotice({ tone: "error", text: cause instanceof Error ? cause.message : "连接测试失败。" });
    }
  }

  async function reloadProfile() {
    try {
      const result = await props.onReload();
      setActionNotice({ tone: "success", text: `已重新载入本机配置 · 修订 r${result.revision}` });
    } catch (cause) {
      setActionNotice({ tone: "error", text: cause instanceof Error ? cause.message : "重新载入失败。" });
    }
  }

  async function revealCredential() {
    try {
      const result = await props.onRevealCredential();
      setRevealedCredential(result.credential);
    } catch (cause) {
      setActionNotice({ tone: "error", text: cause instanceof Error ? cause.message : "无法暂时显示凭据。" });
    }
  }

  return <SettingsSurface eyebrow="AI / Provider" title="Provider 管理" description="配置保存在本机应用数据目录；API Key 只进入服务器端安全凭据后端，不写入浏览器、项目文件或 Git。">
    <section className={`provider-runtime ${siliconFlow?.configured ? "is-connected" : ""}`} aria-label="SiliconFlow 真实连接">
      <header>
        <span className="provider-runtime-icon"><Network /></span>
        <span><strong>{displayName || "SiliconFlow"}</strong><small>{credential?.configured ? "凭据已安全保存" : "尚未保存凭据"}</small></span>
        <em>{profile?.enabled === false ? "已禁用" : credential?.configured ? "已配置" : "未配置"}</em>
      </header>
      <dl>
        <div><dt>当前模型</dt><dd data-testid="provider-model-id">{modelId || props.connection?.modelId || "尚未选择"}</dd></div>
        <div><dt>连接状态</dt><dd>{profile?.connectionStatus === "verified" ? "已连接" : profile?.connectionStatus === "failed" ? "需要检查" : "未检查"}</dd></div>
        <div><dt>可用模型</dt><dd>{availableModels.length ? `${availableModels.length} 个` : "尚未获取"}</dd></div>
        <div><dt>最近检查</dt><dd>{profile?.lastVerifiedAt ? new Date(profile.lastVerifiedAt).toLocaleString() : "—"}</dd></div>
        <div><dt>操作记录</dt><dd>{history.length ? `${history.length} 条` : "暂无"}</dd></div>
        <div><dt>延迟</dt><dd>{siliconFlow?.lastLatencyMs === null || siliconFlow?.lastLatencyMs === undefined ? "—" : `${siliconFlow.lastLatencyMs} ms`}</dd></div>
      </dl>
      <div className="provider-form">
        <label><span>显示名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <details className="provider-advanced"><summary>高级连接设置</summary><label><span>API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} inputMode="url" /></label></details>
        <label className="provider-model-field"><span>默认模型</span><select value={availableModels.includes(modelId) ? modelId : ""} onChange={(event) => setModelId(event.target.value)} disabled={!availableModels.length}><option value="">{availableModels.length ? "选择一个可用模型" : "先获取模型列表"}</option>{filteredModels.map((candidate) => <option value={candidate} key={candidate}>{candidate}</option>)}</select><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="也可以输入完整模型 ID" aria-label="完整模型 ID" /></label>
        <label><span>API Key · 输入后保存，不回显</span><input data-testid="provider-api-key" type="password" value={apiKey} maxLength={MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS} aria-invalid={credentialError ? true : undefined} onChange={(event) => { setApiKey(event.target.value); setCredentialError(""); }} autoComplete="off" spellCheck={false} placeholder={credential?.configured ? "已保存；输入新 Key 可替换" : "只在此处粘贴"} /></label>
        <div className="provider-action-row">
          <button type="button" className="primary-action" disabled={props.busy} onClick={saveProfile}>{props.busy ? "保存中…" : "保存配置"}</button>
          <button type="button" className="secondary-action" disabled={props.busy || !credential?.configured} onClick={() => void props.onTest()}>测试连接</button>
          <button type="button" className="secondary-action" disabled={props.busy} onClick={props.onReload}>重新载入</button>
        </div>
        <div className="provider-action-row">
          {profile?.enabled === false
            ? <button type="button" className="text-action" disabled={props.busy} onClick={() => props.onSave({ expectedRevision: props.status?.profile?.revision ?? 0, displayName: displayName.trim(), baseUrl: baseUrl.trim(), modelId: modelId.trim(), enabled: true })}>启用 Provider</button>
            : <button type="button" className="text-action" disabled={props.busy} onClick={props.onDisable}>禁用 Provider</button>}
          <button type="button" className="text-action danger-text" disabled={props.busy || !credential?.configured} onClick={() => { if (window.confirm("清除本机 Provider 凭据？配置和历史天意会话不会删除。")) props.onClearCredential(); }}>清除凭据</button>
        </div>
      </div>
      {credentialError && <p className="form-error" role="alert">{credentialError}</p>}
      {profileError && <p className="form-error" role="alert">{profileError}</p>}
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      <p className="provider-privacy-note"><KeyRound />页面只显示已配置状态；当前凭据后端：{credential?.backend === "macos-keychain" ? "系统钥匙串" : credential?.backend === "local-file-development-only" ? "本机开发级存储（非生产）" : "服务器端安全后端"}。</p>
    </section>
    <div className="control-boundary-note"><KeyRound /><span><strong>候选优先，作者确认</strong><small>Provider 原始输出必须通过 Schema；即使有效也不能直接写入 Canon。</small></span></div>
    <section className="provider-boundary-summary"><strong>当前只支持 SiliconFlow</strong><small>模型目录来自 Provider；配置保存不会联网，只有点击“测试连接”才会发起 Gate A 请求。</small></section>
  </SettingsSurface>;
}

function ProviderSettingsV2(props: {
  status: ModelServiceStatus | null;
  connection: ProviderSessionConnection | null;
  busy: boolean;
  error: string;
  onSave(input: { expectedRevision: number; displayName: string; baseUrl: string; modelId: string; enabled: boolean; apiKey?: string }): Promise<ProviderProfileProjection>;
  onReload(): Promise<ProviderProfileProjection>;
  onDiscoverModels(): Promise<{ models: string[]; profile: ProviderProfileProjection }>;
  onRevealCredential(): Promise<{ credential: string; expiresInMs: number }>;
  onTest(): Promise<{ modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }>;
  onDisable(): Promise<ProviderProfileProjection>;
  onClearCredential(): Promise<ProviderProfileProjection>;
}) {
  const profile = props.status?.profile?.profile || null;
  const credential = props.status?.profile?.credential || null;
  const siliconFlow = props.status?.providers.find((provider) => provider.id === "siliconflow") || null;
  const [displayName, setDisplayName] = useState(profile?.displayName || "硅基流动");
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl || "https://api.siliconflow.cn/v1");
  const [modelId, setModelId] = useState(profile?.modelId || "");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [revealedCredential, setRevealedCredential] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [formError, setFormError] = useState("");
  const availableModels = profile?.availableModels || [];
  const filteredModels = availableModels.filter((candidate) => candidate.toLocaleLowerCase("zh-CN").includes(modelSearch.trim().toLocaleLowerCase("zh-CN")));
  const history = props.status?.profile?.history || [];
  const hasUnsavedChanges = Boolean(profile && (displayName.trim() !== profile.displayName || baseUrl.trim().replace(/\/$/u, "") !== profile.baseUrl || modelId.trim() !== profile.modelId || apiKey.trim()));
  const selectedModelMissing = Boolean(modelId && availableModels.length && !availableModels.includes(modelId));

  useEffect(() => {
    setDisplayName(profile?.displayName || "硅基流动");
    setBaseUrl(profile?.baseUrl || "https://api.siliconflow.cn/v1");
    setModelId(profile?.modelId || "");
    setRevealedCredential("");
  }, [profile?.updatedAt, profile?.displayName, profile?.baseUrl, profile?.modelId]);

  useEffect(() => {
    if (!revealedCredential) return undefined;
    const hide = () => setRevealedCredential("");
    const timer = window.setTimeout(hide, 12_000);
    const onVisibilityChange = () => { if (document.visibilityState !== "visible") hide(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", hide);
    };
  }, [revealedCredential]);

  async function save() {
    const cleanName = displayName.trim();
    const cleanUrl = baseUrl.trim().replace(/\/$/u, "");
    if (!cleanName) { setFormError("请填写 Provider 名称。"); return; }
    if (!isHttpUrl(cleanUrl)) { setFormError("API 地址必须是 http 或 https 地址。"); return; }
    try {
      const normalizedCredential = apiKey.trim() ? normalizeProviderCredentialInput(apiKey) : undefined;
      const result = await props.onSave({
        expectedRevision: props.status?.profile?.revision ?? 0,
        displayName: cleanName,
        baseUrl: cleanUrl,
        modelId: modelId.trim(),
        enabled: profile?.enabled !== false,
        ...(normalizedCredential ? { apiKey: normalizedCredential } : {})
      });
      setApiKey("");
      setApiKeyVisible(false);
      setFormError("");
      setNotice({ tone: "success", text: `已保存到本机 · 配置修订 r${result.revision}${normalizedCredential ? " · 凭据已更新" : ""}` });
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "保存失败，原配置未确认改变。" });
    }
  }

  async function discoverModels() {
    try {
      const result = await props.onDiscoverModels();
      setNotice({ tone: "success", text: `已获取 ${result.models.length} 个可用模型` });
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "获取模型失败。" });
    }
  }

  async function test() {
    try {
      const result = await props.onTest();
      setNotice({ tone: "success", text: `连接成功 · ${result.modelId} · ${result.availableModelCount} 个可用模型` });
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "连接测试失败。" });
    }
  }

  async function reload() {
    try {
      const result = await props.onReload();
      setNotice({ tone: "success", text: `已重新载入本机配置 · 修订 r${result.revision}` });
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "重新载入失败。" });
    }
  }

  async function reveal() {
    try {
      const result = await props.onRevealCredential();
      setRevealedCredential(result.credential);
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : "无法暂时显示凭据。" });
    }
  }

  return <SettingsSurface eyebrow="AI / Provider" title="连接模型服务" description="连接 SiliconFlow，选择默认模型，然后在需要时检查连接。">
    <section className={`provider-runtime ${siliconFlow?.configured ? "is-connected" : ""}`} aria-label="SiliconFlow Provider">
      <header>
        <span className="provider-runtime-icon"><Network /></span>
        <span><strong>{displayName || "SiliconFlow"}</strong><small>{credential?.configured ? "API Key 已保存" : "还没有 API Key"}</small></span>
        <em>{profile?.enabled === false ? "已停用" : credential?.configured ? "已配置" : "未配置"}</em>
      </header>
      <dl>
        <div><dt>当前模型</dt><dd data-testid="provider-model-id">{modelId || props.connection?.modelId || "尚未选择"}</dd></div>
        <div><dt>连接状态</dt><dd>{profile?.connectionStatus === "verified" ? "已连接" : profile?.connectionStatus === "failed" ? "需要检查" : "未检查"}</dd></div>
        <div><dt>可用模型</dt><dd>{availableModels.length ? `${availableModels.length} 个` : "尚未获取"}</dd></div>
        <div><dt>最近检查</dt><dd>{profile?.lastVerifiedAt ? new Date(profile.lastVerifiedAt).toLocaleString() : "—"}</dd></div>
        <div><dt>操作记录</dt><dd>{history.length ? `${history.length} 条` : "暂无"}</dd></div>
        <div><dt>最近延迟</dt><dd>{siliconFlow?.lastLatencyMs == null ? "—" : `${siliconFlow.lastLatencyMs} ms`}</dd></div>
      </dl>
      <div className="provider-form">
        <label><span>显示名称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <details className="provider-advanced"><summary>高级连接设置</summary><label><span>API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} inputMode="url" /></label></details>
        <label className="provider-model-field"><span>默认模型</span><select value={availableModels.includes(modelId) ? modelId : ""} onChange={(event) => setModelId(event.target.value)} disabled={!availableModels.length}><option value="">{availableModels.length ? "选择一个可用模型" : "先获取模型列表"}</option>{filteredModels.map((candidate) => <option value={candidate} key={candidate}>{candidate}</option>)}</select><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="也可以输入完整模型 ID" aria-label="完整模型 ID" /></label>
        {selectedModelMissing && <p className="provider-model-warning" role="status">当前模型暂未在最新目录中，已保留原选择。</p>}
        <label className="provider-api-key-field"><span>API Key</span><div className="provider-secret-input"><input aria-label="API Key" data-testid="provider-api-key" type={apiKeyVisible ? "text" : "password"} value={apiKey} maxLength={MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS} onChange={(event) => { setApiKey(event.target.value); setNotice(null); }} autoComplete="off" spellCheck={false} placeholder={credential?.configured ? "已保存；输入新 Key 可替换" : "粘贴你的 API Key"} /><button type="button" className="icon-action provider-secret-toggle" onClick={() => setApiKeyVisible((visible) => !visible)} aria-label={apiKeyVisible ? "隐藏新 API Key" : "显示新 API Key"}>{apiKeyVisible ? <EyeOff /> : <Eye />}</button></div>{credential?.configured && <div className="provider-saved-credential"><span>{revealedCredential || `已保存 · ••••••••••${credential.suffix || "····"}`}</span><button type="button" className="text-action" onClick={() => { if (revealedCredential) setRevealedCredential(""); else void reveal(); }} aria-label={revealedCredential ? "隐藏已保存 API Key" : "暂时显示已保存 API Key"}>{revealedCredential ? <EyeOff /> : <Eye />}{revealedCredential ? "隐藏" : "显示"}</button></div>}</label>
        <label className="provider-model-search"><span>搜索模型</span><div className="provider-search-input"><Search /><input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="按名称筛选可用模型" /></div></label>
        <div className="provider-action-row">
          <button type="button" className="primary-action" disabled={props.busy} onClick={() => void save()}>{props.busy ? "保存中…" : "保存配置"}</button>
          <button type="button" className="secondary-action" disabled={props.busy || !credential?.configured || profile?.enabled === false} onClick={() => void test()}>测试连接</button>
          <button type="button" className="secondary-action" disabled={props.busy || !credential?.configured || profile?.enabled === false} onClick={() => void discoverModels()}>获取模型</button>
          <button type="button" className="secondary-action" disabled={props.busy} onClick={() => void reload()}>重新载入</button>
        </div>
        <div className="provider-action-row">
          {profile?.enabled === false
            ? <button type="button" className="text-action" disabled={props.busy} onClick={() => void props.onSave({ expectedRevision: props.status?.profile?.revision ?? 0, displayName: displayName.trim(), baseUrl: baseUrl.trim(), modelId: modelId.trim(), enabled: true })}>启用 Provider</button>
            : <button type="button" className="text-action" disabled={props.busy} onClick={() => void props.onDisable()}>停用 Provider</button>}
          <button type="button" className="text-action danger-text" disabled={props.busy || !credential?.configured} onClick={() => { if (window.confirm("清除本机 Provider 凭据？配置和历史天意会话不会删除。")) void props.onClearCredential(); }}>清除凭据</button>
        </div>
      </div>
      {hasUnsavedChanges && <p className="provider-unsaved-notice" role="status">有未保存修改</p>}
      {notice && <p className={`provider-action-notice is-${notice.tone}`} role="status">{notice.tone === "success" ? <CheckCircle2 /> : <Bug />}{notice.text}</p>}
      {formError && <p className="form-error" role="alert">{formError}</p>}
      {props.error && <p className="form-error" role="alert">{props.error}</p>}
      {profile?.lastError && <p className="provider-last-error" role="note">最近一次检查：{profile.lastError}</p>}
    </section>
    <section className="provider-history" aria-label="Provider 操作历史"><header><span><RefreshCw /><strong>最近操作</strong></span><small>{history.length ? "保存、模型获取和连接检查都会留在本机" : "还没有操作记录"}</small></header>{history.length ? <><div className="provider-history-list">{history.slice().reverse().slice(0, 1).map((entry) => <ProviderHistoryRow entry={entry} key={entry.id} />)}</div>{history.length > 1 && <details className="provider-history-details"><summary>查看全部 {Math.min(history.length, 8)} 条记录</summary><div className="provider-history-list">{history.slice().reverse().slice(1, 8).map((entry) => <ProviderHistoryRow entry={entry} key={entry.id} />)}</div></details>}</> : <p className="provider-history-empty">完成一次保存、获取模型或连接检查后，这里会显示可追溯记录。</p>}</section>
    <section className="provider-boundary-summary"><strong>保存不会自动联网</strong><small>只有点击“获取模型”或“测试连接”才会访问 SiliconFlow；模型输出仍然需要作者确认。</small></section>
  </SettingsSurface>;
}

function ProviderHistoryRow({ entry }: { entry: ProviderProfileProjection["history"][number] }) {
  return <article><span className={`provider-history-status is-${entry.status}`}>{entry.status === "success" ? <CheckCircle2 /> : <Bug />}</span><span><strong>{providerHistoryLabel(entry.kind)}</strong><small>{entry.modelId || (entry.modelCount ? `${entry.modelCount} 个模型` : "")} · {new Date(entry.occurredAt).toLocaleString()}</small></span><em>{entry.status === "failed" ? entry.error || "失败" : entry.latencyMs !== null ? `${entry.latencyMs} ms` : "完成"}</em></article>;
}

function providerHistoryLabel(kind: "save" | "reload" | "models" | "connection" | "credential" | "disable" | "inference") {
  return ({ save: "保存配置", reload: "重新载入", models: "获取模型", connection: "测试连接", credential: "清除凭据", disable: "停用 Provider", inference: "最小推理" } as const)[kind];
}

function ModelCatalogSettings(props: {
  status: ModelServiceStatus | null;
  busy: boolean;
  error: string;
  onDiscover(): Promise<{ models: string[]; profile: ProviderProfileProjection }>;
  onReload(): Promise<ProviderProfileProjection>;
  onSave(input: { expectedRevision: number; displayName: string; baseUrl: string; modelId: string; enabled: boolean }): Promise<ProviderProfileProjection>;
  onTest(modelId?: string): Promise<{ modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }>;
  onMinimalInference(): Promise<{ modelId: string; content: string; finishReason: string | null; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null; traceId: string | null; profile: ProviderProfileProjection }>;
}) {
  const profile = props.status?.profile.profile || null;
  const [query, setQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState(profile?.modelId || "");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedModel && profile?.modelId) setSelectedModel(profile.modelId);
  }, [profile?.modelId, selectedModel]);

  const availableModels = profile?.availableModels || [];
  const modelMetadata = new Map((props.status?.models || []).filter((model) => model.providerId === "siliconflow").map((model) => [model.id, model]));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = availableModels.filter((model) => {
    if (!normalizedQuery) return true;
    const metadata = modelMetadata.get(model);
    return [model, metadata?.label || "", ...(metadata?.capabilities || [])].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  const selectedModelMissing = Boolean(profile?.modelId && availableModels.length && !availableModels.includes(profile.modelId));
  const configured = Boolean(props.status?.profile.credential.configured && profile);
  const latestVerification = [...(props.status?.profile.history || [])].reverse().find((entry) => entry.kind === "connection" || entry.kind === "inference") || null;

  async function discover(): Promise<void> {
    setNotice(null);
    try {
      const result = await props.onDiscover();
      setSelectedModel((current) => current || result.profile.profile?.modelId || result.models[0] || "");
      setNotice(`已获取 ${result.models.length} 个 SiliconFlow 模型。`);
    } catch {
      setNotice("获取模型失败；请先确认 Provider 凭据和网络状态。");
    }
  }

  async function reload(): Promise<void> {
    setNotice(null);
    try {
      const result = await props.onReload();
      setSelectedModel(result.profile?.modelId || "");
      setNotice(`已重新载入 Provider Profile · 修订 r${result.revision}。`);
    } catch {
      setNotice("重新载入失败；当前页面仍保留已读取的模型选择。");
    }
  }

  async function save(): Promise<void> {
    if (!profile || !selectedModel) return;
    setNotice(null);
    try {
      await props.onSave({ expectedRevision: props.status?.profile.revision ?? 0, displayName: profile.displayName || "SiliconFlow", baseUrl: profile.baseUrl || "https://api.siliconflow.cn/v1", modelId: selectedModel, enabled: profile.enabled });
      setNotice("默认模型已保存到现有 Provider Profile。");
    } catch {
      setNotice("模型保存失败；可能是配置已被其他页面更新，请重新载入后再试。");
    }
  }

  async function test(): Promise<void> {
    setNotice(null);
    try {
      const result = await props.onTest(selectedModel || undefined);
      setNotice(`测试连接成功：${result.modelId}，发现 ${result.availableModelCount} 个模型。`);
    } catch {
      setNotice("测试连接未完成；不会把失败写成模型可用。");
    }
  }

  async function minimalInference(): Promise<void> {
    setNotice(null);
    try {
      const result = await props.onMinimalInference();
      const usage = result.usage ? ` · ${result.usage.totalTokens} tokens` : "";
      setNotice(`最小推理成功：${result.modelId}${usage}。响应已验证，不会写入故事。`);
    } catch {
      setNotice("最小推理未完成；失败不会被显示为模型可用。");
    }
  }

  return <SettingsSurface eyebrow="AI / 模型" title="模型目录与默认模型" description="模型列表和默认选择都复用现有 Provider Profile；选择不会创建第二套路由或模型数据库。">
    {!configured && <div className="control-boundary-note"><BrainCircuit /><span><strong>先完成 Provider 配置</strong><small>当前没有可用的本机凭据或 Provider Profile。此页面不会读取、显示或生成 API Key。</small></span></div>}
    {configured && selectedModelMissing && <p className="provider-unsaved-notice" role="alert">当前默认模型不在最近一次模型目录中；请重新获取模型或选择一个可用模型。</p>}
    <section className="model-catalog-card" aria-label="SiliconFlow 模型目录">
      <header><span><BrainCircuit /><strong>SiliconFlow</strong></span><small>{availableModels.length ? `${availableModels.length} 个已发现模型` : "尚未获取模型目录"}</small></header>
      <label className="provider-model-search"><span>搜索模型</span><div className="provider-search-input"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称、ID 或能力筛选" disabled={!availableModels.length} /></div></label>
      {availableModels.length ? <div className="model-catalog-list">{visibleModels.map((model) => <button type="button" key={model} className={selectedModel === model ? "is-active" : ""} onClick={() => setSelectedModel(model)}><span>{model}</span>{selectedModel === model && <CheckCircle2 />}</button>)}{!visibleModels.length && <p>没有匹配的模型。</p>}</div> : <EmptyState icon={<BrainCircuit />} title="还没有模型目录" copy="点击“获取模型”后，列表会从已保存的 SiliconFlow Provider 读取。" />}
      <label className="provider-model-field model-catalog-advanced-field"><span>高级：完整模型 ID</span><input value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} placeholder="例如 Qwen/Qwen3.5-35B-A3B" disabled={!configured} /><small>可测试并保存目录中尚未出现的完整 ID；服务端仍会校验它是否可用。</small></label>
      <div className="provider-action-row"><button type="button" className="primary-action" disabled={!configured || props.busy} onClick={() => void discover()}>{props.busy ? "处理中…" : "获取模型"}</button><button type="button" className="secondary-action" disabled={props.busy} onClick={() => void reload()}>重新载入</button><button type="button" className="secondary-action" disabled={!configured || props.busy || !selectedModel} onClick={() => void save()}>保存默认模型</button><button type="button" className="secondary-action" disabled={!configured || props.busy} onClick={() => void test()}>测试连接</button><button type="button" className="secondary-action" disabled={!configured || props.busy} onClick={() => void minimalInference()}>最小推理</button></div>
      {selectedModel && <p className="setting-impact-note">当前选择：<code>{selectedModel}</code> · 保存后天意工作面会读取这个 Provider Profile。</p>}
    </section>
    {notice && <p className="provider-action-notice is-success" role="status"><CheckCircle2 />{notice}</p>}
    {latestVerification && <p className="setting-impact-note">最近验证：{new Date(latestVerification.occurredAt).toLocaleString("zh-CN")} · {latestVerification.status === "success" ? "成功" : latestVerification.error || "失败"}{latestVerification.latencyMs === null ? "" : ` · ${latestVerification.latencyMs} ms`}{latestVerification.modelId ? ` · ${latestVerification.modelId}` : ""}</p>}
    {props.error && <p className="form-error" role="alert">{props.error}</p>}
  </SettingsSurface>;
}

function TianyiModelSettings(props: { status: ModelServiceStatus | null }) {
  const profile = props.status?.profile.profile;
  const ready = props.status?.tianyiDialogue.ready === true;
  return <SettingsSurface eyebrow="AI / 天意" title="天意工作面" description="创意和对话共享同一个已保存的 Provider Profile；本页只确认可用性，不复制会话或故事语义 owner。">
    <div className={`tianyi-model-readiness ${ready ? "is-ready" : "is-pending"}`} role="status"><span>{ready ? <CheckCircle2 /> : <Bug />}<strong>{ready ? "天意已准备好使用当前模型" : "天意等待 Provider 配置"}</strong></span><small>{profile ? `${profile.displayName} · ${profile.modelId}` : "保存 Provider 凭据并选择默认模型后，这里会显示真实状态。"}</small></div>
    <div className="tianyi-model-mode-grid"><a href="/tianyi?mode=creative" className="tianyi-model-mode-card"><Sparkles /><span><strong>创意</strong><small>形成、整理并审查作者想法；原话先保存。</small></span><ChevronRight /></a><a href="/tianyi?mode=conversation" className="tianyi-model-mode-card"><BookOpenText /><span><strong>对话</strong><small>解释、讨论和追问当前故事；保持时间顺序。</small></span><ChevronRight /></a></div>
    <div className="control-boundary-note"><CheckCircle2 /><span><strong>同一 Provider Profile</strong><small>模型选择会沿用到 Tianyi；本页不自动发起推理，也不写入 Canon、Event、WorldState、Relation 或 Memory。</small></span></div>
  </SettingsSurface>;
}

function ShortcutSettings() {
  return <SettingsSurface eyebrow="工作区 / 快捷键" title="快捷键" description="当前快捷键由工作区固定行为提供，尚未开放可编辑映射。">
    <section className="settings-readonly-list"><div><kbd>Esc</kbd><span><strong>关闭当前弹层或返回</strong><small>不会清除已保存内容。</small></span></div><div><kbd>⌘ K</kbd><span><strong>打开全局命令入口</strong><small>若当前工作面提供该入口，则保持现有 shell 行为。</small></span></div></section>
    <CapabilityDisabledNotice />
  </SettingsSurface>;
}

function VersionSettings(props: { status: ModelServiceStatus | null; storage: StorageTransparency | null }) {
  return <SettingsSurface eyebrow="系统 / 版本" title="版本与运行时" description="显示当前浏览器可确认的运行环境；不会把本地凭据或正文写入诊断。">
    <dl className="system-fact-grid"><div><dt>应用</dt><dd>天衍故事工作室</dd></div><div><dt>运行环境</dt><dd>{typeof window === "undefined" ? "unknown" : window.location.origin}</dd></div><div><dt>Provider</dt><dd>{props.status?.profile.profile?.displayName || "未配置"}</dd></div><div><dt>默认模型</dt><dd>{props.status?.profile.profile?.modelId || "未选择"}</dd></div><div><dt>本地存储</dt><dd>{props.storage?.persistenceState === "verified-local" ? "已验证" : "待确认"}</dd></div><div><dt>真实 Provider 调用</dt><dd>仅在作者明确点击后发生</dd></div></dl>
  </SettingsSurface>;
}

function RecoverySettings(props: { status: ModelServiceStatus | null; storage: StorageTransparency | null }) {
  return <SettingsSurface eyebrow="系统 / 恢复" title="恢复与安全边界" description="恢复沿用现有 Session、Archive 和本地存储状态；本页不创建新的恢复数据库。">
    <div className="recovery-status-card"><RefreshCw /><span><strong>{props.storage?.persistenceState === "verified-local" ? "本地持久化可确认" : "等待本地持久化状态"}</strong><small>{props.status?.profile.profile ? "Provider Profile 可重新载入；凭据仍由受保护存储管理。" : "尚未有 Provider Profile 可恢复。"}</small></span></div>
    <ol className="backup-steps"><li><span>1</span><p><strong>重新载入 Provider Profile</strong><small>从现有 owner 读取最新配置，不覆盖作者原话或故事资料。</small></p></li><li><span>2</span><p><strong>检查本机诊断</strong><small>只保留脱敏事件；导出前会过滤正文与密钥。</small></p></li><li><span>3</span><p><strong>需要时回到天意</strong><small>重开同一工作面时沿用现有 Session/Archive 连续性。</small></p></li></ol>
    <div className="control-boundary-note"><Bug /><span><strong>没有自动回滚或数据迁移</strong><small>当前版本不会擅自改写真实项目；遇到 owner 冲突时保留错误并要求作者重试。</small></span></div>
  </SettingsSurface>;
}

function SkillSettings(props: { skills: ControlCenterSkill[] }) {
  return <SettingsSurface eyebrow="AI / Skills" title="Skill Registry" description="系统技能来自现有 Skill Control 注册表。本页面只展示描述，不安装、不启用、不执行。">
    <CapabilityDisabledNotice />
    <section className="skill-section"><header><strong>系统技能</strong><small>{props.skills.length} 项描述清单</small></header><div className="skill-registry-list">{props.skills.map((skill) => <article key={skill.id}>
      <span className="skill-icon"><Sparkles /></span>
      <span><strong>{skill.name}</strong><small>{skill.description}</small><em>{skill.permissionSummary}</em></span>
      <span className="descriptor-badge">尚未执行</span>
    </article>)}</div></section>
    <section className="skill-section"><header><strong>用户技能</strong><small>0 项</small></header><EmptyState icon={<Box />} title="还没有用户技能" copy="v1 不提供安装、市场或自定义执行入口。" /></section>
  </SettingsSurface>;
}

function WorkflowSettings() {
  const steps = ["章节完成后", "人物检查", "时间线检查", "生成报告"];
  return <SettingsSurface eyebrow="AI / Workflows" title="Skill Workflow" description="这里展示未来编排的产品语言。当前流程不可编辑，也不会监听章节或执行 Skill。">
    <CapabilityDisabledNotice />
    <div className="workflow-placeholder">{steps.map((step, index) => <div key={step}><span>{index + 1}</span><strong>{step}</strong>{index < steps.length - 1 && <ChevronRight />}</div>)}</div>
    <div className="control-boundary-note"><Workflow /><span><strong>展示模式</strong><small>执行器、触发器、失败恢复与权限确认尚未进入本轮。</small></span></div>
  </SettingsSurface>;
}

function ContextSettings(props: { snapshot: ContextBudgetSnapshot }) {
  return <SettingsSurface eyebrow="AI / Context" title="Context Budget" description="显示当前页面能够确认的上下文摘要。大小估算、压缩和选择策略未来由 Context Layer 提供。">
    <CapabilityDisabledNotice />
    <div className="context-budget-grid"><Metric icon={<Database />} label="当前来源" value={`${props.snapshot.sourceCount} 项`} /><Metric icon={<Braces />} label="预计大小" value={props.snapshot.estimatedSize} /><Metric icon={<Gauge />} label="压缩状态" value={props.snapshot.compressionStatus === "not-enabled" ? "未启用" : props.snapshot.compressionStatus} /></div>
    <div className="control-boundary-note"><CheckCircle2 /><span><strong>没有第二个 Context Store</strong><small>本页不收集内容、不压缩文本，也不改变 Tianyi 的上下文授权边界。</small></span></div>
  </SettingsSurface>;
}

function AppearanceOverview(props: { appearance: AppearancePreferences; onSection(section: ControlCenterSection): void; onReset(): void }) {
  return <SettingsSurface eyebrow="工作区 / 外观" title="写作环境" description="这些设置只影响当前浏览器中的显示方式，不会写入项目或故事文件。">
    <div className="appearance-overview">
      <button type="button" onClick={() => props.onSection("font")}><TextCursorInput /><span><strong>字体</strong><small>界面 {appearanceLabel("font", props.appearance.uiFontSize)} · 正文 {appearanceLabel("font", props.appearance.editorFontSize)}</small></span><ChevronRight /></button>
      <button type="button" onClick={() => props.onSection("editor")}><BookOpenText /><span><strong>编辑区域</strong><small>{appearanceLabel("editor", props.appearance.editorWidth)}</small></span><ChevronRight /></button>
      <button type="button" onClick={() => props.onSection("sidebar")}><LayoutPanelLeft /><span><strong>侧栏</strong><small>{sidebarAppearanceLabel(props.appearance)}</small></span><ChevronRight /></button>
    </div>
    <button type="button" className="reset-setting-action" onClick={props.onReset}><RotateCcw />恢复全部外观默认值</button>
  </SettingsSurface>;
}

function TypographySettings(props: { preferences: ControlCenterPreferences; onPreferences(preferences: ControlCenterPreferences): void }) {
  const appearance = props.preferences.appearance;
  const update = (patch: Partial<AppearancePreferences>) => props.onPreferences({ ...props.preferences, appearance: { ...appearance, ...patch } });
  const sizes = [['small', '小'], ['standard', '标准'], ['large', '大'], ['xlarge', '超大']] as const;
  return <SettingsSurface eyebrow="工作区 / 字体" title="字体与阅读大小" description="界面字号和正文阅读字号彼此独立，选择后立即预览并保存到当前浏览器。">
    <section className="appearance-setting-group" data-setting="ui-font-size">
      <header><span><strong>界面字号</strong><small>当前：{appearanceLabel("font", appearance.uiFontSize)} · 影响导航、侧栏、控制中心、按钮与天意界面。</small></span><button type="button" onClick={() => update({ uiFontSize: DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.uiFontSize })}><RotateCcw />恢复默认</button></header>
      <div className="segmented-setting">{sizes.map(([value, label]) => <button type="button" className={appearance.uiFontSize === value ? "is-active" : ""} onClick={() => update({ uiFontSize: value })} key={value}><span>{label}</span><small>{appearance.uiFontSize === value ? "当前" : ""}</small></button>)}</div>
    </section>
    <section className="appearance-setting-group" data-setting="editor-font-size">
      <header><span><strong>正文 / 编辑器字号</strong><small>当前：{appearanceLabel("font", appearance.editorFontSize)} · 只影响章节、场景、Markdown 与天意长回答。</small></span><button type="button" onClick={() => update({ editorFontSize: DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.editorFontSize })}><RotateCcw />恢复默认</button></header>
      <div className="segmented-setting">{sizes.map(([value, label]) => <button type="button" className={appearance.editorFontSize === value ? "is-active" : ""} onClick={() => update({ editorFontSize: value })} key={value}><span>{label}</span><small>{appearance.editorFontSize === value ? "当前" : ""}</small></button>)}</div>
    </section>
  </SettingsSurface>;
}

function AppearanceChoice<T extends string>(props: { title: string; description: string; impact: string; value: T; options: ReadonlyArray<readonly [T, string]>; onValue(value: T): void; onReset(): void }) {
  return <SettingsSurface eyebrow={`工作区 / ${props.title}`} title={props.title} description={props.description}>
    <p className="setting-impact-note">当前：{appearanceLabel("editor", props.value)} · {props.impact}</p>
    <div className="segmented-setting">{props.options.map(([value, label]) => <button type="button" className={props.value === value ? "is-active" : ""} onClick={() => props.onValue(value)} key={value}><span>{label}</span><small>{props.value === value ? "当前" : ""}</small></button>)}</div>
    <button type="button" className="reset-setting-action" onClick={props.onReset}><RotateCcw />恢复默认</button>
  </SettingsSurface>;
}

function SidebarSettings(props: { preferences: ControlCenterPreferences; onPreferences(preferences: ControlCenterPreferences): void }) {
  const appearance = props.preferences.appearance;
  const update = (patch: Partial<AppearancePreferences>) => props.onPreferences({ ...props.preferences, appearance: { ...appearance, ...patch } });
  const options = [['compact', '紧凑', '196 px'], ['standard', '标准', '248 px'], ['custom', '自定义', `${appearance.sidebarCustomWidthPx} px`]] as const;
  return <SettingsSurface eyebrow="工作区 / 侧栏" title="资料与章节侧栏" description="选择展开宽度，或在侧栏边缘拖动到 196–320 px；移动端始终使用抽屉。">
    <p className="setting-impact-note">当前：{sidebarAppearanceLabel(appearance)} · 影响资料库与章节导航。</p>
    <div className="segmented-setting">{options.map(([value, label, detail]) => <button type="button" className={!appearance.sidebarCollapsed && appearance.sidebarWidth === value ? "is-active" : ""} onClick={() => update({ sidebarWidth: value, sidebarCollapsed: false })} key={value}><span>{label}</span><small>{!appearance.sidebarCollapsed && appearance.sidebarWidth === value ? `当前 · ${detail}` : detail}</small></button>)}<button type="button" className={appearance.sidebarCollapsed ? "is-active" : ""} onClick={() => update({ sidebarCollapsed: true })}><span>仅图标</span><small>{appearance.sidebarCollapsed ? "当前 · 56 px" : "56 px"}</small></button></div>
    <button type="button" className="sidebar-state-setting" onClick={() => update({ sidebarCollapsed: !appearance.sidebarCollapsed })}><PanelLeftClose /><span><strong>{appearance.sidebarCollapsed ? "恢复上次展开宽度" : "折叠为仅图标"}</strong><small>展开宽度：{sidebarExpandedLabel(appearance)}；状态会在刷新后保留。</small></span></button>
    <button type="button" className="reset-setting-action" onClick={() => update({
      sidebarWidth: DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.sidebarWidth,
      sidebarCustomWidthPx: DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.sidebarCustomWidthPx,
      sidebarCollapsed: DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.sidebarCollapsed
    })}><RotateCcw />恢复侧栏默认值</button>
  </SettingsSurface>;
}

function CapabilityDisabledNotice() {
  return <div className="capability-disabled-notice" role="note" data-capability-status="not-enabled"><strong>尚未启用</strong><span>当前仅保存非敏感配置；不会调用模型、不会执行 Skill、不会写入故事。</span></div>;
}

function StorageSettings(props: { status: StorageTransparency | null; loading: boolean; error: string; busy: boolean; onRefresh(): void; onReveal(): void }) {
  const ready = props.status?.persistenceState === "verified-local";
  return <SettingsSurface eyebrow="存储 / 当前位置" title="当前故事位置" description="复用现有 Storage Provider 状态。这里不会创建新的存储后端。">
    <div className={`storage-control-card ${props.error ? "is-error" : ""}`}>
      <HardDrive />
      <span><strong>{ready ? "已保存到本地" : props.error ? "暂时无法确认位置" : "正在确认故事位置"}</strong><small>{props.status?.projectPath || props.error || "读取本地存储状态…"}</small></span>
    </div>
    {props.status && <dl className="control-storage-details"><div><dt>项目</dt><dd><code>{props.status.projectPath}</code></dd></div><div><dt>故事库</dt><dd><code>{props.status.libraryPath}</code></dd></div><div><dt>方式</dt><dd>本地 Markdown 与视觉 JSON</dd></div></dl>}
    <div className="control-action-row"><button type="button" className="primary-action" disabled={!props.status?.revealSupported || props.busy} onClick={props.onReveal}><FolderOpen />{props.busy ? "正在打开" : "打开故事文件夹"}</button><button type="button" className="secondary-action" disabled={props.loading || props.busy} onClick={props.onRefresh}><RefreshCw />{props.loading ? "正在检查" : "重新检查"}</button></div>
  </SettingsSurface>;
}

function StorageUsageSettings(props: { status: StorageTransparency | null }) {
  return <SettingsSurface eyebrow="数据 / 存储用量" title="存储状态" description="这里仅显示现有本地存储 owner 能确认的状态；当前版本不估算或清理未知目录。">
    <dl className="system-fact-grid"><div><dt>存储方式</dt><dd>{props.status?.label || "本地文件夹"}</dd></div><div><dt>持久化</dt><dd>{props.status?.persistenceState === "verified-local" ? "已验证" : "待确认"}</dd></div><div><dt>项目路径</dt><dd>{props.status?.projectPath || "未读取"}</dd></div><div><dt>自动清理</dt><dd>未启用</dd></div></dl>
    <div className="control-boundary-note"><HardDrive /><span><strong>安全边界</strong><small>本页不扫描用户主目录，不创建第二个数据库，也不执行不可逆清理。</small></span></div>
  </SettingsSurface>;
}

function BackupSettings(props: { status: StorageTransparency | null; onReveal(): void }) {
  return <SettingsSurface eyebrow="存储 / 备份" title="备份当前故事" description="当前版本没有自动备份服务。这里提供与真实能力一致的手动备份步骤。">
    <ol className="backup-steps"><li><span>1</span><p><strong>确认编辑器显示已保存</strong><small>先保存所有正在编辑的正文和世界资料。</small></p></li><li><span>2</span><p><strong>打开故事文件夹</strong><small>{props.status?.projectPath || "当前项目位置确认后可打开。"}</small></p></li><li><span>3</span><p><strong>复制整个项目文件夹</strong><small>保存到另一块磁盘、备份目录或你信任的同步盘。</small></p></li></ol>
    <button type="button" className="primary-action" disabled={!props.status?.revealSupported} onClick={props.onReveal}><FolderOpen />打开故事文件夹</button>
  </SettingsSurface>;
}

function ExportSettings() {
  return <SettingsSurface eyebrow="存储 / 导入与导出" title="导入与导出" description="带校验清单的一键导入和导出尚未实现。项目文件夹目前仍可整体复制。">
    <EmptyState icon={<FileOutput />} title="导入与导出功能规划中" copy="本轮不创建虚假的导入或导出按钮，也不改变现有 Markdown ownership。" />
  </SettingsSurface>;
}

function SettingsSurface(props: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section className="control-settings-surface"><header><p className="eyebrow">{props.eyebrow}</p><h1>{props.title}</h1><p>{props.description}</p></header>{props.children}</section>;
}

function EmptyState(props: { icon: ReactNode; title: string; copy: string }) {
  return <div className="control-empty-state"><span>{props.icon}</span><strong>{props.title}</strong><p>{props.copy}</p></div>;
}

function Metric(props: { icon: ReactNode; label: string; value: string }) {
  return <article className="context-metric"><span>{props.icon}</span><small>{props.label}</small><strong>{props.value}</strong></article>;
}

function updateAppearance(props: { preferences: ControlCenterPreferences; onPreferences(preferences: ControlCenterPreferences): void }, patch: Partial<AppearancePreferences>) {
  props.onPreferences({ ...props.preferences, appearance: { ...props.preferences.appearance, ...patch } });
}

function appearanceLabel(kind: "font" | "editor" | "sidebar", value: string): string {
  const labels: Record<string, string> = kind === "font"
    ? { small: "小", standard: "标准", large: "大", xlarge: "超大" }
    : kind === "editor"
      ? { focus: "专注", standard: "标准", wide: "宽", full: "铺满" }
      : { compact: "紧凑", standard: "标准", custom: "自定义" };
  return labels[value] || value;
}

function sidebarExpandedLabel(appearance: AppearancePreferences): string {
  return appearance.sidebarWidth === "custom"
    ? `自定义 · ${appearance.sidebarCustomWidthPx} px`
    : appearance.sidebarWidth === "compact" ? "紧凑 · 196 px" : "标准 · 248 px";
}

function sidebarAppearanceLabel(appearance: AppearancePreferences): string {
  return appearance.sidebarCollapsed ? "仅图标 · 56 px" : sidebarExpandedLabel(appearance);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
