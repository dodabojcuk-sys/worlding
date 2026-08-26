import type { ComponentProps } from "react";

import { TianyiQuickAssistant } from "../components/TianyiQuickAssistant";

/** The only App Shell host for the contextual Tianyi Dock. Page workspaces
 * supply context through props but never mount their own assistant surface. */
export function GlobalTianyiDockHost(props: ComponentProps<typeof TianyiQuickAssistant>) {
  return <div className="global-tianyi-dock-host" data-global-tianyi-dock-host="true"><TianyiQuickAssistant {...props} /></div>;
}
