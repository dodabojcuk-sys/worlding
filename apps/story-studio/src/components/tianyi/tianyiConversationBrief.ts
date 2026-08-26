import type {
  ExecutionBriefChanges,
  TianyiContextRequest,
  TianyiNuwaExecutionBrief,
  TianyiSessionMetadata,
  TianyiVisibleMessage
} from "../../lib/localTransport";

export type TianyiV2CloseCategory = "author-decision" | "open-question" | "source-candidate" | "story-candidate" | "nuwa-question";
export type TianyiV2CloseDecision = "pending" | "accepted" | "edited" | "rejected" | "deferred";

export type TianyiV2CloseItem = {
  id: string;
  category: TianyiV2CloseCategory;
  label: string;
  content: string;
  editedContent: string | null;
  decision: TianyiV2CloseDecision;
  sourceReceiptIds: string[];
};

/**
 * The Thread-first review keeps this object in component state only. It is a
 * writer-facing editing surface over the existing Execution Brief contract;
 * it never becomes a new Session, Decision, or persistence schema.
 */
export type TianyiThreadBriefDraft = {
  authorGoal: string;
  mustKeep: string;
  mustAvoid: string;
  openQuestions: string;
  nuwaQuestion: string;
  includeCurrentSources: boolean;
  pinnedSourceReceiptIds: string[];
  omittedItems: Array<Pick<TianyiV2CloseItem, "category" | "label" | "content">>;
};

export type TianyiThreadGroup = { author: TianyiVisibleMessage | null; suggestions: TianyiVisibleMessage[] };

export function buildTianyiThreadProjection(messages: TianyiVisibleMessage[]): TianyiThreadGroup[] {
  const groups: TianyiThreadGroup[] = [];
  for (const message of [...messages].sort((left, right) => left.sequence - right.sequence)) {
    if (message.actor === "author") {
      groups.push({ author: message, suggestions: [] });
      continue;
    }
    const latest = groups.at(-1);
    if (latest) latest.suggestions.push(message);
    else groups.push({ author: null, suggestions: [message] });
  }
  return groups;
}

const CATEGORY_LABELS: Record<TianyiV2CloseCategory, string> = {
  "author-decision": "作者决定",
  "open-question": "开放问题",
  "source-candidate": "资料候选",
  "story-candidate": "故事规划候选",
  "nuwa-question": "女娲验证问题"
};

/**
 * A bounded preview projection. It intentionally extracts no semantic truth;
 * it only gives the Founder Loop a stable review surface over visible Session
 * messages and existing receipt references.
 */
export function deriveTianyiV2CloseProjection(session: TianyiSessionMetadata): TianyiV2CloseItem[] {
  const authors = session.visibleMessages.filter((message) => message.actor === "author");
  const lastAuthor = authors.at(-1)?.visibleContent.trim() || "本次记录尚未形成作者决定。";
  const firstAuthor = authors[0]?.visibleContent.trim() || lastAuthor;
  const question = [...authors].reverse().find((message) => /[?？]/u.test(message.visibleContent))?.visibleContent.trim()
    || "本次记录尚未明确的问题。";
  const receiptIds = [...new Set(session.visibleMessages.map((message) => message.receiptId).filter((value): value is string => Boolean(value)))];
  const sourceContent = receiptIds.length
    ? `可供作者核对的已有来源：${receiptIds.length} 份`
    : "当前没有可直接引用的已有来源；请先选择已授权来源。";
  const storyContent = `从作者记录提取的待验证故事方向：${lastAuthor}`;
  const nuwaContent = `验证：${question}`;
  return [
    makeItem(session.id, "author-decision", firstAuthor, receiptIds),
    makeItem(session.id, "open-question", question, receiptIds),
    makeItem(session.id, "source-candidate", sourceContent, receiptIds),
    makeItem(session.id, "story-candidate", storyContent, receiptIds),
    makeItem(session.id, "nuwa-question", nuwaContent, receiptIds)
  ];
}

function makeItem(sessionId: string, category: TianyiV2CloseCategory, content: string, sourceReceiptIds: string[]): TianyiV2CloseItem {
  return {
    id: `tianyi-v2.close.${sessionId}.${category}`,
    category,
    label: CATEGORY_LABELS[category],
    content: content.slice(0, 500),
    editedContent: null,
    decision: "pending",
    sourceReceiptIds
  };
}

function acceptedContent(item: TianyiV2CloseItem): string | null {
  if (item.decision !== "accepted" && item.decision !== "edited") return null;
  const value = item.editedContent?.trim() || item.content.trim();
  return value || null;
}

export function hasDurableTianyiV2CloseDecision(items: readonly TianyiV2CloseItem[]): boolean {
  return items.some((item) => item.decision === "accepted" || item.decision === "edited");
}

export function deriveTianyiThreadBriefDraft(input: {
  session: TianyiSessionMetadata;
  contextRequest: TianyiContextRequest;
  brief: TianyiNuwaExecutionBrief | null;
}): TianyiThreadBriefDraft {
  const projection = deriveTianyiV2CloseProjection(input.session);
  const value = (category: TianyiV2CloseCategory): string => projection.find((item) => item.category === category)?.content || "";
  const brief = input.brief;
  return {
    authorGoal: brief?.authorGoal || value("story-candidate") || value("author-decision"),
    mustKeep: brief?.mustKeep.join("\n") || value("author-decision"),
    mustAvoid: brief?.mustAvoid.join("\n") || "不得自动选择候选路线\n不得自动修改正文或世界资料\n不得自动建立变更单",
    openQuestions: brief?.unresolvedQuestions.filter((question) => question !== value("nuwa-question")).join("\n") || value("open-question"),
    nuwaQuestion: value("nuwa-question"),
    includeCurrentSources: brief
      ? brief.selectedContextReceiptIds.length > 0
      : Boolean(projection.find((item) => item.category === "source-candidate")?.sourceReceiptIds.length),
    pinnedSourceReceiptIds: brief
      ? brief.selectedContextReceiptIds.slice()
      : [...new Set(input.session.visibleMessages.map((message) => message.receiptId).filter((value): value is string => Boolean(value)))],
    // The five deterministic categories are all mapped to existing Brief
    // fields. Any future omission remains local and is intentionally excluded
    // from mapTianyiThreadBriefChanges below.
    omittedItems: []
  };
}

export function mapTianyiThreadBriefChanges(input: {
  session: TianyiSessionMetadata;
  contextRequest: TianyiContextRequest;
  draft: TianyiThreadBriefDraft;
}): ExecutionBriefChanges {
  const sourceReceiptIds = [...new Set(input.session.visibleMessages.map((message) => message.receiptId).filter((value): value is string => Boolean(value)))];
  const authorGoal = input.draft.authorGoal.trim() || input.draft.nuwaQuestion.trim() || "整理本次天意结果并交给女娲验证";
  const unresolvedQuestions = uniqueLines([input.draft.openQuestions, input.draft.nuwaQuestion]);
  return {
    authorGoal,
    currentContext: {
      mode: input.contextRequest.productMode,
      documentId: input.contextRequest.activeOwner.id ?? "",
      objectIds: input.contextRequest.selection.objectId ? [input.contextRequest.selection.objectId] : [],
      selectionRef: `tianyi-v2.${input.session.id}`
    },
    selectedContextReceiptIds: input.draft.includeCurrentSources
      ? [...new Set((input.draft.pinnedSourceReceiptIds.length ? input.draft.pinnedSourceReceiptIds : sourceReceiptIds).filter((receiptId) => sourceReceiptIds.includes(receiptId)))]
      : [],
    selectedArchiveMessageRefs: [],
    approvedMemoryRefs: input.contextRequest.memorySelections.map((memory) => memory.id),
    mustKeep: uniqueLines([input.draft.mustKeep]),
    mustAvoid: uniqueLines([input.draft.mustAvoid]),
    unresolvedQuestions,
    expectedOutputKind: "candidate-routes",
    allowedAgents: ["nuwa.supervisor", "nuwa.causality", "nuwa.tension", "nuwa.evidence-critic"],
    allowedSkills: ["story-memory-recall@1.0.0"],
    capabilityBudget: { maxAgentRuns: 3, maxSkillCalls: 1, maxTokens: 4_000, timeoutSeconds: 30 },
    sensitivity: "project-private",
    returnDestination: {
      mode: input.contextRequest.productMode,
      documentId: input.contextRequest.activeOwner.id ?? "",
      selectionRef: `tianyi-v2.${input.session.id}`
    }
  };
}

export function mapTianyiV2BriefChanges(input: {
  session: TianyiSessionMetadata;
  contextRequest: TianyiContextRequest;
  items: TianyiV2CloseItem[];
}): ExecutionBriefChanges {
  const values = new Map(input.items.map((item) => [item.category, acceptedContent(item)]));
  const authorGoal = values.get("nuwa-question") || values.get("story-candidate") || values.get("author-decision") || "整理本次天意结果并交给女娲验证";
  const mustKeep = [values.get("author-decision"), values.get("story-candidate")].filter((value): value is string => Boolean(value));
  const unresolvedQuestions = [values.get("open-question"), values.get("nuwa-question")].filter((value): value is string => Boolean(value));
  const sourceCandidate = input.items.find((item) => item.category === "source-candidate");
  const selectedContextReceiptIds = sourceCandidate && (sourceCandidate.decision === "accepted" || sourceCandidate.decision === "edited")
    ? [...new Set(sourceCandidate.sourceReceiptIds)]
    : [];
  return {
    authorGoal,
    currentContext: {
      mode: input.contextRequest.productMode,
      documentId: input.contextRequest.activeOwner.id ?? "",
      objectIds: input.contextRequest.selection.objectId ? [input.contextRequest.selection.objectId] : [],
      selectionRef: `tianyi-v2.${input.session.id}`
    },
    selectedContextReceiptIds,
    selectedArchiveMessageRefs: [],
    approvedMemoryRefs: input.contextRequest.memorySelections.map((memory) => memory.id),
    mustKeep,
    mustAvoid: ["不得自动选择候选路线", "不得自动修改正文或世界资料", "不得自动建立变更单"],
    unresolvedQuestions,
    expectedOutputKind: "candidate-routes",
    allowedAgents: ["nuwa.supervisor", "nuwa.causality", "nuwa.tension", "nuwa.evidence-critic"],
    allowedSkills: ["story-memory-recall@1.0.0"],
    capabilityBudget: { maxAgentRuns: 3, maxSkillCalls: 1, maxTokens: 4_000, timeoutSeconds: 30 },
    sensitivity: "project-private",
    returnDestination: {
      mode: input.contextRequest.productMode,
      documentId: input.contextRequest.activeOwner.id ?? "",
      selectionRef: `tianyi-v2.${input.session.id}`
    }
  };
}

function uniqueLines(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => value.split("\n")).map((value) => value.trim()).filter(Boolean))];
}
