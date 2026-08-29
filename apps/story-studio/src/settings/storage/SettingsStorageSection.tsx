import { FolderOpen, HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import { getStorageTransparency, type StorageTransparency } from "../../lib/localTransport";

/** Route-ready settings section. Shell integration is intentionally delegated. */
type Receipt = { exportedAt?: string; packageName?: string; projectId?: string };

export function SettingsStorageSection(props: { projectId: string | null; onReveal(): Promise<void>; onBackup(): Promise<Receipt> }) {
  const [status, setStatus] = useState<StorageTransparency | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  useEffect(() => { if (props.projectId) void getStorageTransparency(props.projectId).then(setStatus).catch((cause) => setError(cause instanceof Error ? cause.message : "无法验证存储位置。")); }, [props.projectId]);
  const run = (action: () => Promise<Receipt | void>) => void action().then((next) => { if (next) setReceipt(next); }).catch((cause) => setError(cause instanceof Error ? cause.message : "操作未完成；现有项目未被修改。"));
  const hasProject = Boolean(props.projectId);
  return <section aria-labelledby="settings-storage-title" className="settings-card settings-storage-section"><header><HardDrive aria-hidden="true" /><div><p>工作区</p><h2 id="settings-storage-title">存储与备份</h2></div></header><dl><div><dt>当前作品库位置</dt><dd>{status?.libraryPath ?? "由本地存储服务验证"}</dd></div><div><dt>当前项目位置</dt><dd>{status?.projectPath ?? "请先打开项目"}</dd></div><div><dt>验证状态</dt><dd>{status ? "已验证" : "正在验证或尚未选择项目"}</dd></div></dl>{error && <p role="alert">{error} 请检查位置与权限后重试。</p>}{receipt && <p role="status">最近一次成功操作：{receipt.packageName ?? receipt.projectId ?? "已完成"}（{receipt.exportedAt}）</p>}<div className="settings-storage-actions"><button type="button" disabled={!hasProject} onClick={() => run(props.onReveal)}><FolderOpen aria-hidden="true" />打开文件夹</button><button type="button" disabled title="目录选择器尚未由安全服务器端口接入">更改作品库位置</button><button type="button" disabled title="目录选择器尚未由安全服务器端口接入">选择备份位置</button><button type="button" className="settings-primary-action" disabled={!hasProject} onClick={() => run(props.onBackup)}>立即备份</button></div><p>目录选择仅接受服务器端受控的原生选择器，不接受浏览器提交任意路径。</p></section>;
}
