# 天衍正式叙事编排合同 R0

状态：`FOUNDER_REVIEW`

适用阶段：R12-B2.1

不代表：R12-B2 生产 UI 已恢复或 R12-B3 已开始

## 1. 决定

```text
NARRATIVE_POSITION_OWNER=existing Story Structure / Story Unit authority
FORMAL_MODEL=versioned NarrativeArrangement + NarrativePlacement
EVENT_OWNS_GLOBAL_NARRATIVE_POSITION=NO
LINKED_ENTITY_IDS_CARRY_ORDER=NO
UI_OR_LOCAL_STORAGE_OWNS_ORDER=NO
LEGACY_FALLBACK_BECOMES_FORMAL_ORDER=NO
```

叙事位置是作品在特定来源谱系和叙事路径中向读者呈现 Event 的方式，不是 Event 在世界中发生的时间，也不是 Event 的全局属性。

## 2. 术语

- `NarrativeArrangement`：一个 story/work、WorkVersion 来源谱系和既有 Story Unit 叙事路径下的正式编排聚合。它由路径根 Story Unit 托管。
- `NarrativePlacement`：对 Event ID 的一次有稳定身份的呈现引用；同一 Event 可以有多个 Placement。
- `narrativePathId`：复用一个既有 Story Unit ID，不创建平行 branch ID。
- `sourceLineageId`：复用 WorkVersion 根身份；根版本等于自身 ID，派生版本复用其 `parentVersionId`。
- `ownerStoryUnitId`：保存 arrangement 子实体的 Story Unit；R0 必须等于 `narrativePathId`。
- `unplaced`：Event 在该作用域没有有效正式 Placement。它不是一种推断顺序。
- `order-conflict`：Placement 身份、Unit order 或 Unit 内正式 order key 发生歧义。
- `dangling-reference`：Placement 引用的 Event 或 Story Unit 在当前投影中不存在。

## 3. 实际 Owner 与存储

唯一业务 Writer 是 `createStoryStudioWorkspaceOperations()` 返回的 NarrativeArrangement 命令组，代码位于 `src/storyControlSurface/storyStudioWorkspaceOperations.ts`。它复用 Story Unit Markdown 笔记和 `updateWorkspaceNote(expectedContentHash)`，不建立新数据库。

持久化位置是路径根 Story Unit 笔记的独立顶层 frontmatter：

```text
narrative_arrangements_r0: <stable JSON string>
```

该字段是 Story Unit 既有持久化权威内部的版本化子实体。它不进入 `story_unit_payload`，原因是旧版 `updateStoryUnit` 会重新构造旧 payload；相反，既有 `updateWorkspaceNote` 会合并并保留未知顶层 frontmatter。由此，旧版普通 Story Unit 保存不会静默删除新编排数据。

`.tianyan` 继续打包 `story-units/`，所以该子实体随既有 Story Unit 权威导入导出，没有第二套导出格式。

## 4. 作用域与身份

一个 arrangement 明确保存：

- canonical Project ID；
- 当前 `workVersionId`；
- 根 `sourceLineageId`；
- 复用 Story Unit ID 的 `narrativePathId`；
- `ownerStoryUnitId`；
- `currentRevision` 与 `currentVersion`；
-完整 revision 与 receipt 链。

`arrangementId` 由 Project、WorkVersion、path 和 owner 的稳定身份计算。`placementId` 由 arrangement ID 与首次 insert 的 operation ID 计算；move、跨 Unit move 和 rollback 都保持 Placement ID 不变。

Placement 至少包含：`placementId`、`eventId`、`arrangementId`、`storyUnitId`、WorkVersion/lineage/path 身份、内部 `orderKey`、role、来源凭据、创建和更新 revision。

Placement 不保存 Event 标题、正文、世界时间、Canon 或 WorldState 副本。

## 5. 顺序语义

调用方只能表达作者意图：

- `start` / `end`；
- `before(anchorPlacementId)`；
- `after(anchorPlacementId)`；
- move 时同时指定目标 Story Unit 与上述位置意图；
- remove 指定稳定 Placement ID。

R0 内部使用每个 Story Unit 内从 1024 开始的稀疏正整数 key。每次变更可以重平衡 key；重平衡只按变更前正式 key 的顺序工作，不使用 Event ID、标题、时间或输入数组补序，也不改变可见顺序。

完整可见顺序由正式 `StoryUnit.order` 与该 Unit 内 Placement `orderKey` 组合。重复 Unit order 或重复 Unit 内 order key 不使用字典序打破平局，而是暴露 `order-conflict`。

`linkedEntityIds` 和 Collection Point `eventIds` 继续是归一化后的无序成员关系，不被读取为叙事顺序，也不因 Placement 操作而改变。

## 6. 版本、并发、幂等与 receipt

每次写入同时检查：

1. 托管 Story Unit 当前 content hash，即 `expectedOwnerVersion`；
2. arrangement 的 `expectedRevision`。

任一过期都返回显式冲突，不执行 last-write-wins。失效 anchor、anchor 所在 Unit 不匹配、路径/分支错配、重复正式 key 和找不到 Placement 都返回明确冲突。

operation ID 是幂等键。完全相同的请求返回原 receipt；同一 operation ID 携带不同 payload 返回 `idempotency-key-reused`。

receipt 记录 action、operation、author action、payload digest、前后 revision、前后 Placement 身份、回滚目标和时间。revision 保存完整 Placement 快照及 digest。两者都保存在 Story Unit 子实体中并参与解析校验。

## 7. 回滚

回滚不是删除历史。Writer 读取目标 revision 的 Placement 快照，追加一个新 revision，并生成 `rollback` receipt。当前正式版本前进，内容恢复为目标版本；过去 revision 和 receipt 仍可追溯。

回滚不会修改 Event、世界时间、Relation、Canon 或 WorldState。

## 8. 正式与候选边界

本合同只保存作者确认的正式 arrangement。

- 当前明确的直接作者操作可调用 Writer，但必须携带 author action、版本门禁、receipt 和可回滚语义。
- 未来 UI 的普通画布拖动不得自动保存事实。
- AI 或 UI 建议必须先形成候选；候选不进入正式投影。
- 候选确认必须经过既有 AuthorControl，再以 `sourceKind=author-control` 调用同一个 Story Unit Writer。
- 本轮没有新增候选类型、候选 UI 或 AI 调用；现有 AuthorControl 的 Event/Canon change-set 结构不被强行改造成排序审批。

## 9. 旧项目

缺少 `narrative_arrangements_r0` 时，读取返回：

- `arrangement=null`；
- `placed=[]`；
- 每个当前 Event 为 `unplaced`，且 `narrativeIndex=null`。

读取不写回，不自动生成 arrangement，不使用 `linkedEntityIds`、Collection Point、Event ID、标题、创建时间、API 数组、world time、画布位置或 AI 推断。

旧项目不需要破坏性迁移。未来若提供建议式迁移，只能生成候选，并在 AuthorControl 确认后调用本 Writer；该 UI 不属于 R12-B2.1。

## 10. 分支与合流

WorkVersion ID 和现有 Story Unit ID 是唯一复用的来源/路径身份。

- 主路径 arrangement 可覆盖所有未归档 `kind=main` Story Unit，支持原子跨 Unit move。
- 每个既有 `kind=branch` Story Unit 可作为独立 R0 path root；其 arrangement 身份、版本与 receipt 独立。
- 同一 Event 可在两个分支具有不同 Placement 与 role。
- Writer 拒绝把一个分支 Placement 移入另一分支，从而拒绝隐式合流。
- 深层多 Unit 分支延续和正式 branch merge 仍需既有分支模型先冻结；R0 不创造临时后代或合流语义。

视觉相交、筛选、保存视图或多元副本读取都不创建或合并 arrangement。

## 11. 纯读取投影

`projectNarrativeArrangement()` 是无副作用纯函数，输出：

```text
placed
unplaced
order-conflict
dangling-reference
```

`placed` 只按正式 Unit order 与 Placement key 返回，包含稳定 Placement/Event ID、role、source 和 revision。`unplaced` 是无叙事索引的键值集合。投影不写磁盘、不写 localStorage、不调用 Provider，也不读取 world time 作为顺序。

本地 API 的 GET 只封装该投影；未来 R12-B2 UI 必须直接消费其 `placed` 顺序和冲突状态，不得重新排序。

## 12. Writer 命令

唯一命令面：

```text
readNarrativeArrangement
createNarrativeArrangement
insertNarrativePlacement
moveNarrativePlacement
removeNarrativePlacement
rollbackNarrativeArrangement
```

HTTP/local transport 只是该命令面的适配器，不是 Owner。生产 UI 本轮没有接入这些函数。

## 13. 被否决的方案

| 方案 | 否决原因 |
| --- | --- |
| Event 增加单值 `narrativeIndex` | 同一 Event 可在分支、倒叙、回看或改编中多次出现 |
| 复用 `linkedEntityIds` / `eventIds` 数组位置 | 当前归一化会按 ID 排序，只能证明成员关系 |
| UI/localStorage 排序表 | 会成为第二正式 Owner，且无法可靠并发与回滚 |
| world time 作为叙事顺序 | 世界发生时间与讲述顺序是两条独立维度 |
| 独立 arrangement 数据库 | 违反既有 Story Structure/Story Unit 唯一权威 |
| 为 R0 新造 branch ID | 会与 WorkVersion 和 Story Unit 分支身份分叉 |
| 自动旧项目迁移 | 会把 fallback 伪装成作者意图 |
| 大型 CRDT | 本地单作者 optimistic concurrency 已足够，当前没有引入复杂度的依据 |

## 14. 阶段边界

R12-B2.1 到此只交付合同、Owner 子实体、Writer、读取投影、兼容和测试。没有生产事件线画面、拖拽排序、默认“故事推进”、自动迁移、AI 排序、Provider/Embedding Binding 改动或 R12-B3 候选 UI。
