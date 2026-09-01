import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const productCore = readFileSync("TIANYAN_PRODUCT_CORE.md", "utf8");

test("DIRECTORY_CONTRACT keeps the global directory hierarchical and Event identity singular", () => {
  assert.match(productCore, /深蓝八空间导航是一级导航/u);
  assert.match(productCore, /二级目录首页只展示类别、单元与数量/u);
  assert.match(productCore, /不得默认平铺全部 Event/u);
  assert.match(productCore, /同一个 Event 在目录中只有一个稳定身份/u);
  assert.match(productCore, /集点只引用或组织已有 Event，不复制 Event/u);
});

test("EVENT_GRAPH_AI_EDGE_CONTRACT requires connected CandidateSubgraphs and author-confirmed Relations", () => {
  assert.match(productCore, /CandidateSubgraph 时必须同时输出候选节点与候选边/u);
  assert.match(productCore, /两个或更多节点的候选路径如果没有连接这些节点的路径边，必须被合同拒绝/u);
  assert.match(productCore, /这些自动边首先是 Candidate，不是正式 Relation/u);
  assert.match(productCore, /关系类型待确认/u);
  assert.match(productCore, /不得把叙事相邻静默猜成因果/u);
});

test("TIMELINE_CONTRACT keeps bands, Events, and Relations in one React Flow canvas", () => {
  assert.match(productCore, /节点、正式关系、候选关系和纵向时间隔栏位于同一个 React Flow 画布/u);
  assert.match(productCore, /“时间未定”是所有已知时间之后的最后一个同级背景隔栏/u);
  assert.match(productCore, /关系线可以跨越时间隔栏/u);
  assert.match(productCore, /同一 Event \/ Relation 必须保持同一稳定身份/u);
});
