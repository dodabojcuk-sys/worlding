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
import { tianyiComposerDraftStorageKey, readSelectedConversation, retainSelectedConversation, tianyiConversationStorageKey } from "./tianyiShellSessionRecovery";

export type TianyanShellRuntimeState = {
  project: StoryStudioProject | null;
  projects: StoryStudioProject[];
  workVersionLabel: string | null;
  workVersionId: string | null;
  workVersionState?: "loading" | "ready" | "error";
  connectionState: "loading" | "ready" | "unavailable";
  modelStatus: ModelServiceStatus | null;
  permissionState: AgentPermissionState | null;
  tianyiConversationId: string | null;
  creativeComposerDraft: string;
  workComposerDraft: string;
  workScope: "current-story" | "current-unit" | "selected-events";
  activeTianyiCandidateId: string | null;
  activePageAgentRunId: string | null;
  pageAgentTaskDraft: string;
  sharedTianyiReferences: Array<{ id: string; label: string; kind: "attachment" | "source" | "directory" }>;
  setTianyiConversationId(sessionId: string | null): void;
  setCreativeComposerDraft(value: string): void;
  setWorkComposerDraft(value: string): void;
  setWorkScope(value: "current-story" | "current-unit" | "selected-events"): void;
  setActiveTianyiCandidateId(candidateId: string | null): void;
  setActivePageAgentRunId(runId: string | null): void;
  setPageAgentTaskDraft(value: string): void;
  addSharedTianyiReference(reference: { id: string; label: string; kind: "attachment" | "source" | "directory" }): void;
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
  const [workVersionState, setWorkVersionState] = useState<"loading" | "ready" | "error">("loading");
  const [connectionState, setConnectionState] = useState<TianyanShellRuntimeState["connectionState"]>("loading");
  const [modelStatus, setModelStatus] = useState<ModelServiceStatus | null>(null);
  const [permissionState, setPermissionState] = useState<AgentPermissionState | null>(null);
  const [tianyiConversationId, setTianyiConversationId] = useState<string | null>(null);
  const [creativeComposerDraft, setCreativeComposerDraft] = useState("");
  const [workComposerDraft, setWorkComposerDraft] = useState("");
  const [workScope, setWorkScope] = useState<TianyanShellRuntimeState["workScope"]>("current-story");
  const [activeTianyiCandidateId, setActiveTianyiCandidateId] = useState<string | null>(null);
  const [activePageAgentRunId, setActivePageAgentRunId] = useState<string | null>(null);
  const [pageAgentTaskDraft, setPageAgentTaskDraft] = useState("");
  const [sharedTianyiReferences, setSharedTianyiReferences] = useState<TianyanShellRuntimeState["sharedTianyiReferences"]>([]);
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
        setTianyiConversationId(null);
        setActivePageAgentRunId(null);
        setWorkVersionLabel(null);
        setWorkVersionId(null);
        setWorkVersionState("ready");
        setConnectionState("ready");
        return;
      }
      setCreativeComposerDraft(window.localStorage.getItem(tianyiComposerDraftStorageKey(activeProject.id, "creative", readSelectedConversation(activeProject.id))) ?? "");
      setWorkComposerDraft(window.localStorage.getItem(tianyiComposerDraftStorageKey(activeProject.id, "work", readSelectedConversation(activeProject.id))) ?? "");
      setTianyiConversationId(readSelectedConversation(activeProject.id));
      // A failed version read must not leave a previous project's label attached to
      // the current project. The Shell can still become interactive because this is
      // a read-only status projection, not the connection owner.
      setWorkVersionLabel(null);
      setWorkVersionId(null);
      setWorkVersionState("loading");
      void getCreationSourcePortState({ projectId: activeProject.id }).then((version) => {
        if (!active) return;
        const root = version.root;
        setWorkVersionLabel(root ? `${root.name} · r${root.revision}` : null);
        setWorkVersionId(root?.id ?? null);
        setWorkVersionState("ready");
      }).catch(() => {
        if (!active) return;
        setWorkVersionLabel(null);
        setWorkVersionId(null);
        setWorkVersionState("error");
      });
      // Shell readiness belongs to the storage connection. Provider and
      // permission projections are optional page capabilities: a slow or
      // failed model-status read must not strand map/event navigation in a
      // permanent loading state after storage has already connected.
      void storageProvider.connect().then(() => {
        if (!active) return;
        setConnectionState("ready");
        void withConnection((token) => getModelServiceStatus(token)).then((status) => {
          if (active) setModelStatus(status);
        }).catch(() => {
          if (active) setModelStatus(null);
        });
        void getAgentPermissionState(activeProject.id).then((state) => {
          if (active) setPermissionState(state);
        }).catch(() => {
          if (active) setPermissionState(null);
        });
      }).catch(() => {
        if (active) setConnectionState("unavailable");
      });
    }).catch(() => {
      if (active) setConnectionState("unavailable");
    });
    return () => { active = false; };
  }, [connectionRevision, withConnection]);

  const retryConnection = useCallback(() => setConnectionRevision((revision) => revision + 1), []);

  useEffect(() => {
    const refreshModelServiceProjection = () => retryConnection();
    window.addEventListener("story-studio-model-service-status-changed", refreshModelServiceProjection);
    window.addEventListener("focus", refreshModelServiceProjection);
    return () => {
      window.removeEventListener("story-studio-model-service-status-changed", refreshModelServiceProjection);
      window.removeEventListener("focus", refreshModelServiceProjection);
    };
  }, [retryConnection]);

  const openActiveProject = useCallback(async (projectId: string) => {
    const nextProject = await withConnection((token) => openProject(projectId, token));
    setProject(nextProject);
    setCreativeComposerDraft(window.localStorage.getItem(tianyiComposerDraftStorageKey(nextProject.id, "creative", readSelectedConversation(nextProject.id))) ?? "");
    setWorkComposerDraft(window.localStorage.getItem(tianyiComposerDraftStorageKey(nextProject.id, "work", readSelectedConversation(nextProject.id))) ?? "");
    setTianyiConversationId(readSelectedConversation(nextProject.id));
    setActivePageAgentRunId(null);
    setActiveTianyiCandidateId(null);
    setSharedTianyiReferences([]);
    setWorkVersionLabel(null);
    setWorkVersionId(null);
    setWorkVersionState("loading");
    setModelStatus(null);
    setPermissionState(null);
    setConnectionRevision((revision) => revision + 1);
  }, [withConnection]);

  const createNewProject = useCallback(async (title: string) => {
    const nextProject = await withConnection((token) => createProject({ title, folderSlug: `project-${crypto.randomUUID()}`, token }));
    setProject(nextProject);
    setProjects((current) => [...current, nextProject]);
    setCreativeComposerDraft("");
    setWorkComposerDraft("");
    setTianyiConversationId(null);
    setActivePageAgentRunId(null);
    setActiveTianyiCandidateId(null);
    setSharedTianyiReferences([]);
    setWorkVersionLabel(null);
    setWorkVersionId(null);
    setWorkVersionState("loading");
    setModelStatus(null);
    setPermissionState(null);
    setConnectionRevision((revision) => revision + 1);
  }, [withConnection]);

  const persistTianyiConversationId = useCallback((sessionId: string | null) => {
    setTianyiConversationId(sessionId);
    if (!project) return;
    if (sessionId && !tianyiConversationId) {
      const creativeKey = tianyiComposerDraftStorageKey(project.id, "creative", sessionId);
      const workKey = tianyiComposerDraftStorageKey(project.id, "work", sessionId);
      if (window.localStorage.getItem(creativeKey) === null && creativeComposerDraft) window.localStorage.setItem(creativeKey, creativeComposerDraft);
      if (window.localStorage.getItem(workKey) === null && workComposerDraft) window.localStorage.setItem(workKey, workComposerDraft);
    }
    setCreativeComposerDraft(window.localStorage.getItem(tianyiComposerDraftStorageKey(project.id, "creative", sessionId)) ?? "");
    setWorkComposerDraft(window.localStorage.getItem(tianyiComposerDraftStorageKey(project.id, "work", sessionId)) ?? "");
    retainSelectedConversation(project.id, sessionId);
  }, [project, tianyiConversationId, creativeComposerDraft, workComposerDraft]);
  const persistComposerDraft = useCallback((lane: "creative" | "work", value: string) => {
    if (!project) return;
    const key = tianyiComposerDraftStorageKey(project.id, lane, tianyiConversationId);
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  }, [project, tianyiConversationId]);
  const persistCreativeComposerDraft = useCallback((value: string) => {
    setCreativeComposerDraft(value);
    persistComposerDraft("creative", value);
  }, [persistComposerDraft]);
  const persistWorkComposerDraft = useCallback((value: string) => {
    setWorkComposerDraft(value);
    persistComposerDraft("work", value);
  }, [persistComposerDraft]);
  const addSharedTianyiReference = useCallback((reference: TianyanShellRuntimeState["sharedTianyiReferences"][number]) => {
    setSharedTianyiReferences((current) => current.some((item) => item.id === reference.id) ? current : [...current, reference]);
  }, []);

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
    workVersionState,
    connectionState,
    modelStatus,
    permissionState,
    tianyiConversationId,
    creativeComposerDraft,
    workComposerDraft,
    workScope,
    activeTianyiCandidateId,
    activePageAgentRunId,
    pageAgentTaskDraft,
    sharedTianyiReferences,
    setTianyiConversationId: persistTianyiConversationId,
    setCreativeComposerDraft: persistCreativeComposerDraft,
    setWorkComposerDraft: persistWorkComposerDraft,
    setWorkScope,
    setActiveTianyiCandidateId,
    setActivePageAgentRunId,
    setPageAgentTaskDraft,
    addSharedTianyiReference,
    retryConnection,
    openProject: openActiveProject,
    createProject: createNewProject,
    setPermissionProfile,
    withConnection
  }), [activePageAgentRunId, activeTianyiCandidateId, addSharedTianyiReference, connectionState, createNewProject, creativeComposerDraft, modelStatus, openActiveProject, pageAgentTaskDraft, permissionState, persistCreativeComposerDraft, persistTianyiConversationId, persistWorkComposerDraft, project, projects, retryConnection, setPermissionProfile, sharedTianyiReferences, withConnection, workComposerDraft, workScope, workVersionId, workVersionLabel, workVersionState]);

  return <TianyanR0Shell runtime={runtime} />;
}
