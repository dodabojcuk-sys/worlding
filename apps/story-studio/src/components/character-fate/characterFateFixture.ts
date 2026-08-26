import {
  projectCharacterFate,
  type CharacterFateObservation,
  type CharacterFateProjection
} from "../../../../../src/storyContracts/characterFateProjection.ts";

export const CHARACTER_FATE_FIXTURE_CHARACTERS = [
  { id: "fixture.character.shen-yan", revision: "character-revision.shen-yan.v2", name: "沈砚" },
  { id: "fixture.character.a-wu", revision: "character-revision.a-wu.v1", name: "阿芜" }
] as const;

export const CHARACTER_FATE_FIXTURE_EVENTS = [
  { id: "fixture.event.arrival", title: "雾港来信" },
  { id: "fixture.event.key", title: "铜钥匙交到手中" },
  { id: "fixture.event.lighthouse", title: "灯塔在无风夜亮起" },
  { id: "fixture.event.whisper", title: "潮声中的未确认低语" },
  { id: "fixture.event.ledger", title: "账册留下的旁线" }
] as const;

const source = {
  arrival: "fixture.source.anchor.letter-paragraph-2",
  key: "fixture.source.anchor.dock-paragraph-4",
  trust: "fixture.source.anchor.dialogue-paragraph-5",
  plan: "fixture.source.anchor.execution-brief-lighthouse",
  whisper: "fixture.source.anchor.whisper-candidate",
  ledgerA: "fixture.source.anchor.ledger-entry-a",
  ledgerB: "fixture.source.anchor.ledger-note-b",
  stale: "fixture.source.anchor.dock-draft-v1"
} as const;

const base = {
  unitId: "fixture.story-unit.tide-letter",
  unitLabel: "潮痕来信",
  storylineIds: ["fixture.storyline.main"],
  branchId: "branch.main",
  scope: "原始主线 · 潮痕来信"
} as const;

const observations: CharacterFateObservation[] = [
  observation({ observationId: "shen.knowledge.letter", characterId: "fixture.character.shen-yan", eventId: "fixture.event.arrival", setPointId: "fixture.set-point.letter", setPointLabel: "集点一 · 来信", narrativeOrder: 1, worldTime: exact("18:20"), stateDimension: "knowledge.letter", stateDimensionLabel: "掌握的信息", valueBefore: "不知道灯塔异常与旧约有关", valueAfter: "知道无署名信指向北岸灯塔", changeKind: "knowledge", trajectory: "actual", authority: "confirmed", sourceAnchorIds: [source.arrival], explanation: "沈砚亲手收到信，信中的潮纹与灯塔旧约建立明确信息连接。", confidence: "author", stale: false, conflictGroupId: null, knowledgeBoundary: "沈砚只知道信的内容，尚不知道寄信人身份。" }),
  observation({ observationId: "shen.possession.key", characterId: "fixture.character.shen-yan", eventId: "fixture.event.key", setPointId: "fixture.set-point.letter", setPointLabel: "集点一 · 来信", narrativeOrder: 2, worldTime: exact("19:05"), stateDimension: "possession.copper-key", stateDimensionLabel: "关键持有物", valueBefore: "未持有铜钥匙", valueAfter: "持有潮纹铜钥匙", changeKind: "transfer", trajectory: "actual", authority: "confirmed", sourceAnchorIds: [source.key], explanation: "阿芜在旧船坞将铜钥匙交到沈砚手中，持有关系由该 Event 明确改变。", confidence: "author", stale: false, conflictGroupId: null, knowledgeBoundary: "沈砚知道钥匙存在，但不知道它能打开哪扇门。" }),
  observation({ observationId: "shen.relation.trust", characterId: "fixture.character.shen-yan", eventId: "fixture.event.key", setPointId: "fixture.set-point.letter", setPointLabel: "集点一 · 来信", narrativeOrder: 2, worldTime: exact("19:05"), stateDimension: "relation.trust.a-wu", stateDimensionLabel: "与阿芜的信任", valueBefore: "保持戒备", valueAfter: "有条件地信任", changeKind: "relation", trajectory: "actual", authority: "confirmed", sourceAnchorIds: [source.trust], explanation: "钥匙交接后，沈砚同意在不公开阿芜来历的前提下共同查证。", confidence: "author", stale: false, conflictGroupId: null, knowledgeBoundary: "沈砚仍不知道阿芜为何提前知道信会到达。" }),
  observation({ observationId: "shen.plan.enter-lighthouse", characterId: "fixture.character.shen-yan", eventId: "fixture.event.lighthouse", setPointId: "fixture.set-point.lighthouse", setPointLabel: "集点二 · 灯塔", narrativeOrder: 3, worldTime: relative("信到达后当夜"), stateDimension: "goal.lighthouse", stateDimensionLabel: "明确行动计划", valueBefore: "尚未决定是否进入灯塔", valueAfter: "计划用铜钥匙查看第三层", changeKind: "constraint", trajectory: "planned", authority: "author_planned", sourceAnchorIds: [source.plan], explanation: "作者已在 Execution Brief 中确认调查方向，但进入第三层尚未发生。", confidence: "author", stale: false, conflictGroupId: null, knowledgeBoundary: "计划不使沈砚预先知道第三层里的内容。" }),
  observation({ observationId: "shen.candidate.whisper", characterId: "fixture.character.shen-yan", eventId: "fixture.event.whisper", setPointId: "fixture.set-point.lighthouse", setPointLabel: "集点二 · 灯塔", narrativeOrder: 4, worldTime: unknown(), stateDimension: "knowledge.old-name", stateDimensionLabel: "旧名的线索", valueBefore: null, valueAfter: "可能意识到旧名被人知晓", changeKind: "unknown", trajectory: "candidate", authority: "candidate", sourceAnchorIds: [source.whisper], explanation: "低语的来源和发生时间都尚未确认，不能改写沈砚当前知识。", confidence: "model", stale: false, conflictGroupId: null, knowledgeBoundary: "阿芜声称听到低语；沈砚未亲历，也未确认相信。" }),
  observation({ observationId: "shen.conflict.ledger-a", characterId: "fixture.character.shen-yan", eventId: "fixture.event.ledger", setPointId: "fixture.set-point.ledger", setPointLabel: "集点三 · 账册", narrativeOrder: 5, worldTime: range("21:10–21:30", "21:10"), stateDimension: "belief.lighthouse-history", stateDimensionLabel: "对灯塔历史的判断", valueBefore: "认为异常只发生在当夜", valueAfter: "认为三十年前已有同类记录", changeKind: "knowledge", trajectory: "actual", authority: "conflicted", sourceAnchorIds: [source.ledgerA], explanation: "账册主条目记录三十年前的点灯日期。", confidence: "author", stale: false, conflictGroupId: "fixture.conflict.lighthouse-ledger", knowledgeBoundary: "沈砚只看到账册当前展开的两页。" }),
  observation({ observationId: "shen.conflict.ledger-b", characterId: "fixture.character.shen-yan", eventId: "fixture.event.ledger", setPointId: "fixture.set-point.ledger", setPointLabel: "集点三 · 账册", narrativeOrder: 5, worldTime: range("21:10–21:30", "21:10"), stateDimension: "belief.lighthouse-history", stateDimensionLabel: "对灯塔历史的判断", valueBefore: "认为异常只发生在当夜", valueAfter: "旁注声称旧记录是拉拉队传闻", changeKind: "knowledge", trajectory: "actual", authority: "conflicted", sourceAnchorIds: [source.ledgerB], explanation: "账册旁注否定主条目的可靠性，两份有效来源互相不一致。", confidence: "author", stale: false, conflictGroupId: "fixture.conflict.lighthouse-ledger", knowledgeBoundary: "沈砚尚未核对账册保管人的身份。" }),
  observation({ observationId: "shen.stale.key-origin", characterId: "fixture.character.shen-yan", eventId: "fixture.event.key", setPointId: "fixture.set-point.letter", setPointLabel: "集点一 · 来信", narrativeOrder: 2, worldTime: exact("19:05"), stateDimension: "belief.key-origin", stateDimensionLabel: "钥匙来源", valueBefore: "未知", valueAfter: "旧版来源称钥匙来自灯塔守人", changeKind: "knowledge", trajectory: "actual", authority: "stale", sourceAnchorIds: [source.stale], explanation: "该来源修订已被 v2 替代，本投影保留旧结论但不把它当成当前事实。", confidence: "author", stale: true, conflictGroupId: null, knowledgeBoundary: "来源过期意味着沈砚不应依据此结论行动。" }),
  observation({ observationId: "awu.possession.key", characterId: "fixture.character.a-wu", eventId: "fixture.event.key", setPointId: "fixture.set-point.letter", setPointLabel: "集点一 · 来信", narrativeOrder: 2, worldTime: exact("19:05"), stateDimension: "possession.copper-key", stateDimensionLabel: "关键持有物", valueBefore: "持有潮纹铜钥匙", valueAfter: "已交给沈砚", changeKind: "transfer", trajectory: "actual", authority: "confirmed", sourceAnchorIds: [source.key], explanation: "同一 Event 从阿芜视角投影为持有关系的失去。", confidence: "author", stale: false, conflictGroupId: null, knowledgeBoundary: "阿芜知道钥匙的来源，但没有向沈砚公开全部经过。" }),
  observation({ observationId: "awu.candidate.whisper", characterId: "fixture.character.a-wu", eventId: "fixture.event.whisper", setPointId: "fixture.set-point.lighthouse", setPointLabel: "集点二 · 灯塔", narrativeOrder: 4, worldTime: unknown(), stateDimension: "knowledge.old-name", stateDimensionLabel: "旧名的线索", valueBefore: "未说明", valueAfter: "声称在潮声中听到沈砚旧名", changeKind: "knowledge", trajectory: "candidate", authority: "candidate", sourceAnchorIds: [source.whisper], explanation: "该叙述仍是待确认候选，无法推定阿芜的信息来源。", confidence: "model", stale: false, conflictGroupId: null, knowledgeBoundary: "阿芜的听见不能自动成为沈砚所知。" })
];

export type CharacterFateFixtureCase = "complete" | "single" | "planned-only" | "actual-only" | "unknown-only" | "conflict" | "stale" | "rejected" | "empty-branch";

export function createCharacterFateFixtureProjection(input: {
  characterId?: string | null;
  fixtureCase?: CharacterFateFixtureCase;
  renamedCharacter?: string;
  branchId?: string;
} = {}): CharacterFateProjection | null {
  const character = CHARACTER_FATE_FIXTURE_CHARACTERS.find((item) => item.id === (input.characterId || CHARACTER_FATE_FIXTURE_CHARACTERS[0]!.id));
  if (!character) return null;
  const fixtureCase = input.fixtureCase || "complete";
  const branchId = input.branchId || (fixtureCase === "empty-branch" ? "branch.missing" : "branch.main");
  let selected = observations;
  if (fixtureCase === "single") selected = observations.filter((item) => item.observationId === "shen.knowledge.letter");
  if (fixtureCase === "planned-only") selected = observations.filter((item) => item.trajectory === "planned");
  if (fixtureCase === "actual-only") selected = observations.filter((item) => item.trajectory === "actual" && item.authority === "confirmed");
  if (fixtureCase === "unknown-only") selected = observations.filter((item) => item.worldTime.kind === "unknown");
  if (fixtureCase === "conflict") selected = observations.filter((item) => item.authority === "conflicted");
  if (fixtureCase === "stale") selected = observations.filter((item) => item.authority === "stale");
  if (fixtureCase === "rejected") selected = observations.filter((item) => item.trajectory !== "candidate");
  return projectCharacterFate({
    project: { id: "fixture.project.tide-letter", version: "project-version.tide-letter.r0" },
    character: { ...character, name: input.renamedCharacter || character.name },
    branchId,
    scope: base.scope,
    knownEventIds: CHARACTER_FATE_FIXTURE_EVENTS.map((event) => event.id),
    observations: selected,
    generatedAt: "2026-08-23T08:00:00.000Z"
  });
}

export function characterFateFixtureEventTitle(eventId: string): string {
  return CHARACTER_FATE_FIXTURE_EVENTS.find((event) => event.id === eventId)?.title || "未知事件";
}

function observation(input: Omit<CharacterFateObservation, "unitId" | "unitLabel" | "storylineIds" | "branchId" | "scope">): CharacterFateObservation {
  return { ...base, ...input, storylineIds: input.eventId === "fixture.event.whisper" ? ["fixture.storyline.hidden"] : [...base.storylineIds] };
}

function exact(label: string) {
  return { kind: "exact" as const, label, sortKey: label };
}

function relative(label: string) {
  return { kind: "relative" as const, label, sortKey: "20:00" };
}

function range(label: string, sortKey: string) {
  return { kind: "range" as const, label, sortKey };
}

function unknown() {
  return { kind: "unknown" as const, label: "未知时间", sortKey: null };
}
