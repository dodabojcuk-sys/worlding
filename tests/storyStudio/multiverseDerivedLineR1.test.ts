import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Multiverse is one Derived Event Line workbench instead of four OutputArtifact forms", () => {
  const workbench = source("apps/story-studio/src/components/MultiverseWorkbench.tsx");
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(workbench, /data-multiverse-model="derived-event-line-r1"/);
  assert.match(workbench, /事件对齐与审核/);
  assert.match(workbench, /批准为可用于创作/);
  assert.doesNotMatch(workbench, /createOutputArtifact|localStorage|sessionStorage|fetch\(/);
  assert.match(app, /createDerivedEventLineR1/);
  assert.match(app, /updateStoryUnit\(\{ projectId: library\.project\.id, unitId: unit\.id/);
  assert.doesNotMatch(app, /function createDerivedOutputArtifact/);
});

test("translation and POV expose honest deterministic review while IF is distinct from prediction", () => {
  const workbench = source("apps/story-studio/src/components/MultiverseWorkbench.tsx");
  for (const label of ["来源 revision 已变化", "接受此事件", "视角可行性评分", "IF 反事实前提", "不是运行次数或预测概率", "Provider 0 次"]) assert.match(workbench, new RegExp(label));
  assert.match(workbench, /L3 结构闭环/);
  assert.match(workbench, /L2 合同骨架/);
});

test("Creation handoff binds the exact reviewed Story Unit revision and offers a source return", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const artifact = source("apps/story-studio/src/components/OutputArtifactWorkbench.tsx");
  assert.match(app, /unitVersion: unit\.version/);
  assert.match(app, /buildDerivedCreationBriefR1\(unit\)/);
  assert.match(app, /appendDerivedHandoffReceiptR1/);
  assert.match(artifact, /返回派生事件线/);
  assert.match(app, /onOpenDerivedSource=\{\(\) => void chooseProductMode\("multiverse"\)\}/);
});

