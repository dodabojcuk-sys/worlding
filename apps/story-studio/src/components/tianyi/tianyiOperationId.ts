export function createTianyiOperationId(kind: string, nonce = crypto.randomUUID()): string {
  const safeKind = kind.toLowerCase().replace(/[^a-z0-9.-]/gu, "-");
  return `operation.${safeKind}.${nonce.toLowerCase()}`;
}

export function createTianyiSubmissionId(nonce = crypto.randomUUID()): string {
  return `submission.${nonce.toLowerCase()}`;
}

export function createTianyiSelectionRef(nonce = crypto.randomUUID()): string {
  return `selection.${nonce.toLowerCase()}`;
}
