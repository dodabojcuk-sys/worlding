import { BookOpenText } from "lucide-react";

export interface ProductShellIdentityProps {
  contextTitle: string;
  contextDetail: string;
}

/**
 * Shared, stateless shell identity. Context labels are display-only and never
 * participate in route, workspace, or persistence state.
 */
export function ProductShellIdentity(props: ProductShellIdentityProps) {
  return <div className="product-shell-identity" data-testid="product-shell-identity">
    <span className="brand-glyph" aria-hidden="true">衍</span>
    <span className="product-shell-brand-copy">
      <strong>Story Studio</strong>
      <small>天衍故事工作室</small>
    </span>
    <span className="product-shell-context-copy">
      <BookOpenText aria-hidden="true" />
      <span>
        <strong>{props.contextTitle}</strong>
        <small>{props.contextDetail}</small>
      </span>
    </span>
  </div>;
}
