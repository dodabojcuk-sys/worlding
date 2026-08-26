import { createCharacterStateProjectionPort, type CharacterStateEvidence, type CharacterStateProjection } from "../../../../../src/storyContracts/characterStateProjection.ts";

export type CharacterStateFixtureCase = "complete" | "asymmetry" | "conflict" | "stale" | "insufficient";

export const CHARACTER_STATE_FIXTURE_CHARACTERS = [
  { id: "fixture.character.shen-yan", name: "沈砚", revision: "character.shen-yan-r3" },
  { id: "fixture.character.a-wu", name: "阿芜", revision: "character.a-wu-r2" }
] as const;

const port = createCharacterStateProjectionPort();

export function createCharacterStateFixtureProjection(input: { characterId?: string; branchId?: string; narrativePosition?: number; fixtureCase?: CharacterStateFixtureCase; confirmedEventId?: string | null }): CharacterStateProjection | null {
  const character = CHARACTER_STATE_FIXTURE_CHARACTERS.find((item) => item.id === (input.characterId || CHARACTER_STATE_FIXTURE_CHARACTERS[0].id));
  if (!character) return null;
  const branchId = input.branchId || "branch.main";
  const fixtureCase = input.fixtureCase || "complete";
  let evidence = evidenceFor(character.id, input.confirmedEventId || null);
  if (fixtureCase === "asymmetry") evidence = evidence.filter((item) => item.claimId.includes("asymmetry") || item.claimId.includes("letter") || item.authority === "unknown");
  if (fixtureCase === "conflict") evidence = evidence.filter((item) => item.conflictGroupId || item.claimId.includes("letter"));
  if (fixtureCase === "stale") evidence = evidence.filter((item) => item.stale || item.claimId.includes("letter"));
  if (fixtureCase === "insufficient") evidence = evidence.filter((item) => item.claimId === "claim.knowledge.letter-warning");
  return port.projectCharacterState({
    character: { ...character },
    scope: { projectId: "fixture.project.tide-letter", projectVersion: input.confirmedEventId ? "fixture-r1-confirmed" : "fixture-r0", branchId, narrativePosition: input.narrativePosition ?? 3, worldTime: { kind: "relative", label: "铜钥匙交接之后", sortKey: 3 }, sceneId: null, sourceRevision: "fixture-sources-r3" },
    evidence
  });
}

export function characterStateFixtureEventTitle(eventId: string | null): string {
  return ({
    "fixture.event.letter": "雾港来信",
    "fixture.event.key-transfer": "铜钥匙交到手中",
    "fixture.event.trust": "潮桥上的有条件信任",
    "fixture.event.ledger-conflict": "账册留下的旁线",
    "fixture.event.lighthouse-plan": "灯塔在无风夜亮起",
    "fixture.event.whisper-candidate": "潮声中的未确认低语"
  } as Record<string, string>)[eventId || ""] || (eventId ? "作者确认的新事件" : "缺少事件来源");
}

function evidenceFor(characterId: string, confirmedEventId: string | null): CharacterStateEvidence[] {
  const isShen = characterId === "fixture.character.shen-yan";
  const common: CharacterStateEvidence[] = [
    claim(characterId, { claimId: "claim.location.mist-harbor", category: "location", statement: `${isShen ? "沈砚" : "阿芜"}当前在雾港`, value: "雾港 · 潮桥附近", authority: "world_fact", learnedAtEventId: "fixture.event.letter", sourceAnchorIds: ["source.scene.mist-harbor#location"] }),
    claim(characterId, { claimId: "claim.possession.copper-key", category: "possession", statement: "铜钥匙当前持有人", value: isShen ? "沈砚持有" : "已交给沈砚", authority: "world_fact", learnedAtEventId: "fixture.event.key-transfer", narrativePosition: 2, sourceAnchorIds: ["source.event.key-transfer#holder"] }),
    claim(characterId, { claimId: "claim.knowledge.letter-warning", category: "knowledge", statement: isShen ? "知道来信警告不要独自登塔" : "知道沈砚收到一封警告信", value: "已确认知道", authority: "confirmed_knowledge", learnedAtEventId: "fixture.event.letter", sourceAnchorIds: ["source.letter.body#warning"] }),
    claim(characterId, { claimId: "claim.unknown.sender", category: "knowledge", statement: "寄信人身份", value: "明确未知", authority: "unknown", learnedAtEventId: "fixture.event.letter", sourceAnchorIds: ["source.letter.envelope#unsigned"] }),
    claim(characterId, { claimId: "claim.belief.sender", category: "belief", statement: "对寄信人的判断", value: isShen ? "怀疑是旧守塔人" : "怀疑与旧账册有关", authority: "suspicion", learnedAtEventId: "fixture.event.letter", sourceAnchorIds: ["source.dialogue.harbor#suspicion"] }),
    claim(characterId, { claimId: "claim.misinformation.lighthouse-open", category: "belief", statement: "灯塔第三层是否开放", value: "误以为第三层已经开放", authority: "misinformation", learnedAtEventId: "fixture.event.letter", sourceAnchorIds: ["source.rumor.lighthouse#v1"] }),
    claim(characterId, { claimId: "claim.goal.verify-ledger", category: "goal", statement: "当前目标", value: "核对灯塔守夜记录", authority: "world_fact", learnedAtEventId: "fixture.event.key-transfer", narrativePosition: 2, sourceAnchorIds: ["source.dialogue.key-transfer#goal"] }),
    claim(characterId, { claimId: "claim.commitment.no-solo", category: "commitment", statement: "当前承诺", value: "确认来源前不独自登塔", authority: "world_fact", learnedAtEventId: "fixture.event.trust", narrativePosition: 3, sourceAnchorIds: ["source.event.trust#promise"] }),
    claim(characterId, { claimId: "claim.relation.perceived-trust", category: "perceived_relation", statement: isShen ? "沈砚对阿芜的关系理解" : "阿芜对沈砚的关系理解", value: isShen ? "有条件合作" : "可以分享钥匙线索，但不能分享私密判断", authority: "confirmed_knowledge", learnedAtEventId: "fixture.event.trust", narrativePosition: 3, sourceAnchorIds: ["source.event.trust#relation"] }),
    claim(characterId, { claimId: "claim.asymmetry.key", category: "knowledge", statement: isShen ? "阿芜掌握钥匙来历的完整细节" : "知道钥匙交接，但不知道沈砚读信后的判断", value: isShen ? "没有证据" : "明确知识不对称", authority: "unknown", learnedAtEventId: "fixture.event.key-transfer", narrativePosition: 2, sourceAnchorIds: ["source.event.key-transfer#participants"], subjectCharacterId: isShen ? "fixture.character.a-wu" : null }),
    claim(characterId, { claimId: "claim.conflict.old-name-a", category: "knowledge", statement: "旧名出现日期", value: "守夜第三夜", authority: "contradiction", learnedAtEventId: "fixture.event.ledger-conflict", narrativePosition: 3, sourceAnchorIds: ["source.ledger.main#old-name"], conflictGroupId: "conflict.old-name-date" }),
    claim(characterId, { claimId: "claim.conflict.old-name-b", category: "knowledge", statement: "旧名出现日期", value: "守夜第五夜", authority: "contradiction", learnedAtEventId: "fixture.event.ledger-conflict", narrativePosition: 3, sourceAnchorIds: ["source.ledger.margin#old-name"], conflictGroupId: "conflict.old-name-date" }),
    claim(characterId, { claimId: "claim.stale.key-origin", category: "knowledge", statement: "铜钥匙的制造者", value: "旧船厂", authority: "confirmed_knowledge", learnedAtEventId: "fixture.event.key-transfer", narrativePosition: 2, sourceAnchorIds: ["source.key-record#v1"], stale: true, sourceRevision: "source-v1-stale" }),
    claim(characterId, { claimId: "claim.plan.lighthouse", category: "goal", statement: "作者规划的未来行动", value: "与阿芜共同调查灯塔第三层", authority: "author_planned", learnedAtEventId: "fixture.event.lighthouse-plan", narrativePosition: 3, sourceAnchorIds: ["source.author-plan#lighthouse"] }),
    claim(characterId, { claimId: "claim.candidate.whisper", category: "belief", statement: "潮声中的低语", value: "可能提到旧名", authority: "candidate", learnedAtEventId: "fixture.event.whisper-candidate", narrativePosition: 3, sourceAnchorIds: ["source.candidate.whisper#1"], worldTime: { kind: "unknown", label: "世界时间未知", sortKey: null } })
  ];
  if (confirmedEventId && isShen) common.push(claim(characterId, { claimId: "claim.knowledge.old-name-confirmed", category: "knowledge", statement: "旧名曾出现在灯塔守夜记录中", value: "已确认知道", authority: "confirmed_knowledge", learnedAtEventId: confirmedEventId, narrativePosition: 3, sourceAnchorIds: ["source.anchor.watch-ledger", "source.anchor.a-wu-statement"] }), claim(characterId, { claimId: "claim.relation.after-impact", category: "perceived_relation", statement: "沈砚对阿芜的关系理解", value: "愿意共同核对记录", authority: "confirmed_knowledge", learnedAtEventId: confirmedEventId, narrativePosition: 3, sourceAnchorIds: ["source.anchor.a-wu-statement"] }));
  return common;
}

function claim(characterId: string, patch: Partial<CharacterStateEvidence> & Pick<CharacterStateEvidence, "claimId" | "category" | "statement" | "value" | "authority">): CharacterStateEvidence {
  return { characterId, learnedAtEventId: null, sourceAnchorIds: [], sourceRevision: "fixture-source-r3", branchId: "branch.main", narrativePosition: 1, worldTime: { kind: "relative", label: "雾港来信之后", sortKey: 1 }, sceneId: null, scope: "character_private", stale: false, conflictGroupId: null, subjectCharacterId: null, ...patch };
}
