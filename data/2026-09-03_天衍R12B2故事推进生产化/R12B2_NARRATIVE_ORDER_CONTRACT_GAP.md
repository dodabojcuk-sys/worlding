# R12-B2 叙事排序合同缺口

## 结论

`R12-B2` 在生产实现开始前被正确性门禁阻断。当前领域不能区分“作者正式叙事位置”与稳定 ID、对象列表、返回顺序等 fallback，因此不能把现有事件集合安全地投影成默认“故事推进”脊柱。

这正命中 Founder 指令中的停止条件：若现有领域完全无法区分正式叙事位置与 fallback 排序，立即停止，不新增字段、数据库迁移或 Writer。

## 已证明的现状

### 1. Story Unit 只有单元级顺序

`StoryStudioStoryUnit.order` 是 Story Unit 自身的排序字段；Event 引用只有 `linkedEntityIds: string[]`，没有单元内叙事位置、位置来源、版本或冲突状态。

证据：`src/storyControlSurface/storyStudioWorkspaceOperations.ts:448-474`。

### 2. `linkedEntityIds` 不能承载作者顺序

Story Unit 归一化把 `linkedEntityIds` 交给 `normalizeStableIds`；该函数去重后强制按 `localeCompare` 排序。输入数组中的作者次序不会被保留。

证据：

- `src/storyControlSurface/storyStudioWorkspaceOperations.ts:3268-3289`
- `src/storyControlSurface/storyStudioWorkspaceOperations.ts:3747-3749`

因此，任何把 `linkedEntityIds` 的数组位置解释为叙事位置的做法都会把对象 ID 字典序伪装为故事顺序。

### 3. Collection Point 也没有可靠的 Event 内部顺序

Collection Point 有容器级 `order`，但其 `eventIds` 同样经过 `normalizeStableIds`。它能证明成员归属与集点顺序，不能证明集点内 Event 的叙事顺序。

### 4. 当前 narrative 画布直接继承运行数组顺序

`EventGraphCanvas` 通过 `visibleEvents.map((event, order) => ...)` 生成 layout order。这里的 `order` 是当前投影数组下标，不是领域 Owner 提供的作者叙事位置。

证据：`apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx:890-897`。

### 5. 当前分组不恢复单元内顺序

`groupEventsByUnit` 只使用 `StoryUnit.order` 建立 Event→Unit 归属，随后按 `events` 输入数组遍历；它没有可读取的正式 Event 叙事位置。

证据：`apps/story-studio/src/components/EventLineWorkbench.tsx:1046-1061`。

### 6. R12-A 已记录同一缺口

`R12A_CURRENT_EVENT_LINE_AUDIT.md` 已观察到：真实事件集合缺少稳定作者叙事次序时，运行投影按稳定对象/标题次序返回，18 Event 样例会偏离创作顺序，不能作为故事脊柱。

证据：R12-A 审计第 25 行。

## 被禁止的替代方案

本轮没有使用以下值补造叙事顺序：

- Event 标题、ID 或创建时间；
- 数据库/API 返回顺序；
- `linkedEntityIds` / `eventIds` 的字典序；
- 世界时间；
- React key、稳定哈希或 AI 推断；
- 观察层新增的未版本化本地排序。

## 为什么不能只做 UI

默认“故事推进”、共享 Event 脊柱、Story Unit 边界、分支展开和“待编排”区都必须先判定 Event 是否拥有正式叙事位置。当前只可证明 Event 身份、Unit 归属、Unit 顺序、Collection Point 归属与世界时间投影，不能证明 Event 的作者叙事位置。

若 UI 自己保存顺序，它会成为第二排序事实 Owner；若把全部 Event 都判为“待编排”，则无法交付 Founder 指定的生产默认故事推进，且会把已有作品误呈现为未编排。

## 需要 Founder / 产品核心先作出的合同决定

继续 R12-B2 前，需要先有一个明确且版本化的既有 Owner 结论，能够回答：

1. 哪个正式 Owner 持有 Event 的叙事位置；
2. 位置在 Story / Story Unit / Branch 中的作用域；
3. 分支来源身份和合流位置如何表达；
4. 缺失、重复和冲突位置如何被读取；
5. Event 创建、确认、移动和删除时由哪个唯一 Writer 更新；
6. 旧项目如何在不伪造作者意图的前提下保持 `unplaced`；
7. 版本、并发冲突与回滚凭据是什么。

这不是对新字段、数据库迁移或 Writer 的授权。本分支未实现任何一种方案。

## 本轮实际边界

- 生产 UI 修改：0
- 领域合同修改：0
- 新事实 Owner：0
- 正式事实写入：0
- Provider 调用：0
- 用户项目数据修改：0
- R12-B3 候选链：未开始
- 角色视角、关系演变、长篇窗口化：未开始

## 恢复条件

只有在 Founder 明确指定可追溯的正式叙事位置 Owner，或另行授权专项合同设计后，才应从唯一基线重新评估 R12-B2。不能以本报告作为自动修改领域合同的授权。
