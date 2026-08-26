import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Relation authoring is a Library content directory with one URL presentation owner", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const rail = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const home = source("apps/story-studio/src/components/LibraryHomeWorkbench.tsx");
  const directory = source("apps/story-studio/src/components/LibraryDirectoryWorkbench.tsx");
  assert.match(rail, /id="relation" label="关系"/);
  assert.match(rail, /faction.*\n.*relation/s);
  assert.match(home, /id: "relation", label: "关系"/);
  assert.match(app, /relationView/);
  assert.match(app, /relationId/);
  assert.match(app, /libraryDirectory === "relation"/);
  assert.match(directory, /kind: "relation"/);
  assert.match(app, /relationRecords\.filter\(\(relation\) => relation\.reviewState === "candidate"/);
});

test("Relation workbench uses existing safe operations and keeps list review alongside a read-only graph projection", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const workbench = source("apps/story-studio/src/components/RelationAuthoringWorkbench.tsx");
  const graph = source("apps/story-studio/src/components/RelationGraphProjection.tsx");
  assert.match(app, /createRelationCandidate/);
  assert.match(app, /confirmRelationCandidate/);
  assert.match(app, /rejectRelationCandidate/);
  assert.match(app, /archiveConfirmedRelation/);
  assert.match(app, /appendRelationEvidence/);
  assert.match(app, /createRelationCorrectionCandidate/);
  assert.match(workbench, /保存候选/);
  assert.match(workbench, /搜索已有资料/);
  assert.match(workbench, /检查重复建议/);
  assert.match(workbench, /不会自动合并/);
  assert.match(workbench, /确认关系/);
  assert.match(workbench, /创建更正候选/);
  assert.match(workbench, /作者手动建立/);
  assert.match(workbench, /旧图来源（未锚定）/);
  assert.match(workbench, /RelationGraphProjection/);
  assert.match(workbench, /图谱/);
  assert.match(app, /relationPresentation/);
  assert.match(graph, /nodesDraggable=\{false\}/);
  assert.match(graph, /nodesConnectable=\{false\}/);
  assert.match(graph, /图谱列表替代/);
  assert.match(graph, /setStatus\("candidate"\)/);
  assert.doesNotMatch(graph, /createRelationCandidate|confirmRelationCandidate|saveVisualDocument|reconcileGraphRelations/);
});

test("confirmation and evidence remain server revalidated through the existing owner", () => {
  const operations = source("src/storyControlSurface/storyStudioRelationOperations.ts");
  assert.match(operations, /confirmRelationCandidate\(rootPath, withoutProject\(request\), \{ resolveEvidence/);
  assert.match(operations, /appendRelationEvidence\(rootPath, withoutProject\(request\), \{ resolveEvidence/);
  assert.match(operations, /createRelationCorrectionCandidate/);
});
