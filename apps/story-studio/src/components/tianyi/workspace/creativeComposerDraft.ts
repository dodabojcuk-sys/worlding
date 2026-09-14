export type CreativeComposerDraftView = {
  body: string;
  source: null | { responseMessageId: string; labels: string };
};

const SOURCE_DRAFT = /^创意草稿 · 来自天意回复 ([^\n]+)\n来源：([^\n]*)\n\n([\s\S]*)$/u;

/** Keeps the existing single-slot storage format while separating editable prose from provenance in the UI. */
export function readCreativeComposerDraft(value: string): CreativeComposerDraftView {
  const matched = SOURCE_DRAFT.exec(value);
  if (!matched) return { body: value, source: null };
  return { body: matched[3] || "", source: { responseMessageId: matched[1] || "", labels: matched[2] || "当前作品" } };
}

export function writeCreativeComposerDraftBody(current: string, body: string): string {
  const draft = readCreativeComposerDraft(current);
  if (!draft.source) return body;
  return `创意草稿 · 来自天意回复 ${draft.source.responseMessageId}\n来源：${draft.source.labels}\n\n${body}`;
}
