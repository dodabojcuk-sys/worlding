export type CharacterHistoryOwner = "markdown" | "presentation";

export type CharacterHistoryRevision = {
  id: string;
  sequence: number;
  source: "create" | "save" | "restore" | "external-baseline";
  recordedAt: string;
  restoredFromRevisionId: string | null;
  operationId?: string | null;
};

export type CharacterHistoryLedger = {
  revisions: CharacterHistoryRevision[];
  milestones: Array<{ id: string; title: string; revisionId: string; sequence: number }>;
};

export type CharacterCardHistoryAction = {
  id: string;
  operationId: string | null;
  recordedAt: string;
  entries: Array<{
    owner: CharacterHistoryOwner;
    revision: CharacterHistoryRevision;
    milestoneTitles: string[];
    summary: string;
  }>;
};

export function alignCharacterCardHistory(input: { markdown: CharacterHistoryLedger; presentation: CharacterHistoryLedger }): CharacterCardHistoryAction[] {
  const actions = new Map<string, CharacterCardHistoryAction>();
  for (const [owner, ledger] of [["markdown", input.markdown], ["presentation", input.presentation]] as const) {
    for (const revision of ledger.revisions) {
      const operationId = revision.operationId || null;
      const key = operationId ? `operation:${operationId}` : `${owner}:${revision.id}`;
      const current = actions.get(key) || { id: key, operationId, recordedAt: revision.recordedAt, entries: [] };
      current.recordedAt = latestIsoTime(current.recordedAt, revision.recordedAt);
      current.entries.push({
        owner,
        revision,
        milestoneTitles: ledger.milestones.filter((milestone) => milestone.revisionId === revision.id).map((milestone) => milestone.title),
        summary: revisionSummary(owner, revision.source)
      });
      actions.set(key, current);
    }
  }
  return [...actions.values()]
    .map((action) => ({ ...action, entries: [...action.entries].sort((left, right) => ownerOrder(left.owner) - ownerOrder(right.owner)) }))
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || left.id.localeCompare(right.id));
}

function revisionSummary(owner: CharacterHistoryOwner, source: CharacterHistoryRevision["source"]): string {
  if (source === "create") return owner === "markdown" ? "创建人物内容" : "创建卡片构成";
  if (source === "restore") return owner === "markdown" ? "恢复人物内容（追加新版本）" : "恢复卡片构成（追加新版本）";
  if (source === "external-baseline") return owner === "markdown" ? "记录外部人物内容基线" : "记录外部卡片构成基线";
  return owner === "markdown" ? "更新人物内容" : "更新卡片构成";
}

function ownerOrder(owner: CharacterHistoryOwner): number {
  return owner === "markdown" ? 0 : 1;
}

function latestIsoTime(left: string, right: string): string {
  return left.localeCompare(right) >= 0 ? left : right;
}
