import type { StoryUnit, VerifiedCanonEventDetailRead, VerifiedCanonEventListRead, WorldObject, WorldObjectSummary } from "../../lib/localTransport";

export type EventLineFixture = {
  projectTitle: string;
  events: WorldObjectSummary[];
  details: Record<string, WorldObject>;
  listState: VerifiedCanonEventListRead;
  storyUnits: StoryUnit[];
};

/**
 * A deterministic, in-memory presentation fixture used only when the URL
 * explicitly requests `fixture=event-hierarchy`. It never reaches a server
 * owner and cannot be written back to a real project.
 */
export function createEventLineFixture(projectId: string): EventLineFixture {
  const definitions: Array<{ id: string; title: string; setPoint: string; time: string; storyLine: string; characters: string[]; location: string; body: string; questions: string[]; properties: Record<string, string | string[]>; tags?: string[] }> = [
    { id: "fixture.event.arrival", title: "雾港来信", setPoint: "集点一 · 来信", time: "18:20", storyLine: "主线", characters: ["沈砚"], location: "雾港邮局", body: "沈砚在雾港收到一封没有署名的信。", questions: ["寄信人是否知道灯塔的秘密？"], properties: { emotion: "压抑", conflict: "信件与旧约冲突", infoDensity: "中", richness: "来源充分", foreshadowPlanted: "true" } },
    { id: "fixture.event.key", title: "铜钥匙交到手中", setPoint: "集点一 · 来信", time: "19:05", storyLine: "主线", characters: ["沈砚", "阿芜"], location: "旧船坞", body: "阿芜把一把刻着潮纹的铜钥匙交给沈砚。", questions: ["钥匙打开的是哪一扇门？"], properties: { emotion: "迟疑", conflict: "信任尚未建立", pacing: "缓慢", itemTransferTo: "fixture.event.lighthouse", causes: "fixture.event.arrival" } },
    { id: "fixture.event.lighthouse", title: "灯塔在无风夜亮起", setPoint: "集点二 · 灯塔", time: "约 20:00", storyLine: "主线", characters: ["沈砚"], location: "北岸灯塔", body: "没有风，北岸灯塔却亮起了第三层的灯。", questions: ["第三层是否有人？"], properties: { emotion: "惊惧", conflict: "规则被打破", infoDensity: "高", foreshadowRecovered: "true", causedBy: "fixture.event.key" } },
    { id: "fixture.event.whisper", title: "潮声里的未确认低语", setPoint: "集点二 · 灯塔", time: "", storyLine: "隐线", characters: ["阿芜"], location: "北岸灯塔", body: "阿芜说她听见潮声里有人喊出沈砚的旧名。", questions: ["这是记忆、回声，还是有人在传话？"], tags: ["状态：预测", "伏笔：埋下"], properties: { storyLineKind: "hidden", status: "prediction", conflict: "信息来源不明" } },
    { id: "fixture.event.ledger", title: "账册留下的旁线", setPoint: "集点三 · 账册", time: "21:10–21:30", storyLine: "旁线", characters: ["阿芜"], location: "船坞档案室", body: "账册显示三十年前也有人在无风夜点亮灯塔。", questions: [], tags: ["线类型：side"], properties: { storyLineKind: "side", infoDensity: "高", foreshadowRecovered: "true" } }
  ];
  const events = definitions.map((definition, index) => {
    const tags = ["作者确认", `Unit：潮痕来信`, `Set Point：${definition.setPoint}`, `Story Line：${definition.storyLine}`, `Time：${definition.time}`, `Character：${definition.characters.join("、")}`, `Location：${definition.location}`, `来源：作者来源-${index + 1}`, `观测摘要：${definition.body}`, ...(definition.tags ?? []), ...definition.questions.map((question) => `开放问题：${question}`)];
    return { id: definition.id, relativeId: `events/${definition.id}.md`, title: definition.title, type: "event" as const, status: "committed", tags, aliases: [], revisionToken: `${String(index + 1).repeat(64).slice(0, 64)}`, source: "markdown" as const };
  });
  const details = Object.fromEntries(definitions.map((definition, index) => {
    const summary = events[index]!;
    const properties: Record<string, string | string[]> = { ...definition.properties, storyUnit: "潮痕来信", setPoint: definition.setPoint, storyLine: definition.storyLine, participants: definition.characters, locations: [definition.location], ...(definition.time ? { narrativeTime: definition.time } : {}), sourceRef: `作者来源-${index + 1}`, sourceHash: `来源校验-${index + 1}`, sourceVersion: summary.revisionToken, openQuestions: definition.questions };
    const linkedObjects = definition.id === "fixture.event.arrival" ? [events[1]!] : definition.id === "fixture.event.key" ? [events[2]!] : [];
    return [definition.id, {
      ...summary,
      canonicalReadVerified: true,
      body: `# ${definition.title}\n\n${definition.body}\n\n## 作者选择\n作者确认保留这条事件记录。`,
      properties,
      knowledgeSubjects: [],
      subtype: "fixture-event",
      typedProperties: [],
      propertyDiagnostics: [],
      profile: null,
      linkedObjects,
      backlinks: [],
      card: { version: "story-card-presentation/v2", objectId: definition.id, preset: "character", layout: "vertical", portrait: null, cover: null, templateRef: null, blocks: [], visual: { density: "comfortable", mediaAssets: [] }, revisionToken: summary.revisionToken, source: "virtual-v1", diagnostics: [], migration: { required: false, cleanupPending: false } },
      visualReferences: [],
      worldProjection: null
    } satisfies WorldObject];
  }));
  const capturedAt = "2026-08-22T00:00:00.000Z";
  const sourceRefs = events.map((event, index) => ({
    sourceKind: "event-line" as const,
    ownerId: projectId,
    entityId: event.id,
    entityVersion: String(index + 1),
    capturedAt,
    staleState: "fresh" as const
  }));
  const storyUnits: StoryUnit[] = [{
    id: "fixture.story-unit.tide-letter",
    relativeId: "story-units/fixture.tide-letter.md",
    title: "潮痕来信",
    summary: "一组围绕雾港来信、灯塔与旧账册展开的隔离事件演示。",
    lifecycle: "active",
    sourceRefs,
    items: events.map((event, index) => ({
      id: `fixture.story-unit.item.${index + 1}`,
      kind: "event",
      authority: "canon" as const,
      content: { title: event.title },
      sourceRefs: [sourceRefs[index]!],
      subjectRef: event.id,
      createdBy: "author" as const
    })),
    linkedEntityIds: events.map((event) => event.id),
    unresolvedQuestionIds: definitions.flatMap((definition, index) => definition.questions.map((_, questionIndex) => `fixture.question.${index + 1}.${questionIndex + 1}`)),
    generationConstraints: {},
    version: "fixture-story-unit-v1",
    createdAt: capturedAt,
    updatedAt: capturedAt,
    source: "markdown"
  }];
  return { projectTitle: "潮痕来信 · 事件线演示", events, details, listState: { status: "ready", eventIds: events.map((event) => event.id), invalidRecordCount: 0 }, storyUnits };
}

export function readEventLineFixture(fixture: EventLineFixture, eventId: string): VerifiedCanonEventDetailRead {
  const event = fixture.details[eventId];
  return event ? { status: "ready", event } : { status: "error", error: { kind: "invalid-record", message: "隔离事件不存在。" } };
}

/**
 * Read-only Event Line projection for the one Event created by the bounded
 * Nuwa fixture. The Event ID comes from the completed AuthorControl receipt;
 * candidate IDs are deliberately not accepted by this projection.
 */
export function createNuwaConfirmedEventLineFixture(projectId: string, eventId: string): EventLineFixture {
  if (!eventId.startsWith("event.author-confirmed-")) {
    return { projectTitle: "潮痕来信 · 隔离演示", events: [], details: {}, listState: { status: "ready", eventIds: [], invalidRecordCount: 0 }, storyUnits: [] };
  }
  const revisionToken = eventId.slice("event.author-confirmed-".length).padEnd(64, "0").slice(0, 64);
  const event: WorldObjectSummary = {
    id: eventId,
    relativeId: `events/${eventId}.md`,
    title: "沈砚与阿芜决定先核对旧名守夜记录",
    type: "event",
    status: "committed",
    tags: ["作者确认", "Unit：潮痕来信", "来源：女娲排演 · 灯塔前的旧名核对", "世界时间：作者尚未指定时间", "Character：沈砚、阿芜", "观测摘要：沈砚与阿芜在进入灯塔前先核对旧名守夜记录；寄信人与精确时间仍未知。"],
    aliases: [],
    revisionToken,
    source: "markdown",
  };
  const detail: WorldObject = {
    ...event,
    canonicalReadVerified: true,
    body: "# 沈砚与阿芜决定先核对旧名守夜记录\n\n在进入灯塔前，沈砚收起匿名来信，阿芜只依据自己见过的守夜记录残页回应。两人决定先核对旧名记录，再决定是否进入灯塔。寄信人身份仍未知，作者尚未指定事件发生的精确时间。\n\n## 作者选择\n作者确认把这次核对加入事件线；灯塔历史、现有关系事实与角色未获知的信息均保持不变。",
    properties: {
      storyUnit: "潮痕来信",
      participants: ["沈砚", "阿芜"],
      narrativeTime: "作者尚未指定时间",
      sourceRef: "女娲排演：灯塔前的旧名核对",
      sourceVersion: revisionToken,
      openQuestions: ["守夜记录中写下旧名的人是谁？", "寄信人身份仍未知"],
    },
    knowledgeSubjects: [], subtype: "fixture-event", typedProperties: [], propertyDiagnostics: [], profile: null,
    linkedObjects: [], backlinks: [],
    card: { version: "story-card-presentation/v2", objectId: eventId, preset: "character", layout: "vertical", portrait: null, cover: null, templateRef: null, blocks: [], visual: { density: "comfortable", mediaAssets: [] }, revisionToken, source: "virtual-v1", diagnostics: [], migration: { required: false, cleanupPending: false } },
    visualReferences: [], worldProjection: null,
  };
  const capturedAt = "2026-08-23T00:00:00.000Z";
  const sourceRef = { sourceKind: "event-line" as const, ownerId: projectId, entityId: eventId, entityVersion: revisionToken, capturedAt, staleState: "fresh" as const };
  return {
    projectTitle: "潮痕来信 · 隔离演示",
    events: [event], details: { [eventId]: detail },
    listState: { status: "ready", eventIds: [eventId], invalidRecordCount: 0 },
    storyUnits: [{ id: "fixture.story-unit.tide-letter.nuwa-confirmed", relativeId: "story-units/fixture.tide-letter.nuwa-confirmed.md", title: "潮痕来信", summary: "沈砚与阿芜在进入灯塔前先核对旧名守夜记录；寄信人与精确时间仍未知。", lifecycle: "active", sourceRefs: [sourceRef], items: [{ id: "fixture.story-unit.item.nuwa-confirmed", kind: "event", authority: "canon", content: { title: event.title }, sourceRefs: [sourceRef], subjectRef: eventId, createdBy: "author" }], linkedEntityIds: [eventId], unresolvedQuestionIds: ["fixture.question.nuwa-confirmed.1", "fixture.question.nuwa-confirmed.2"], generationConstraints: {}, version: "fixture-story-unit-v1", createdAt: capturedAt, updatedAt: capturedAt, source: "markdown" }],
  };
}

/**
 * Read-only Event Line presentation for the bounded Multiverse receipt. The
 * formal Event identity still comes from AuthorControl; this only supplies the
 * author-facing summary and stable provenance that the generic Markdown card
 * does not carry.
 */
export function createMultiverseConfirmedEventLineFixture(projectId: string, eventId: string, authorControlReceiptId: string): EventLineFixture {
  const fixture = createNuwaConfirmedEventLineFixture(projectId, eventId);
  const summary = fixture.events[0];
  const detail = fixture.details[eventId];
  if (!summary || !detail || !authorControlReceiptId.startsWith("author-change-set-")) {
    return { projectTitle: "潮痕来信 · 多元隔离演示", events: [], details: {}, listState: { status: "ready", eventIds: [], invalidRecordCount: 0 }, storyUnits: [] };
  }
  const sourceLabel = "多元派生版本：旧名守夜记录走向";
  const tags = summary.tags.map((tag) => tag.startsWith("来源：") ? `来源：${sourceLabel}` : tag);
  const projectedSummary = { ...summary, tags };
  const projectedDetail = {
    ...detail,
    tags,
    body: "# 沈砚与阿芜决定先核对旧名守夜记录\n\n这条事件来自作者保留的“旧名守夜记录走向”。在进入灯塔前，沈砚与阿芜决定先核对守夜记录；寄信人身份与精确世界时间仍未知。\n\n## 作者选择\n作者只把这一条 Event 变化融入当前主线；角色状态、人物命运、世界状态与关系事实均未写入。",
    properties: {
      ...detail.properties,
      sourceRef: sourceLabel,
      sourceHash: authorControlReceiptId,
      openQuestions: ["守夜记录中写下旧名的人是谁？", "寄信人身份仍未知", "精确世界时间仍未知"]
    }
  } satisfies WorldObject;
  return {
    ...fixture,
    projectTitle: "潮痕来信 · 多元隔离演示",
    events: [projectedSummary],
    details: { [eventId]: projectedDetail }
  };
}
