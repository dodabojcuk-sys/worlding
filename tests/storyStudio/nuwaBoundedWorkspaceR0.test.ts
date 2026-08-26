import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createNuwaConfirmedEventLineFixture } from "../../apps/story-studio/src/components/event-observation/eventLineFixture.ts";

const workspaceSource = readFileSync(new URL("../../apps/story-studio/src/components/nuwa-bounded/NuwaBoundedScenarioWorkspace.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../../apps/story-studio/src/styles/nuwa-bounded-r0.css", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("../../src/storyAgent/contextualCapabilityRegistry.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../apps/story-studio/src/App.tsx", import.meta.url), "utf8");
const assistantSource = readFileSync(new URL("../../apps/story-studio/src/components/TianyiQuickAssistant.tsx", import.meta.url), "utf8");
const boundarySource = readFileSync(new URL("../../docs/product/TIANYAN_NUWA_RUN_AND_MULTIVERSE_DERIVED_VERSION_BOUNDARY_R0.md", import.meta.url), "utf8");

test("Nuwa bounded workspace exposes author-readable scope and page-level tools", () => {
  for (const label of ["当前排演范围", "角色此时知道", "明确排除 / 禁止改变", "排演现场", "临时走向", "结果对照", "事件候选", "作者审查", "回放记录"]) {
    assert.match(workspaceSource, new RegExp(label.replace(/[ /]/g, "\\$&")));
  }
  for (const retiredDefaultLabel of [">Observation</button>", ">Branch</button>", ">Compare</button>", ">Event Overlay</button>", ">Review</button>", ">Replay</button>", "Fixture · Provider 0", "天意 Work Dock"]) {
    assert.doesNotMatch(workspaceSource, new RegExp(retiredDefaultLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const stageLabel of ["· 对话", "角色行动", "物品响应 · 铜钥匙", "地点响应 · 灯塔入口", "环境变化", "规则阻断", "仍然未知", "候选结果"]) {
    assert.match(workspaceSource, new RegExp(stageLabel));
  }
  assert.match(workspaceSource, /props\.run\.lifecycle === "running" \? "正在等待第一步"/);
  assert.doesNotMatch(workspaceSource, /NuwaStageStrip/);
  assert.match(workspaceSource, /run\.branches\.every\(\(branch\) => branch\.status === "completed"\)/);
});

test("controls and review surfaces preserve candidate versus confirmed boundaries", () => {
  for (const label of ["开始排演", "单步", "连续运行", "暂停", "恢复", "取消", "导演纠正", "这个候选会让故事发生什么", "与当前故事的差异", "使用的作者来源", "仍未确定", "会影响的内容", "当前事实", "确认后可能变化", "保持不变", "未知与冲突", "恢复点", "正式变化数量", "确认并加入事件线"]) {
    assert.match(workspaceSource, new RegExp(label));
  }
  assert.match(workspaceSource, /在作者确认前，它不会进入事件线或改变当前故事/);
  assert.match(workspaceSource, /作者尚未指定时间/);
  assert.match(workspaceSource, /回放完整，内容与确认前一致/);
  assert.match(appSource, /fixtureKind === "nuwa-bounded" \? null : goldenLoopResult/);
});

test("Nuwa Work Dock is scoped to explanation, boundary checks and proposal work", () => {
  for (const label of ["解释当前步骤", "检查角色知识边界", "查找违反禁止事项的变化", "列出两个结果的差异", "查找没有来源的变化", "准备导演纠正", "准备候选送审"]) {
    assert.match(registrySource, new RegExp(label));
  }
  for (const label of ["本次排演使用离线演示数据", "未调用真实模型", "离线演示不发送", "没有发送任何模型请求"]) {
    assert.match(assistantSource, new RegExp(label));
  }
  assert.match(assistantSource, /isNuwaBoundedFixture \? <section className="tianyi-quick-model-status/);
});

test("Nuwa temporary paths and future Multiverse versions have one frozen owner boundary", () => {
  assert.match(boundarySource, /A Nuwa temporary path is scoped to one Run and one frozen snapshot/);
  assert.match(boundarySource, /It is not\s+\n?\s*a branch in the Multiverse product sense/);
  assert.match(boundarySource, /no Multiverse route, data model, persistence, migration or UI implementation/);
  assert.match(boundarySource, /no new version, Event, World, Character, Relation, Canon or Run owner/);
});

test("responsive contract collapses workspace chrome and honors reduced motion", () => {
  assert.match(styleSource, /@media \(max-width: 1040px\)/);
  assert.match(styleSource, /grid-template-columns:\s*1fr/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Event Line fixture accepts only an AuthorControl-confirmed Event ID", () => {
  const confirmed = createNuwaConfirmedEventLineFixture("fixture-project", "event.author-confirmed-abc123");
  assert.deepEqual(confirmed.listState.status === "ready" ? confirmed.listState.eventIds : [], ["event.author-confirmed-abc123"]);
  assert.equal(confirmed.events[0]?.status, "committed");
  assert.match(confirmed.details["event.author-confirmed-abc123"]?.body || "", /沈砚收起匿名来信/);
  assert.equal(confirmed.details["event.author-confirmed-abc123"]?.properties.narrativeTime, "作者尚未指定时间");
  assert.equal(confirmed.details["event.author-confirmed-abc123"]?.properties.sourceRef, "女娲排演：灯塔前的旧名核对");
  const candidate = createNuwaConfirmedEventLineFixture("fixture-project", "candidate.event.old-name-ledger-check");
  assert.deepEqual(candidate.events, []);
});
