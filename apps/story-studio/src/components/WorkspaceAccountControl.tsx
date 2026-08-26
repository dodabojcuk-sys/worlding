import { CircleUserRound } from "lucide-react";

export type WorkspaceAccountPresentation = {
  displayName: string;
  detail: string;
  avatarUrl?: string | null;
};

/**
 * Present-only local identity status. It intentionally owns no account action.
 */
export function WorkspaceAccountControl(props: {
  account: WorkspaceAccountPresentation;
  collapsed?: boolean;
}) {
  return <div className={`workspace-account-control ${props.collapsed ? "is-collapsed" : ""}`}>
    <div className="workspace-local-identity" data-testid="local-identity-status" aria-label="本地身份">
      <span className="workspace-account-avatar">
        {props.account.avatarUrl ? <img src={props.account.avatarUrl} alt="" /> : <CircleUserRound />}
      </span>
      <span className="workspace-account-copy"><strong>{props.account.displayName}</strong><small>{props.account.detail}</small><em>本地身份</em></span>
    </div>
  </div>;
}
