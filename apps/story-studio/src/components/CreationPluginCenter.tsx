import { ArrowLeft, CheckCircle2, Download, ExternalLink, Power, RefreshCw, RotateCcw, Trash2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import type { CuratedCreationPlugin } from "../lib/localTransport";

type PluginOperation = "install" | "update" | "rollback" | "enable" | "disable" | "uninstall";

export function CreationPluginCenter(props: {
  surface?: "creation" | "settings";
  settingsView?: "catalog" | "installed" | "permissions" | "updates";
  onBack(): void;
  list(): Promise<CuratedCreationPlugin[]>;
  operate(pluginId: string, operation: PluginOperation): Promise<unknown>;
}) {
  const [plugins, setPlugins] = useState<CuratedCreationPlugin[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [updateConfirmation, setUpdateConfirmation] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setError("");
    try {
      setPlugins(await props.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => { void reload(); }, [props.settingsView]);

  async function operate(pluginId: string, operation: PluginOperation): Promise<void> {
    setBusy(`${pluginId}:${operation}`);
    setError("");
    try {
      await props.operate(pluginId, operation);
      setUpdateConfirmation(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }

  const settingsSurface = props.surface === "settings";
  const settingsView = props.settingsView || "catalog";
  const visiblePlugins = settingsSurface ? plugins.filter((plugin) => {
    if (settingsView === "installed") return ["installed", "disabled", "update-available", "quarantined"].includes(plugin.installState);
    if (settingsView === "updates") return plugin.installState === "update-available";
    return true;
  }) : plugins;
  const viewTitle = settingsSurface ? ({ catalog: "插件目录", installed: "已安装插件", permissions: "插件权限", updates: "插件更新" } as const)[settingsView] : "插件中心";
  return <section className={`workbench creation-home creation-plugin-center ${settingsSurface ? "is-settings-surface" : ""}`} data-testid="creation-plugin-center" data-plugin-surface={settingsSurface ? "settings" : "creation"}>
    <header className="creation-home-header">
      <div>
        <small>{settingsSurface ? "设置 · 外部工具" : "创作输出 · 外部工具"}</small>
        <h1>{viewTitle}</h1>
        <p>{settingsSurface ? settingsView === "permissions" ? "查看每个精选工具声明的权限与失败关闭状态；本页不会授予执行权限。" : "管理已审核的外部工具、安装状态、权限和完整性状态。插件不可用时，天衍会明确保持不可执行。" : "选择经过天衍审核的外部工具。安装包与运行文件独立于故事资料；卸载不会删除故事包、输出产物或回执。"}</p>
      </div>
      <div className="creation-home-primary-actions">
        {!settingsSurface && <button type="button" className="secondary-action" onClick={props.onBack}><ArrowLeft />返回创作输出</button>}
        <button type="button" className="secondary-action" onClick={() => void reload()}><RefreshCw />刷新</button>
      </div>
    </header>
    {error ? <p className="neutral-package-error" role="alert">{error}</p> : null}
    <section className="creation-plugin-list" aria-label="精选外部工具目录">
      {visiblePlugins.map((plugin) => <PluginCard
        key={plugin.manifest.pluginId}
        plugin={plugin}
        readOnly={settingsSurface && settingsView === "permissions"}
        busy={busy}
        updateConfirmation={updateConfirmation}
        onRequestUpdate={setUpdateConfirmation}
        onOperate={operate}
      />)}
      {!visiblePlugins.length && !error ? <div className="neutral-package-empty"><Wrench /><div><strong>{settingsView === "updates" ? "当前没有可用更新" : settingsView === "installed" ? "还没有已安装插件" : "尚未发现精选外部工具"}</strong><p>{settingsView === "permissions" ? "插件权限会在每个工具详情中显示；当前仍保持失败关闭。" : "请刷新目录；这里不会接受任意 GitHub 地址或命令行路径。"}</p></div></div> : null}
    </section>
    <p className="creation-plugin-boundary"><CheckCircle2 />安装、停用和卸载只管理插件运行文件。外部结果仍需你预览并明确保存，才会进入既有输出产物。</p>
  </section>;
}

function PluginCard(props: {
  plugin: CuratedCreationPlugin;
  readOnly?: boolean;
  busy: string | null;
  updateConfirmation: string | null;
  onRequestUpdate(pluginId: string | null): void;
  onOperate(pluginId: string, operation: PluginOperation): Promise<void>;
}) {
  const { plugin } = props;
  const { manifest } = plugin;
  const operation = plugin.installState === "installable" ? "install" : plugin.installState === "update-available" ? "update" : plugin.installState === "disabled" ? "enable" : plugin.installState === "installed" ? "disable" : null;
  const operationLabel = operation === "install" ? "安装" : operation === "enable" ? "启用" : operation === "disable" ? "停用" : "";
  const externalUrl = safeExternalUrl(manifest.upstreamRepository);
  const confirmingUpdate = operation === "update" && props.updateConfirmation === manifest.pluginId;

  return <article className="creation-plugin-card" data-plugin-state={plugin.installState} data-execution-state={plugin.executionState}>
    <div>
      <span className={`creation-plugin-state is-${plugin.executionState}`}>{executionLabel(plugin.executionState)}</span>
      <h2>{manifest.displayName}</h2>
      <p>{manifest.description}</p>
      <small>{manifest.capabilities.map(capabilityLabel).join(" · ")} · {stateLabel(plugin.installState)}</small>
    </div>
    <div className="creation-plugin-actions">
      {!props.readOnly && operation === "update" && !confirmingUpdate
        ? <button type="button" className="primary-action" disabled={props.busy !== null} onClick={() => props.onRequestUpdate(manifest.pluginId)}><RefreshCw />查看更新</button>
        : !props.readOnly && operation ? <button type="button" className="primary-action" disabled={props.busy !== null} onClick={() => void props.onOperate(manifest.pluginId, operation)}>
          {operation === "install" ? <Download /> : operation === "update" ? <RefreshCw /> : <Power />}
          {props.busy === `${manifest.pluginId}:${operation}` ? "处理中…" : operation === "update" ? "确认更新" : operationLabel}
        </button> : null}
      {!props.readOnly && confirmingUpdate ? <button type="button" className="secondary-action" disabled={props.busy !== null} onClick={() => props.onRequestUpdate(null)}>取消</button> : null}
      {!props.readOnly && (["installed", "disabled", "update-available"] as const).includes(plugin.installState as "installed")
        ? <button type="button" className="secondary-action" disabled={props.busy !== null} onClick={() => void props.onOperate(manifest.pluginId, "uninstall")}><Trash2 />卸载</button>
        : null}
    </div>
    <details>
      <summary>工具详情</summary>
      <dl>
        <div><dt>上游项目</dt><dd>{externalUrl ? <a href={externalUrl} target="_blank" rel="noreferrer">查看上游 <ExternalLink /></a> : "来源地址不可用"}</dd></div>
        <div><dt>版本</dt><dd>{manifest.upstreamCommitOrRelease}</dd></div>
        <div><dt>许可证</dt><dd>{manifest.licenseSpdx}</dd></div>
        <div><dt>包体积</dt><dd>{plugin.packageSizeBytes === null ? "R0 目录尚未发布" : `${Math.ceil(plugin.packageSizeBytes / 1024)} KB`}</dd></div>
        <div><dt>权限</dt><dd>{manifest.permissions.join("、") || "无"}</dd></div>
        <div><dt>运行环境</dt><dd>{manifest.runtime} · {manifest.pluginKind}</dd></div>
        <div><dt>安全状态</dt><dd>{securityDetail(plugin)}</dd></div>
        <div><dt>独立服务</dt><dd>{manifest.externalServiceRequired ? "需要；由连接器单独配置" : "不需要"}</dd></div>
        <div><dt>模型</dt><dd>{manifest.modelManagedByTianyan ? "由天衍管理" : "不包含或管理模型"}</dd></div>
        <div><dt>包状态</dt><dd>{packageDetail(plugin)}</dd></div>
        <div><dt>更新与卸载</dt><dd>更新需明确确认并保留已验证旧版；卸载不删除故事包、输出产物或回执。</dd></div>
      </dl>
      {!props.readOnly && (["installed", "disabled", "update-available", "quarantined"] as const).includes(plugin.installState as "installed") ? <button type="button" className="secondary-action" disabled={props.busy !== null} onClick={() => void props.onOperate(manifest.pluginId, "rollback")}><RotateCcw />回滚已验证版本</button> : null}
    </details>
  </article>;
}

function stateLabel(state: CuratedCreationPlugin["installState"]): string {
  return ({ unavailable: "尚未发布", installable: "可安装", installed: "已安装", disabled: "已停用", "update-available": "有更新", incompatible: "不兼容", quarantined: "完整性失败" })[state];
}
function executionLabel(state: CuratedCreationPlugin["executionState"]): string { return ({ runnable: "可运行", unavailable: "暂不可运行", quarantined: "已隔离" })[state]; }
function capabilityLabel(value: string): string { return ({ screenplay: "剧本", interactive_story: "互动叙事", document_export: "文档导出" } as Record<string, string>)[value] || value; }
function safeExternalUrl(value: string): string | null { try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
function securityDetail(plugin: CuratedCreationPlugin): string { return plugin.executionState === "quarantined" ? plugin.integrity?.reason || "完整性检查失败；已隔离" : "已安装但不可执行；真实操作系统能力隔离尚未完成"; }
function packageDetail(plugin: CuratedCreationPlugin): string { return plugin.installState === "installed" ? "已安装；可停用、更新或卸载" : plugin.installState === "quarantined" ? "完整性失败；已禁止启用和运行" : plugin.packageAvailable ? "可从本地精选目录安装" : "R0 目录尚未发布此安装包"; }
