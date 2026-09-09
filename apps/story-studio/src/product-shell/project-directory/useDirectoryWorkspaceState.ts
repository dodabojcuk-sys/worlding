import { useCallback, useEffect, useRef, useState } from "react";

import {
  readDirectoryWorkspaceState,
  writeDirectoryWorkspaceState,
  type DirectoryWorkspaceState
} from "./directoryWorkspaceState";

/**
 * Owns the project-scoped directory preference and browsing state.  The Shell
 * only consumes this projection and asks the directory owner to transition it.
 */
export function useDirectoryWorkspaceState(projectId: string | null, fallbackOpen: boolean) {
  const projectIdRef = useRef(projectId);
  const [state, setState] = useState<DirectoryWorkspaceState>(() => readDirectoryWorkspaceState(projectId, fallbackOpen));
  const stateRef = useRef(state);

  const updateState = useCallback((next: DirectoryWorkspaceState) => {
    stateRef.current = next;
    setState(next);
    writeDirectoryWorkspaceState(projectIdRef.current, next);
  }, []);

  const setPreferredOpen = useCallback((preferredOpen: boolean) => {
    updateState({ ...stateRef.current, preferredOpen });
  }, [updateState]);

  useEffect(() => {
    if (projectIdRef.current === projectId) return;
    writeDirectoryWorkspaceState(projectIdRef.current, stateRef.current);
    projectIdRef.current = projectId;
    const next = readDirectoryWorkspaceState(projectId, fallbackOpen);
    stateRef.current = next;
    setState(next);
  }, [fallbackOpen, projectId]);

  return {
    state,
    stateReady: projectIdRef.current === projectId,
    updateState,
    setPreferredOpen
  };
}
