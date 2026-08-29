import { useEffect, useRef, useState } from "react";

import { exportStorageProject, getBootstrap, importStorageProject, revealStorageProject, type StoryStudioProject } from "../../lib/localTransport";
import { LocalFolderProvider } from "../../lib/storageProvider";
import { SettingsStorageSection } from "./SettingsStorageSection";

/** Standalone route; App selects it for /settings/storage without touching Shell. */
export function SettingsStorageRoute() {
  const storageProvider = useRef(new LocalFolderProvider()).current;
  const fileInput = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<StoryStudioProject | null>(null);
  useEffect(() => { void getBootstrap().then((value) => setProject(value.activeProject)); }, []);
  const withToken = <T,>(action: (token: string) => Promise<T>) => storageProvider.withWriteAccess(action);
  return <main data-route="settings-storage"><SettingsStorageSection
    projectId={project?.id ?? null}
    onReveal={() => project ? withToken(() => revealStorageProject(project.id)) : Promise.reject(new Error("请先打开项目。"))}
    onExport={() => project ? withToken((token) => exportStorageProject({ projectId: project.id, token })) : Promise.reject(new Error("请先打开项目。"))}
    onBackup={() => project ? withToken((token) => exportStorageProject({ projectId: project.id, token })) : Promise.reject(new Error("请先打开项目。"))}
    onImport={() => new Promise((resolve, reject) => { const input = fileInput.current; if (!input) return reject(new Error("导入控件不可用。")); input.onchange = async () => { const file = input.files?.[0]; input.value = ""; if (!file) return reject(new Error("未选择工程包。")); try { const imported = await withToken((token) => file.text().then((packageText) => importStorageProject({ packageText, token }))); setProject((await getBootstrap()).activeProject); resolve(imported); } catch (error) { reject(error); } }; input.click(); })}
  /><input ref={fileInput} type="file" accept=".tianyan,application/json" hidden aria-hidden="true" /></main>;
}
