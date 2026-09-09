export type DirectoryReadDiagnostic = {
  sequence: number;
  at: number;
  phase: string;
  projectId: string | null;
  readId?: string;
  effectId?: string;
  endpoint?: "world-library" | "story-units";
  status?: number;
  outcome?: "ready" | "empty" | "failed" | "cancelled" | "discarded" | "loading";
  responseProjectId?: string | null;
  objectCount?: number;
  unitCount?: number;
  classifiedCount?: number;
  reason?: string;
  durationMs?: number;
};

type DirectoryDiagnosticWindow = Window & {
  __tianyanDirectoryReadTrace?: DirectoryReadDiagnostic[];
};

let diagnosticSequence = 0;

export function directoryReadDiagnosticsEnabled(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("directoryTrace") === "1";
}

/**
 * Bounded, opt-in diagnostics for the directory read projection. Entries contain
 * only project references, counts, status and timing; never story text, bodies,
 * credentials, cookies, tokens or attachments.
 */
export function recordDirectoryReadDiagnostic(input: Omit<DirectoryReadDiagnostic, "sequence" | "at">): void {
  if (!directoryReadDiagnosticsEnabled()) return;
  const target = window as DirectoryDiagnosticWindow;
  const trace = target.__tianyanDirectoryReadTrace ?? [];
  trace.push({ sequence: ++diagnosticSequence, at: Math.round(performance.now()), ...input });
  if (trace.length > 300) trace.splice(0, trace.length - 300);
  target.__tianyanDirectoryReadTrace = trace;
}
