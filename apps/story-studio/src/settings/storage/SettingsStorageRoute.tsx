import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  exportStorageProject,
  disableProviderProfile,
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
import { AgentSettingsSection, type ProviderProfileUpdate } from "../agent/AgentSettingsSection";
import { SettingsTransferSection } from "./SettingsTransferSection";
import { SettingsStorageSection } from "./SettingsStorageSection";

type SettingsSectionId = "storage" | "transfer" | "agent";

const workspaceSections: ReadonlyArray<{ id: SettingsSectionId; group: string; label: string }> = [
  { id: "storage", group: "工作区", label: "存储与备份" },
  { id: "transfer", group: "数据", label: "导入与导出" },
  { id: "agent", group: "智能", label: "模型与 Agent" }
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

  const updatePermission = async (profile: AgentPermissionProfile) => {
    if (!project) throw new Error("请先打开项目。");
    const next = await withToken((token) => setAgentPermissionProfile({ projectId: project.id, profile, token }));
    setPermissionState(next);
  };
  const saveProvider = async (input: ProviderProfileUpdate) => {
    await withToken((token) => saveProviderProfile({ ...input, token }));
    await refreshRuntime(project);
  };
  const disableProvider = async (expectedRevision: number) => {
    await withToken((token) => disableProviderProfile({ expectedRevision, token }));
    await refreshRuntime(project);
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
      <header className="settings-utility-heading">
        {presentation === "utility" && <a className="settings-back-link" href="/world"><ArrowLeft aria-hidden="true" />返回作品</a>}
        <div className="settings-heading-copy"><p>设置</p><h1>本地工作区设置</h1><span><strong>{project?.title ? `当前作品：${project.title}` : "尚未打开作品"}</strong> 配置只通过既有 Workspace、Provider 与权限 owner 生效。</span></div>
      </header>
      <div className="settings-workspace-layout">
        {presentation === "workspace" && <aside className="settings-workspace-nav" aria-label="设置目录">
          <p>设置目录</p>
          <nav>{workspaceSections.map((section) => <button key={section.id} type="button" aria-current={activeSection === section.id ? "page" : undefined} aria-controls={`settings-section-${section.id}`} onClick={() => setActiveSection(section.id)}><small>{section.group}</small><span>{section.label}</span></button>)}</nav>
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
            onDisableProviderProfile={disableProvider}
          /></section>}
        </div>
      </div>
    </div>
    <input ref={fileInput} type="file" accept=".tianyan,application/json" hidden aria-hidden="true" />
  </main>;
}
