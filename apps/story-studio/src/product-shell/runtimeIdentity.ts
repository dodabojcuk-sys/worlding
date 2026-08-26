export type RuntimeIdentity = Readonly<{
  head: string;
  branch: string;
  previewPort: string;
  buildTime: string;
  providerMode: string;
}>;

type RuntimeIdentityEnvironment = Readonly<{
  dev: boolean;
  search: string;
  rawIdentity: string | undefined;
}>;

/** Resolves an opt-in local-preview marker without exposing a filesystem root. */
export function resolveRuntimeIdentity(environment: RuntimeIdentityEnvironment): RuntimeIdentity | null {
  if (!environment.dev || !new URLSearchParams(environment.search).has("runtimeIdentity") || !environment.rawIdentity) return null;

  try {
    const parsed: unknown = JSON.parse(environment.rawIdentity);
    if (!parsed || typeof parsed !== "object") return null;
    const identity = parsed as Record<string, unknown>;
    const fields = ["head", "branch", "previewPort", "buildTime", "providerMode"] as const;
    if (!fields.every((field) => typeof identity[field] === "string" && identity[field].trim().length > 0)) return null;
    return {
      head: identity.head as string,
      branch: identity.branch as string,
      previewPort: identity.previewPort as string,
      buildTime: identity.buildTime as string,
      providerMode: identity.providerMode as string
    };
  } catch {
    return null;
  }
}
