import { ArrowLeft, Bug, Database, Network, Palette, Wrench, type LucideIcon } from "lucide-react";

import type { ModelServiceStatus, ProviderProfileProjection, ProviderSessionConnection, StorageTransparency, CuratedCreationPlugin } from "../lib/localTransport";
import type { ControlCenterSection, ControlCenterSurfaceProps, ContextBudgetSnapshot } from "./AIControlCenter";
import { ControlCenterSurface } from "./AIControlCenter";
import { CreationPluginCenter } from "./CreationPluginCenter";
import type { SettingsRouteLeaf, SettingsRouteSection } from "../product-shell/settingsRouteState";
import type { ControlCenterPreferences } from "../lib/controlCenterPreferences";
import type { ControlCenterSkill } from "../lib/skillRegistryProjection";

type SettingsPageProps = {
  projectTitle: string;
  section: SettingsRouteSection;
  leaf: SettingsRouteLeaf;
  returnContext: string | null;
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
  onSection(section: SettingsRouteSection): void;
  onLeaf(section: SettingsRouteSection, leaf: SettingsRouteLeaf): void;
  onBack(): void;
  onPreferences(preferences: ControlCenterPreferences): void;
  onRefreshStorage(): void;
  onRevealStorage(): void;
  onSaveProviderProfile(input: { expectedRevision: number; displayName: string; baseUrl: string; modelId: string; enabled: boolean; apiKey?: string }): Promise<ProviderProfileProjection>;
  onReloadProviderProfile(): Promise<ProviderProfileProjection>;
  onDiscoverProviderModels(): Promise<{ models: string[]; profile: ProviderProfileProjection }>;
  onRevealProviderCredential(): Promise<{ credential: string; expiresInMs: number }>;
  onTestProvider(modelId?: string): Promise<{ modelId: string; availableModelCount: number; models: string[]; profile: ProviderProfileProjection }>;
  onMinimalInference(): Promise<{ modelId: string; content: string; finishReason: string | null; usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null; traceId: string | null; profile: ProviderProfileProjection }>;
  onDisableProvider(): Promise<ProviderProfileProjection>;
  onClearProviderCredential(): Promise<ProviderProfileProjection>;
  listPlugins(): Promise<CuratedCreationPlugin[]>;
  operatePlugin(pluginId: string, operation: "install" | "update" | "rollback" | "enable" | "disable" | "uninstall"): Promise<unknown>;
};

const settingsSections: Array<{ id: SettingsRouteSection; label: string; detail: string; Icon: LucideIcon }> = [
  { id: "ai", label: "AI 服务", detail: "Provider、模型、上下文与工作流", Icon: Network },
  { id: "plugins", label: "插件", detail: "目录、权限、完整性与更新", Icon: Wrench },
  { id: "workspace", label: "工作区", detail: "外观、字体、编辑区域与侧栏", Icon: Palette },
  { id: "data", label: "数据", detail: "当前位置、备份、导入与导出", Icon: Database },
  { id: "system", label: "系统", detail: "诊断、日志与版本信息", Icon: Bug }
];

const settingsLeafDefinitions: Record<Exclude<SettingsRouteSection, "home">, Array<{ id: SettingsRouteLeaf; label: string; detail: string }>> = {
  ai: [
    { id: "provider", label: "Provider", detail: "凭据与连接状态" },
    { id: "models", label: "模型", detail: "模型目录与默认模型" },
    { id: "tianyi", label: "天意", detail: "创意与对话模型入口" },
    { id: "context", label: "上下文", detail: "来源与上下文预算" },
    { id: "skills", label: "Skills", detail: "已注册能力说明" },
    { id: "workflows", label: "工作流", detail: "当前编排边界" }
  ],
  plugins: [
    { id: "catalog", label: "插件目录", detail: "精选、完整性与可用状态" },
    { id: "installed", label: "已安装", detail: "已安装插件与停用" },
    { id: "permissions", label: "权限", detail: "权限说明与失败关闭" },
    { id: "updates", label: "更新", detail: "可用更新与回滚" }
  ],
  workspace: [
    { id: "appearance", label: "外观", detail: "显示与布局总览" },
    { id: "fonts", label: "字体", detail: "界面与正文字号" },
    { id: "editor", label: "编辑区域", detail: "正文阅读列宽" },
    { id: "sidebar", label: "侧栏", detail: "侧栏宽度与折叠" },
    { id: "shortcuts", label: "快捷键", detail: "当前可用快捷行为" }
  ],
  data: [
    { id: "location", label: "当前位置", detail: "本地故事文件夹" },
    { id: "backup", label: "备份", detail: "手动文件夹备份" },
    { id: "import-export", label: "导入与导出", detail: "当前可用边界" },
    { id: "storage", label: "存储用量", detail: "当前本地存储状态" }
  ],
  system: [
    { id: "diagnostics", label: "诊断与日志", detail: "本机脱敏记录" },
    { id: "logs", label: "日志", detail: "本机近期诊断记录" },
    { id: "version", label: "版本", detail: "运行时与提交身份" },
    { id: "recovery", label: "恢复", detail: "恢复边界与检查" }
  ]
};

export function SettingsPage(props: SettingsPageProps) {
  // /settings remains a compatibility URL, but opens the most useful surface
  // directly instead of sending authors through a low-information card home.
  const activeSection: Exclude<SettingsRouteSection, "home"> = props.section === "home" ? "ai" : props.section;
  const isPlugins = activeSection === "plugins";
  const returnLabel = props.returnContext === "creation" ? "返回创作输出" : "返回当前工作面";

  return <section className="settings-page" data-testid="settings-page" data-settings-section={props.section}>
    <header className="settings-page-header">
      <div className="settings-page-heading">
        <small>{props.projectTitle} · 天衍工作区</small>
        <h1>{settingsSections.find((item) => item.id === activeSection)?.label || "设置"}</h1>
        <p>{settingsSections.find((item) => item.id === activeSection)?.detail || ""}</p>
      </div>
      <button type="button" className="secondary-action" onClick={props.onBack}><ArrowLeft />{returnLabel}</button>
    </header>

    <main className="settings-layout" aria-label="设置工作区">
      <nav className="settings-section-navigation" aria-label="设置分类">
        {settingsSections.map(({ id, label, detail, Icon }) => <div className={`settings-section-navigation-group ${activeSection === id ? "is-active" : ""}`} key={id}>
          <button type="button" className={activeSection === id ? "is-active" : ""} aria-current={activeSection === id && props.leaf === settingsLeafDefinitions[id as Exclude<SettingsRouteSection, "home">]?.[0]?.id ? "page" : undefined} onClick={() => props.onSection(id)}><Icon /><span><strong>{label}</strong><small>{detail}</small></span></button>
          {activeSection === id && <div className="settings-leaf-navigation" aria-label={`${label}设置`}>
            {settingsLeafDefinitions[id as Exclude<SettingsRouteSection, "home">].map((leaf) => <button type="button" className={props.leaf === leaf.id ? "is-active" : ""} aria-current={props.leaf === leaf.id ? "page" : undefined} key={leaf.id} onClick={() => props.onLeaf(id, leaf.id)}><span><strong>{leaf.label}</strong><small>{leaf.detail}</small></span></button>)}
          </div>}
        </div>)}
      </nav>
      <div className="settings-layout-content">
        {isPlugins ? <CreationPluginCenter surface="settings" settingsView={props.leaf === "installed" || props.leaf === "permissions" || props.leaf === "updates" ? props.leaf : "catalog"} onBack={props.onBack} list={props.listPlugins} operate={props.operatePlugin} /> : <SettingsDetailSurface {...props} section={activeSection} />}
      </div>
    </main>
  </section>;
}

function SettingsDetailSurface(props: SettingsPageProps & { section: Exclude<SettingsRouteSection, "home" | "plugins"> }) {
  const active = leafToControlCenterSection(props.leaf);

  const surfaceProps: Omit<ControlCenterSurfaceProps, "section" | "onSection"> = {
    preferences: props.preferences,
    skills: props.skills,
    contextBudget: props.contextBudget,
    storage: props.storage,
    storageLoading: props.storageLoading,
    storageError: props.storageError,
    storageActionBusy: props.storageActionBusy,
    modelServiceStatus: props.modelServiceStatus,
    providerConnection: props.providerConnection,
    providerBusy: props.providerBusy,
    providerError: props.providerError,
    onPreferences: props.onPreferences,
    onRefreshStorage: props.onRefreshStorage,
    onRevealStorage: props.onRevealStorage,
    onSaveProviderProfile: props.onSaveProviderProfile,
    onReloadProviderProfile: props.onReloadProviderProfile,
    onDiscoverProviderModels: props.onDiscoverProviderModels,
    onRevealProviderCredential: props.onRevealProviderCredential,
    onTestProvider: props.onTestProvider,
    onMinimalInference: props.onMinimalInference,
    onDisableProvider: props.onDisableProvider,
    onClearProviderCredential: props.onClearProviderCredential
  };

  return <main className="settings-detail" aria-label={`${settingsSections.find((item) => item.id === props.section)?.label || "设置"}内容`}>
    <div className="settings-detail-content">
      <ControlCenterSurface {...surfaceProps} section={active} onSection={(next) => props.onLeaf(props.section, controlCenterSectionToLeaf(next, props.section))} />
    </div>
  </main>;
}

function leafToControlCenterSection(leaf: SettingsRouteLeaf): ControlCenterSection {
  return ({ provider: "providers", models: "models", tianyi: "tianyi", context: "context", skills: "skills", workflows: "workflows", appearance: "appearance", fonts: "font", editor: "editor", sidebar: "sidebar", shortcuts: "shortcuts", location: "storage", backup: "backup", "import-export": "export", storage: "storage-usage", diagnostics: "diagnostics", logs: "logs", version: "version", recovery: "recovery", catalog: "providers", installed: "providers", permissions: "providers", updates: "providers" } as Record<SettingsRouteLeaf, ControlCenterSection>)[leaf];
}

function controlCenterSectionToLeaf(section: ControlCenterSection, settingsSection: Exclude<SettingsRouteSection, "home" | "plugins">): SettingsRouteLeaf {
  const leaf = ({ providers: "provider", models: "models", tianyi: "tianyi", context: "context", skills: "skills", workflows: "workflows", appearance: "appearance", font: "fonts", editor: "editor", sidebar: "sidebar", shortcuts: "shortcuts", storage: "location", "storage-usage": "storage", backup: "backup", export: "import-export", diagnostics: "diagnostics", logs: "logs", version: "version", recovery: "recovery" } as Record<ControlCenterSection, SettingsRouteLeaf>)[section];
  return settingsLeafDefinitions[settingsSection].some((item) => item.id === leaf) ? leaf : settingsLeafDefinitions[settingsSection][0].id;
}
