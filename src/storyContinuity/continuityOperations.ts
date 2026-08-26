export type IndependentContinuityOperation<T> = {
  owner: string;
  run(): Promise<T>;
};

export type IndependentContinuityOperationResult<T> =
  | { owner: string; ok: true; result: T }
  | { owner: string; ok: false; errorCode: string; message: string };

/**
 * Runs owner writes independently and reports partial success without rollback.
 * A completed owner is never deleted to simulate a cross-owner transaction.
 */
export async function runIndependentContinuityOperations<T>(operations: Array<IndependentContinuityOperation<T>>): Promise<Array<IndependentContinuityOperationResult<T>>> {
  const seen = new Set<string>();
  const results: Array<IndependentContinuityOperationResult<T>> = [];
  for (const operation of operations) {
    if (!operation.owner || seen.has(operation.owner)) throw new Error("Independent continuity operation owners must be unique.");
    seen.add(operation.owner);
    try {
      results.push({ owner: operation.owner, ok: true, result: await operation.run() });
    } catch (error) {
      results.push({
        owner: operation.owner,
        ok: false,
        errorCode: error instanceof Error && "code" in error ? String(error.code) : "continuity-operation-failed",
        message: error instanceof Error ? sanitizeError(error.message) : "Continuity operation failed."
      });
    }
  }
  return results;
}

function sanitizeError(message: string): string {
  return message
    .replace(/(?:\/[A-Za-z0-9._ -]+){2,}/gu, "[local path]")
    .replace(/(?:token|authorization)\s*[:=]\s*\S+/giu, "[redacted]")
    .slice(0, 240);
}
