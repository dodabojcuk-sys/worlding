export const TIANYI_CHECKPOINT_C_VERSION = "story-studio-tianyi-context-companion-v1-checkpoint-c" as const;

export const TIANYI_CHECKPOINT_C_OPERATIONS = [
  "identity",
  "project-resume",
  "context-question",
  "receipt-read",
  "session-lifecycle",
  "memory-candidate-review",
  "memory-candidate-decision",
  "memory-lifecycle",
  "global-memory-grants",
  "session-events",
  "stopping-points",
  "tombstones",
  "pack-export",
  "pack-read-only-staging"
] as const;

export const TIANYI_CHECKPOINT_C_ARTIFACTS = [
  "companion-panel",
  "current-view",
  "memory-view",
  "history-view",
  "receipt-inspector",
  "server-routes",
  "local-transport",
  "feature-smoke",
  "capture-results",
  "contact-sheet",
  "feature-report",
  "package-script"
] as const;

const ROOT_FIELDS = [
  "version",
  "uiIntegrationComplete",
  "desktopCoveragePassed",
  "mobileCoveragePassed",
  "reactDirectRepositoryImportCount",
  "prohibitedCapabilityCount",
  "checkpointARegressionPassed",
  "checkpointBRegressionPassed",
  "productOperations",
  "artifacts"
] as const;

export function reduceTianyiCheckpointC(value: unknown): boolean {
  if (!plainExact(value, ROOT_FIELDS)) return false;
  const input = value as Record<string, unknown>;
  if (input.version !== TIANYI_CHECKPOINT_C_VERSION) return false;
  if (input.uiIntegrationComplete !== true || input.desktopCoveragePassed !== true || input.mobileCoveragePassed !== true) return false;
  if (input.reactDirectRepositoryImportCount !== 0 || input.prohibitedCapabilityCount !== 0) return false;
  if (input.checkpointARegressionPassed !== true || input.checkpointBRegressionPassed !== true) return false;
  return exactBooleanRecord(input.productOperations, TIANYI_CHECKPOINT_C_OPERATIONS)
    && exactBooleanRecord(input.artifacts, TIANYI_CHECKPOINT_C_ARTIFACTS);
}

function exactBooleanRecord(value: unknown, keys: readonly string[]): boolean {
  if (!plainExact(value, keys)) return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => record[key] === true);
}

function plainExact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
