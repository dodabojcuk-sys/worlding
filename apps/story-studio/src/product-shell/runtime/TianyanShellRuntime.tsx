import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getAgentPermissionState,
  getBootstrap,
  getCreationSourcePortState,
  getModelServiceStatus,
  setAgentPermissionProfile,
  type AgentPermissionProfile,
  type AgentPermissionState,
  type ModelServiceStatus,
  type StoryStudioProject
} from "../../lib/localTransport";
import { LocalFolderProvider } from "../../lib/storageProvider";
import { TianyanR0Shell } from "../TianyanR0Shell";
import { tianyiShellSessionStorageKey } from "./tianyiShellSessionRecovery";

export type TianyanShellRuntimeState = {
  project: StoryStudioProject | null;
  workVersionLabel: string | null;
  connectionState: "loading" | "ready" | "unavailable";
  modelStatus: ModelServiceStatus | null;
  permissionState: AgentPermissionState | null;
  sharedSessionId: string | null;
  sharedDraft: string;
  setSharedSessionId(sessionId: string | null): void;
  setSharedDraft(value: string): void;
  setPermissionProfile(profile: AgentPermissionProfile): Promise<void>;
  withConnection<T>(action: (token: string) => Promise<T>): Promise<T>;
};

/**
 * Product-shell adapter only: it reads existing bootstrap, work-version,
 * connection and Tianyi projections. Session, Agent, Provider and Canon
 * ownership remain in their established runtime ports.
 */
export function TianyanShellRuntime() {
  const storageProvider = useRef(new LocalFolderProvider()).current;
  const [project, setProject] = useState<StoryStudioProject | null>(null);
  const [workVersionLabel, setWorkVersionLabel] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<TianyanShellRuntimeState["connectionState"]>("loading");
  const [modelStatus, setModelStatus] = useState<ModelServiceStatus | null>(null);
  const [permissionState, setPermissionState] = useState<AgentPermissionState | null>(null);
  const [sharedSessionId, setSharedSessionId] = useState<string | null>(null);
  const [sharedDraft, setSharedDraft] = useState("");

  const withConnection = useCallback(<T,>(action: (token: string) => Promise<T>) => storageProvider.withWriteAccess(action), [storageProvider]);

  useEffect(() => {
    let active = true;
    void getBootstrap().then(async (bootstrap) => {
      if (!active) return;
      const activeProject = bootstrap.activeProject;
      setProject(activeProject);
      if (!activeProject) {
        setSharedSessionId(null);
        setWorkVersionLabel(null);
        setConnectionState("ready");
        return;
      }
      setSharedSessionId(window.sessionStorage.getItem(tianyiShellSessionStorageKey(activeProject.id)));
      const [versionResult, runtimeResult] = await Promise.allSettled([
        getCreationSourcePortState({ projectId: activeProject.id }),
        withConnection(async (token) => Promise.all([
          getModelServiceStatus(token),
          getAgentPermissionState(activeProject.id)
        ]))
      ]);
      if (!active) return;
      if (versionResult.status === "fulfilled") {
        const root = versionResult.value.root;
        setWorkVersionLabel(root ? `${root.name} · r${root.revision}` : null);
      }
      if (runtimeResult.status === "fulfilled") {
        setModelStatus(runtimeResult.value[0]);
        setPermissionState(runtimeResult.value[1]);
        setConnectionState("ready");
      } else {
        setConnectionState("unavailable");
      }
    }).catch(() => {
      if (active) setConnectionState("unavailable");
    });
    return () => { active = false; };
  }, [withConnection]);

  const persistSharedSessionId = useCallback((sessionId: string | null) => {
    setSharedSessionId(sessionId);
    if (!project) return;
    const key = tianyiShellSessionStorageKey(project.id);
    if (sessionId) window.sessionStorage.setItem(key, sessionId);
    else window.sessionStorage.removeItem(key);
  }, [project]);

  const setPermissionProfile = useCallback(async (profile: AgentPermissionProfile) => {
    if (!project) throw new Error("No active project.");
    const next = await withConnection((token) => setAgentPermissionProfile({ projectId: project.id, profile, token }));
    setPermissionState(next);
  }, [project, withConnection]);

  const runtime = useMemo<TianyanShellRuntimeState>(() => ({
    project,
    workVersionLabel,
    connectionState,
    modelStatus,
    permissionState,
    sharedSessionId,
    sharedDraft,
    setSharedSessionId: persistSharedSessionId,
    setSharedDraft,
    setPermissionProfile,
    withConnection
  }), [connectionState, modelStatus, permissionState, persistSharedSessionId, project, setPermissionProfile, sharedDraft, sharedSessionId, withConnection, workVersionLabel]);

  return <TianyanR0Shell runtime={runtime} />;
}
