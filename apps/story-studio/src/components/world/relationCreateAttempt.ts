export type RelationWriteAttempt = {
  fingerprint: string;
  typeOperationId: string;
  candidateOperationId: string;
  createdTypeId: string | null;
};

export function relationWriteFingerprint(input: {
  sourceId: string;
  targetId: string;
  direction: string;
  typeChoice: string;
  newTypeLabel: string;
  evidenceMode: string;
  evidenceEventId: string;
}): string {
  return JSON.stringify({
    ...input,
    newTypeLabel: input.newTypeLabel.trim(),
    evidenceEventId: input.evidenceMode === "confirmed-event" ? input.evidenceEventId : ""
  });
}

export function ensureRelationWriteAttempt(current: RelationWriteAttempt | null, fingerprint: string, createId: () => string): RelationWriteAttempt {
  if (current?.fingerprint === fingerprint) return current;
  return {
    fingerprint,
    typeOperationId: `relation-type-create.${createId()}`,
    candidateOperationId: `relation-manual-create.${createId()}`,
    createdTypeId: null
  };
}
