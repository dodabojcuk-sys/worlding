/** Active workspaces may cancel an in-app route change while a task is pending. */
export const WORKSPACE_NAVIGATION_REQUEST = "story-studio-workspace-navigation-request";

export function requestWorkspaceNavigation(): boolean {
  return window.dispatchEvent(new Event(WORKSPACE_NAVIGATION_REQUEST, { cancelable: true }));
}
