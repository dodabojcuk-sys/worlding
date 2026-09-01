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
  revealStorageProject,
  saveProviderProfile,
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

type SettingsSectionId = "storage" | "transfer" | "agent";
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
export function SettingsStorageRoute(props: { presentation?: "utility" | "workspace" } = {}) {
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
    let result: ProviderProfileSaveResult = { discovery: "not-needed", modelCount: saved.profile?.availableModels.length ?? 0 };
    if (!input.modelId && saved.credential.configured) {
      try {
        const discovery = await withToken((token) => discoverProviderModels(token));
        result = { discovery: "loaded", modelCount: discovery.models.length };
      } catch (cause) {
        result = {
          discovery: "failed",
          modelCount: 0,
          discoveryError: cause instanceof Error ? cause.message : "请稍后重试或手动填写模型 ID。"
        };
      }
    }
    await refreshRuntime(project);
    window.dispatchEvent(new Event("story-studio-model-service-status-changed"));
    return result;
  };
  const discoverModels = async () => {
    const discovery = await withToken((token) => discoverProviderModels(token));
    await refreshRuntime(project);
    window.dispatchEvent(new Event("story-studio-model-service-status-changed"));
    return discovery.models;
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

  return <main className={`settings-utility-route ${presentation === "workspace" ? "settings-workspace-route" : ""}`} data-route="settings-storage" data-settings-route={presentation}>
    <div className="settings-utility-content">
      {presentation === "utility" && <header className="settings-utility-heading">
        {presentation === "utility" && <a className="settings-back-link" href="/world"><ArrowLeft aria-hidden="true" />返回作品</a>}
        <div className="settings-heading-copy"><p>设置</p><h1>本地工作区设置</h1><span><strong>{project?.title ? `当前作品：${project.title}` : "尚未打开作品"}</strong> 配置只通过既有 Workspace、Provider 与权限 owner 生效。</span></div>
      </header>}
      <div className="settings-workspace-layout">
        {presentation === "workspace" && <aside className="settings-workspace-nav" aria-label="设置目录">
          <p>设置目录</p>
          <nav>{workspaceNavigation.map((group) => <section className="settings-workspace-nav-group" key={group.group} aria-label={group.group}>
            <strong>{group.group}</strong>
            <div>{group.items.map((item) => <button key={item.id} type="button" aria-current={activeNavItem === item.id ? "page" : undefined} aria-controls={item.targetId} onClick={() => openSettingsItem(item)}><span>{item.label}</span></button>)}</div>
          </section>)}</nav>
        </aside>}
        <div className="settings-workspace-sections">
          {(presentation === "utility" || activeSection === "storage") && <section id="settings-section-storage" aria-label="存储与备份"><SettingsStorageSection
            projectId={project?.id ?? null}
            onReveal={() => project ? withToken(() => revealStorageProject(project.id)) : Promise.reject(new Error("请先打开项目。"))}
            onBackup={() => project ? withToken((token) => exportStorageProject({ projectId: project.id, token })) : Promise.reject(new Error("请先打开项目。"))}
          /></section>}
          {(presentation === "utility" || activeSection === "transfer") && <section id="settings-section-transfer" aria-label="导入与导出"><SettingsTransferSection
            hasProject={Boolean(project)}
            onExport={() => project ? withToken((token) => exportStorageProject({ projectId: project.id, token })) : Promise.reject(new Error("请先打开项目。"))}
            onImport={importPackage}
          /></section>}
          {(presentation === "utility" || activeSection === "agent") && <section id="settings-section-agent" aria-label="模型与 Agent"><AgentSettingsSection
            status={modelStatus}
            permissionState={permissionState}
            busy={runtimeBusy}
            error={runtimeError}
            onRefresh={() => void refreshRuntime(project)}
            onPermissionProfile={updatePermission}
            onSaveProviderProfile={saveProvider}
            onDiscoverProviderModels={discoverModels}
            onDisableProviderProfile={disableProvider}
          /></section>}
        </div>
      </div>
    </div>
    <input ref={fileInput} type="file" accept=".tianyan,application/json" hidden aria-hidden="true" />
  </main>;
}
