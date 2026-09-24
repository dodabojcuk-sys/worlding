# TIANYAN_PRODUCT_SEMANTIC_CORE_R1

> 状态：产品核心语义规范 R1
>
> 目标：统一天衍最核心的不变量
>
> 范围：Author、Future、Character、Agent 与 Cross Device
>
> 不包含：功能增量、UI、代码、数据库、API、同步协议或部署方案

## 0. 文档位置

本文档是天衍跨领域的最小语义核心。它不增加能力，而是把已有产品原则收敛为同一套可以被后续产品文档、Agent 和工程审查共同使用的语义。

上游依据是：

1. `TIANYAN_PRODUCT_CORE.md`；
2. `TIANYAN_CROSS_DEVICE_AND_AGENT_MODEL_R2`；
3. `docs/product/TIANYAN_BOUNDARY_MODEL_R1.md`。

当前仓库检出中可读取到第 1、3 项，未发现第 2 项的同名实体文件。本文档对第 2 项的使用以本轮任务明示的语义为限，不将未读取的内容冒充为已核对依据。

本文档使用“必须”、“禁止”和“可以”表达规范强度。与本文档冲突的后续能力，必须先重新进行产品语义决策，不得在实现中默认改写。

---

# 一、统一语义核心

## 1.1 天衍处理的不是一种“内容”

同一段文字、同一个场景或同一项角色变化，可以处于完全不同的语义状态。天衍必须首先识别它的权威和作用域，再理解它的文本内容。

| 语义轴 | 核心问题 | 典型概念 |
| --- | --- | --- |
| 作者轴 | 作者想要什么 | Author Intent |
| 提案轴 | 有什么可被考虑的改变 | Candidate、IF Proposal、Planned Event |
| 发生轴 | 在目标故事中发生了什么 | Event |
| 权威轴 | 在哪个项目与版本中什么成立 | Canon |
| 推演轴 | 如果继续发展可能会如何 | Future Projection、Run |
| 认知轴 | 某个角色知道、相信、经历了什么 | Query、Guidance、Experience、Information Transfer |
| 执行轴 | Agent 有什么能力、被允许做什么、本次可在哪里做 | Capability、Permission、Scope |
| 运行轴 | 内容在哪个端、存储或服务上可见 | Device、Sync、Cloud |

这些语义轴可以关联，但不得相互替代。例如：“在手机上可见”不回答“它是否是 Canon”；“Agent 能生成”不回答“Agent 是否被允许写入”。

## 1.2 最小权威链

```mermaid
flowchart LR
    I["Author Intent"] --> X["Explore"]
    X --> P["Propose"]
    P --> C["Candidate"]
    C --> D["作者决定 / 已验证范围授权"]
    D --> A["AuthorControl"]
    A --> O["目标领域唯一 Owner"]
    O --> V["新 WorkVersion / Receipt"]
    V --> N["目标版本 Canon"]
```

这是一条权威链，不是强制每次都经历所有中间体验的页面流程。作者可以直接定义一项静态设定，也可以先反复探索未来；但任何正式结果都必须有明确目标、有效决定和唯一 Owner。

## 1.3 Canon 是目标与版本内的权威，不是全局绝对真理

Canon 必须同时绑定：

- 明确项目；
- 明确故事来源或分支；
- 明确 WorkVersion；
- 明确领域 Owner；
- 可追溯的作者决定或范围授权。

主故事、IF 与派生版本可以各自有效，但彼此不共享默认 Canon。跨版本可见、对照、复制或同步，都不会产生跨版本权威。

---

# 二、Author Model

## 2.1 Author Intent

Author Intent 是作者对作品方向、目标、约束、价值判断、禁止事项和未来期望的明确表达。

Author Intent 对“作者想要什么”具有权威，但它不当然对“故事中已经发生了什么”具有权威。

Author Intent 可以包含：

- 宏观方向和主题；
- 期望保留、改变或避免的内容；
- 未来想法、规划节点和未决问题；
- 对 Agent 的目标、风格、预算、范围和禁止事项；
- 对一次操作、一个批次或一次高权限 Run 的明确授权。

Author Intent 必须与以下内容分开：

- 意图不等于候选；
- 对未来的期望不等于 Planned Event 已发生；
- 作者允许 Agent 推演不等于已同意推演结果；
- 作者表达一个方向不等于每个具体实现都获得采纳。

Agent 可以整理、引用或请作者澄清 Author Intent，但不得把自己的推断写成“作者已决定”。

## 2.2 Candidate

Candidate 是一份尚未对目标故事生效的可审查提案。它可以来自作者、Agent、导入来源、预测或女娲 Run。

Candidate 必须：

- 保持来源、依据、不确定性和目标；
- 区分已知、推断、未知和作者偏好；
- 在采纳前保持非 Canon；
- 在拒绝、保留或过期后继续保持原有权威状态，不因持久化而升级。

Candidate 不仅是 AI 结果。作者手工起草但尚未对明确目标生效的内容，仍然可以是 Candidate。

## 2.3 Event

Event 表达在明确故事目标与故事时间中发生的事情。它是角色经历、信息传播、关系变化和世界状态变化的故事原因之一。

在本文档中，单独使用大写 `Event` 时，指已通过正式采纳进入明确目标版本的事件。未采纳的未来事件必须称为 Event Candidate、Planned Event、Prediction 或 Nuwa Scenario，不得借用 `Event` 名称获得正式性。

Event 必须：

- 属于明确项目、故事来源与 WorkVersion；
- 由既有唯一 Event Owner 建立；
- 有作者决定或已验证范围授权；
- 与它导致的关系、世界状态和角色认知变化保持可追溯关系。

## 2.4 Canon

Canon 是一个明确项目、故事来源和版本中，由各领域唯一 Owner 维护的已确认权威内容集合。

Canon 可以包含：

- Event；
- 角色、地点、物品、组织与规则的正式定义；
- Relation 与 WorldState；
- 正式叙事编排和其他已确认故事语义。

Event 与 Canon 的关系是：

- 一个已确认 Event 是所属目标版本 Canon 的一部分；
- Canon 不只包含 Event；
- 静态作者定义可以在不伪造 Event 的情况下成为 Canon；
- 任何被描述为在故事时间中发生的变化，若要成为 Canon，必须由 confirmed Event 提供可追溯原因，不能只修改投影结果；非事件型静态作者定义仍按上一条处理。

## 2.5 四者不得混同

| 概念 | 它对什么有权威 | 它不代表什么 |
| --- | --- | --- |
| Author Intent | 作者当前的目标、约束与决策方向 | 不代表故事中已发生 |
| Candidate | 一份可审查的提案及其来源 | 不代表作者已采纳 |
| Event | 目标版本中已正式发生的故事事件 | 不代表 Canon 的全部 |
| Canon | 目标版本内当前有效的已确认故事语义 | 不代表其他分支或版本也同样成立 |

标准转换是：

```text
Author Intent
  → Explore / Propose
  → Candidate
  → Author decision or validated scoped authorization
  → Event and/or target domain formal change
  → target-version Canon
```

但不存在以下等价：

```text
Author Intent = Candidate
Candidate = Event
Event = all Canon
Author Intent = Canon
```

---

# 三、Future Model

## 3.1 Explore：观察未来

Explore 是在不改变目标 Canon 的前提下，观察、比较、推演或询问可能未来。

Explore 可以使用：

- Nuwa Scenario；
- Prediction；
- 规划轨迹；
- IF 假设；
- Derived Version 对照；
- 任何明确为只读的 Future Projection。

Explore 的输出可以是瞬时观察、Run-local 结果或可保留方向。只有当作者明确将其转为可审查内容时，它才进入 Propose。

Explore 不得：

- 产生目标 Canon 写入；
- 因为某个未来被多次浏览就提高其权威；
- 把观察结果当成作者意图；
- 让角色自动获得推演中才出现的信息。

## 3.2 Propose：提出未来

Propose 是把一个可能未来变成带来源、目标、依据和不确定性的可审查提案。

Propose 可以形成：

- Candidate；
- IF Proposal；
- Planned Event；
- 女娲待审结果；
- 对明确目标的派生版本或融入建议。

Propose 不是 Commit。被保存、编辑、对照、同步或多次重试的提案，仍然是提案。

## 3.3 Commit：确认未来的去向

Commit 是作者对一个已展示范围和影响的 Future Proposal 作出明确决定，或在高权限 Run 开始时对等价范围作出已验证授权。

`Commit` 在本文档中是产品语义，不指任何特定技术、文件或版本控制操作。

“确认未来”必须说明它被确认成什么：

| Commit 结果 | 产品语义 | 与 Canon 的关系 |
| --- | --- | --- |
| Commit as Intent | 作者确认这是希望保留的规划、方向或约束 | 成为已确认 Author Intent，但不是已发生 Event |
| Commit as Derived Version | 作者确认建立具有来源和独立身份的派生版本 | 只在新派生版本内产生局部 Canon，不改变来源 Canon |
| Commit as Story Fact | 作者让选定变化对明确目标故事正式生效 | 经 AuthorControl、唯一 Owner 与新 WorkVersion 后成为目标 Canon；它对该目标已不再仅是 Future |

不指明 Commit 目标的“确认”没有权威效力。

## 3.4 Explore、Propose、Commit 不得合并

| 阶段 | 是否改变 Canon | 是否需要作者决定 | 权威结果 |
| --- | --- | --- | --- |
| Explore | 否 | 只需触发或允许推演 | 观察、推演或 Run-local Future |
| Propose | 否 | 可以由作者或 Agent 发起 | 可审查但非 Canon 的提案 |
| Commit | 取决于明确目标 | 是，或已有等价有界范围授权 | 已确认 Intent、Derived Version 或目标 Canon |

一次 Nuwa Run 可以完成 Explore 并生成 Propose，但它不因运行成功而完成 Commit。高权限 Run 也只能在已验证授权的明确范围内代表作者事先作出的 Commit，不会让 Agent 变成作者。

---

# 四、Character Model

## 4.1 四种认知操作

| 操作 | 语义 | 对 Run 的影响 | 对正式角色的影响 |
| --- | --- | --- | --- |
| Query | 读取角色在明确版本中可知的知识、信念、记忆与状态 | 不改变 Run 语义；可以留查询回执 | 无 |
| Guidance | 改变本次推演的注意方向、判断倾向和范围 | 改变当前 Run | 无；不增加知识、不改写记忆、不变更人物设定 |
| Experience | 角色在故事或推演中亲历、目击、参与或承受的内容 | Run-local Experience 可改变后续推演 | 只有经 Experience Promotion 后才能持久影响目标版本角色 |
| Information Transfer | 主体之间的信息传递、缺失、欺骗、误解和相信变化 | 在 Run 内可改变临时所知 | 持久改变必须经信息传播 Event 与 Experience Promotion |

Query 不会因为提问内容而教会角色。Guidance 不会因为 Agent 重复使用而变成性格、信念或长期记忆。

## 4.2 Experience Promotion

Experience Promotion 是将 Run-local Experience 或 Future 中的角色经历，经正式作者决定和 Event 链，转化为明确目标版本中可持久的角色经验。

Experience Promotion 不是复制 Agent 记忆，也不是把 Run 中的心理描述直接存成角色事实。它必须满足：

1. 明确来源 Run、Future 路径、对应角色与目标 WorkVersion；
2. 把需要成立的故事经过表达为可审查的 Event Candidate；
3. 区分世界发生了什么、角色实际感知了什么、角色如何理解或误解；
4. 由作者决定或已验证范围授权完成 Commit；
5. 经 AuthorControl、Event Owner 与其他受影响领域 Owner 建立新目标版本；
6. 再从已确认 Event 投影角色的知识、信念、记忆或状态变化。

标准语义链是：

```text
Run-local Experience
  → Event Candidate
  → Author decision / validated scoped authorization
  → AuthorControl
  → confirmed Event in target WorkVersion
  → Character knowledge / belief / memory / state projection
```

如果没有目标版本中的 confirmed Event，该 Experience 必须继续保持 Run-local 或 Future-local，不得进入其他独立 Run 或任何版本的持久角色记忆。如果目标是 Derived Version，也必须先在该派生版本内建立 confirmed Event。

## 4.3 信息传播中的三种真实

对信息传播进行 Experience Promotion 时，必须同时保持三种不同语义：

| 语义 | 示例 | 可能的权威状态 |
| --- | --- | --- |
| 传播事实 | A 告诉 B“X” | 这次告知可以是 confirmed Event |
| 角色认知 | B 听到、理解、怀疑或相信“X” | 是由 Event 支撑的角色知识或信念投影 |
| 世界事实 | “X”本身是否为真 | 必须由其自身的 Canon 依据决定，不因 A 说过或 B 相信就成立 |

“角色知道”、“角色相信”和“世界为真”必须始终可以被分开审查。

## 4.4 作者定义不冒充 Experience Promotion

作者对角色初始知识、核心设定或静态档案的明确定义，可以经相应正式 Owner 成为目标 Canon，不必伪造 Event。

但它必须标识为作者定义，不得宣称角色在故事时间中“经历了”一件从未发生的事。

---

# 五、Agent Model

## 5.1 Capability、Permission、Scope

| 概念 | 回答的问题 | 来源 | 不能代表 |
| --- | --- | --- | --- |
| Capability | 这个 Agent 在技术和产品上会做什么 | 天衍声明并可验证的 Agent 能力 | 不代表在当前项目被允许使用 |
| Permission | 该用户与 Agent 被允许做到哪个权限级别 | 用户身份、项目成员身份、Agent 策略与作者授权 | 不代表具体本次可以作用哪些对象 |
| Scope | 本次 Run 在哪个项目、版本、对象、时间、预算和停止条件内执行 | 本次明确选择、授权与排除项 | 不代表可以超过 Permission，也不代表 Agent 真有该 Capability |

一次 Agent 行为只在下列四者同时成立时有效：

```text
Effective Agent Action
  = available Capability
  ∩ granted Permission
  ∩ current Run Scope
  ∩ Tianyan Boundary Rules
```

其中，Boundary Rules 不是可由单次 Run 授权取消的权限选项。

## 5.2 Permission 仍遵循四层链

```text
User
  → Project
  → Agent
  → Run
```

- User 层确定发起者和其显式决定；
- Project 层决定该用户在当前故事边界内拥有什么权限；
- Agent 层把项目允许进一步限制为该 Agent 可使用的能力；
- Run 层将权限限定到本次目标、BaseVersion、对象、预算和停止条件。

有效 Permission 是四层交集，拒绝优先。Run 可以缩小权限，但不能放大权限。

## 5.3 三者不得混同

- 有 Capability 但无 Permission：不得执行。
- 有 Permission 但无 Capability：不得伪装执行成功。
- 有 Capability 与 Permission，但目标超出 Scope：不得执行。
- Scope 内执行成功：不代表结果已成为 Canon。
- 更换模型、Provider、Runtime、设备或云环境：不得改变 Permission 与 Scope。
- 扩大对象、项目、版本、操作类型或预算：必须产生新的明确 Scope，不得从当前 Run 环境中推导。

## 5.4 Agent 不是 Author

Agent 可以：

- 理解、整理和引用 Author Intent；
- 在 Capability、Permission 和 Scope 内 Explore；
- 生成 Candidate 和 Future Proposal；
- 在已验证范围授权内继续既有正式链；
- 返回可追溯回执和解释。

Agent 不可以：

- 把自己的推断声称为 Author Intent；
- 自行扩大 Permission 或 Scope；
- 将 Run 成功当作作者决定；
- 因为获得高权限范围授权就成为作者；
- 成为 Event、Canon、Character、WorldState 或 WorkVersion Owner。

高权限 Run 表达的是“作者已对该范围作出决定”，不是“Agent 拥有作者权”。

---

# 六、Cross Device Model

## 6.1 跨端只改变运行与可见位置

| 载体 | 产品角色 | 可以承担 | 永远不是 |
| --- | --- | --- | --- |
| 手机 | 交互与轻量工作表面 | 阅读、查询、创作草稿、提出候选、发起作者决定 | 移动端事实 Owner |
| 电脑 | 完整工作与可选本地执行表面 | 保存项目、运行 Agent、审查候选、执行正式操作 | 因为文件在本机就优先的故事权威 |
| NAS | 存储、备份或传输载体 | 保存项目文件或备份 | 项目、Event、Canon 或 WorkVersion Owner |
| WebDAV | 通用文件传输方式 | 复制和同步字节 | 故事冲突仲裁者 |
| 坚果云 | 第三方文件同步服务 | 传输、备份和文件级冲突保留 | 作者决定、项目权限或 Canon 权威 |
| 官方云 | 天衍的身份、协调、计算、存储或同步环境 | 承载天衍项目同步、运行 Agent、保存回执与备份 | 脱离项目 Owner 的中央故事真理 |

这些载体可以组合。例如，手机可以通过官方云发起一次 Run，电脑可以从 NAS 打开项目，WebDAV 或坚果云可以复制项目文件。组合方式不会改变任何领域 Owner。

## 6.2 外部文件同步与天衍项目同步

| 类型 | 同步的是 | 能够保证 | 不能单独保证 |
| --- | --- | --- | --- |
| 外部文件同步 | 文件、字节、路径与文件级冲突 | 传输或备份结果 | 对象身份、Candidate / Canon、Owner、BaseVersion、作者决定和跨 Owner 完整性 |
| 天衍项目同步 | 带项目、版本、Owner、权限、Run 与回执语义的故事工程 | 保留语义身份、权威等级、冲突和因果 | 不能新建 Owner，不能因同步成功自动创建 Canon |

外部文件同步可以为天衍项目同步提供字节传输，但不能替代天衍项目语义。

## 6.3 跨端必须保持的不变量

无论项目出现在哪个载体上，都必须保持：

- 同一项目和对象的稳定身份；
- 明确故事来源、分支与 WorkVersion；
- Author Intent、Candidate、Event 与 Canon 的区分；
- Explore、Propose 与 Commit 的区分；
- Capability、Permission 与 Scope 的区分；
- Agent Run 的来源、目标、预算、停止条件与权限；
- AuthorControl、唯一 Owner、版本校验与回执；
- 角色知识、信念、记忆和世界事实的区分。

一个项目若只有文件到达、但无法确认上述语义是否完整，必须被视为未完成项目同步，不得自动开放正式写入。

## 6.4 跨端冲突不产生新事实

- 设备时间、文件时间、上传时间和到达顺序不是版本权威。
- 文件同步的“冲突副本”不是自动 IF、Derived Version 或新 Canon。
- 离线端可以产生 Author Intent、草稿和 Candidate；在经目标 BaseVersion 校验前，不是项目 Canon。
- 多设备并行 Explore 和 Propose 可以存在；对同一目标版本的正式 Commit 必须串行校验。

---

# 七、Boundary Rules

## 7.1 四条不可替换公式

```text
Future != Canon
Device != Owner
Sync != Authority
Agent != Author
```

### Future != Canon

Future 是可能性、推演、规划或派生上下文；Canon 是明确目标版本中经正式决定与唯一 Owner 建立的权威内容。持久化、展示、同步、多次使用和模型高置信都不会将前者转为后者。

Derived Version 在自身版本内可以有局部 Canon，但它对来源版本仍是另一个故事目标。

### Device != Owner

手机、电脑、NAS 和云环境可以承载、复制或运行产品能力，但都不因存有“最新文件”而成为 Event、Character、WorldState、WorkVersion 或 Canon Owner。

Owner 是领域责任，可以被运行在某个设备或云中；运行位置不是 Owner 身份。

### Sync != Authority

同步只能携带、复制、对齐或发现状态。它不能因为某份文件最后到达、上传成功或存在于官方云，就创建作者决定、解决故事冲突或产生新 Canon。

同步必须保留已有权威，不能创造权威。

### Agent != Author

Agent 可以理解意图、探索未来、生成提案并在授权范围内继续正式链，但它不能创建“作者已决定”的事实。

即使作者授予高权限 Run，权威仍来自作者事先做出的有界决定，而不是 Agent 身份。

## 7.2 由四条公式推出的次级不变量

1. **Author Intent != Canon**：作者期望不是已发生故事。
2. **Candidate != Event**：提案不是已确认发生。
3. **Event != all Canon**：Event 是 Canon 的一部分，Canon 还包含其他正式领域事实。
4. **Explore != Propose != Commit**：观察、提案与正式决定不共享权威。
5. **Guidance != Character State**：引导只影响本 Run，不是人物变化。
6. **Experience != Canon without Promotion**：未经 Experience Promotion 的经验不得跨越 Run 或版本边界。
7. **Capability != Permission**：会做不等于被允许做。
8. **Permission != Scope**：拥有某类权限不等于本次可以对任意对象使用。
9. **Character Belief != World Fact**：角色相信不会改变世界真实。
10. **Availability != Authority**：更新、更可见、更接近用户的副本不因此更正式。

---

# 八、统一准入检查

任何后续产品定义、Agent 行为、角色记忆、Future 能力或跨端能力，都必须回答：

1. 这是 Author Intent、Candidate、Event 还是 Canon？
2. 它处于 Explore、Propose 还是 Commit？
3. 如果声称 Commit，目标是 Intent、Derived Version 还是 Story Fact？
4. 它属于哪个项目、故事来源和 WorkVersion？
5. 哪个唯一 Owner 对该结果负责？
6. 如果涉及角色，它是 Query、Guidance、Experience 还是 Information Transfer？
7. 如果 Experience 要持久影响角色，Experience Promotion 和 confirmed Event 在哪里？
8. Agent 的 Capability、Permission 和 Scope 各是什么？
9. 当前设备、同步方式或云环境是否被误当成 Owner 或权威？
10. 作者决定、AuthorControl、目标 Owner、WorkVersion 与回执是否完整？

任何一个问题无法回答，都意味着该能力尚不具备清晰的产品语义，不应继续向实现层扩展。

---

# 九、最终核心

天衍的核心不是“Agent 能做多少”，也不是“故事可以同步到多少设备”。

它的核心是：

> **作者可以自由表达意图、探索未来和授权 Agent 行动；但候选、未来、角色经验、Agent 运行、设备副本和同步结果，只有在明确目标与版本中，经有效作者决定、AuthorControl 与唯一 Owner 后，才能成为该目标的 Canon。**

所有后续产品语义都必须守住这个核心。
