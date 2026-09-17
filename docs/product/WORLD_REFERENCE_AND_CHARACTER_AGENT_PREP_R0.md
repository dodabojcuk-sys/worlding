# 世界参考与角色 Agent 预备（R0 草案）

> 本文是「资料板块（世界观）升级 R1」为后续角色 Agent 升级预留的接口与边界说明。
> 它不是产品核心，不改变既有 Owner；所有内容服从 `TIANYAN_PRODUCT_CORE.md`。

## 1. 世界参考工作面是什么

资料区新增 `libraryView=reference` 只读视图（`WorldReferenceWorkspace.tsx`）：把既有 world-library 事实按「类别（人物/地点/组织/物件/规则/线索）× 信息性质（已确认事实/待确认线索/传闻·不确定/作者备注）」投影为作者可读的世界参考条目。它不写入、不复制、不建立第二事实库；唯一事实链仍是既有 WorldObject / Event / Relation / Canon Owner。

## 2. 信息性质的来源（只推导，不新增）

分类由 `src/storyContracts/worldReferenceProjection.ts` 从既有字段推导：

| 性质 | 推导依据（既有字段） |
| --- | --- |
| 已确认事实 | 默认（status=active 的非草稿对象） |
| 待确认线索 | type=event/thread 且 status≠active（作者草稿线索） |
| 传闻 · 不确定 | 标签含 `推测：` / `时间：未知` / `相对锚点：` |
| 作者备注 | 标签含 `作者秘密` / `作者备注` |
| 角色知情（伴随维度） | 标签 `知情：<角色>=已得知/未知/怀疑/被误导` 解析为 per-character known/unknown/uncertain |

## 3. 角色 Agent 未来读取的投影（预备接口）

`characterAllowedReferences(entries, character)` 是角色 Agent 上下文组装的准备接口：

- **允许进入角色上下文**：已确认事实中的 rule/location/faction（世界规则与公共事实），以及带 `知情：<角色>=已得知` 的事件线索；
- **永不进入角色上下文**：`author-note`（作者秘密/备注）与 `rumor`（传闻/推测）；
- **`知情：<角色>=未知` 的事件对该角色不可见**——角色不能因为作者知道而知道。

未来角色 Agent 升级时，应复用本投影 + 既有链路（CharacterMemoryLedger 的女娲听闻、事件线 characterKnowledgeHandoff），不得另建知识库或越权读取他人视角。

## 4. 已有连接与后续路线

- R1 已建立：女娲故事辅助栏「当前单元」卡 →「相关资料」链接（`/library?libraryView=reference&related=<单元标题>`）；世界参考视图支持任意人物/地点/单元反查（`related` 参数）。
- 后续候选（不在 R1 范围）：世界参考条目→事件线定位深链；规则对象在女娲范围设置中的只读引用；角色档案页的世界参考入口。
