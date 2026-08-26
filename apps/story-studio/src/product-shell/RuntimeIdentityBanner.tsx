import { resolveRuntimeIdentity } from "./runtimeIdentity";

export function RuntimeIdentityBanner() {
  const identity = resolveRuntimeIdentity({
    dev: import.meta.env.DEV,
    search: window.location.search,
    rawIdentity: import.meta.env.VITE_STORY_STUDIO_RUNTIME_IDENTITY
  });
  if (!identity) return null;

  return <aside className="runtime-identity-banner" data-testid="runtime-identity" aria-label="本地预览运行身份">
    <strong>LOCAL PREVIEW</strong>
    <span>HEAD {identity.head.slice(0, 7)}</span>
    <span>{identity.branch}</span>
    <span>:{identity.previewPort}</span>
    <span>{identity.providerMode}</span>
    <time dateTime={identity.buildTime}>{identity.buildTime}</time>
  </aside>;
}
