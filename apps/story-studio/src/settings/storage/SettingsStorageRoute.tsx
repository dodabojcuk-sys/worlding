import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  exportStorageProject,
  disableProviderProfile,
  discoverProviderModels,
  getAgentPermissionState,
  getBootstrap,
  getModelServiceStatus,
  importStorageProject,
  probeProviderEmbedding,
  readProviderConnectionDiagnostic,
  revealProviderCredential,
  revealStorageProject,
  saveProviderProfile,
  testProviderConnection,
  setAgentPermissionProfile,
  type AgentPermissionProfile,
  type AgentPermissionState,
  type ModelServiceStatus,
  type StoryStudioProject
} from "../../lib/localTransport";
import { LocalFolderProvider } from "../../lib/storageProvider";
import { AgentSettingsSection, type ProviderProfileSaveResult, type ProviderProfileUpdate } from "../agent/AgentSettingsSection";
import { SettingsTransferSection } from "./SettingsTransferSection";
import { SettingsStorageSection } from "./SettingsStorageSection";
import { useI18n } from "../../product-shell/i18n/I18nProvider";
import { resolveInitialShellTheme, type ShellTheme } from "../../product-shell/theme/theme";

type SettingsSectionId = "storage" | "transfer" | "agent";
type MobileSettingsPage = "appearance" | "storage" | "transfer" | "agent-provider" | "agent-permissions" | null;
const mobilePageFromPath = (): MobileSettingsPage => {
  const page = window.location.pathname.split("/")[2];
  return ["appearance", "storage", "transfer", "agent-provider", "agent-permissions"].includes(page ?? "") ? page as MobileSettingsPage : null;
};
type SettingsNavItem = { id: string; label: string; section: SettingsSectionId; targetId: string };

const workspaceNavigation: ReadonlyArray<{ group: string; items: ReadonlyArray<SettingsNavItem> }> = [
  { group: "工作区", items: [{ id: "storage", label: "存储与备份", section: "storage", targetId: "settings-section-storage" }] },
  { group: "数据", items: [{ id: "transfer", label: "导入与导出", section: "transfer", targetId: "settings-section-transfer" }] },
  { group: "智能", items: [
    { id: "agent-overview", label: "运行概览", section: "agent", targetId: "settings-agent-overview" },
    { id: "agent-runtime", label: "Pi Agent 运行时", section: "agent", targetId: "settings-agent-runtime" },
    { id: "agent-provider", label: "Provider 与模型", section: "agent", targetId: "settings-agent-provider" },
    { id: "agent-permissions", label: "默认权限", section: "agent", targetId: "settings-agent-permissions" }
  ] }
];

/** Independent utility route. It composes settings adapters without mounting the product Shell. */
export function SettingsStorageRoute(props: { presentation?: "utility" | "workspace" | "mobile" } = {}) {
  const { locale, setLocale } = useI18n();
  const [appearance, setAppearance] = useState<ShellTheme>(resolveInitialShellTheme);
  const chooseAppearance = (next: ShellTheme) => {
    setAppearance(next);
    try { window.localStorage.setItem("tianyan.shell.theme", next); } catch { /* current session remains usable */ }
    window.dispatchEvent(new CustomEvent("tianyan-shell-theme-change", { detail: next }));
  };
  const presentation = props.presentation ?? "utility";
  const storageProvider = useRef(new LocalFolderProvider()).current;
  const fileInput = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<StoryStudioProject | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelServiceStatus | null>(null);
  const [permissionState, setPermissionState] = useState<AgentPermissionState | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("storage");
  const [activeNavItem, setActiveNavItem] = useState("storage");
  const [mobilePage, setMobilePage] = useState<MobileSettingsPage>(mobilePageFromPath);
  const [mobileTab, setMobileTab] = useState<"settings" | "sync" | "about">("settings");
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const withToken = useCallback(<T,>(action: (token: string) => Promise<T>) => storageProvider.withWriteAccess(action), [storageProvider]);

  const refreshRuntime = useCallback(async (activeProject: StoryStudioProject | null) => {
    setRuntimeBusy(true);
    setRuntimeError(null);
    try {
      const [model, permission] = await withToken(async (token) => Promise.all([
        getModelServiceStatus(token),
        activeProject ? getAgentPermissionState(activeProject.id) : Promise.resolve(null)
      ]));
      setModelStatus(model);
      setPermissionState(permission);
    } catch (cause) {
      setRuntimeError(cause instanceof Error ? cause.message : "无法读取 Agent 运行状态。");
    } finally {
      setRuntimeBusy(false);
    }
  }, [withToken]);

  useEffect(() => {
    let active = true;
    void getBootstrap().then(async (value) => {
      if (!active) return;
      setProject(value.activeProject);
      await refreshRuntime(value.activeProject);
    }).catch((cause) => active && setRuntimeError(cause instanceof Error ? cause.message : "无法读取设置。"));
    return () => { active = false; };
  }, [refreshRuntime]);

  useEffect(() => {
    if (!pendingTargetId) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(pendingTargetId)?.scrollIntoView({ block: "start" });
      setPendingTargetId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSection, pendingTargetId]);

  useEffect(() => {
    const restore = () => setMobilePage(mobilePageFromPath());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const openMobilePage = (page: Exclude<MobileSettingsPage, null>) => {
    window.history.pushState({}, "", `/settings/${page}`);
    setMobilePage(page);
    setActiveSection(page === "storage" ? "storage" : page === "transfer" ? "transfer" : "agent");
    window.dispatchEvent(new Event("tianyan-mobile-route-change"));
  };

  const openSettingsItem = (item: SettingsNavItem) => {
    setActiveSection(item.section);
    setActiveNavItem(item.id);
    setPendingTargetId(item.targetId);
  };

  const updatePermission = async (profile: AgentPermissionProfile) => {
    if (!project) throw new Error("请先打开项目。");
    const next = await withToken((token) => setAgentPermissionProfile({ projectId: project.id, profile, token }));
    setPermissionState(next);
  };
  const saveProvider = async (input: ProviderProfileUpdate): Promise<ProviderProfileSaveResult> => {
    const saved = await withToken((token) => saveProviderProfile({ ...input, token }));
    const result: ProviderProfileSaveResult = { discovery: "not-needed", modelCount: saved.profile?.catalog.entries.filter((entry) => entry.source === "endpoint").length ?? 0 };
    await refreshRuntime(project);
    window.dispatchEvent(new Event("story-studio-model-service-status-changed"));
    return result;
  };
  const discoverModels = async () => {
    try {
      const discovery = await withToken((token) => discoverProviderModels(token));
      return discovery.models;
    } finally {
      await refreshRuntime(project);
      window.dispatchEvent(new Event("story-studio-model-service-status-changed"));
    }
  };
  const testConnection = async (input: { modelId?: string; operationId: string }) => {
    try {
      return await withToken((token) => testProviderConnection(token, input));
    } finally {
      await refreshRuntime(project);
      window.dispatchEvent(new Event("story-studio-model-service-status-changed"));
    }
  };
  const readConnectionDiagnostic = async (operationId: string) => withToken((token) => readProviderConnectionDiagnostic(token, operationId));
  const revealCredential = async (providerInstanceId: string) => withToken((token) => revealProviderCredential({ providerInstanceId, token }));
  const probeEmbedding = async (modelId: string) => {
    const result = await withToken((token) => probeProviderEmbedding(token, modelId));
    await refreshRuntime(project);
    window.dispatchEvent(new Event("story-studio-model-service-status-changed"));
    return result;
  };
  const disableProvider = async (expectedRevision: number) => {
    await withToken((token) => disableProviderProfile({ expectedRevision, token }));
    await refreshRuntime(project);
    window.dispatchEvent(new Event("story-studio-model-service-status-changed"));
  };

  const importPackage = () => new Promise<Awaited<ReturnType<typeof importStorageProject>>>((resolve, reject) => {
    const input = fileInput.current;
    if (!input) return reject(new Error("导入控件不可用。"));
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return reject(new Error("未选择工程包。"));
      try {
        const imported = await withToken((token) => file.text().then((packageText) => importStorageProject({ packageText, token })));
        const bootstrap = await getBootstrap();
        setProject(bootstrap.activeProject);
        resolve(imported);
      } catch (error) { reject(error); }
    };
    input.click();
  });

  return <main className={`settings-utility-route ${presentation === "workspace" || presentation === "mobile" ? "settings-workspace-route" : ""}`} data-route="settings-storage" data-settings-route={presentation} data-mobile-page={mobilePage ?? "home"}>
    <div className="settings-utility-content">
      {presentation === "utility" && <header className="settings-utility-heading">
        {presentation === "utility" && <a className="settings-back-link" href="/world"><ArrowLeft aria-hidden="true" />返回作品</a>}
        <div className="settings-heading-copy"><p>设置</p><h1>本地工作区设置</h1><span><strong>{project?.title ? `当前作品：${project.title}` : "尚未打开作品"}</strong> 配置只通过既有 Workspace、Provider 与权限 owner 生效。</span></div>
      </header>}
      {presentation === "mobile" && !mobilePage && <div className="mobile-settings-home" aria-label="设置首页">
        <div className="mobile-settings-profile"><span aria-hidden="true">我</span><div><strong>个人中心</strong><small>当前设备上的偏好与工作区配置</small></div></div>
        <div className="mobile-settings-tabs" role="tablist" aria-label="个人中心分类"><button type="button" role="tab" aria-selected={mobileTab === "settings"} onClick={() => setMobileTab("settings")}>设置</button><button type="button" role="tab" aria-selected={mobileTab === "sync"} onClick={() => setMobileTab("sync")}>同步与备份</button><button type="button" role="tab" aria-selected={mobileTab === "about"} onClick={() => setMobileTab("about")}>关于</button></div>
        {mobileTab === "settings" ? <><p className="mobile-settings-group">模型接入</p><div className="mobile-settings-list"><button type="button" onClick={() => openMobilePage("agent-provider")}>API / Provider 配置 <span>{modelStatus?.profile.profile?.displayName ?? "未配置"} ›</span></button><button type="button" onClick={() => openMobilePage("agent-permissions")}>默认权限 <span>查看现有配置 ›</span></button></div><p className="mobile-settings-group">读法与工作区</p><div className="mobile-settings-list"><button type="button" onClick={() => openMobilePage("appearance")}>外观与语言 <span>本机偏好 ›</span></button><button type="button" onClick={() => openMobilePage("storage")}>存储与备份 <span>当前作品 ›</span></button><button type="button" onClick={() => openMobilePage("transfer")}>导入与导出 <span>工程包 ›</span></button></div><p className="mobile-settings-note">语音、通知与云同步尚未接入；这里没有可操作开关。</p></> : mobileTab === "sync" ? <><p className="mobile-settings-group">同步与备份</p><div className="mobile-settings-list"><button type="button" onClick={() => openMobilePage("storage")}>本地备份 <span>查看 ›</span></button><div>跨设备同步 <span>尚未实现</span></div></div><p className="mobile-settings-note">本机存储不表示作品已经同步到其他设备。</p></> : <><p className="mobile-settings-group">关于</p><div className="mobile-settings-list"><div>天衍 Story Studio <span>当前本地版本</span></div><div>手机创作端 <span>与桌面共用项目和领域服务</span></div></div></>}
      </div>}
      {(presentation !== "mobile" || mobilePage) && <>
      <div className="settings-workspace-layout">
        {presentation === "workspace" && <aside className="settings-workspace-nav" aria-label="设置目录">
          <p>设置目录</p>
          <nav>{workspaceNavigation.map((group) => <section className="settings-workspace-nav-group" key={group.group} aria-label={group.group}>
            <strong>{group.group}</strong>
            <div>{group.items.map((item) => <button key={item.id} type="button" aria-current={activeNavItem === item.id ? "page" : undefined} aria-controls={item.targetId} onClick={() => openSettingsItem(item)}><span>{item.label}</span></button>)}</div>
          </section>)}</nav>
        </aside>}
        <div className="settings-workspace-sections">
          {(presentation !== "mobile" || mobilePage === "appearance") && <section className="settings-appearance" aria-label="外观与语言"><h2>外观与语言</h2><div><label>主题<select aria-label="主题" value={appearance} onChange={(event) => chooseAppearance(event.target.value as ShellTheme)}><option value="cloud-ink">云砚</option><option value="night-paper">夜纸</option></select></label><label>语言<select aria-label="语言" value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}><option value="zh-CN">中文</option><option value="en-US">English</option></select></label></div><small>当前选择保存在本机；切换不会改变作品或模型设置。</small></section>}
          {(presentation === "utility" || presentation === "mobile" ? mobilePage === "storage" || presentation === "utility" : activeSection === "storage") && <section id="settings-section-storage" aria-label="存储与备份"><SettingsStorageSection
            projectId={project?.id ?? null}
            onReveal={() => project ? withToken(() => revealStorageProject(project.id)) : Promise.reject(new Error("请先打开项目。"))}
            onBackup={() => project ? withToken((token) => exportStorageProject({ projectId: project.id, token })) : Promise.reject(new Error("请先打开项目。"))}
          /></section>}
          {(presentation === "utility" || mobilePage === "transfer" || presentation === "workspace" && activeSection === "transfer") && <section id="settings-section-transfer" aria-label="导入与导出"><SettingsTransferSection
            hasProject={Boolean(project)}
            onExport={() => project ? withToken((token) => exportStorageProject({ projectId: project.id, token })) : Promise.reject(new Error("请先打开项目。"))}
            onImport={importPackage}
          /></section>}
          {(presentation === "utility" || presentation === "mobile" && mobilePage?.startsWith("agent-") || presentation === "workspace" && activeSection === "agent") && <section id="settings-section-agent" aria-label="模型与 Agent"><AgentSettingsSection
            status={modelStatus}
            permissionState={permissionState}
            busy={runtimeBusy}
            error={runtimeError}
            onRefresh={() => void refreshRuntime(project)}
            onPermissionProfile={updatePermission}
            onSaveProviderProfile={saveProvider}
            onDiscoverProviderModels={discoverModels}
            onTestProviderConnection={testConnection}
            onReadProviderConnectionDiagnostic={readConnectionDiagnostic}
            onRevealProviderCredential={revealCredential}
            onProbeEmbedding={probeEmbedding}
            onDisableProviderProfile={disableProvider}
          /></section>}
        </div>
      </div>
      </>}
    </div>
    <input ref={fileInput} type="file" accept=".tianyan,application/json" hidden aria-hidden="true" />
  </main>;
}
