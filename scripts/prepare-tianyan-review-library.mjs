import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createCreationSourceSelectionPort } from "../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { createNormalEventCreationPort } from "../apps/story-studio/server/normalEventCreationPort.mjs";
import { createStoryStudioAuthorControl } from "../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioCanonReadProjection } from "../src/storyControlSurface/storyStudioCanonReadProjection.ts";
import { createStoryStudioRelationOperations } from "../src/storyControlSurface/storyStudioRelationOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

const targetRoot = path.resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Usage: node --experimental-strip-types scripts/prepare-tianyan-review-library.mjs <empty-target-root>");
if (existsSync(targetRoot) && readdirSync(targetRoot).length) throw new Error(`Review library target must be empty: ${targetRoot}`);
mkdirSync(targetRoot, { recursive: true });
const stateFilePath = path.join(targetRoot, ".story-studio", "state.json");
const operations = createStoryStudioWorkspaceOperations({ rootPath: targetRoot, stateFilePath });
const authorControl = createStoryStudioAuthorControl({ rootPath: targetRoot, stateFilePath });

const projectId = "north-bay-synthetic-review";
operations.createProject({ title: "北湾创作审阅样例（合成）", folderSlug: projectId, genre: "fantasy", ambience: "coastal" });
operations.createProject({ title: "空白新手练习（合成）", folderSlug: "blank-author-onboarding" });
operations.openProject({ projectId });

const createObject = (type, title, body, tags = []) => operations.createWorldObject({ projectId, type, title, status: type === "event" ? "committed" : "active", body: `# ${title}\n\n${body}\n`, tags });
const northBay = createObject("location", "北湾", "北湾是被山岭与浅海围合的沿岸区域，旧航道在雾港外分叉。", ["地点", "区域"]);
const fogHarbour = createObject("location", "雾港", "雾港是北湾沿岸的旧港镇，河道与山路在此交汇。", ["地点", "港镇"]);
createObject("rule", "北湾潮闸规则", "潮闸只有在满足既定巡检条件后才可开启。这是已记录的世界设定，不由地图距离自动推导。", ["世界设定"]);

const people = [
  ["顾澜", "港务记录员，关注潮闸安全与航道档案。"],
  ["程野", "山路信使，关注药材运送与渡口通行。"],
  ["沈砚", "潮闸工匠，负责检查旧闸的结构。"],
  ["苏弦", "港口医师，记录药材库存与伤员去向。"],
  ["陆衍", "北湾船主，熟悉潮汐和外港水道。"],
  ["闻舟", "远行抄写员，尚未记录与其他人的正式关系。"]
].map(([title, body]) => createObject("character", title, body, ["人物"]));
const byName = Object.fromEntries(people.map((person) => [person.title, person]));

// The sample's confirmed event must come from the same author confirmation
// chain the product UI uses (story unit → candidate → impact review → author
// confirmation).  A raw "committed" world object would fail the confirmed-
// event evidence contract at read time and break every relation that cites it.
const normalCreation = createNormalEventCreationPort({ operations, authorControl });
const storyUnit = normalCreation.createStoryUnit(projectId, {
  title: "潮闸争议",
  summary: "围绕雾港潮闸检修与药材运送时段的第一个故事单元。"
});
const candidate = normalCreation.createCandidate(projectId, {
  storyUnitId: storyUnit.id,
  title: "雾港潮闸争议",
  body: "潮闸受损后，顾澜主张先封闭旧港航道检修；程野则要求保留药材运送时段。两人约定日落前与沈砚共同勘查。这只确认公开立场与共同勘查，不确认彼此信任或敌对。"
});
normalCreation.beginImpact(projectId, { storyUnitId: storyUnit.id, planningEventId: candidate.planning.id });
normalCreation.confirm(projectId, { storyUnitId: storyUnit.id, planningEventId: candidate.planning.id });
const creationState = normalCreation.state(projectId, { storyUnitId: storyUnit.id, planningEventId: candidate.planning.id });
const confirmedEvent = creationState.confirmedEvents.at(-1);
if (!confirmedEvent) throw new Error("作者确认链没有产生正式事件；样例构建中断。");
if (!authorControl.verifyCanonEventRead({ projectId, eventId: confirmedEvent.id })) {
  throw new Error(`正式事件未通过确认链读取验证：${confirmedEvent.id}`);
}

// The root WorkVersion must come from the product's own Creation source port
// so its owner snapshot carries the real story-unit/event stable references
// that the fixed-draft artifact chain validates later.
const canonReadProjection = createStoryStudioCanonReadProjection({ workspace: operations, authorControl });
const relations = createStoryStudioRelationOperations({
  workspaceOperations: operations,
  verifyCanonEventRead: ({ projectId: evidenceProjectId, eventId }) => authorControl.verifyCanonEventRead({ projectId: evidenceProjectId, eventId })
});
const creationSource = createCreationSourceSelectionPort({ operations, relationOperations: relations, canonReadProjection });
const version = creationSource.createRoot(projectId);
const types = Object.fromEntries(["港务协作", "航线分歧", "委托调查", "情报互换", "护送约定", "地点关联"].map((label) => [label, relations.createRelationType({ projectId, operationId: `synthetic.type.${label}`, label }).type.relationTypeId]));
const evidenceRefs = [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId, eventId: confirmedEvent.id, revisionToken: confirmedEvent.revision, state: "committed", requestedUse: "constraint" } }];
const confirm = (label, source, target, direction) => {
  const operationId = `synthetic.relation.${label}.${source.id}.${target.id}`;
  const result = relations.createRelationCandidate({ projectId, workVersionId: version.identity.workVersionId, operationId, sourceObjectId: source.id, targetObjectId: target.id, relationTypeId: types[label], direction, evidenceRefs });
  return relations.confirmRelationCandidate({ projectId, workVersionId: version.identity.workVersionId, relationId: result.relation.relationId, expectedRelationRevision: result.relation.revision, operationId: `${operationId}.confirm` });
};
confirm("港务协作", byName["顾澜"], byName["程野"], "forward");
confirm("航线分歧", byName["顾澜"], byName["程野"], "reverse");
confirm("委托调查", byName["沈砚"], byName["顾澜"], "forward");
confirm("情报互换", byName["苏弦"], byName["程野"], "both");
confirm("护送约定", byName["陆衍"], byName["苏弦"], "forward");
confirm("地点关联", fogHarbour, byName["顾澜"], "forward");
const pending = relations.createRelationCandidate({ projectId, workVersionId: version.identity.workVersionId, operationId: "synthetic.pending.harbour-scribe", sourceObjectId: fogHarbour.id, targetObjectId: byName["闻舟"].id, relationTypeId: types["地点关联"], direction: "forward", evidenceRefs: [] });

let map = operations.createVisualDocument({ projectId, type: "map", title: "北湾手绘区域图" });
const layers = [{ id: "layer.terrain", title: "地形", visible: true, locked: false }, { id: "layer.routes", title: "道路与河流", visible: true, locked: false }, { id: "layer.places", title: "地点与标注", visible: true, locked: false }];
const drawing = (value) => ({ strokeColor: "#315f52", fillColor: "#d8eee8", fillOpacity: .6, width: 2, size: 4, seed: 7, rotation: 0, label: null, objectId: null, ...value });
map = operations.updateVisualDocument({ projectId, relativePath: map.relativePath, expectedHash: map.contentHash, document: { ...map, content: { ...map.content, layers, coordinateSystem: { ...map.content.coordinateSystem, north: { degreesClockwiseFromMapUp: 0, source: "author" } }, drawings: [
  drawing({ id: "area.north-bay", kind: "area", subtype: "geography", layerId: "layer.terrain", points: [{ x: 9, y: 14 }, { x: 68, y: 10 }, { x: 82, y: 38 }, { x: 74, y: 82 }, { x: 18, y: 86 }, { x: 7, y: 55 }], fillColor: "#dce9bf", strokeColor: "#55734c", objectId: northBay.id, label: "北湾陆地" }),
  drawing({ id: "line.river", kind: "line", subtype: "river", layerId: "layer.routes", points: [{ x: 28, y: 12 }, { x: 38, y: 33 }, { x: 48, y: 55 }, { x: 61, y: 78 }], strokeColor: "#4b8bbd", width: 5, label: "雾河" }),
  drawing({ id: "line.road", kind: "line", subtype: "road", layerId: "layer.routes", points: [{ x: 17, y: 66 }, { x: 39, y: 57 }, { x: 62, y: 49 }, { x: 76, y: 34 }], strokeColor: "#8b6746", width: 4, label: "滨海道" }),
  drawing({ id: "terrain.forest", kind: "terrain", subtype: "forest", layerId: "layer.terrain", points: [{ x: 20, y: 28 }, { x: 28, y: 25 }, { x: 35, y: 31 }, { x: 42, y: 28 }], strokeColor: "#3f7250", width: 8, label: "雾松林" }),
  drawing({ id: "symbol.harbour", kind: "symbol", subtype: "settlement", layerId: "layer.places", points: [{ x: 61, y: 62 }], fillColor: "#d39b53", size: 7, objectId: fogHarbour.id, label: "雾港" })
], markers: [{ id: `marker.${fogHarbour.id}`, objectId: fogHarbour.id, layerId: "layer.places", x: 61, y: 62, color: "#147d78", labelMode: "always" }], labels: [{ id: "label.north-bay", text: "北湾", layerId: "layer.places", x: 43, y: 18, fontSize: 24, fontWeight: 700, align: "center", rotation: 0, visible: true, treatment: "outline" }] } } }).document;

const relationList = relations.listRelations({ projectId });
const confirmedRelationCount = relationList.relations.filter((relation) => relation.reviewState === "confirmed" && relation.evidenceRefs.some((item) => item.kind === "confirmed-event")).length;
if (confirmedRelationCount !== 6) throw new Error(`带确认事件依据的正式关系数量不符合预期：${confirmedRelationCount}/6`);
writeFileSync(path.join(targetRoot, "REVIEW_FIXTURE.json"), `${JSON.stringify({ version: "tianyan-review-fixture/v2", synthetic: true, projects: [{ id: projectId, title: "北湾创作审阅样例（合成）", workVersionId: version.identity.workVersionId, mapId: map.id, pendingRelationId: pending.relation.relationId, storyUnitId: storyUnit.id, confirmedEventId: confirmedEvent.id, confirmedEventRevision: confirmedEvent.revision, authorConfirmationChain: "normal-event-creation-port", verifiedCanonEventRead: true, confirmedRelationsWithEventEvidence: confirmedRelationCount }, { id: "blank-author-onboarding", title: "空白新手练习（合成）" }] }, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ targetRoot, projectId, workVersionId: version.identity.workVersionId, mapId: map.id, storyUnitId: storyUnit.id, confirmedEventId: confirmedEvent.id, confirmedRelationsWithEventEvidence: confirmedRelationCount, providerCalls: 0, synthetic: true }));
