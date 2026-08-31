import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getAgentPermissionState,
  getBootstrap,
  createProject,
  getCreationSourcePortState,
  getModelServiceStatus,
  openProject,
  setAgentPermissionProfile,
  type AgentPermissionProfile,
  type AgentPermissionState,
  type ModelServiceStatus,
  type StoryStudioProject
} from "../../lib/localTransport";
import { LocalFolderProvider } from "../../lib/storageProvider";
import { TianyanR0Shell } from "../TianyanR0Shell";
import { tianyiAgentSessionStorageKey, tianyiDialogueSessionStorageKey } from "./tianyiShellSessionRecovery";

export type TianyanShellRuntimeState = {
  project: StoryStudioProject | null;
  projects: StoryStudioProject[];
  workVersionLabel: string | null;
  workVersionId: string | null;
  connectionState: "loading" | "ready" | "unavailable";
  modelStatus: ModelServiceStatus | null;
  permissionState: AgentPermissionState | null;
  dialogueSessionId: string | null;
  dialogueComposerDraft: string;
  agentSessionId: string | null;
  activeAgentRunId: string | null;
  agentTaskDraft: string;
  setDialogueSessionId(sessionId: string | null): void;
  setDialogueComposerDraft(value: string): void;
  setAgentSessionId(sessionId: string | null): void;
  setActiveAgentRunId(runId: string | null): void;
  setAgentTaskDraft(value: string): void;
  retryConnection(): void;
  openProject(projectId: string): Promise<void>;
  createProject(title: string): Promise<void>;
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
  const [projects, setProjects] = useState<StoryStudioProject[]>([]);
  const [workVersionLabel, setWorkVersionLabel] = useState<string | null>(null);
  const [workVersionId, setWorkVersionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<TianyanShellRuntimeState["connectionState"]>("loading");
  const [modelStatus, setModelStatus] = useState<ModelServiceStatus | null>(null);
  const [permissionState, setPermissionState] = useState<AgentPermissionState | null>(null);
  const [dialogueSessionId, setDialogueSessionId] = useState<string | null>(null);
  const [dialogueComposerDraft, setDialogueComposerDraft] = useState("");
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [activeAgentRunId, setActiveAgentRunId] = useState<string | null>(null);
  const [agentTaskDraft, setAgentTaskDraft] = useState("");
  const [connectionRevision, setConnectionRevision] = useState(0);

  const withConnection = useCallback(<T,>(action: (token: string) => Promise<T>) => storageProvider.withWriteAccess(action), [storageProvider]);

  useEffect(() => {
    let active = true;
    setConnectionState("loading");
    void getBootstrap().then(async (bootstrap) => {
      if (!active) return;
      const activeProject = bootstrap.activeProject;
      setProjects(bootstrap.projects);
      setProject(activeProject);
      if (!activeProject) {
        setDialogueSessionId(null);
        setAgentSessionId(null);
        setActiveAgentRunId(null);
        setWorkVersionLabel(null);
        setWorkVersionId(null);
        setConnectionState("ready");
        return;
      }
      setDialogueSessionId(window.sessionStorage.getItem(tianyiDialogueSessionStorageKey(activeProject.id)));
      setAgentSessionId(window.sessionStorage.getItem(tianyiAgentSessionStorageKey(activeProject.id)));
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
        setWorkVersionId(root?.id ?? null);
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
  }, [connectionRevision, withConnection]);

  const retryConnection = useCallback(() => setConnectionRevision((revision) => revision + 1), []);

  const openActiveProject = useCallback(async (projectId: string) => {
    const nextProject = await withConnection((token) => openProject(projectId, token));
    setProject(nextProject);
    setDialogueSessionId(window.sessionStorage.getItem(tianyiDialogueSessionStorageKey(nextProject.id)));
    setAgentSessionId(window.sessionStorage.getItem(tianyiAgentSessionStorageKey(nextProject.id)));
    setActiveAgentRunId(null);
    setWorkVersionLabel(null);
    setWorkVersionId(null);
    setModelStatus(null);
    setPermissionState(null);
    setConnectionRevision((revision) => revision + 1);
  }, [withConnection]);

  const createNewProject = useCallback(async (title: string) => {
    const nextProject = await withConnection((token) => createProject({ title, folderSlug: `project-${crypto.randomUUID()}`, token }));
    setProject(nextProject);
    setProjects((current) => [...current, nextProject]);
    setDialogueSessionId(null);
    setAgentSessionId(null);
    setActiveAgentRunId(null);
    setWorkVersionLabel(null);
    setWorkVersionId(null);
    setModelStatus(null);
    setPermissionState(null);
    setConnectionRevision((revision) => revision + 1);
  }, [withConnection]);

  const persistModeSessionId = useCallback((mode: "dialogue" | "agent", sessionId: string | null) => {
    if (mode === "dialogue") setDialogueSessionId(sessionId);
    else setAgentSessionId(sessionId);
    if (!project) return;
    const key = mode === "dialogue" ? tianyiDialogueSessionStorageKey(project.id) : tianyiAgentSessionStorageKey(project.id);
    if (sessionId) window.sessionStorage.setItem(key, sessionId);
    else window.sessionStorage.removeItem(key);
  }, [project]);
  const persistDialogueSessionId = useCallback((sessionId: string | null) => persistModeSessionId("dialogue", sessionId), [persistModeSessionId]);
  const persistAgentSessionId = useCallback((sessionId: string | null) => persistModeSessionId("agent", sessionId), [persistModeSessionId]);

  const setPermissionProfile = useCallback(async (profile: AgentPermissionProfile) => {
    if (!project) throw new Error("No active project.");
    const next = await withConnection((token) => setAgentPermissionProfile({ projectId: project.id, profile, token }));
    setPermissionState(next);
  }, [project, withConnection]);

  const runtime = useMemo<TianyanShellRuntimeState>(() => ({
    project,
    projects,
    workVersionLabel,
    workVersionId,
    connectionState,
    modelStatus,
    permissionState,
    dialogueSessionId,
    dialogueComposerDraft,
    agentSessionId,
    activeAgentRunId,
    agentTaskDraft,
    setDialogueSessionId: persistDialogueSessionId,
    setDialogueComposerDraft,
    setAgentSessionId: persistAgentSessionId,
    setActiveAgentRunId,
    setAgentTaskDraft,
    retryConnection,
    openProject: openActiveProject,
    createProject: createNewProject,
    setPermissionProfile,
    withConnection
  }), [activeAgentRunId, agentSessionId, agentTaskDraft, connectionState, createNewProject, dialogueComposerDraft, dialogueSessionId, modelStatus, openActiveProject, permissionState, persistAgentSessionId, persistDialogueSessionId, project, projects, retryConnection, setPermissionProfile, withConnection, workVersionId, workVersionLabel]);

  return <TianyanR0Shell runtime={runtime} />;
}
