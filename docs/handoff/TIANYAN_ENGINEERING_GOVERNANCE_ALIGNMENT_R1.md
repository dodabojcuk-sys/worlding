# TIANYAN_ENGINEERING_GOVERNANCE_ALIGNMENT_R1

> 文档性质：产品语义到工程准入规则的只读对照审查  
> 对照基线：`TIANYAN_PRODUCT_SEMANTIC_CORE_R1`、`TIANYAN_BOUNDARY_MODEL_R1`  
> 工程范围：当前 Story Studio 真实代码  
> 本文不设计功能、UI、数据库或 API，也不改变任何现有 Owner。

## 0. 审查结论

当前工程已经具备若干可靠的局部边界：正式 Event 有专用写入链；Prediction、Nuwa Run、Planned Event、Derived Version 都有不同程度的来源冻结、状态校验或作者确认；Agent 运行也已有工具白名单、审批回执和部分 Scope 校验。

但这些门槛尚未统一成一条工程准入规则。当前不能把“某个模块自身有状态字段”视为全工程已经满足边界。尤其存在三处必须先治理的缺口：

1. Future 对象与 Canon 对象存在物理共存，所有读取方尚无统一的 Canon 准入认证；
2. Nuwa `heard` 记忆可以在没有正式 Event 的情况下持久化并被后续 Run 召回，形成第二角色认知事实风险；
3. Agent 的 Capability、Permission、Scope 分散在不同路径，部分是硬拒绝，部分只是注册信息或 UI 文案。

工程准入应统一为：

> **有效行为 = Capability ∩ Permission ∩ Scope ∩ Owner Admission**

- Capability：工程确实注册并允许该行为；
- Permission：当前用户明确允许本次行为；
- Scope：行为只作用于被授权的项目、WorkVersion、对象与 Run；
- Owner Admission：最终变化只能由唯一领域 Owner 接纳，Agent、设备、同步服务和 Future 对象本身均不能绕过。

任一项缺失，行为必须失败关闭。UI 展示、提示词、标签或模型自述都不能代替准入。

---

# A. 已有工程门槛

## A1. Future Projection Layer

| Future 语义 | 当前工程事实 | 已有硬门槛 | 当前结论 |
|---|---|---|---|
| Prediction | `multiNodePrediction.ts` 定义 Run、Bundle、节点、边和来源快照；`storyStudioMultiNodePredictionOperations.ts` 负责持久化与过期判断 | 固定 `projectId`、来源版本与快照；来源变化后标记 stale；生成物先保持预测/草稿身份 | **已有局部门槛**，但缺少全工程 Canon 读取认证 |
| Nuwa Scenario | `nuwaRunPack.ts`、`nuwaN1Runtime.ts` 将排演保存在 Run 内；任务默认无正式写入权；候选通过既有作者审查链送出 | Run 身份、冻结来源、步骤回执、作者提示 revision、候选移交、AuthorControl | **边界总体成立**；角色 `heard` 记忆是例外风险 |
| IF Proposal | 未发现独立且通用的 IF Proposal 工程契约 | 当前可借 Candidate/作者审查表达“如果……”建议 | **语义缺口**；不得因此新建第二事实 Owner |
| Planned Event | `storyStudioWorkspaceOperations.ts` 为规划事件保留专用创建路径，并禁止普通对象更新伪造 `planned/committed` 权威状态 | 规划标签和状态受保护；必须先进入 Impact Review；正式写入另走 `createConfirmedEventOnce` | **已有强门槛**，但规划事件与正式事件物理共存，读取侧仍需统一约束 |
| Derived Version | `workVersionAuthority.ts` 管理 root/derived 身份、来源版本、manifest、lineage、receipt；`multiverseB1MergeCoordinator.ts` 管理差异、冲突与合并 | 固定父版本和来源 revision；要求完整 Owner snapshot；派生版本与源版本隔离；合并经过 Owner 顺序和回执 | **当前最完整的 Future Commit 边界** |

已有的正式 Event 准入链为：

```text
Future / Candidate / Planned Event
              ↓
        Impact Review
              ↓
     applyAuthorChangeSet
              ↓
   createConfirmedEventOnce
              ↓
       verified Canon read
```

关键事实：Prediction 采纳目前创建的是 `draft` Event WorldObject；Planned Event 也可进入现有事件存储和时间线。它们没有因此成为 Canon，但工程不能再以“存储位置”“对象 type”或“出现在时间线”作为正式事实判断条件。

## A2. Character

| 认知操作 | 当前状态 | 当前 Owner / 边界 | 判断 |
|---|---|---|---|
| Query | 已有 | `CharacterMemoryQueryProjection`、`CharacterStateProjectionPort`；明确 `writes: 0`、`providerCalls: 0`，并按 project/character/WorkVersion/叙事位置过滤 | **已有，只读边界较强** |
| Guidance | 部分已有 | Nuwa `cueNuwaN1Run` 把作者提示写入当前 Run 的 `pendingCue`，带 expected revision 和 cue receipt | **已有 Run 内能力；尚无通用 Guidance 契约** |
| Experience | 部分已有 | 正式部分从 Event knowledge projection 读取；临时部分存在于 Nuwa Run step | **已有数据来源，但缺少统一生命周期** |
| Information Transfer | 部分已有 | Nuwa step 显式记录 `heardByActorIds` / `heardStatements`；`CharacterMemoryLedger` 持久化 `heard` | **有真实实现，但当前跨 Run 持久化越过 Event 边界** |
| Experience Promotion | 未形成完整工程准入 | 当前没有一个明确保证“Run 经验经作者确认并由正式 Event 支撑后才进入持久角色认知”的统一事务边界 | **缺失** |

已有 Query 没有第二 Character Owner：它是对 Event knowledge、角色状态投影和 `heard` ledger 的只读聚合。`CharacterStateProjectionPort` 也是投影端口，不是持久角色状态 Owner。

当前最重要的不一致是：`nuwaN1Port.mjs` 在 Run step 后调用 `synchronizeCharacterHeardMemories`；`characterMemoryRepository.ts` 会把 `heard` 保存为可被以后运行召回的记录。虽然 Query 正确地把 `heard` 与正式 Event 经验分开显示，但其跨 Run 持久性已经形成“第二认知事实”风险。

## A3. Author Intent 与 Execution Brief

当前 `TianyiNuwaExecutionBrief` 已经具备实际工程强度：

- `authorGoal` 与作者原始 `sourceQuestion` 分开保存；
- `mustKeep`、`mustAvoid`、未决问题、来源集合和当前上下文进入同一 revision；
- `allowedAgents`、`allowedSkills`、运行次数、token、调用次数和超时预算进入同一 Brief；
- Brief 有 revision、内容 hash、source-set hash、作者批准状态和 Run binding；
- 启动前会拒绝未批准、过期或包含未知 Agent/Skill 的 Brief。

这说明 Brief 已是可靠的**单次执行约束载体**，但它同时混合了四种语义：

1. 作者为什么要做：Author Intent；
2. 本次看什么：Context / Scope；
3. 本次允许谁做什么：Capability / Permission；
4. 如何执行和返回：Execution Plan / Budget / Return Destination。

因此，Brief 目前不能被直接认定为长期 Author Intent Owner。

## A4. Agent

| 维度 | 真正强制的部分 | 仅声明、展示或局部生效的部分 |
|---|---|---|
| Capability | Agent tool registry 拒绝未知工具；参数 schema、字段、长度和危险外部执行内容会被校验；Execution Brief 拒绝未知 Agent/Skill | `contextualCapabilityRegistry.ts` 明确是 presentation-only；其中 capability kind 和 scopeLabel 不授予任何权限 |
| Permission | Tianyi Runtime 的受控工具需要作者审批回执；Pi tool call 在执行前经过 `authorizeTool`；`ActionPermissionBroker` 对 protected action 和 Nuwa 范围授权作实际判断 | `permissionProfile` 或 UI 选择本身不是 Owner 写入授权；Broker 只在调用路径真正接入时才构成门槛 |
| Scope | Nuwa N1 绑定 project/run/story unit/actor/source revision；Tianyi Runtime 绑定 project/WorkVersion/session/run，并检查当前激活 WorkVersion；Execution Brief 绑定来源快照与上下文 | tool definition 中的 `current-session/current-project`、Capability 面板的 scopeLabel 主要是元数据；尚未成为所有执行路径共享的统一 Scope 判定器 |

当前 Agent 不是作者，也不是 Canon Owner。这一点在候选工具、AuthorControl 和 Nuwa handoff 路径中已经成立。问题不在是否存在门槛，而在门槛没有覆盖所有运行时与所有工具入口。

## A5. Cross Device 的已有基础

当前代码已经提供未来跨设备所需的部分底座：

- 稳定的 project、object、run、session、WorkVersion 身份；
- revision、hash、expected revision、operation id 和幂等回执；
- 多数关键本地文件使用临时文件后 rename 的原子写入；
- WorkVersion manifest 和 Owner snapshot 完整性校验；
- Candidate、Run、正式 Event 和 Derived Version 已有不同状态与写入路径；
- 项目路径策略限制跨项目文件越界。

这些只能证明“本机可建立受控写入”，尚不能证明“多设备可并发同步”。本地文件锁、原子 rename 和单机 expected revision 不等于分布式单写者规则。

---

# B. 缺失工程门槛

## B1. Future 必须新增的统一检查

### F-01 Future Authority Declaration

所有 Prediction、Nuwa Scenario、IF Proposal、Planned Event、Derived Version 必须带有可机器判断的权威类别，并明确其允许去向：

| 类型 | 唯一 Owner | 默认权威 | 唯一允许的晋升方式 |
|---|---|---|---|
| Prediction | Prediction Run Owner | Projection | 生成 Candidate，不能直接生成 Canon |
| Nuwa Scenario | Nuwa Run Owner | Run-local Projection | Candidate → AuthorControl；不得直接改写源世界 |
| IF Proposal | 既有 Candidate / AuthorControl 生命周期 | Proposal | 作者 Commit 后才可创建 Derived Version |
| Planned Event | Event Planning 生命周期 | Planning | Impact Review → AuthorControl → Confirmed Event |
| Derived Version | WorkVersionAuthority | 该派生版本内的正式版本 | 只在自身 WorkVersion 内生效；回源必须走 B1 合并链 |

IF Proposal **不需要新的事实 Owner**。它需要的是 Candidate 语义下的明确契约。否则“为了保存 IF”而新增独立世界、Event 或 Version 存储，反而会制造第二事实。

### F-02 Canon Read Certification

每一个把 Event、WorldState、Character、Relation 作为正式事实读取的消费者，都必须证明它只读取经过正式准入的对象。统一禁止以下替代判断：

- `type === event`；
- 存在于事件目录；
- 存在于时间线；
- 有 `planned`、`draft` 或 Prediction 标签；
- 被某个 Agent 或 Run 产出；
- 已写入某个持久文件。

只有 verified Canon admission 可以进入正式世界投影、角色认知、关系证据、正式 ContextPack、导出和跨设备同步。

### F-03 Promotion-Only Write

Future 对象不得直接改写正式 Owner。所有提升必须保存：来源 Future 身份、来源 revision/hash、作者决定、目标 Owner、BaseVersion、写入回执和补偿结果。来源过期、选择不完整或目标版本变化时必须失败关闭。

### F-04 Derived Version Isolation

Derived Version 必须始终具有自己的 WorkVersion 身份。任何读取、生成、导出、Agent Context 和同步操作不得把 derived 内容无标识地混入 root Canon；回到 root 只能经过现有差异、冲突、Owner 顺序与作者确认链。

### F-05 Future Non-Propagation

未 Commit 的 Future 不得成为下列正式输入：

- 角色“已经知道”的知识；
- WorldState 当前事实；
- Relation 当前事实；
- 后续 Canon 推演的已发生前提；
- WorkVersion 完整快照中的正式 Owner 数据；
- 另一设备自动接纳的正式变化。

Future 可以被新的 Future Run 引用，但引用必须保持 Future provenance，不能在传递中丢失其非 Canon 身份。

## B2. Character 必须新增的 Owner 与晋升规则

### Owner 判断

| 语义 | 是否需要新增独立事实 Owner | 工程治理决定 |
|---|---|---|
| Query | 否 | 保持只读投影；禁止持久写入 |
| Guidance | 否，不得成为 Character Owner | 由当前 Run Owner 保存指令、revision 和回执；只影响后续 Run 步骤 |
| Run-local Experience | 否 | 由 Run Owner 保存；Run 结束后仍是排演证据，不是角色正式经历 |
| Formal Experience | 否 | 从已确认 Event 与角色参与/观察/被告知证据派生 |
| Information Transfer | 否，不建立第二 Memory truth | 持久角色认知变化必须由已确认 Event 支撑；AuthorControl 负责晋升决策，Event Owner 负责正式写入 |
| Experience Promotion | 需要明确的准入契约，但不需要新的事实 Owner | 契约协调 Run → Candidate → AuthorControl → Event → Character projection |
| 非 Event 型持久 CharacterState | 当前无明确唯一 Owner | 在确定唯一 Owner 前禁止写入和跨端同步；不得让 ProjectionPort 或 MemoryLedger 越权成为 Owner |

### COG-01 Guidance Run Locality

Guidance 必须绑定 project、WorkVersion、character、run、expected revision 和有效期。它只能改变注意方向、判断倾向和当前推演范围，不得：

- 修改 Character 正式资料；
- 增加角色正式知识；
- 伪造已发生经验；
- 默认继承到无关 Run；
- 被 Character Query 当成角色自己的信念或记忆。

当前 Nuwa cue 已绑定 Run 和 revision，但其自由文本没有通用语义校验，也没有覆盖非 Nuwa Agent。

### COG-02 Cross-Run Cognition Gate

任何记录只要能影响另一个独立 Run 中角色的知识、信念、记忆或状态，就必须满足二选一：

1. 有已确认 Event 及角色获知路径；或
2. 明确保持为同一 Run lineage 内的临时上下文，不进入正式 Character Query。

当前 `CharacterMemoryLedger` 的 `heard` 跨 Run 召回不满足该规则。治理上应将其限定为 Run provenance / 审计证据，不能把它视为正式角色认知 Owner。

### COG-03 Information Transfer Event Gate

持久信息传播必须具备：发送者、接收者、信息内容、发生时点、传播方式、来源 Event、作者确认和目标 WorkVersion。缺任一关键依据，结果只能停留在 Run/Candidate，不能进入角色正式知识变化。

### COG-04 Experience Promotion Atomicity

Experience Promotion 必须保证 Event 正式写入、Character 投影可见性和 WorkVersion/receipt 对齐。不能出现“Event 未确认但角色已记住”或“Event 已补偿但角色记忆仍有效”的半完成状态。

## B3. Author Intent

### 判断一：是否需要独立 Owner

**需要，但只针对可复用、可跨 Run、可参与作者决策追踪的 Author Intent。**

它是作者权威，不是故事事实权威：

- 不进入 Canon；
- 不自动生成 Event；
- 不因 Agent 解释而改变；
- 可以被作者修订、撤销或替换；
- 每次执行只能引用一个明确 revision；
- Agent 推断出的“作者可能想要”只能是 Candidate，不得写回 Author Intent。

临时的一次性指令可以继续由当前 Run/Brief 持有；只有需要跨 Run 复用或作为长期约束时，才必须进入 Author Intent Owner。这样既避免 Brief 成为隐性全局真相，也避免为每句临时指令创建永久对象。

### 判断二：Brief 是否应该拆语义

**应该拆语义，但本文不要求拆文件、数据库或 API。**

工程契约上至少要分清：

| 语义块 | 内容 | 权威来源 |
|---|---|---|
| Author Intent Reference | 目标、必须保持、禁止改变、成功/失败标准、未决问题 | 作者确认的 Intent revision |
| Execution Context | 当前项目、WorkVersion、文档、对象、来源集合与 hash | 当前项目 Owner snapshot |
| Agent Admission | allowed Agents/Skills、Permission、Scope、预算和敏感级别 | 用户/项目授权 |
| Run Plan | 运行次数、seed、超时、输出类型、返回位置 | 当前 Brief revision |

当前 Brief 的 hash、source-set hash、approval 和 run binding 可以继续作为良好基础，但“Brief 已批准”不能等价于“作者长期意图已被定义”。

### INTENT-01 Intent Provenance Gate

任何 Agent Run 如果声称遵循 Author Intent，必须引用作者确认的 Intent revision；没有引用时只能标为本轮输入或 Agent inference。

### INTENT-02 No Back-Write Gate

Candidate、Run 结果、模型总结和设备同步都不得自动修改 Author Intent。只有作者动作可以建立、修订、撤销或替换它。

## B4. Agent：从局部门槛升级为统一准入

### AGENT-01 Capability Enforcement

每个可执行能力必须来自运行时白名单和版本化定义；UI Capability Registry 只负责发现与描述。未知能力、未装载能力、版本不匹配或 Owner handoff 不存在时必须拒绝。

### AGENT-02 Permission Enforcement

每个非只读动作必须在执行当下验证授权；审批回执必须绑定具体用户、项目、Agent、Run、动作、目标、BaseVersion 和有效期。权限档位不能替代具体动作授权，过期或撤销授权不能被重放。

### AGENT-03 Scope Enforcement

每次 Context 读取、工具调用、Candidate 写入和 Owner handoff 都必须校验同一个 scope envelope。至少包括 project、WorkVersion、session/run、目标对象集合和来源 revision。工具定义中的 scope 文本不是校验结果。

### AGENT-04 Conjunctive Admission

Capability、Permission、Scope 必须在同一执行链上同时成立，且在真正 Owner 写入前再次校验。不能出现：

- 有能力但无权限；
- 有权限但目标越界；
- Scope 正确但工具未注册；
- 前置检查通过后目标 WorkVersion 已变化；
- Agent 回执被另一 Run、另一项目或另一设备重放。

### AGENT-05 Agent Cannot Author

Agent 可以生成 Query、Guidance、Run、Candidate 和带来源的变更建议；不能生成作者确认、伪造 Author Intent、把自己的选择标为作者选择，或直接成为 Event/Canon/Character/WorkVersion Owner。

## B5. 手机、NAS 与云同步前置条件

### 全部跨设备形态的共同前置条件

以下条件未全部满足前，不得宣称“天衍项目同步”可用：

1. 完成唯一 Owner 清单，覆盖 Event、Character、Relation、WorldState、WorkVersion、Candidate、AuthorControl、Run、Author Intent；
2. 所有正式读取通过 Canon Read Certification；
3. 所有正式写入具备 BaseVersion、expected revision、operation id、幂等回执和补偿边界；
4. WorkVersion 能形成完整且一致的 Owner snapshot；不支持或缺失的 Owner 必须失败关闭；
5. 明确跨设备单写者或冲突仲裁规则；本地锁和文件 rename 不算跨设备协调；
6. 正式事实、Future、Candidate、Run、缓存、索引、密钥和临时文件具有不可混淆的同步分类；
7. 权限回执、作者身份和项目授权不能被其他设备重放或冒用；
8. 设备离线、时钟漂移、重复上传、乱序到达和部分同步不能改变语义结果；
9. 冲突副本不得被自动导入为正式 Owner 状态；
10. Character 的跨 Run 认知边界与 Experience Promotion 已闭合。

### 分形态准入

| 形态 | 上线前必须满足 | 在满足前允许的边界 |
|---|---|---|
| 手机端 | 不持有第二 Event/Character/Memory/Version 模型；只消费认证读模型；离线变化只能保持为本地草稿/Candidate，回连后重新校验 BaseVersion 与作者身份 | 只读浏览或不具正式写入权的临时输入 |
| NAS / WebDAV / 坚果云 | 明确它们只是外部文件传输；项目关闭或单写者条件可验证；冲突副本、部分上传和延迟覆盖可检测并隔离 | 备份、导入/导出、关闭项目后的单向复制；不得称为多人实时项目同步 |
| Relay | 只转发加密数据或操作，不解释 Canon，不决定冲突，不产生 WorkVersion | 传输层；不能成为 Owner 或 AuthorControl |
| 官方云 | 远端执行仍复用同一 Owner 规则；具备分布式并发控制、项目级身份权限、完整 Owner snapshot、重放保护、补偿与可审计回执 | 在上述门槛闭合前只能提供文件托管或受限只读能力，不能宣称云端故事权威 |

设备、NAS、WebDAV、坚果云、Relay、官方云和自部署环境都不是故事权威。部署位置变化不能改变 Owner。

---

# C. 必须禁止提前开发

在 B 组门槛闭合前，以下方向应作为工程禁区，而不是普通待办：

1. 新建独立 Prediction World、Nuwa World、IF World 或 Planned Event Store，并让其可被正式查询当作事实；
2. 让 Prediction、Nuwa Scenario、IF Proposal 或 Planned Event 直接调用正式 Owner 写入；
3. 仅因作者创建了 IF 分支，就把 IF Proposal 与 Derived Version 合并成同一个概念；
4. 在手机端复制 Event、Character、Memory、Version 或 Canon 模型并允许本地成为权威；
5. 直接用 NAS、WebDAV、坚果云共享一个正在被多设备写入的项目目录；
6. 把官方云数据库、Relay、自部署节点或最后写入设备定义为新 Owner；
7. 扩大 `CharacterMemoryLedger` 的正式角色记忆职责，或在没有 Event 的情况下继续增加跨 Run 认知类型；
8. 在 Experience Promotion 尚未闭合前开发长期角色自主成长、跨设备角色记忆或后台角色 Agent；
9. 把自由文本 Guidance 写入 Character 档案、知识、信念或正式状态；
10. 把 Execution Brief 当成全局 Author Intent，或允许 Agent 根据对话自动重写作者长期意图；
11. 仅凭 UI Capability、按钮可见性、permission profile 或 scopeLabel 宣称 Agent 权限已生效；
12. 在没有统一 Capability × Permission × Scope × Owner Admission 前增加新的高权限 Agent 工具；
13. 在 Owner snapshot 不完整时上线项目级同步、自动合并或后台双向同步；
14. 用路径、标签、对象类型或时间线位置替代 verified Canon admission。

---

# D. 建议新增测试 / 契约类型（只描述，不实现）

## D1. Future 与 Canon

| 测试 / 契约类型 | 必须证明的事实 |
|---|---|
| Future Authority Contract | 五类 Future 均声明唯一 Owner、authority class、来源 revision、允许晋升目标；缺失即拒绝 |
| Canon Read Certification Suite | 每个正式 World/Event/Character/Relation/ContextPack/导出读取方都排除 draft、planned、prediction、run-local、uncommitted IF |
| Promotion Route Contract | Future 只能通过 Candidate/Impact Review/AuthorControl/正式 Owner 晋升，并保留来源和作者决定 |
| Stale Source Negative Test | 来源 WorkVersion、对象 revision 或 source hash 变化后，旧 Future 不能晋升 |
| Planned Event Isolation Test | 规划事件即使已持久化、已进时间线，也不能进入正式 Event/角色经验/WorldState |
| Derived Version Isolation Test | Derived 内容不污染 root；跨版本引用必须带 WorkVersion；回源必须经过冲突与 Owner 写入链 |
| Future Propagation Test | Future 引用 Future 时非 Canon 身份不丢失，不因二次生成或同步变为正式事实 |

## D2. Character

| 测试 / 契约类型 | 必须证明的事实 |
|---|---|
| Query Purity Contract | Query 始终 `writes: 0`、`providerCalls: 0`，且 project/character/WorkVersion/叙事位置越界失败 |
| Guidance Locality Contract | Guidance 只改变目标 Run 的后续注意/判断/范围，不写 Character、Knowledge、Memory、Event |
| Cross-Run Cognition Negative Test | 无 confirmed Event 的 Run `heard`、推测、临时经验不能成为另一独立 Run 的正式认知输入 |
| Information Transfer Contract | 持久知识变化必须关联 confirmed Event、发送者、接收者、时点、来源和作者确认 |
| Experience Promotion Contract | Run experience 只有经 Candidate → AuthorControl → Event 后，才会出现在正式 Character projection |
| Promotion Atomicity / Compensation Test | Event 写入失败时角色认知不变；Event 回滚/补偿后相关认知按同一来源失效或可追溯 |
| Character Owner Uniqueness Test | ProjectionPort、MemoryLedger、Agent Run 和同步层均不能成为第二正式 Character Owner |

## D3. Author Intent 与 Brief

| 测试 / 契约类型 | 必须证明的事实 |
|---|---|
| Intent Ownership Contract | 只有作者动作能建立、修订、撤销 Intent；Agent inference 只能产生 Candidate |
| Intent Revision Binding Test | Run 引用固定 Intent revision；Intent 变化后旧 Brief 不会静默继承新意图 |
| Brief Semantic Separation Contract | Intent、Context、Admission、Run Plan 可独立识别；Brief approval 不被误当为长期 Intent approval |
| Brief Staleness Test | source set、WorkVersion、对象或 Intent revision 变化后，旧 Brief 启动失败 |
| No Intent Back-Write Test | Run result、Candidate、同步冲突和模型总结都不能自动修改 Author Intent |

## D4. Agent

| 测试 / 契约类型 | 必须证明的事实 |
|---|---|
| Capability Allowlist Test | 未声明或版本不匹配的 Agent/Skill/Tool 被运行时拒绝，而非仅隐藏 UI |
| Permission Receipt Binding Test | 回执不能跨 user/project/Agent/Run/action/target/BaseVersion 重放；撤销和过期即时生效 |
| Scope Conformance Test | project、WorkVersion、session/run、对象集合和来源 revision 任一不匹配都失败关闭 |
| Conjunctive Admission Matrix | Capability、Permission、Scope、Owner Admission 任一为 false 时都不执行；四者为 true 也只允许目标 Owner 接纳 |
| TOCTOU / Revalidation Test | 前置审批后 WorkVersion 或目标对象变化，真正写入前必须再次拒绝旧操作 |
| UI Is Not Authority Test | 改变按钮、Capability Registry、scopeLabel 或客户端请求不能扩大服务端能力 |
| Agent Cannot Author Test | Agent 无法生成作者确认、伪造 Intent、绕过 AuthorControl 或成为正式 Owner |

## D5. Cross Device

| 测试 / 契约类型 | 必须证明的事实 |
|---|---|
| Owner Inventory Completeness Gate | 任一正式 Owner 未纳入 snapshot/sync 分类时，项目同步不可启用 |
| Distributed Concurrent Writer Test | 两设备从同一 BaseVersion 写入时不会 last-write-wins 覆盖；只有明确仲裁结果可生效 |
| Replay / Duplicate / Reorder Test | 重复、乱序、延迟操作保持幂等，不能重复产生 Event、Memory 或 WorkVersion |
| Partial Snapshot Fail-Closed Test | Owner snapshot 缺失、hash 不匹配或上传不完整时不发布新 WorkVersion |
| External File Conflict Quarantine Test | NAS/WebDAV/坚果云冲突副本不会自动成为项目事实或覆盖 Owner 状态 |
| Offline Mobile Candidate Test | 离线手机输入保持非 Canon；回连后重新验证身份、Scope、BaseVersion 和作者决定 |
| Authority Location Invariance Test | 同一操作在电脑、手机、官方云、自部署环境执行，Owner 与准入结果一致 |
| Secret / Runtime Exclusion Contract | 密钥、Provider profile、运行锁、缓存和临时文件不作为故事项目事实同步 |
| Recovery / Compensation Test | 中断、断网、崩溃和部分成功后可确定恢复，不留下跨 Owner 半提交状态 |

---

## 最终治理判定

| 领域 | 当前等级 | 下一准入条件 |
|---|---|---|
| Future | 局部可用，未全局闭合 | Canon Read Certification + Promotion-only Write |
| Character Query | 可用 | 保持只读与来源边界 |
| Character Guidance | Run 内部分可用 | Guidance Run Locality |
| Experience / Information Transfer | 不可作为跨 Run 正式认知基础 | Event-backed Experience Promotion |
| Author Intent | Brief 内有素材，但无独立长期 Owner | 冻结 Intent Owner 与 Brief 语义分离 |
| Agent | 多条真实门槛，尚未统一 | Capability × Permission × Scope × Owner Admission |
| Cross Device | 仅有本地一致性底座 | Owner 完整性、分布式并发、重放与部分失败边界全部通过 |

因此，当前工程可以继续收紧本地语义与 Owner 准入，但**不具备手机正式写入、活动项目目录的 NAS/WebDAV 双向同步、或官方云项目同步的工程准入条件**。

