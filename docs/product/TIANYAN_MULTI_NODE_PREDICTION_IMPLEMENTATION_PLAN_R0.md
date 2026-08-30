# 天衍多节点天意推演：最小实施计划 R0

状态：规则冻结与实施计划；本文件不授权产品实现。

依据：[`TIANYAN_PRODUCT_CORE.md`](../../TIANYAN_PRODUCT_CORE.md) 的“事件线的结构”“事件线预测”章节。

范围：事件线内的多节点天意推演，不改变 Canon、WorldState、Provider 或 Pi Agent 边界。

## 本轮视觉交叉核对与硬性门禁

本计划已实际核对本轮附带的六张 WinkNovel 工作台截图，以及 Founder 最终确认的天衍多节点预测图。同行截图中的工作流库、执行画布、运行日志、写作编辑器联动与状态追踪，只记录为后续能力；它们不改变本计划的首个实现切片，也不把内部 Agent 执行图带入事件线。

Founder 图中的作者可见流程是：选择已有事件作为推演范围 → 产生多条候选事件路径 → 在事件图上预览 → 检查一致性 → 选择路径并审阅 → 采纳为草稿。下列门禁是首切片的不可跳过合同：

1. **稳定身份去重。**候选永远只有候选 ID，不能生成或占用已有 Event 的稳定 ID。生成和采纳前均须查重；同名候选必须显示已有 Event 的引用，并要求作者明确选择“引用已有”“进入合并审查”或“保留为新草稿并说明差异”，不能静默创建重复身份。
2. **时间一致性。**每个候选路径须在生成后完成时间检查；检查按所选推演方式的时间规则执行。无法从来源或候选中确定时间时，节点明确标为“时间未定”，不得伪造日期。发现冲突时该路径不可采纳。
3. **预览隔离。**候选节点和候选关系只作为事件图上的虚线或半透明预览层，并始终标明“尚未写入事件线”；它们不得进入正式 Event / Relation、故事脊柱或时间轴的正式投影。
4. **采纳前置状态。**推演尚未完成、身份去重未决、时间一致性检查尚未完成、检查失败、来源已过期或未选择路径时，采纳操作必须禁用，并给出可恢复原因。
5. **先路径、后审阅。**作者必须先选择一个候选路径，才可进入审阅；审阅支持整条路径或该路径中的部分候选节点采纳。
6. **独立 Run。**每次推演创建独立、可读取的 Prediction Run 和结果 bundle；重新推演新建 Run，不覆盖、合并或隐去旧结果。
7. **可扩展方式。**请求合同使用可扩展的 `predictionMode`，不得把“向后推演”编码为唯一语义。R0 只实现 `forward-development`，其余方式仅保留注册与拒绝未知方式的边界。
8. **两张图严格分离。**作者只操作 Event、推演范围、候选路径和审阅结果。事件候选图不得渲染、存储或传输 Pi Agent、Prompt、模型、工具节点或内部执行边；这些只可留在内部运行回执与受控诊断层。

## 已冻结的产品规则

1. 单元是侧栏容器，可直接包含节点。
2. 集点是可选节点集合；R0 不嵌套集点、不复制节点。
3. 作者可选择一个或多个已有节点作为推演依据。
4. 天意返回多种候选发展；每种可以是连续节点链，允许分叉和合流。
5. 候选只在预览层，不写入事件线。
6. 作者可采纳整条路径或部分节点；结果只写作者草稿，绝不自动进入 Canon。
7. 故事脊柱、关系图、时间轴投影同一份正式 Event / Relation。
8. Tianyi 是全局最右侧 Dock；Pi Agent 与内部编排不面向普通作者。

## 已核实的现有能力

| 范围 | 现有实现与可复用点 | 本轮结论 |
| --- | --- | --- |
| 正式事件投影 | `apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx` 从 World Library 与已验证 Canon 事件列表构造事件线；`eventWorkspaceProjectionSummaries` 同时允许带“作者草稿”标签的 draft Event。 | 可作为采纳后的唯一正式可见数据源；候选不能插入此列表。 |
| 三种事件线视图 | `EventLineWorkbench.tsx` 将脉络、`EventGraphCanvas.tsx`、`EventTimelineProjection.tsx` 接到同一 `events` 与 `relations`；时间视图已在 React Flow 内按横向时间和关系边投影。 | 正式 Event / Relation 的“同源不同投影”已存在，应保持。 |
| 天意来源引用 | `src/storyContracts/storyStudioEventReference.ts` 提供项目、Event、版本、状态和用途绑定的引用；`storyStudioTianyiOperations.ts` 已验证同项目、去重的 `eventRefs`，上限为 4。 | 后端上下文已能承载多个约束引用；当前 UI 仅创建并传递一个引用。 |
| 候选与审阅 | `src/storyControlSurface/storyStudioAuthorControl.ts` 已持久化 Candidate Review，可读取、列举、放弃和决定候选；`EventLineWorkbench.tsx` 已有候选区与只读评审表达。 | 当前审阅对象是一条候选路线的一次接受/拒绝，且只允许一条 accepted route；不支持路径内节点选择。 |
| 当前候选接线 | `EventLineWorkbench.tsx` 接受 `GoldenLoopResult`；但 `R0EventLineProjection.tsx` 固定传入 `goldenLoop={null}`。 | 现有候选 UI 不能视为已上线的事件线预测闭环。 |
| 草稿写入 | `R0EventLineProjection.tsx` 已以 `createWorldObject({ type: "event", status: "draft" })` 新建作者草稿；唯一 Workspace owner 位于 `src/storyControlSurface/storyStudioWorkspaceOperations.ts`。 | 可复用 owner，不让 UI、Tianyi 或 Author Control 直接写 Event 文件。 |
| 关系写入 | 当前图中的 Relation 操作走现有 `create/confirm/update/rejectRelationCandidate` owner。 | R0 推演候选边只能作为预览边；采纳节点时不得自动创建或确认 Relation。 |

## 实际缺口

- 事件线只有单选 `selectedEventId` 和单个 `onOpenTianyi(reference?)` 入口；缺少有序多选、选择上限、来源版本失效提示和批量引用组装。
- Tianyi 现有 `eventRefs` 是上下文约束，不是“多节点推演请求”与候选路径合同；不存在可持久化的候选节点、路径、分叉/合流边、来源快照和预览状态模型。
- Candidate Review 目前以候选路线为原子决定，不能选择路径内的节点，也没有“仅创建草稿”的批量、幂等回执。
- `eventSemanticHierarchy.ts` 当前将 Set Point 生成到一个 `storyUnitId` 下，且缺省为“未指定集点”。这与“集点可选、非强制层级”不同；R0 需要无损读旧标签，同时把集合成员关系从父子关系中分离。
- 图和时间画布尚无只读候选叠加层；不可把候选节点伪装成 Event，也不可复用正式 Relation ID。
- 当前 Tianyi 菜单有“后续候选”意图，但没有端到端多节点预测命令、确定性 fixture adapter 或审阅后草稿写入流程。
- 不存在候选与既有 Event 的稳定身份/同名冲突决议、推演方式合同、路径级时间一致性检查、Run 历史或“检查完成前禁用采纳”的状态机。

## 第一个可独立验收的最小闭环

目标仅为：**多选已有节点 → Tianyi 生成多条候选节点链 → 图中预览 → 审阅并采纳部分或整条 → 只保存为草稿。**

### 用户流与验收边界

1. 作者在关系图或故事脊柱中选择 1–4 个现有 Event；界面显示顺序、标题与版本状态，并把这些事件的版本绑定引用交给 Tianyi。
2. 作者从最右侧 Tianyi 发起 `forward-development` 推演。每次请求创建独立 Prediction Run；R0 使用本地确定性 fixture gateway，返回至少两条候选路径。每条含 1–N 个候选节点和预览边，合同允许分叉或合流。
3. 关系图以虚线/半透明的候选叠加层显示结果，并标明“尚未写入事件线”。候选节点与预览边不进入正式脊柱数据、正式 Relation 列表或时间轴正式投影；候选来源、Run、路径和版本可见。
4. 系统完成稳定身份/同名冲突检查和路径时间一致性检查。相同标题必须由作者选择引用、合并或以已说明差异创建新草稿；未知时间明确显示“时间未定”，冲突路径被阻断。所有检查未完成前，审阅与采纳不可继续。
5. 作者先选择一个仍为 current 的候选路径，再进入审阅；可选择整条路径或路径中的多个候选节点。
6. 采纳命令由 Workspace Event owner 幂等创建对应的 `status: "draft"` Event。写入回执列出每个新草稿 ID、来源 Run/path/candidate ID 和同名决议；不创建/确认 Relation，不调用 Canon 写入链，不改 WorldState。
7. 刷新后可从 Run、审阅回执与事件线草稿投影复核已创建草稿；未采纳候选仍是预览，重新推演保留旧 Run，放弃某个 Run 不会删除任何正式 Event。

非目标：集点编辑器、嵌套集点、候选 Relation 采纳、自动时间推断、自动 Canon、真实模型、女娲 Run、跨项目来源或改变 Tianyi 的 Dock 布局。

## 建议实施切片与文件接口

### 1. 先建立领域合同和确定性测试夹具

新增 `src/storyContracts/multiNodePrediction.ts`，仅定义和校验：

- `MultiNodePredictionRequest`：`projectId`、有序且去重的 `sourceEventRefs`、作者目标、`predictionMode`、`operationId`；引用复用 `StoryStudioEventReference`，用途保持 `constraint`。R0 仅接受注册的 `forward-development`。
- `PredictionRun` 与 `PredictionBundle`：稳定且彼此独立的 `runId` / `bundleId`、来源快照、方式、`paths[]`、候选 `nodes[]`、候选 `edges[]`、生成/检查/审阅状态与版本；重新推演只能新建 Run。
- `PredictionPath` 与 `PredictionNode`：路径成员、顺序和可选分叉/合流边；每个节点包含显示文本、来源/不确定性、时间检查结果与草稿转换所需的最小字段。候选 ID 必须命名空间隔离，不能使用正式 Event / Relation ID 或内部 Agent 执行 ID。
- `IdentityResolution`、`TimeConsistencyResult`、`PredictionReviewGate`：同名/稳定身份的引用、合并或新建决议；时间通过、冲突或“时间未定”；以及只在生成与检查完成、路径已选、来源 current 时启用审阅/采纳的状态。
- `PredictionAcceptanceSelection` 与 `DraftCreationReceipt`：已选择路径及整条/显式节点选择、同名决议、幂等 operation ID、生成草稿 ID、未创建原因。

同步扩展 `tests/storyContracts/`：校验多源去重、版本绑定、方式注册、Run 不覆盖、分叉/合流合法性、不得循环为未声明的连续路径、候选 ID 不可伪装正式 ID、同名决议、时间冲突/时间未定，以及部分选择不得扩大为整条路径。

### 2. 将天意编排限制在候选生成与读取

在 `src/storyControlSurface/storyStudioTianyiOperations.ts` 增加多节点预测操作，复用现有 `normalizeContextEventReferences`、服务端重读和版本校验。它只创建/读取独立 `PredictionRun` 与 `PredictionBundle`，不获得 Event、Relation、Canon 或 WorldState 写权；事件候选 DTO 不包含 Prompt、模型、工具、Pi 或内部执行图字段。

在 `src/storyAgent/` 或现有 Tianyi fixture adapter 层增加一个显式的、可注入的确定性 `MultiNodePredictionGateway`。生产 Provider 不在本切片接入；UI 文案只称“天意推演”，不出现 Pi、runtime、tool loop 或 gateway 名称。

必要的 transport/route 薄层应在 `apps/story-studio/server/server.mjs` 与 `apps/story-studio/src/lib/localTransport.ts` 成对增加，并复用本地控制 token、projectId 与 operationId 校验。

### 3. 让唯一 Workspace owner 批量创建草稿

在 `src/storyControlSurface/storyStudioWorkspaceOperations.ts` 增加一个专用的幂等批量草稿命令（建议名 `createPredictionDraftEventsOnce`）。其输入是已校验的采纳选择和候选节点快照；其输出为逐节点 `DraftCreationReceipt`。

它只能在 Run 已完成、路径已选择、身份决议已完成且时间检查无冲突时创建 `type: "event"`、`status: "draft"`、`作者草稿` 标签的 Event，并记录来源 run/bundle/candidate/path 与身份决议的可追溯元数据。不能调用 `createConfirmedEventOnce`、Canon 写入、WorldState 更新或 Relation owner。发生版本冲突、来源陈旧、身份未决、时间冲突或任何节点校验失败时，先返回可恢复错误；批次写入必须采用 operation ID 幂等化，避免重试重复创建。

`src/storyControlSurface/storyStudioAuthorControl.ts` 只扩展为审阅选择与审阅回执 owner：把当前“单路线 accepted”模型扩展为路径与节点粒度的决定，但不自行写 Event。它调用上述 Workspace 命令后保存 receipt，再投影结果。

### 4. 在既有事件线与 Tianyi UI 上增加薄适配

- `apps/story-studio/src/components/EventLineWorkbench.tsx`：把单选扩展为可控的多选集合；继续使用现有详情的单一焦点。新增“以 N 个节点推演”、Run 列表、路径先选后审阅和候选叠加入口，不能把候选混入 `events`，更不能显示内部 Agent 执行图。
- `apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx`：组装正式 Event / Relation 投影、多源引用、Prediction Bundle、草稿创建回执与重新加载；保持它只做 adapter。
- `apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx`：接收只读候选 overlay nodes/edges，使用独立样式与交互，不调用 Relation owner。
- `apps/story-studio/src/components/event-observation/EventTimelineProjection.tsx`：首切片只投影正式 Event / Relation；若展示候选，必须是明确的 overlay 且不作为第二套时间数据。默认不把候选时间当作事实。
- `apps/story-studio/src/components/tianyi/sidebar/`、`composer/`、`capability-launcher/`：仅增加天意命令与来源/审阅状态的表现和回调；不迁移 Tianyi Dock，也不泄露内部运行实现。

## 数据兼容与迁移风险

1. **Event ID 与版本：**不改既有 Event ID。每次推演保存其来源 Event ID、revision token 与 projectId；服务端重读不一致即标为 stale，禁止采纳。
2. **集点语义：**旧数据可继续从 `Story Unit:` / `Set Point:` 标签无损读取。R0 不做存量迁移，不删除默认投影标签；新合同需把 Set Point 表达为可为空的 membership index，而非必须的 `storyUnitId`。在有持久化 owner 与迁移回退方案前，不重写用户标签。
3. **候选隔离：**Prediction Bundle 另存为候选工件，不能追加到 World Library、正式 Event list、Relation list、Canon 或 WorldState。候选边也不得借用 Relation ID；预览只以虚线/半透明及“尚未写入事件线”文案呈现。
4. **身份冲突：**候选 ID 不是 Event ID。相同标题或近似身份必须保留检测证据与作者决议；只有“新建”且说明差异时，Workspace 才生成新的 stable Event ID。
5. **时间：**时间检查保存为 Run 结果。无法确定时保存 `unknown`，不迁移或伪造日期；冲突结果禁止写草稿。
6. **草稿可追溯：**仅在作者采纳时写 draft Event；保留 run/bundle/path/candidate 与身份决议来源。重复 command 必须返回已有 receipt，部分失败不能静默补齐或升级为 confirmed。
7. **旧 Candidate Review：**保留 `story-studio-candidate-review/v1` 读取；多节点预测应有版本化的新 artifact 或明确 v2 迁移读取器，绝不以非兼容字段覆盖旧 review 文件。

## 验证计划

- 单元：多源引用版本校验、4 节点上限、方式注册、Run 不覆盖、候选图的路径/分叉/合流校验、Set Point 可选成员投影、同名身份决议、时间冲突/时间未定、部分采纳选择和幂等 receipt。
- Owner 集成：以临时项目和 deterministic gateway 生成两个独立 Run、每个至少两条路径；断言候选生成零 Event/Relation/Canon/WorldState 写入、候选 DTO 零内部 Agent 图字段、检查未完成时采纳禁用、同名未决和时间冲突时草稿写入被拒绝；部分与整条采纳只产生 `draft + 作者草稿` Event；重复 operation ID 不重复写入。
- 现有边界回归：`tests/storyContracts/eventSemanticHierarchyR0.test.ts`、`tests/storyStudio/tianyiCreativeEventM0.test.ts`、`tests/storyStudio/tianyiCreativeGoldenLoopR0.test.ts`、`tests/storyStudio/tianyiCreativeOwnerHandoffR0.test.ts`、`tests/storyStudio/tianyanEventGraphVisualRebuildR1.test.ts` 与 `tests/storyStudio/timelineProjection.test.ts`。
- 浏览器 E2E：多选 → Tianyi 最右侧以 R0 推演方式请求 → 两路径虚线预览且标记“尚未写入事件线” → 等待一致性检查完成 → 选择一条路径 → 选择其中部分节点 → 草稿出现；覆盖同名三种决议、时间未定、时间冲突禁用、重新推演保留旧 Run。断言正式关系、Canon 与 WorldState 前后完全相同；刷新后 Run、receipt 和草稿仍可复核。
- 所有测试只使用 mock/本地伪服务器；验证 `REAL_MODEL_CALLS=0`。

## 回滚、停止条件与交付门槛

功能以 Prediction Bundle/overlay 开关隔离。关闭入口或放弃 bundle 仅移除候选预览；已明确采纳的草稿仍按现有草稿生命周期处理，不做隐式删除。由于本切片不写 Canon、WorldState 或正式 Relation，不需要这些域的回滚。

停止并拒绝采纳，直到人工处理，若出现任一情况：来源 Event 已删除/变更/跨项目；Run、推演或一致性检查未完成；未选择路径；同名身份未决；时间冲突；候选图校验失败；候选 ID 与正式 ID 冲突；请求方式未注册或超出选择上限；批量草稿写入冲突且无法给出逐项回执；任何路径试图创建或确认 Relation、写 Canon 或更新 WorldState；候选在正式脊柱/时间轴中被当作事实；或 UI 把 Pi/Prompt/模型/工具/内部编排暴露给普通作者。

实施完成的最低门槛是：上述最小闭环在隔离 fixture 上通过单元、集成和 E2E，且每个 Run 独立可复核、审阅门禁可证明、草稿来源与零 Canon/WorldState/正式 Relation 变化均可复核。之后才评估集点持久化、候选关系采纳、时间候选、工作流库、运行日志、写作联动、状态追踪和真实 Provider 的独立计划。
