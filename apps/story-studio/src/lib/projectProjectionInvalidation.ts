export type ProjectProjectionInvalidationMode = "none" | "boundary" | "completion";

const immediateOwnerWritePaths = [
  /^\/storage\/import$/u,
  /^\/agent-recognition\/proposals\/(?:confirm|merge)$/u,
  /^\/story-units\/(?:create|update|archive)$/u,
  /^\/narrative-arrangements\/(?:create|insert|move|remove|rollback)$/u,
  /^\/story-collection-points\/(?:create|update|dissolve)$/u,
  /^\/author-control\/(?:change-set\/apply|prediction-review\/accept)$/u,
  /^\/nuwa-n1\/(?:auto-apply|auto-rollback)$/u,
  /^\/world-objects\/(?:create|open|close|agent-type|update|duplicate|archive|restore|bulk|move-to-folder|delete)$/u,
  /^\/character-templates\/apply$/u,
  /^\/characters\/create$/u,
  /^\/library\/import-text$/u,
  /^\/source-import\/handoff$/u,
  /^\/r9a-recovery\/backups\/restore$/u,
  /^\/planning-events\/(?:create|abandon|pause|resume)$/u,
  /^\/timeline\/planning-event\/(?:create-and-add|add-existing)$/u,
  /^\/tianyi-agent\/story-intake\/batch\/(?:confirm|undo)$/u
];

/** Only writes that can change World Library or Story Unit projections fence those reads. */
export function projectProjectionInvalidationMode(pathname: string, method: string): ProjectProjectionInvalidationMode {
  if (method !== "POST") return "none";
  const localPath = pathname.replace(/^\/__local\/story-studio/u, "");
  if (localPath === "/nuwa-n1/continuous") return "completion";
  return immediateOwnerWritePaths.some((pattern) => pattern.test(localPath)) ? "boundary" : "none";
}
