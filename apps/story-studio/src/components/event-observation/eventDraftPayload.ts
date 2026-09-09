import type { EventDraftInput } from "../EventLineWorkbench";

/**
 * Presentation input is converted to ordinary Workspace Event fields here.
 * This produces a draft only; Author Control remains the sole Canon writer.
 */
export function eventDraftPayload(input: EventDraftInput): { tags: string[]; body: string; knowledgeSubjects: string[] } {
  const participants = [...new Set([...input.participantSubjects.map((item) => item.label), ...input.participants])];
  const knowledgeSubjects = [...new Set(input.participantSubjects.map((item) => item.id))];
  const tags = ["作者草稿", input.summary ? `摘要：${input.summary}` : null, input.storyUnit ? `故事单元：${input.storyUnit}` : null, input.focus ? `集点：${input.focus}` : null, input.storyTime ? `时间：${input.storyTime}` : null, input.location ? `地点：${input.location}` : null, ...participants.map((value) => `人物：${value}`), ...knowledgeSubjects.map((id) => `知情：${id}=已亲历`), ...input.tags].filter((value): value is string => Boolean(value));
  const body = [
    `# ${input.title}`,
    input.summary,
    input.note ? `## 作者备注\n\n${input.note}` : "",
    input.storyUnit ? `- 故事单元：${input.storyUnit}` : "",
    input.focus ? `- 集点：${input.focus}` : "",
    input.storyTime ? `- 故事时间：${input.storyTime}` : "",
    input.location ? `- 地点：${input.location}` : "",
    participants.length ? `- 涉及人物：${participants.join("、")}` : ""
  ].filter(Boolean).join("\n\n");
  return { tags, body, knowledgeSubjects };
}
