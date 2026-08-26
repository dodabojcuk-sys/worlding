export const LOCAL_DIAGNOSTIC_VERSION = "tianyan-diagnostic-event/v1" as const;
export const LOCAL_DIAGNOSTIC_STORAGE_KEY = "story-studio:diagnostics:v1";
export const LOCAL_DIAGNOSTIC_MAX_BYTES = 20 * 1024 * 1024;
export const LOCAL_DIAGNOSTIC_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type DiagnosticCategory =
  | "navigation"
  | "user-action"
  | "request"
  | "persistence"
  | "provider"
  | "author-control"
  | "nuwa"
  | "exception"
  | "render"
  | "slow-operation";

export type DiagnosticScalar = string | number | boolean | null;
export type DiagnosticValue = DiagnosticScalar | DiagnosticValue[] | { [key: string]: DiagnosticValue };
export interface DiagnosticMetadata { [key: string]: DiagnosticValue; }

export type DiagnosticEvent = {
  version: typeof LOCAL_DIAGNOSTIC_VERSION;
  id: string;
  recordedAt: string;
  category: DiagnosticCategory;
  route: string | null;
  errorCode?: string;
  traceId?: string | null;
  sessionId?: string | null;
  runId?: string | null;
  summary: string;
  metadata: DiagnosticMetadata;
};

export type DiagnosticContext = {
  appVersion: string;
  branch: string;
  head: string;
  tree: string;
  browser: string;
  runtime: string;
  route: string | null;
  persistenceHealth: "healthy" | "degraded" | "unknown";
  ownerHashes: Record<string, string>;
};

export type DiagnosticStorage = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>;

export type LocalDiagnosticService = {
  list(): DiagnosticEvent[];
  record(input: Omit<DiagnosticEvent, "version" | "id" | "recordedAt" | "metadata"> & { metadata?: unknown }): DiagnosticEvent;
  clear(): void;
  exportPackage(context: DiagnosticContext): { version: typeof LOCAL_DIAGNOSTIC_VERSION; exportedAt: string; context: DiagnosticContext; events: DiagnosticEvent[] };
  summary(context: DiagnosticContext): string;
};

const SENSITIVE_KEY = /(prompt|prose|content|body|text|excerpt|sourceText|raw|token|secret|api.?key|cookie|authorization|password|credential|header)/iu;
const MAX_SUMMARY_LENGTH = 240;

function redact(value: unknown, key = ""): DiagnosticValue {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" ? value.slice(0, MAX_SUMMARY_LENGTH) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => redact(item, key));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 64).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  return "[REDACTED]";
}

export function redactDiagnosticMetadata(value: unknown): DiagnosticMetadata {
  const result = redact(value, "metadata");
  return result && !Array.isArray(result) && typeof result === "object" ? result as DiagnosticMetadata : {};
}

function newId(now: string): string {
  const random = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `diag.${now.replace(/[^0-9]/gu, "").slice(-14)}.${random}`;
}

function safeParse(storage: DiagnosticStorage | null | undefined): DiagnosticEvent[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_DIAGNOSTIC_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DiagnosticEvent => Boolean(item && typeof item === "object" && (item as DiagnosticEvent).version === LOCAL_DIAGNOSTIC_VERSION));
  } catch {
    return [];
  }
}

export function createLocalDiagnosticService(options: { storage?: DiagnosticStorage | null; now?: () => Date; maxBytes?: number; retentionMs?: number } = {}): LocalDiagnosticService {
  const storage = options.storage || null;
  const now = options.now || (() => new Date());
  const maxBytes = Math.max(1024, options.maxBytes || LOCAL_DIAGNOSTIC_MAX_BYTES);
  const retentionMs = Math.max(60_000, options.retentionMs || LOCAL_DIAGNOSTIC_RETENTION_MS);
  let events = safeParse(storage);

  const persist = () => {
    events = events.filter((event) => now().getTime() - Date.parse(event.recordedAt) <= retentionMs);
    while (events.length && JSON.stringify(events).length > maxBytes) events.shift();
    try {
      if (storage) storage.setItem(LOCAL_DIAGNOSTIC_STORAGE_KEY, JSON.stringify(events));
    } catch {
      // Diagnostics are best effort and must never break product work.
    }
  };

  return {
    list: () => events.slice(),
    record: (input) => {
      const recordedAt = now().toISOString();
      const event: DiagnosticEvent = {
        version: LOCAL_DIAGNOSTIC_VERSION,
        id: newId(recordedAt),
        recordedAt,
        category: input.category,
        route: input.route || null,
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.runId !== undefined ? { runId: input.runId } : {}),
        summary: String(input.summary || "诊断事件").slice(0, MAX_SUMMARY_LENGTH),
        metadata: redactDiagnosticMetadata(input.metadata || {})
      };
      events = [...events, event];
      persist();
      return event;
    },
    clear: () => {
      events = [];
      try { storage?.removeItem?.(LOCAL_DIAGNOSTIC_STORAGE_KEY); } catch { /* best effort */ }
    },
    exportPackage: (context) => ({
      version: LOCAL_DIAGNOSTIC_VERSION,
      exportedAt: now().toISOString(),
      context: redactDiagnosticMetadata(context) as DiagnosticContext,
      events: events.slice()
    }),
    summary: (context) => JSON.stringify({
      version: LOCAL_DIAGNOSTIC_VERSION,
      exportedAt: now().toISOString(),
      context: redactDiagnosticMetadata(context),
      recentEvents: events.slice(-20)
    }, null, 2)
  };
}
