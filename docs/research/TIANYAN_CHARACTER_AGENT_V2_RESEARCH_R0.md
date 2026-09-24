# 天衍角色 Agent V2 产品研究 R0

> 本文是产品研究文档，不是实现计划。不含代码、不含架构迁移方案、不删除任何已有功能、不估算技术难度。
>
> **本文不新增任何 Owner。** 凡"需要新增"一栏，只指明由哪一个**既有唯一 Owner** 承载（取自 `项目目录导航.md` 与 `docs/architecture/FEATURE_INDEX.json` 的 `boundaries` 块）；找不到既有承载者的，一律标注**归属未裁定**，不擅自发明落点。
>
> 所有内容服从 `TIANYAN_PRODUCT_CORE.md`。凡本文判断与产品核心冲突，以产品核心为准。

---

## 〇、前提、基线与口径

### 0.1 基线声明（本文全部 `file:line` 的适用范围）

| 项 | 值 |
| --- | --- |
| 代码阅读位置 | `/home/beelink/.codex/worktrees/tianyan-ui-design-freeze-r1` |
| 研究基线 | `codex/semantic-world-r3`（`93f41aa`，2026-09-18） |
| 仓库最新 ref | `codex/tianyan-ui-design-freeze-r1`（`a37a314`，2026-09-18） |
| 当前工作树 | `codex/world-materials`（`f77b800`，2026-09-16）**落后 44 个提交** |

`a37a314` 是 `93f41aa` 的直接子提交（`git log -1 --format='%P'` 实测父为 `93f41aa`），其改动为 `34 files changed, 1684 insertions(+)`，**全部落在 `design-prototypes/` 与 `docs/` 下，无一个 `src/` 或 `apps/` 文件**。因此本文所称"基线代码"与"最新 ref 代码"逐字节等价，两个名字可互换。

**工作树不能作为本研究依据。** 四个关键文件在工作树中不存在，而在基线中存在（逐项 `git cat-file -e` 实测）：

| 文件 | world-materials | semantic-world-r3 |
| --- | --- | --- |
| `apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx` | 不存在 | 存在 |
| `apps/story-studio/src/components/entity-dock/entityInspectorDockStore.ts` | 不存在 | 存在 |
| `src/storyContracts/characterContextPack.ts` | 不存在 | 存在 |
| `src/storyContracts/worldReferenceProjection.ts` | 不存在 | 存在 |
| `src/storyContracts/characterStateProjection.ts` | 存在 | 存在 |
| `src/storyContracts/characterFateProjection.ts` | 存在 | 存在 |

它们自 `codex/nuwa-entry-r3a`（提交 `ecac1ad`）起进入提交链，而 `ecac1ad` 不是 `HEAD` 的祖先。**若在工作树上做本项研究，会得出"角色磁吸工作台不存在"的错误结论。**

### 0.2 任务前提的三处不成立（必须先说明）

用户点名研究六项。其中三项的"当前"与仓库现实不符，本文按实况研究，不迁就措辞：

1. **「Attention Pack」在仓库中不存在同名模块。** 全仓 `src`、`apps`、`tests`、`docs` 内没有任何名为 `AttentionPack` / `attentionPack` 的类型、文件、路由或 store。`TIANYAN_PRODUCT_CORE.md:1606-1619` 把它定义为"分支感知的注意力隔离"这一**能力要求**。本文因此研究的是**承担该职责的实际代码**（§2.5），结论是它今天由 5 套互不相连的装配器分别承担、外加一个第 6 影子。
2. **「Context Inspector」今天有两个，一真一空。** 真的是女娲 N1 的 `ContextInspector`；空的是天意输入区的 `ContextControl`。二者无代码关系（§2.4）。
3. **「命运 K 线」没有任何界面。** 不是"界面简陋"，是一个组件都没有，且仓库不含任何图表库（§2.6）。

### 0.3 已有一份同基线的未跟踪研究文档

`docs/product/TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md`（476 行）已经研究过女娲角色差距、世界观升级、命运 K 线、Attention Pack，且**基线正是 `93f41aa`**，与本文同一份代码。

**风险提醒：该文件不在任何 git 分支上。** 实测 `main`、`codex/world-materials`、`codex/nuwa-entry-r3a`、`codex/semantic-world-r3`、`codex/tianyan-ui-design-freeze-r1` 五个 ref 全部没有它；它只以未跟踪状态存在于工作树。一次 `git clean -fd` 即永久丢失。

本文与它的分工：该文按**子系统**组织（女娲／世界／命运／Attention）并给出六个月节奏；本文按**用户点名的六个能力面**组织，逐项重新独立核验，回答用户点名的五个问题，并按 `已有代码支持／需要新增／风险／Owner` 四栏标注每一条建议。文中共识部分不重复展开，只做交叉引用；本文对该文的两处锚点做了修正（见 §9.3）。

### 0.4 分级口径

本文只使用四个等级，不合并：

| 等级 | 判据 |
| --- | --- |
| **可用** | 既有真实生产者，又有真实消费者；作者或模型今天就能读到它 |
| **仅合同** | 类型与逻辑齐备（多数还带测试），但缺生产者**或**缺消费者 |
| **空壳** | 界面上有位置，内容是硬编码、占位文案或指向别处的假动作 |
| **未开始** | 全仓零命中 |

状态验收层级沿用 `TIANYAN_ROADMAP.md:7`：`计划中 / 已有基础 / 实现中 / 本地通过 / 真实模型待验 / 作者待验 / 已接受` 并列，**不得以测试通过冒充真实模型或作者体验验收**。注意 `FEATURE_INDEX.json` 另用一套英文状态词（`LOCAL_REVIEW / PARTIAL / FOUNDER_REVIEW / PRODUCTION_CONNECTED`），两套口径本文不合并。

---

## 一、结论摘要

1. **今天已经有一个"可被读取、可被隔离、真的行动过"的角色，还没有一个"会变化的角色"。** 女娲 N1 是一条真实可运行、带预算门、知识边界**结构性生效**的逐角色排演流水线；但它跑完不留下人格、状态与命运，因为这三样没有落点。
2. **天衍不缺契约设计，缺生产者与接线。** 这是本文最核心的判断，且有三条独立铁证：
   - `characterStateProjection.ts` 全套 8 类状态、比对、过渡解释、越界校验**已写完且带完整测试**，而 `compareCharacterStates`、`explainStateTransition`、`validateKnowledgeBoundary` 在非自身文件、非测试目录下**零调用者**（本文 §9.1-B 实测）；
   - `characterFateProjection.ts` 230 行输出契约质量很高、且**逐条满足**产品核心 `:558` 的"不能有神秘分数"，但它在 `src`、`apps`、`tests`、`scripts` 内**零引用、零测试**；
   - 磁吸工作台的两个页签把这件事**写在界面上**：`EntityInspectorDock.tsx:160` 与 `:164` 的文案就是"合同已定义／当前没有生产喂入"。
3. **角色状态是六个面里唯一"整块都不是可用"的一项，且它撞到的是一堵墙不是一个洞。** 唯一持久 WorldState Owner 在校验层**主动拒绝角色主体**（`storyStudioWorkspaceOperations.ts:1540-1541`：`passage` 只许地点、`holder` 只许物品）。所以在裁定"角色状态由谁承载"之前，任何状态生产者都无处可写。**这是角色 Agent 升级的第一前置。**
4. **角色记忆只补上了 1/5。** 查询侧声明五种记忆，持久账本的写入校验**硬拒**除 `heard` 以外的一切（`characterMemoryRepository.ts:194`）。亲历、目击、告知、信念四类**没有写入者**；长期/短期/最近的分层、遗忘、压抑在全仓**零命中**。
5. **Context Inspector 是今天最被低估的资产。** N1 那条链上"作者看到的上下文 == 模型收到的上下文"已经成立（同源读同一冻结对象），这是角色 Agent 可解释性的地基，后续任何设计都必须保持它，而不是再造一个。
6. **Attention 的真实水位比名字的存在与否更重要：一条路径已经把"被排除的来源标题"发给了 Provider。** `nuwaN1PiAdapter.mjs:109-111` 已经确立了正确策略（只发数量与理由码，因为"排除身份本身可能泄露未来的秘密"），`liveProviderPilot.mjs:129/152` 却把整个 `attentionContext` 序列化后作为 user 消息发送，其中 `excludedSources` 携带 `label`、`reason` 与 `excerpt ≤240`。今天因真实 Provider 默认关闭而未触发，**在产品开始调真实模型的那一刻即触发**（§2.5.4）。
7. **命运 K 线的最小可行版本不需要图表库、不需要新契约、不需要新库**，只需要 `CharacterFateObservation` 的生产者；但它有两个硬前置：因果本体归一（两套互不兼容）和世界时间（正式事件无结构化世界时间字段）。**横轴今天只能是叙事顺序，且必须在界面上标出来。**

---

## 二、六个能力面逐项现状

### 2.1 角色资料 —— 可用（但只活了 3 个字段）

#### 2.1.1 真实部分

- **载体与持久化是真的。** 角色是 `WorldObject`，落盘为 Markdown + frontmatter，profile 序列化进 `story_profile_v1`。唯一写入链在 `src/storyControlSurface/storyStudioWorkspaceOperations.ts`；UI 从不改本地状态冒充写入。
- **写入者唯一。** `CharacterProfileEditor.tsx` 是档案的唯一作者写入入口，且刻意声明 `writeMarkdown: true, writePresentation: false`（`:44-45`）——把"正文卡片组合"留给另一个 Owner，没有形成第二写入者。
- **磁吸工作台的"档案"页签是真的**（`EntityInspectorDock.tsx:159`），只读展示作者已确认字段，缺值回落到"未设置"，不编造。

#### 2.1.2 契约齐备但没活

| 条目 | 证据 | 实况 |
| --- | --- | --- |
| profile 字段实际只有 3 个活着 | `storyStudioObjectProfile.ts:29` 的 `fields: Record<string, …>` 是开放字典；`CharacterProfileEditor.tsx:105` 是唯一构造点 | 只有 `summary`、`character_core`、`boundaries` 有生产者且有消费者；其余 key 存得进、无人读 |
| `source` 三值只活一个 | `storyStudioObjectProfile.ts:3` 声明 `["author","agent","source-anchor"]` | 唯一构造点写死 `source: "author"`；`agent`／`source-anchor` **零写入者** |
| `unresolvedQuestions`／`warnings` | `storyStudioObjectProfile.ts:31-32` | 零生产者、零消费者，编辑器原样回传 |
| `typedProperties` 七型属性系统 | `src/storyCardPresentation/characterProperties.ts` | 解析、序列化、测试齐备，**没有作者编辑入口也没有展示入口**；`CharacterProfileEditor.tsx:52` 把 `object.typedProperties` 原样回写 |
| 模板声明的档案字段 | `characterTemplate.ts:277-278` 有 `"知识边界"`、`"当前状态"` 标签 | `characterPreset.ts:31-35` 引导创建只建 `background/personality/appearance` 三段。**"当前状态""知识边界"是标签字符串，无生产者** |

#### 2.1.3 空壳

- `CharacterInspectorCard` 的逐字段铅笔图标：点击一律调 `onOpenFull` 打开全局编辑器，**不能编辑它所在的那个字段**。是视觉承诺、无对应动作。

#### 2.1.4 对角色 Agent 最关键的一条

进入模型的人格只有**两个字符串**：`NuwaN1ProfileBasis = {core, boundaries}`，且 `normalizeProfileBasis` 的白名单只接受 `field ∈ {character_core, boundaries}` 并要求 `source === "author-profile"`，其余**抛错**。产品核心 `:530-548` 列出的欲望、恐惧、底线、价值观、智力与判断方式、文化水平、素质习惯性格、说话方式，在**数据层不存在**——它们只存在于 Markdown 卡片的标题文字里，女娲不读。

**判定：可用（窄）。** 资料面不是瓶颈；瓶颈是"资料 → 可参与决策的人格"这一段。

---

### 2.2 角色记忆 —— 混合：派生投影可用，持久账本只活了 1/5

#### 2.2.1 一个重要的正面判断

**记忆是事件的派生投影，不是三个大文本框。** `characterMemoryQuery.ts` 在类型上直接写死 `writes: 0`、`providerCalls: 0`（`:24-25`），owner 串声明为 `Event+NarrativeArrangement+CharacterStateProjectionPort+CharacterMemoryLedger`（`:23`）。它把"事件派生的正式记录"与"听闻账本记录"合并，不要求作者手工维护。这符合产品核心 `:550` 的"应能随事件和时间变化自动投影，避免重复维护冲突字段"。

#### 2.2.2 真实部分

| 能力 | 证据 | 等级 |
| --- | --- | --- |
| 五类记忆的**读取**与筛选 | `characterMemoryQuery.ts:7` `experienced\|witnessed\|informed\|belief\|heard` | 可用（读） |
| 逐角色知情过滤（能答"X 在事件 Y 能读到什么"） | `eventStoryCrossingKnowledge.ts:94-188`，在边界前**丢弃隐藏事件正文** | 可用 |
| 听闻账本的持久、幂等、失效、可见性 | `characterMemoryRepository.ts`，owner id = sha256(接收者)，落 `<project>/continuity/character-memory-ledgers/`；重放幂等、内容不同抛错、回溯只翻 `invalidated` 且强制理由、永不删除 | 可用 |
| 工作台"记忆"页签 | `EntityInspectorDock.tsx:161` → `CharacterInspectorCard.tsx:80-99`，空态与读取失败态**分开**（`:97` 空 / `:89` 读取失败，并明写"没有把读取失败当成没有经历"） | 可用 |
| 服务线路由与浏览器闭环 | `server.mjs:1486-1495`；`TIANYAN_E2E_SCOPE=character-memory-query` 断言 `data-provider-calls="0"`、接收者隔离、往返后状态保留 | 可用 |

#### 2.2.3 仅合同 / 未开始

| 条目 | 实况 |
| --- | --- |
| **四类记忆的写入** | `characterMemoryRepository.ts:194` 硬拒 `epistemicState !== "heard"`。**亲历/目击/告知/信念四类没有写入者。** 唯一持久生产者是女娲 `synchronizeCharacterHeardMemories`（`nuwaN1Port.mjs:224`） |
| 召回质量 | `listRecallableCharacterMemories` 是**过滤不是排序**：按 active + 作用域 + 时点筛，无相关性评分、无显著性、无衰减、无巩固 |
| 候选排演的记忆增量 | `NuwaMemoryDelta{agentRef, before, proposedAfter, reason, sourceEventId, reviewStatus}` 定义完整（`nuwaRehearsalContract.ts:92-99`），但 `writeNuwaRehearsalRevision`（`nuwaRunPack.ts:266-304`）**无任何应用调用者**，只有测试 |
| 外部记忆 Skill | `memorySkills/externalMemorySkillAdapters.ts` 全部 `adapterStatus: "descriptor_only"`；`memoryPalaceSkill.ts:44` 用闭包数组存条目，**无持久化、无角色作用域** |
| **长期/短期/最近分层** | **未开始**。`短期记忆`、`最近记忆` 全仓零命中 |
| **遗忘 / 被压抑** | **未开始**。`压抑` 的 3 处命中全部是事件情绪标签"压抑"（`eventLineFixture.ts:18` 及两个测试断言），与记忆压抑无关；`遗忘`/`forgotten`/`repressed` 零命中 |
| 怀疑 | `doubt` 零命中；语义只由 `suspicion`（权威枚举）与 tag `怀疑：` 承载 |
| 误解 | 只有 tag `误导\|被误导 → "misled"` 与 `misinformation` 权威值，**没有专门记录类型** |

**⚠️ 一个必须防的误读：** `memoryGrantRepositories.ts` + `tianyiMemoryOperations.ts` 新增了带 `MemoryKind` 的持久 owner，容易被当作"角色记忆补上了"。实测其 `MemoryKind` 为 `working-preference|shared-decision|unresolved-thread|author-provided-fact`，作用域 `author-global|project`，**没有 `recipientId`/`speakerId`**——那是**天意助手自己的**记忆，不是角色的。同理 `personaPolicyRepositories.ts` 承载的是天意 Agent 的 persona（`defaultTianyiPersona`），与角色人格无关；误用会把运行底座人格与领域人格混为一谈，直接违反 `TIANYAN_PRODUCT_CORE.md:423-429`。

**判定：读取侧可用、持久侧 1/5、分层与遗忘未开始。** 因此角色今天**记不住"我经历了什么"和"我相信什么"**，只记得"谁对我说过什么"。它无法因创伤、承诺或被澄清的误解而长期改变行为。

---

### 2.3 角色状态 —— 整块「仅合同」，且被一道校验挡住

六个面里唯一没有任何"可用"评级的一个。

#### 2.3.1 契约侧：设计得相当完整

`src/storyContracts/characterStateProjection.ts`（222 行）声明：

- **8 类状态维度**（`:24`）：`physical | location | possession | knowledge | belief | goal | commitment | perceived_relation`；
- 6 种认知权威 `confirmed_knowledge|belief|suspicion|misinformation|unknown|contradiction`，**精确对应**产品核心 `:543` 的"知道·相信·怀疑·误解·不知道"；
- `openQuestions / conflicts / staleSources / plannedState / candidateState`，`compareCharacterStates`（`:179`，缺项目/角色/分支一致即抛错），`explainStateTransition`（`:192`，输出中文「由事件 X 形成／缺少事件依据」），`validateKnowledgeBoundary`（`:196-211`，六种结论含 `boundary_violation`「把作者全知或另一角色的秘密错误地共享给了当前角色」）；
- 纯函数、`writes: 0`、`providerCalls: 0`，且带完整测试 `tests/storyContracts/characterStateProjectionR0.test.ts`。

#### 2.3.2 实况侧：三层断链

**第一层，8 维退化成 2 维。** 运行时只有一个调用点（本文实测，`src`/`apps` 全量）：

```
eventStoryCrossingKnowledge.ts:117  createCharacterStateProjectionPort().projectCharacterState({...})
```

它喂的证据由 `knowledgeEvidence()` 合成，**每个事件恰好一条**，`category` 只可能取 `"knowledge"` 或 `"belief"`。`physical/location/possession/goal/commitment/perceived_relation` **六类零生产者，永远为空数组。**

**第二层，作用域是写死的伪值。** 同一个 `:117` 调用传入的 scope 全部是常量（实测 `:119-127`）：

```
branchId: "main"            // 不是真的分支解析
worldTime: { kind: "unknown", sortKey: null }
sceneId: null
narrativePosition: input.events.length   // 数组下标，不是故事时间
```

**第三层，算出来的东西被丢掉。** 该投影的结果对象不向外传，只有 `characterStateProjectionRevision`（一个 hash）活下来（`:186`），并作为"上下文版本"显示在 `CharacterInspectorCard.tsx:122`。**没有任何 UI 或模型读到过 `knowledgeState`/`beliefState`。**

**并且，唯一持久状态 Owner 拒绝角色。** `storyStudioWorkspaceOperations.ts:1540-1541`（本文实测原文）：

```
Passage state can only be applied to a location or facility object.
Holder state can only be applied to an item object.
```

`WorldStateN4Value` 只支持这两型。也就是说：**产品 mandated 的唯一 World 事实 Owner 在校验层就把角色主体挡在门外。** 值得记下：WorldStateN4 本身已经升级出分支/版本感知（`WorldStateN4Envelope{mainline, workVersions}`、`forkWorldStateN4`、按 `effectiveAt` 的 `history[]` 真实时间轴、证据必须是 confirmed-event 的 id+revision 否则抛错）——**能力都在，只是不受理角色。**

#### 2.3.3 界面自认

`EntityInspectorDock.tsx:160`（"心理与状态"页签）逐字显示：

> 状态投影合同（`tianyan-character-state-projection/v1`）**已定义，但当前没有生产喂入**；本面板不做无来源推断。

这条诚实占位应当保留到真有生产者为止。**判定：仅合同。** 角色状态今天**没有 Owner**（归属未裁定，见 §8-Q1）。

---

### 2.4 Context Inspector —— 一个真的，一个空的

#### 2.4.1 真的那个：女娲 N1

| 环节 | 证据 |
| --- | --- |
| 组件 | `apps/story-studio/src/components/nuwa/NuwaN1Workspace.tsx:780` `function ContextInspector`，挂载 `:744`，`<aside aria-label="女娲上下文检查器">` |
| 数据来源 | `run.contextInspector`，服务端由**重新调用同一个编译器**构建（`nuwaN1Port.mjs:817-839`）：逐角色 `attention.selected[].reason`、`excludedCount`、字节预算 |
| **同源保证** | 模型收到的是同一个冻结对象（`nuwaN1PiAdapter.mjs:96-116` `safeContextForProvider`；`:43` `prompt: promptFor(context, …)`） |
| 作者可见内容 | 角色核心／底线／本场目标、`knowledgeItems`、信念与误解、听闻、`details.nuwa-n1-context-technical` 预算、"N 项权限排除（身份隐藏）" |
| 预算诚实性 | UTF-8 字节实测（`nuwaN1Runtime.ts:285` `Buffer.byteLength(stableJson(context))`），界面明写"不是实际计费 token" |
| 测试 | `tests/storyIntelligence/nuwaN1Attention.test.ts`、`tests/storyStudio/nuwaN1LocalApi.integration.test.ts` |

**这是全仓唯一一处"作者看到的上下文 == 模型收到的上下文"，是角色 Agent 可解释性的地基。** NUWA-N2B 的验收文字已经把这条写成合同（`TIANYAN_ROADMAP.md:63`）。后续任何新上下文能力都必须保持同源，而不是再造一个面板。

#### 2.4.2 空的那个：天意输入区

`apps/story-studio/src/components/tianyi/composer/ContextControl.tsx` 的**形状完全按产品核心 `:1591-1600` 的八项清单**：页面／选中／引用／记忆／已排除／用量／预算 + "管理上下文"。它的 view model 是一个正经的 `TianyiComposerContextViewModel`（`:7-15`）。

实况（本文实测实参构造点 `TianyiSidebar.tsx:313`）——**7 行里 4 真 3 假**：

| 行 | 实参 | 判定 |
| --- | --- | --- |
| 页面 | `props.pageLabel` | 真 |
| **选中** | `t("context.noneSelected")` | **写死的常量** |
| 引用 | `simulationPack?.sources.length ?? contextRequest?.sourceRefs.length ?? 0` | 真 |
| **记忆** | `"not-connected" as const` | **写死的字面量** |
| **已排除** | `t("context.otherBranches")` | **写死的常量** |
| 用量 | `run ? String(simulationPack?.estimatedTokens ?? …)` | 真（run 未建时 `null`） |
| 预算 | `run ? String(run.budget.maxProviderCalls)` | 真 |
| "管理上下文…" | `translations.ts:396` = `"上下文管理尚未接入"` | **按钮存在，动作是弹一句未接入** |

> 修正记录：第一轮（在工作树上的）子代理把本组件判为"整块空壳"。上表是按基线实参逐行重推的结果——它其实是**一半真一半假，且假在恰好最难的那三项（选中作用域、记忆接入、跨分支排除）**。这个区分决定了升级成本，不能混。

#### 2.4.3 天意其余两处

- **来源抽屉（真）**：`TianyiSidebar.tsx:311-335` 渲染角色/标题/权威/`omitted`+理由，而它的 prompt 就是同一个对象 `JSON.stringify(contextPayload)`（`server.mjs:727`）。**同源成立。**
- **Grounded 回答回执（半）**：`sourceManifest` 四裁定（`included/excluded/budgetOmitted/conflicting`）+ 十理由码在服务端**真的算**（`tianyiGroundedContextGate.ts:76-94`、`:24-34`），但 UI 只渲染 `included`（`TianyiConversationWorkspace.tsx:1281` "采用的资料"）。`excludedSources/budgetOmitted/conflicting` 三个字段在 `localTransport.ts:463-465` 上了线，**没有任何 `.tsx` 引用它们**。
- **回执过期（半）**：`ContextReceiptV5.stale` 在构造时写死 `false`（`tianyiGroundedAnswerOperation.ts:772`），读路径原样回显（`storyStudioTianyiOperations.ts:514`）→ **回执级的版本漂移在今天是不生效的。** 来源级的漂移是真的（`STALE_REFERENCE` 逐源 contentHash 比较，`tianyiGroundedContextGate.ts:214-217`）。

**判定：N1 那一条可用；天意那一个是空壳（且是半成品空壳）；四裁定负向清单是仅合同。没有一个统一的 Context Inspector 模块、路由或 store。**

---

### 2.5 Attention Pack —— 五套装配器 + 一个影子，和一条已确认的外泄

#### 2.5.1 今天有几条装配路径：六条，互不相连

| # | 装配器 | 位置 | 真进模型请求 | 作者可见 |
| --- | --- | --- | --- | --- |
| 1 | N1 排演注意力 | `nuwaN1Attention.ts:22` `selectNuwaN1Attention`，算法标记 `permission-first-lexical-utf8/v1` | **是**（唯一进入逐角色真实请求的） | 是（与 Inspector 同源） |
| 2 | 天意 Grounded Context Gate | `tianyiGroundedContextGate.ts:169` | 是（天意泳道） | 部分（只显示 included） |
| 3 | 女娲执行简报注意力胶囊 | `nuwaAttentionContext.ts:71` | 是（`storyStudioIntelligenceBridgeOperations.ts:138,169,230`；`liveProviderPilot.mjs:129`、`goldenLoopOperation.mjs:20`） | 部分 |
| 4 | 天意侧栏模拟简报 | `tianyiSimulationSourceContract.ts:45` | 是（`server.mjs:620` → `:727`） | 是（来源抽屉，同源） |
| 5 | Golden Loop Context Pack | `goldenLoopOperation.mjs:544` | 是 | **无渲染器** |
| 6 | 女娲任务 ContextPack | `nuwaTaskContextPack.ts:36` | **否**，只做缓存身份 | 否 |

外加另有三处功能各自拼自己的 payload，一条都不复用：地图编辑（`mapEditProposalProviderAdapter.mjs:26-52`）、故事建模（`storyModelingProviderAdapter.mjs:44`）、图片观察（`imageObservationProviderAdapter.mjs:25`）。

**"影子第 7 个"：`characterContextPack.ts:88-134` `buildCharacterContextPack` ——它才是最接近用户所描述的 Attention Pack 的东西。** 它有：`kernel{core,boundaries}`、边界裁剪后的 `includedFacts`、场景匹配的记忆（上限 6 条）、`relationSnapshot`、`visibleEvents`、**`excluded[]` 每项带 `reason: "author-note"|"rumor"|"character-unknown"`**、UTF-8÷3 保守 token 估算、`providerCalls: 0` 的字面量类型、零命中时返回 0 条而不静默补位。

**但它只到 React 组件为止。** 本文实测 `buildCharacterContextPack` 在基线的全部非自身引用只有两处，都在同一个文件：

```
apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx:15   import
apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx:100  调用
（另有 tests/storyContracts/characterContextPack.test.ts:4,16,32）
```

`apps/story-studio/server/` 下**零引用**。它的唯一消费者是 `EntityInspectorDock.tsx:203-210` 的一个展示块。**是"给作者看的预览"，不是"给模型的输入"。** 真正进模型的逐角色上下文是另一条：`nuwaN1Runtime.ts:388` `compileNuwaN1Context`。

#### 2.5.2 分支感知（产品核心 `:1606-1619` 的要件）：只在 N1 成立

- **成立**：`nuwaN1Port.mjs:936-989` 按 `ownerWorkVersionId` 门控 `listVerifiedCanonEventIds`／`readWorldStateN4`／`listRelations`；`nuwaN1Runtime.ts:160`、`:731-736` 冻结 `sourceIdentity{kind: root|derived|unversioned-draft}`。记忆账本同样按 `sourceIdentity.kind` 分流（root 取 `revision ≤`、derived 取精确等值）。
- **不成立**：装配器 2/3/4/5 **没有任何分支/版本字段**；`TianyiSimulationSource.branchOrUniverse` 类型上有、值恒为 `null`（全文两处赋值 `server.mjs:607`、`:617`，均为字面量 `null`）；"明确排除的其他分支"在天意侧只剩一个静态字符串 `t("context.otherBranches")`。
- **一处新增但不属于注意力**：`buildContextManifest`（`server.mjs:553`）会校验 active work-version 相等（`:556`）、拒绝角色/仅展示访问（`:560-562`）、为非作者观察者剪掉隐藏事件引用（`:567-576`）。真的，但**没有共享给其余五个装配器**。

#### 2.5.3 「不该关注什么」在设计上是残缺的

- 预算内排除理由**只有一条** `lower-relevance-within-budget`（`nuwaN1Attention.ts:14`、`:67-68`）；权限排除只有一个合成码 `not-known-by-actor`。
- 产品核心八项清单要的"这条与本任务无关／这条已被作者禁止／这条会剧透／这条已过期"——**今天一类都答不出**。
- 已有但没接线的更完整分类法：`tianyiGroundedContextGate.ts:24-34` 的十理由码，以及 `excludedSourceReason.ts:19` 的八类分类器——后者**只有测试调用者**。
- **排除清单不持久**：装出来的 pack 不落盘，只有 `contextHash`（`nuwaN1Runtime.ts:297`、`:309`、`:366`）。Run 结束后"当时被拒了什么、为什么"**无任何记录可回看**。
- **作者主权缺 half**：产品核心 `:1602` 授权作者"增、删、固定、禁止"。`pinnedSourceIds` 已在（`nuwaAttentionContext.ts:29`），天意侧的 pin/remove 也已接（`TianyiConversationWorkspace.tsx:241-242,275-285` → `selectTianyiGroundedEvidence`）；**forbid 不存在**，N1 表面没有任何 pin/forbid 控件。
- **单位不一致**：N1 用 UTF-8 字节；`hybridRetrieval.ts:63-65` 用 `ceil(bytes/3)+1`；Gate 用 NFC 码点。`outputTokenBudget 1024`（`nuwaN1Runtime.ts:394`）对上适配器的 `maxOutputTokens: 512`（`nuwaN1PiAdapter.mjs:48`）。

#### 2.5.4 已确认：被排除的来源标题发给了 Provider

两条路径共享同一条产品意图（"排除清单的身份不得外泄"），**但只有一条实现到位**。本文在基线上逐字复核：

**正确的一条** — `nuwaN1PiAdapter.mjs:109-111`：
```
// Excluded identities can themselves disclose a future secret. The role
// gets only an auditable count/reason; the author inspector retains IDs.
excluded: { count: context.excludedKnowledgeCount, reasonCodes: … ? ["not-known-by-actor"] : [] },
```

**外泄的一条** — `apps/story-studio/server/providerGateway/liveProviderPilot.mjs`：
```
:129   attentionContext: input.attentionContext || null,     // 放进 requestPayload
:152   { role: "user", content: JSON.stringify(requestPayload) }   // 整个 payload 发给 Provider
```
而 `nuwaAttentionContext.ts:37` 的 `excludedSources: NuwaAttentionSource[]`，其元素类型（`:5-16`）携带 `label`、`reason`（中文，如 `:106` 的"超过本次来源预算"）与 `excerpt`（`:96` 截断到 240 字）。

> 注：`TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md` 把该文件写作 `liveProviderPilot.mjs`，实际路径含 `providerGateway/` 前缀；行号 129 与 152 正确。

**严重性限定（不夸大为"正在泄露"）**：该路径需 `executionMode === "live-pilot-r2"`（`server.mjs:3395`），且真实 Provider 由 `TIANYAN_REAL_PROVIDER_PRODUCT_PATH === "1"` 显式开启（`server.mjs:332`），默认关闭时返回 `unavailable` 且 `providerCalls: 0`（`:3935`）。所以它是**潜伏项**：今天不触发，在产品开始调真实模型做验收的那一刻触发。它是 §7 波次 0 的第一项。

**判定：不存在名为 Attention Pack 的东西；承担其职责的 6+1 套里，唯一真进模型的是 N1 那一条；负向理由、持久化、forbid、跨分支四项均未到位；另有一条已在的真实越界外泄。**

---

### 2.6 命运 K 线 —— 契约最好的一份，引用最少的一份

#### 2.6.1 契约侧：`characterFateProjection.ts`（230 行）逐条满足产品红线

| 产品核心要求 | 契约是否已实现 |
| --- | --- |
| 三条轨迹并列（`:553` 实际/规划/候选） | 是，`:59-61` `actual/planned/candidateTrajectory` |
| "不能由模型给出无法解释的神秘分数"（`:558`） | **是，而且是结构性保证**：`confidence` 是分类 `"author"\|"rule"\|"model"\|"unknown"`（`:31`），**类型上就不可能是数值** |
| 每点带回溯依据 | `knowledgeBoundary`（`:34`）、`explanation`（`:170`）、`stateDimension`（`:165`）、`sourceAnchorIds` |
| 未知不插值 | 世界时间四态 `exact\|relative\|range\|unknown`（`:5-9`），理由逐字写明 "World time is unknown; narrative order is preserved without interpolation."（`:108`） |
| 不得把候选冒充已发生 | `:147` actual 轨**禁止**含 planned/candidate/inferred 权威；`:150` confirmed 点必须有来源锚点；`:151` stale 必须**显式保持为 stale**；`:144` 必须复用既有 Event ID 否则抛错 |
| 不得静默合并/借用 | 按 `branchId`+`scope` 过滤（`:93`）；函数头注释 `:78-81` 明写"不推断缺失点、不改写 Owner、不提升权威" |

#### 2.6.2 实况侧：真孤儿

本文在最新 ref（`a37a314`）上直接执行 `grep -rn "characterFateProjection\|projectCharacterFate" src apps tests scripts`，除该文件自身外**命中为空**。仅有的相关字符串是无关字段名 `characterFateBefore/After`，出现在 fixture 路径（`nuwaBoundedScenarioRuntime.ts:428-429`、`nuwaBoundedScenarioFixture.mjs:250-251`），且该 fixture 默认关闭。

**零引用、零路由、零测试。** `TIANYAN_ROADMAP.md:69` 的 FATE-F1 状态是**计划中**。

#### 2.6.3 契约自身也还没覆盖五条轨

产品核心 `:560-566` 要求至少五条可比轨迹。现状：

| 要求的轨迹 | 状态 |
| --- | --- |
| 已确认事件形成的实际轨迹 | 契约有，**无生产者** |
| 作者直接设计的规划轨迹 | 契约有，无生产者；最近的既有物是 `status:"planned"` Event（一等公民，守卫在 `storyStudioWorkspaceOperations.ts:3730-3741`） |
| 未确认的候选轨迹 | 契约有，无生产者；来源候选是 `NuwaBranchNode`／多节点预测 bundle |
| **女娲排演形成的轨迹** | **契约里就没有这一条 lane** |
| **跨分支对照（主线/IF/翻译/改编）** | **契约里就没有对照轴**；`branchId` 是**过滤器**不是并列维度 |

另三个硬缺口：
- **横轴只能是叙事顺序。** 排序键实测是 `narrativeOrder` 然后 `observationId`（`:186-188`），**不含 `worldTime.sortKey`**；根因是正式 Event 没有结构化世界时间字段（世界时间今天散落在 Relation 的 `validFrom/validTo`、N4 的 `effectiveAt`、因果卡上从 `时间：` 标签切出的字符串）。
- **没有"默认综合 + 折叠维度"模型。** `stateDimension` 是扁平字符串，无综合概念。
- **没有编辑/拖拽 API。** 函数是显式只读的。

#### 2.6.4 UI 与图形：完全未开始

- `package.json` 与 `apps/story-studio/package.json` 中**没有任何图表库**（实测 `echarts`/`d3`/`recharts`/`visx`/`chart`/`victory`/`plotly` 全部零命中）。现有图形依赖只有 `@xyflow/react`、`@dagrejs/dagre`、`leaflet`。
- 应用内所有 `<polyline>`／`<path d=>` 属于地图绘制（`components/world/mapAuthoring.tsx`），与角色无关。
- `EntityInspectorDock.tsx:164` 的"演化与命运"页签逐字写着：**"命运投影合同（`tianyan-character-fate-projection/v1`）已定义；当前没有 actual / planned / candidate 生产数据，不生成无来源轨迹。"** ——位置已预留，内容是诚实占位。

#### 2.6.5 三个"看起来像但不是"，研究时必须排除

1. **`ParticipationObservation.tsx` 的"人物轨迹"** ——是**参与**轨迹，取值 `direct|witnessed|explicit-absence|unknown`，**无任何数值**，不是命运。
2. **`contextualCapabilityRegistry.ts:40`** ——声明了 7 个 `data-fate-*` 能力（"解释当前轨迹""对照实际与规划""检查角色知识越界"…），文案与产品核心高度吻合。但它们是**静态展示字符串**：app 侧全部对本模块做 type-only import，实际下发的菜单是 7 项无关硬编码项（`capabilityMenuRegistry.ts:8-17`），该数组只被一个 Shell 测试读取。**是空壳，不是入口。**
3. **`characterStateImpactFixture.mjs` 的 `impactPreview()`** ——before/after/newKnowledge/beliefChanges/relationshipChanges **全是硬编码散文**，且同文件 `:71` 自报 `characterWrites: 0`。这是演示夹具，不可当作能力证据。
4. 另有 `multiverseSingleDerivedR0.ts:109`、`creationSourceDriftR0.ts:132` 里的字符串 `"Character Fate"`，出现在"**本次没有改动**什么"的声明中——恰好是反证。

**判定：仅合同（且契约缺 2/5 轨迹）+ 界面完全未开始。** 最危险的邻近物是三处 `confidence: number`（`temporalProjection.ts:29`、`:42`，`derivedEventLineR1.ts:54-70`）——最省事的实现会把它们当 K 线高度，直接违反 `:558`。

---

## 三、问题 1：当前角色 Agent 已经有什么

按产品核心 `:417` 对 Agent 的定义逐项对照（"稳定身份、状态、记忆、关系、规则、能力、知识边界和可被调用的响应方式"）：

| Agent 要件 | 实况 | 等级 |
| --- | --- | --- |
| 稳定身份 | WorldObject 稳定 ID + subtype + aliases + revisionToken，Markdown 落盘，改名影响引用 | **可用** |
| 类型与子类型 | 7 型 WorldObject + `agentTypeCatalog` 的 `classified/uncertain`（§七.3 未归类/已归类轴） | **可用** |
| 长期属性（人格） | 3 个活字段；进模型的只有 `{core, boundaries}` 两字符串 | **可用（极窄）** |
| 记忆 | 读：5 类派生 + 账本；写：只有 `heard` | **混合：读可用／写 1/5** |
| **当前状态** | 8 类契约、2 类退化产出、结果被丢弃、Owner 拒绝角色 | **仅合同** |
| 关系 | `RelationRecordR0` 双时态 + `reviewState` + `evidenceRefs` + `supersedesRelationId`，唯一 Owner，全仓最强结构；工作台"关系与知情"页签真读 | **可用** |
| 知识边界 | 事件可见性投影按 tag 过滤并在边界前丢弃隐藏正文；N1 侧**在派发前结构性生效**（越权事实根本不进 payload） | **可用（仅 N1 路径）** |
| 可被调用的响应方式 | N1 逐角色回合：`intent ≤600`／`speech ≤1200`／`action{targetId,worldState?}`／`observableResult ≤1200`／`heardByActorIds`；唯一工具 `read_role_context` | **可用** |
| 运行状态（§七.2 休眠/按需/事件触发/后台/排演） | 全仓无 `dormant`/`休眠`/`on-demand` 标识；只有 per-run 状态机 | **未开始** |
| **命运轨迹** | 高质量契约，零引用零测试零 UI | **仅合同** |
| 变更历史 | 角色卡历史投影有测试但**无运行时调用者**（孤儿-by-consumption）；`compareCharacterStates` 零调用者 → 无状态时间轴 | **仅合同** |
| per-Agent 预算/工具/频率/子 Agent 限制 | 只有 run 级 `permissionProfile` 与 `maxProviderCalls`；`AgentPermissionProfile` 是动作级不是人物级 | **未开始** |

**外加一条已经跑通、但常被漏记的事实：Agent Run 底座是实的。**

- `src/storyAgent/tianyiAgentRuntimePort.ts`（799 行）真实执行 `startRun → planFor → executeContextStep → executeAnalysis → 工具/审批/转向/回执`，事件溯源持久化，`idle|planning|awaiting_author|running|paused|completed|failed|cancelled` 全套可暂停恢复取消重试，页面作用域校验，接 `server.mjs:1096-1097, 4580-4712`。
- **工具白名单是真的**：`TIANYI_AGENT_TOOL_REGISTRY`（`:133-299`，14 个工具），`validateTianyiAgentToolCall`（`:767-793`）拒绝未声明工具、未声明字段、路径/shell/凭据 key 与 URL。`propose_story_intake` 是**模型真能调的注册工具**（`storyIntakeTool.ts:22-79`，带 JSON-Schema 与 `execute()`，2 次修复上限），在 `server.mjs:699` 实例化、`:743-744` 作为 `requiredToolName`、`builtinPiAgentRuntimePlugin.ts:196-197` 首轮强制。
- **端到端真打通**：UI → `localTransport.ts:3339` → `server.mjs:4612` → runtime → `runProvider` → `runtime.run` → `providerGateway.openChatStream` → `siliconFlowAdapter.mjs:41` 真实 `fetch`。**但有 env 闸门**（`server.mjs:330`/`:332`），默认返回 `ProviderUnavailable`，测试走 `local-fake` 确定性流，**无静默回退**。
- **预算与停止条件是真的**：`providerRequestBudgetLedger.mjs:35` 派发前预扣、幂等、`PROVIDER_BUDGET_EXHAUSTED`；N1 硬上限 6 步／12 次派发；连续循环带无进展守卫。

**一句话总结**：天衍今天有"一个有身份、有来源、能被稳定读取的角色对象"，和"一条真的按该角色所知所信行动过、可暂停可回放可预算、且作者能看到模型看到了什么的排演流水线"。**没有的是"这个角色跑完之后世界里的它发生了哪些可追溯变化"的落点。**

---

## 四、问题 2：距离真正「角色生命体」缺什么

"角色生命体"在产品核心里的可操作定义在 `:1660-1666`（知识传播是"角色自然行动、视角切换和女娲推演的基础"）与 `:43`（"让角色依据自己的知识和记忆行动"）。据此，缺的不是"更大的模型"，而是下面 10 条**机制**。每条标注承载者。

| # | 缺的机制 | 今天为什么不算"活着" | 需要新增（不新建 Owner） | 归属 |
| --- | --- | --- | --- | --- |
| L1 | **角色状态的落点** | `:1540-1541` 直接拒绝角色主体；状态算出来即丢弃 | 先裁定由哪一个既有 Owner 受理角色主体；再补 8−2 维生产者 | **归属未裁定**（§8-Q1） |
| L2 | **人格能否决行动** | 人格进了 prompt，但没有任何一处能让"底线"阻止一个行动。约束目前是**措辞不是关卡** | 底线关卡：判定结果作为 attempt 内带理由记录，随 `run.json` 走 | `nuwaN1Runtime.ts`（校验）+ `StoryStudioObjectProfile`（数据） |
| L3 | **四类记忆的写入者** | 只记得"谁对我说过什么"，记不住"我经历了什么/我相信什么" | 在**作者确认之后**由成功路径派生写入（不得由推演自动写） | `storyContinuity/characterMemoryRepository.ts`（唯一） |
| L4 | **召回参与决策** | 召回是过滤不是排序；即使召回也不影响"下一步做什么" | 授权集合内的确定性相关性排序 | `storyContinuity` + `storyIntelligence` |
| L5 | **决策而不是轮转** | 下一行动者 = `actors[steps.length % actors.length]`，人格/目标/信念对其**零影响** | 在"已授权目标集 + 场景必需"内确定性选取；`intent` 必须引用其实际使用的目标/信念 ID | `nuwaN1Runtime.ts`（循环内部） |
| L6 | **角色会拒绝** | `authorCue` 是纯建议，新 cue 只会作废当次尝试 | 新增候选结果形态"不行动 + 理由 + 依据条目"；仍是 Run 本地候选 | `nuwaN1Runtime.ts`（⊕ §8-Q6 是否耗派发待裁定） |
| L7 | **目标能在数据层相撞** | 三个平面字符串（`authorGoal`／`localGoal`／`scene.label`），唯一用途是当检索词；两角色目标在数据上无法冲突 | 用**已存在**的 `CharacterStateEvidence{category:"goal"\|"commitment"}` + 同 `conflictGroupId` 聚合；**不需要新结构** | `characterStateProjection.ts`（纯投影，已含 conflict） |
| L8 | **`observableResult` 有裁决者** | 它是模型自述文本，从不与任何解析器核对 | 让事件效果以**提案**形式指向既有 `WorldStateN4Change`（其证据强制已完备） | `storyStudioWorkspaceOperations.ts`（唯一 WorldState Owner） |
| L9 | **心理状态的时间轴** | 即使补上 L1，也没有"按叙事位置取快照"的调用者（`projectCharacterState` 已支持 `narrativePosition <=` 过滤，无人调用） | 接一个只读调用点 | `storyContracts/`（只读投影） |
| L10 | **跨场景不污染** | 主线/派生/Run 临时三类记忆的可见性规则已在（root ≤、derived 精确），但 derived 的 full-access 写入**当前被直接阻断**（`nuwaN1Port.mjs:386-388`），是有意设计 | 解开或维持，属产品判断 | **归属未裁定**（§8-Q7） |

### 4.1 一条真实的产品-工程冲突（必须点出）

产品核心 `:468-476` 要求 Agent 有"**后台活动**"运行状态（在作者允许的范围、预算、时间内持续工作）。而工程侧 `src/storyContinuity/checkpointBAcceptance.ts:27` 把 `backgroundActivityCount`、`backgroundModelCallCount` 列入 `TIANYI_CHECKPOINT_B_BOUNDARY_COUNTERS`（逐项归零的边界计数器），且全仓**没有任何** `setInterval`、cron、scheduler 或 worker 队列——"女娲连续运行"是**一次 HTTP 请求内的同步 while 循环**（`nuwaN1Port.mjs:236-248`）。

**两者不是"实现没跟上"，是验收口径与产品定义的正面冲突。** 要"角色在自己不在场时也活着"，必须先改掉这条零值不变量；本文不替创始人做这个决定（§8-Q8）。

### 4.2 本文替用户挡掉的、不属于"角色生命体"缺口的东西

以下常被误列为必需项，实测既无既有落点、也与上述 10 条无因果关系，本文不纳入路线：常驻的每角色模型实例（`:429` 明令不等于）、向量数据库（`R0.5 一个都不选`）、自动文明演化、统一世界时钟（属 §8-Q9 的大项）、"命运指数"式单分数（违反 `:558`）。

---

## 五、问题 3：哪些能力已有 contract

按"契约完整度"降序。这一节的实用价值是：**这些不需要重新设计，只需要接生产者或接消费者。**

| 契约 | 位置 | 完整度 | 缺的是 |
| --- | --- | --- | --- |
| **角色状态投影** | `storyContracts/characterStateProjection.ts`（222 行） | 8 类状态 + 6 权威 + open/conflict/stale/planned/candidate + 比对 + 过渡解释 + 越界校验，**带完整测试** | **缺消费者**（3 个函数零调用者）+ 缺 6/8 类生产者 |
| **命运轨迹投影** | `storyContracts/characterFateProjection.ts`（230 行） | 三轨 + 7 权威 + 分类 confidence + unknown/conflict + 不插值 + 4 条硬校验 | **缺生产者 + 缺消费者 + 缺 UI**；契约内还缺排演轨与跨分支轴 |
| **角色上下文包（最接近 Attention Pack）** | `storyContracts/characterContextPack.ts`（134 行） | kernel/includedFacts/memories/relations/visibleEvents + **带理由的 excluded[]** + token 估算 + `providerCalls: 0` | **缺模型侧消费者**（只到 React 组件） |
| 世界参考投影 | `storyContracts/worldReferenceProjection.ts`（166 行） | 类别×信息性质 + per-character 知情 + 反查键 + `characterAllowedReferences` | **可用**（唯一有新契约且带服务端消费者的一条：`semanticIndexService.mjs:98-105` 索引资格门） |
| 女娲注意力胶囊 | `storyIntelligence/nuwaAttentionContext.ts` | included/excluded + reason + constraints{mustKeep,mustAvoid,success,failure} + actorKnowledge + pinned + budget + capsuleHash + stale 拒绝 | 缺渲染器（`projectNuwaAttentionForAuthor` **零调用者**）；**且它是 §2.5.4 外泄的载体** |
| Grounded 上下文门 | `storyContinuity/tianyiGroundedContextGate.ts` | 四裁定 + 十理由码 + 硬预算 + 逐源 contentHash；**真的进模型** | 负向三裁定在 wire 上但**无 UI 引用** |
| 记忆账本 | `storyContinuity/characterMemoryRepository.ts` + `continuityTypes.ts:101-118` | 幂等/失效/理由强制/永不删除/版本链可见性 **全套已实现** | 缺 4/5 类的写入者（`:194` 主动拒绝） |
| 排演记忆与关系增量 | `nuwaRehearsalContract.ts:92-99`、`:102-110` | `NuwaMemoryDelta`/`NuwaRelationshipDelta` 字段齐备 | `writeNuwaRehearsalRevision` **无应用调用者** |
| WorldState N4 | `storyContracts/worldStateN4.ts` | append-only、证据必须 confirmed-event id+revision、补偿指向既有变更、**已有 mainline/workVersions 分支感知与 history 时间轴** | 缺"从事件推导"（全靠手工录入）；**不受理角色** |
| 角色卡属性系统 | `storyCardPresentation/characterProperties.ts`、`characterTemplate.ts` | 7 类型 + frontmatter 解析/序列化 + 标签映射（含"知识边界""当前状态"） | 缺编辑与展示 UI；模板声明的字段缺生产者 |
| 对象 profile | `storyContracts/storyStudioObjectProfile.ts` | 开放 `fields` + `source` 三值 + confidence 四级 + sourceAnchors + authorConfirmed | `agent`/`source-anchor` 零写入者；`unresolvedQuestions`/`warnings` 双向皆空 |
| 正式叙事编排 | `storyContracts/narrativeArrangement.ts` + Story Unit Writer | 版本化 `NarrativeArrangement` + 稳定 `NarrativePlacement` + revision 链 + 回执 + rollback | **可用**，但 K 线未复用它作横轴 |
| 知情边界工具 | `characterStateProjection.ts:97-116` `CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION` | 完整 JSON-Schema 工具定义 | **零引用**（白名单里也没有它）——注册即可用，但要先定失败语义 |
| Agent §七.2 运行状态 | — | **无契约** | 未开始 |
| Attention Pack / Context Inspector | — | **无同名模块** | 见 §0.2 |

**本节最重要的一句话：`characterStateProjection.ts` 与 `characterFateProjection.ts` 是两份已经写完、已经通过测试、已经逐字对齐产品红线的契约，一共 452 行、生产可达性分别约为 1/3 和 0。** 角色 Agent 升级的最高性价比动作是**接线**，不是再设计第三份契约。

---

## 六、问题 4：哪些只是空壳

"空壳"的定义（§0.4）：界面上有位置，内容是硬编码、占位文案或指向别处的假动作。本节逐项列出，并区分**诚实空壳**（明说没有，符合 `:2153` "未知明确写未知，不显示假数据"）与**误导性空壳**（看着像有）。

### 6.1 诚实空壳（保留，等生产者）

| # | 位置 | 界面文案 |
| --- | --- | --- |
| H1 | `EntityInspectorDock.tsx:160` 心理与状态页签 | "状态投影合同（`tianyan-character-state-projection/v1`）已定义，但当前没有生产喂入；本面板不做无来源推断" |
| H2 | `EntityInspectorDock.tsx:164` 演化与命运页签 | "命运投影合同…**已定义；当前没有 actual / planned / candidate 生产数据**，不生成无来源轨迹" |
| H3 | `EntityInspectorDock.tsx:163` 人生与事件页签 | 只有计数 + 深链，无事件列表；空态 `:128` "暂无正式事件参与记录" |
| H4 | `EntityInspectorDock.tsx:193-199` Agent 运行页签解析链 | 四段依次"未设置"，终态"尚无可执行档案；…角色级配置 Owner 未建立" |
| H5 | 世界变体 `EntityInspectorDock.tsx:322` | "暂无 planned/candidate 数据（诚实空态）" |
| H6 | `CharacterInspectorCard.tsx:97` | "当前筛选没有可显示的记录；这不代表角色从未经历任何事情"——**并且 `:89` 把读取失败与空结果分开写**，是正例 |

> 这六处的存在本身是好消息：它们说明作者不会被假数据骗到，也说明**位置已经预留好了**。§7 波次 1 的目标就是把 H1/H2 的文案替换成真实内容，而不是新建面板。

### 6.2 误导性空壳（需要处理，但不等于"填上就行"）

| # | 位置 | 问题 | 处理方向 |
| --- | --- | --- | --- |
| M1 | `ContextControl.tsx` 的 3 行（实参 `TianyiSidebar.tsx:313`） | `selection`、`memoryState:"not-connected"`、`excludedScope` 是**写死常量**，但同面板另有 4 行是真值 → 整体看着可信 | 假行改显式未接入态，或接真值；见 U1-4 |
| M2 | `TianyiSidebarComposer.tsx:41` "管理上下文…" | 按钮存在，动作是弹 `translations.ts:396` "上下文管理尚未接入" | 未接入前应禁用（产品核心 `:2074` "未接入工具必须禁用或隐藏"） |
| M3 | `CharacterInspectorCard.tsx:57` 逐字段铅笔 | 每支铅笔都调 `onOpenFull`，**不编辑所在字段** | 图标即承诺，应改图标或改动作 |
| M4 | `contextualCapabilityRegistry.ts:40` 的 7 个 `data-fate-*` | 文案精确对应命运 K 线能力，但 app 侧全为 type-only import，实际菜单是 7 项无关硬编码 | 属"承诺未实现能力"；入口待 §8-Q5 裁定后再决定 |
| M5 | `characterStateImpactFixture.mjs:142-161` `impactPreview()` | before/after/newKnowledge/beliefChanges/relationshipChanges **全部硬编码散文**，同文件 `:71` 自报 `characterWrites: 0` | 夹具，禁止进入任何作者面 |
| M6 | `impactAnalyzer.ts:262` | 置信度是编造的 `0.72 + n*0.02` | 与 `:2153`"不显示假数据"冲突；已在 `domainTemplates` 原型内、不在女娲生产路径，但**必须显式标为原型** |
| M7 | `characterTemplate.ts:277-278` 的"当前状态""知识边界" | 标签存在、无任何生产者 → 作者会以为填了就有状态 | 与 H1 是同一件事的两面 |
| M8 | `EntityInspectorDock.tsx:162` `graphRelationCount={0}` | 页签本身真读关系，但图谱计数是字面量 0 | 单点接线 |
| M9 | `EntityInspectorDock.tsx:103` `goal: null` | "当前目标"恒显示"未记录"，而 N2A 的逐角色本场目标**在服务端已经存在** | 与 `localGoal` 接上即可 |
| M10 | `tianyiSimulationSourceContract.ts:18` `branchOrUniverse` | 类型上声明分支/宇宙，值恒 `null`（`server.mjs:607`、`:617`） | 是 §2.5.2 的界面症状 |

### 6.3 完全未开始（不是空壳，连壳都没有）

记忆分层（长期/短期/最近）、遗忘与被压抑、怀疑的专门记录类型、状态时间轴的历史读取、命运 K 线的一切图形（且无图表库依赖）、世界时间为横轴的 K 线、作者的上下文 **forbid** 权、排除清单的持久化与事后回看、per-Agent 预算/频率/工具/子 Agent 限制、§七.2 运行状态模型、后台/定时/事件触发活动。

---

## 七、问题 5：最小可行升级路线

**排序原则是依赖解锁，不是工作量。** 本文不估算难度、不提重构方案、不指定实现方式；每行按用户要求的四栏标注。

**Owner 一栏只写既有唯一 Owner 或"未裁定"**（取自 `FEATURE_INDEX.json.boundaries` 与 `项目目录导航.md:142-150`）：Canon 写入 = `src/storyControlSurface/storyStudioAuthorControl.ts`；WorldState 事实／Event 投影 = `src/storyControlSurface/storyStudioWorkspaceOperations.ts`；Agent 运行端口 = `src/storyAgent/tianyiAgentRuntimePort.ts`；Provider 边界 = `apps/story-studio/server/providerGateway/aiProviderGateway.mjs`；角色听闻记忆 = `src/storyContinuity/characterMemoryRepository.ts`；上下文正确性与角色知识边界 = `storyContinuity/`；有界运行与授权内注意力 = `storyIntelligence/`。

### 波次 0 · 清障（不加任何能力）

| 编号 | 升级项 | 已有代码支持 | 需要新增 | 风险 | Owner |
| --- | --- | --- | --- | --- | --- |
| U0-1 | **修排除来源标题外泄** | 正确策略已在 `nuwaN1PiAdapter.mjs:109-111`（只发 count+reasonCode，注释已解释"排除身份可泄露未来秘密"）；负向清单结构已在 `nuwaAttentionContext.ts:37` | 让 `liveProviderPilot.mjs:129/152` 采用**同一条**外泄策略；不新增语义、不改 Inspector 侧可见内容 | 收敛时把 N1 侧更强的不变量弱化掉；或反过来把 Inspector 也削成只显数量，违反 `:1602` 作者知情 | `server/providerGateway/`（Provider 边界）＋ `storyIntelligence/nuwaAttentionContext.ts` |
| U0-2 | **裁定角色状态归属** | WorldStateN4 全套已可用：append-only、证据强制 confirmed-event id+revision、补偿、`mainline/workVersions` 分支感知、`history[]` 时间轴 | **一次裁定**：角色主体由该 Owner 受理，还是保持"投影派生、非存储真相"（后者已在 `characterStateProjection.ts` 实现）。本文不替创始人选 | 若为"当前心理状态"新建可变表 → 违反唯一 World 事实 Owner；若不先裁定，L1/L7/L9 全部无处落地 | **未裁定**（现有候选：`storyStudioWorkspaceOperations.ts:1540-1541` 的两型限制） |
| U0-3 | **结清存量验收** | NUWA-N2A/N2B/N2C/N3A、MEM-Q1 五条均为"本地与浏览器通过；真实模型未运行；作者待验"，代码与证据链齐 | 真实模型验证 + Founder 独立人工验收（`AGENTS.md` 明令技术测试不等于验收） | 在未验能力上继续叠能力；把"作者待验"误升级成"已具备"，污染能力账本 | `docs/product/TIANYAN_ROADMAP.md` 状态行（能力账本唯一入口） |
| U0-4 | **补登记磁吸工作台** | `FEATURE_INDEX.json` 已登记 `character-agent-magnetic-workbench-r0`、`world-reference-r1`（实测 18 处命中） | `项目目录导航.md` 中 `entity-dock`/`EntityInspectorDock` **命中数为 0**。按 `AGENTS.md` 第二条，责任区/入口/所有者变化须同步导航 | 低（文档一致性）；但不补则下一个 Agent 会重复发明同一定位 | `项目目录导航.md` |

### 波次 1 · 接线优先于新建（本文最高性价比段）

| 编号 | 升级项 | 已有代码支持 | 需要新增 | 风险 | Owner |
| --- | --- | --- | --- | --- | --- |
| U1-1 | **状态投影不再丢弃** | `projectCharacterState` 已在 `eventStoryCrossingKnowledge.ts:117` 被真实调用；投影对象已含 8 类分桶；`projectionRevision` 已在 `:186` 透出并被 UI 显示 | 把同一投影的**内容**交出去，让 H1（`EntityInspectorDock.tsx:160`）读到；不新建投影、不改校验强度 | 展示出的仍是 `knowledge`/`belief` 两桶，作者可能误以为"状态=所知"，需在界面标注覆盖范围 | `storyContracts/`（只读投影，无写入） |
| U1-2 | **两个零调用者函数接为闸门** | `compareCharacterStates`（`:179`）、`explainStateTransition`（`:192`，已输出中文「由事件 X 形成／缺少事件依据」）、`validateKnowledgeBoundary`（`:196-211`，已含 `boundary_violation`）**全部已实现且带测试** | 两个调用点：Inspector 展示 + 排演前只读校验。**这是能力已在、只缺接线** | 越界校验的失败语义未定（阻断派发 vs 标注后放行），属产品判断；选错会把可解释性变成新的静默拦截 | `storyContracts/`（判定）＋ `nuwaN1Runtime.ts`（派发前读取，不改预算/fail-closed） |
| U1-3 | **角色目录接入磁吸工作台** | dock 已在 `ShellWorkspaceOutlet.tsx:105` 全局挂载；`openEntityDock({kind:"object", objectId, openedFrom})` 已有三个 `openedFrom` 取值的先例；中央 `CharacterWorkspace` 已只读组合同一批 Owner | 目录/中央页的入口实参（`openedFrom` 新增一种取值即可） | 与既有中央 `CharacterWorkspace` 职责重叠——`FEATURE_INDEX` 已把 "character-directory entry migration" 列为 open gap；两页并存会形成第二作者面 | `product-shell/project-directory/`（只拥有导航/组织/引用 UI） |
| U1-4 | **把 M1 的三行假值改诚实或接真** | 同面板已有 4 行真值可参照；`selection` 的真实来源在 `EventLineWorkbench` 的通用选择里存在；`excludedScope` 的真实来源在 `nuwaAttentionContext.excludedSources` | 只改 UI 实参，不新增装配出口（`TIANYAN_DEV_SUGGESTIONS_R0.md:40` 已规定任何新上下文必须走 Gate） | 若在 UI 侧另拼一份上下文，即形成第二装配出口，直接违反既有硬约束 | `components/tianyi/composer/`（只表达 UI） |

### 波次 2 · 让记忆与人格闭得上

| 编号 | 升级项 | 已有代码支持 | 需要新增 | 风险 | Owner |
| --- | --- | --- | --- | --- | --- |
| U2-1 | **四类记忆写入者（L3）** | 账本全套已实现：确定性 ID 幂等、内容不符抛错、回溯只翻 `invalidated` 且强制理由、root ≤／derived 精确可见性；五类 kind 已在读侧存在 | 写入时机从"排演步骤"改为**作者确认之后**，由 `applyAuthorChangeSet` 成功路径派生（确认了 Event，才产生该 Event 的亲历/目击/告知记忆） | ① **推演结果自动当正式故事**（违反 `:167`）——必须挂在确认之后；② **RunPack 变第二永久记忆库**（`TIANYAN_ROADMAP.md:64` 明令禁止），只能写在 repository 不写在 `run.json`；③ 主线/派生/临时三类记忆互相污染（`:1641`） | `storyContinuity/characterMemoryRepository.ts`（唯一） |
| U2-2 | **召回相关性排序（L4）** | `nuwaN1Attention.ts:20-21` 已确立并注释了全仓最重要的一条不变量："排序永远不能授予访问，只接受已授权集合"，可直接照搬其语义 | 授权集合内的确定性排序函数；冻结输入必得同一输出 | 语义相关性排序最容易把"作者以为已排除的东西"用**排序位置**暗示出来；既有不变量不得因"更好用"而弱化 | `storyContinuity`（召回）＋ `storyIntelligence`（预算内选择，不授予来源） |
| U2-3 | **人格字段扩展（L2 前半）** | `StoryStudioObjectProfile.fields` 是开放字典（加 key 不需改契约）；`CharacterProfileEditor.tsx:105` 是唯一构造点；`authorConfirmed` 闸门已在（N2A） | 把 `normalizeProfileBasis` 的白名单从 2 项扩到欲望/恐惧/底线/价值观/说话方式；编辑入口仍是同一个 | 把模型猜测当人格事实 → 新字段必须**作者确认后才进入排演**（沿用 N2A 既有闸门）；⊕ 录入形态未定（§8-Q2） | WorldObject / Profile 唯一写入者：`storyStudioWorkspaceOperations.ts` |
| U2-4 | **底线关卡 + 拒绝形态（L2 后半、L6）** | `CharacterStateEvidence.authority` 已含 `candidate`，`projectCharacterState` 已把 candidate 与 ordinary 分流（`:150`、`:172-173`）；`NuwaN1ActorResult` 已是候选交接（`formalWrites: 0`） | 判定结果建议**不落地**：作为 attempt 内带理由的拒绝记录，与 `NuwaN1Attempt` 同生命周期 | ① 变成第二套权限系统——必须与 `actionPermissionBroker.ts` 严格分开，后者既有不变量（受保护动作恒 `requires-author`、范围授权精确匹配 run+unit+全部 actor）不得动；② 拒绝是否消耗派发（§8-Q6） | `nuwaN1Runtime.ts`（校验/循环）＋ `StoryStudioObjectProfile`（数据） |

### 波次 3 · 决策与命运（严格前置依赖）

| 编号 | 升级项 | 已有代码支持 | 需要新增 | 风险 | Owner |
| --- | --- | --- | --- | --- | --- |
| U3-1 | **因果本体归一（K 线硬前置）** | 两套都在跑且各有唯一消费者：`projectCausalEvolution`（`worldCausalEvolution.ts`，从标签与对象类型推导）→ `EntityInspectorDock.tsx:16,262`；`buildEventCausalIndex`（`eventCausalIndex.ts`，从关系标签正则推导）→ `EventLineWorkbench.tsx:83,1299` | 一次**裁定**谁是权威、谁降为视图。**这是纯去歧义，不删功能** | 不先做则同一次偏移在事件线和 K 线上显示成两条不同因果，作者立刻失去信任；两套权威枚举还不兼容（`author\|confirmed-event\|planned\|candidate` vs `author-confirmed\|ai-candidate\|speculative\|conflict`） | **未裁定**（两者均在 `storyContracts/`） |
| U3-2 | **决策替换轮转（L5）** | 全部预算门、fail-closed、冻结人物修订哈希校验（`:836,858`）、每次读重规范化（`:714`）都已在 | `:282` 的轮转改为确定性选取；`intent` 必须引用实际使用的目标/信念 ID | 回放与可复现性依赖冻结输入；引入任何随机性或时间依赖即破坏"同一冻结输入可复现"（N2B 检查点条款） | `nuwaN1Runtime.ts`（循环内部） |
| U3-3 | **`CharacterFateObservation` 生产者（F 的唯一必需代码主体）** | 契约 230 行逐条可用；三条轨迹的**存储在层都已有一等公民**：规划 = `status:"planned"` Event，候选 = 派生 WorkVersion 下的 `NuwaBranchNode`／多节点预测 bundle，实际 = `committed` + `作者确认` | actual 点从 confirmed Event（+ 未来的 WorldStateN4Change）生成，planned 点从规划 Event 生成 | 契约 `:144` 强制点必须复用既有 Event ID → 候选点入图前**必须先有可引用的候选 Event 身份**（§8-Q4）；⊕ 禁止 K 线读任何 `confidence:number`（`temporalProjection.ts:29,42`、`derivedEventLineR1.ts:54-70` 就在旁边） | `storyContracts/`（纯投影，`writes: 0`、`providerCalls: 0`） |
| U3-4 | **K 线首版：只画 actual + planned 两轨** | 偏移的"因"有现成回溯器：`buildEventCausalIndex` 的 `cause\|trigger\|necessary-condition\|result\|downstream-impact` + 深度 1-2，**作者已经在事件线上看得到它**；计划↔实际的既有连接 = `canonicalLinks` 的 `planningEventId→canonicalEventId` | 一个不依赖图表库的两轨视图；横轴用叙事顺序并**在界面标出** | 用叙事顺序冒充世界时间（`:371` 时间线同上游问题，§8-Q9）；⊕ 固定入口未定（`:2466`，§8-Q5） | `storyContracts/`（投影）＋ `product-shell/`（呈现） |

### 波次 4 · 明确不做（最小可行的"小"体现在这里）

常驻逐角色模型实例（`:429`）、向量数据库与完整 RAG（`R0.5 一个都不选`）、自动文明演化、统一世界时钟与虚构历法（§8-Q9 未裁定前不做）、任何概率/权重/"命运指数"、跨分支轨迹合并视图（`:568` 只允许显式对照，`compareCharacterStates:218` 的校验强度**不得为支持合并视图而放宽**）、把预测自动升级为 IF（`:2464` 门槛已确认）。

### 7.1 依赖图（文字版）

```
U0-1 修外泄 ─┐
U0-2 裁定状态归属 ─┬─ U1-1 投影不再丢弃 ─ U1-2 闸门接线 ─┐
U0-3 结清存量验收 ─┤                                    ├─ U2-1 四类记忆 ─ U2-2 召回排序
U0-4 补登记 ───────┘   U1-3 目录入口   U1-4 UI 诚实化 ──┘  U2-3 人格扩展 ─ U2-4 底线关卡
                                                          │
                                       U3-1 因果归一 ──────┴─ U3-2 决策替换轮转
                                              │
                                              └─ U3-3 Fate 生产者 ─ U3-4 K 线首版
```

**最短路径（若只能做三件事）**：U0-1（一条已在隔壁实现正确的安全策略）→ U0-2（一次裁定，解开 L1/L7/L9 三条链的共用死结）→ U1-2（把两个已写完、已测过的函数接上）。这三件都不新增契约、不新增 Owner、不新增库，却能立刻让"状态可读、越界可拦"从界面上的占位句变成真实内容。

---

## 八、进入任何一项之前需创始人裁定的问题

| # | 待裁定 | 为什么本文不能替你定 |
| --- | --- | --- |
| Q1 | **角色状态由谁承载**：扩展 WorldStateN4 受理角色主体，还是保持 `characterStateProjection` 的"纯派生投影、非存储真相" | 前者动唯一 World 事实 Owner 的语义，后者决定状态永远是可重算的只读视图。这是全路线最上游的一刀，且 `:1540-1541` 是**有意的限制**不是疏漏 |
| Q2 | **人格录入形态**：逐字段结构化填，还是作者自由写"角色灵魂"后由 AI 提结构候选、作者确认 | `TIANYAN_PRODUCT_CORE.md:515-550` 列了完整字段清单但未定录入体验 |
| Q3 | **唯一 Attention 信封选哪一份形状**：`nuwaAttentionContext`（已带 constraints/actorKnowledge/budget/capsuleHash/stale 拒绝，但已是外泄载体）还是 `characterContextPack`（排除即条目、providerCalls 字面量类型，但只到 UI） | 这是全文最大的一次收敛。两者各有既有消费者，**新建第三套会直接出现三套真相**并违反 `CORE.md:6`。属架构选择，超出研究范围 |
| Q4 | **候选轨迹点的 ID 语义**：多节点预测的 bundle 能否作为 K 线可引用的候选 Event 身份 | `characterFateProjection.ts:144` 强制复用既有 Event ID，不解决则 candidate 轨根本进不了图 |
| Q5 | **命运 K 线的固定入口** | `:2466` 原文列为未冻结。本文只提示两处既有预留：`EntityInspectorDock.tsx:164` 页签，以及 `contextualCapabilityRegistry.ts:40` 的 7 项 `data-fate-*`（当前是静态字符串） |
| Q6 | **角色"拒绝行动"是否消耗一次派发** | 直接影响 6 步／12 次硬上限的语义 |
| Q7 | **IF／派生分支里的角色能否获得长期记忆** | `nuwaN1Port.mjs:386-388` 目前**直接阻断** derived 的 full-access 写入，是有意设计；解开牵动 §2.2 与 `:1641` 的三类记忆不污染 |
| Q8 | **后台活动 vs 零值验收不变量** | `:468-476` 要求 Agent 可后台持续活动，`checkpointBAcceptance.ts:27` 把 `backgroundActivityCount`/`backgroundModelCallCount` 列为边界计数器。二者不能同时成立（§4.1） |
| Q9 | **是否为本代产品引入虚构历法/世界时间结构** | 不引入则 K 线与时间线只能以叙事顺序为横轴并显式标注；这是 Q4、U3-4 与时间线切片的共同上游 |
| Q10 | **越界校验的失败语义**：`validateKnowledgeBoundary` 判定 `boundary_violation` 时阻断派发，还是标注后仍交作者 | 接 U1-2 之前必须先定；选错会把"可解释性"变成新的静默拦截，或变成"提醒了但照样越界" |

---

## 九、方法与核验说明

### 9.1 本文亲自（在基线/最新 ref 上）复跑的关键断言

- **A**：`buildCharacterContextPack` 非自身文件的全部引用 = `EntityInspectorDock.tsx:15,100` + 其测试；`apps/story-studio/server/` 下零命中 → **仅到 UI 预览**。
- **B**：`compareCharacterStates`、`explainStateTransition`、`validateKnowledgeBoundary` 在 `src`+`apps` 内**零命中**（仅剩定义文件自身）；`projectCharacterState` 唯一调用点 `eventStoryCrossingKnowledge.ts:117` → **能力已在、缺消费者** 的直接证据。
- **C**：`storyStudioWorkspaceOperations.ts:1540-1541` 两行拒绝角色主体，逐字复核。
- **D**：`characterFateProjection`/`projectCharacterFate` 在 `src`+`apps`+`tests`+`scripts` 内除自身文件外**零命中**。
- **E**：外泄链路三段各自复核：`liveProviderPilot.mjs:129`、`:152`；`nuwaAttentionContext.ts:5-16`（`label`/`reason`/`excerpt` 字段）、`:37`（`excludedSources`）、`:96`、`:106`；对照正确策略 `nuwaN1PiAdapter.mjs:109-111`。闸门 `server.mjs:332`、`:3395`、`:3935`。
- **F**：状态退化范围逐字复核：`eventStoryCrossingKnowledge.ts:113-130`（`branchId:"main"`、`worldTime:{kind:"unknown",sortKey:null}`、`sceneId:null`、`narrativePosition: input.events.length`）与 `:184-188`（只透出 `projectionRevision`）。
- **G**：`短期记忆`/`最近记忆`/`遗忘` 全仓 **0 命中**；`压抑` 的 3 处命中逐条查为事件情绪标签（`eventLineFixture.ts:18` 与两个测试），与记忆无关。
- **H**：`ContextControl` 七行实参逐行拆分（`TianyiSidebar.tsx:313`）→ 4 真 3 假，见 §6.2-M1。
- **I**：`package.json` 与 `apps/story-studio/package.json` 中图表库 **0 命中**。
- **J**：`entity-dock`/`EntityInspectorDock` 在 `项目目录导航.md` 中 **0 命中**，在 `FEATURE_INDEX.json` 中 18 命中。
- **K**：`a37a314` 相对 `93f41aa` 为 `34 files changed, 1684 insertions(+)` 且全在 `design-prototypes/`、`docs/` 下 → 两 ref 代码等价。

### 9.2 被本文修正掉的断言（含子代理与既有文档）

本文不静默丢弃被否证的结论，逐条列出：

1. **第一轮子代理的整份结论被判定为不可用并作废**：它读的是工作树 `codex/world-materials`，其核心结论之一"角色磁吸详情工作台不存在、`characterContextPack.ts` 不存在"是分支差异而非事实。据此重跑了针对基线的第二遍。
2. **修正：`ContextControl.tsx` 不是"整块空壳"**。第一轮判为全部硬编码；基线逐行实参复核为 4 真 3 假（§6.2-M1）。差别决定成本，已按实况写。
3. **修正：`liveProviderPilot.mjs` 路径**。`TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md` 记为 `apps/story-studio/server/liveProviderPilot.mjs`，实际为 `apps/story-studio/server/providerGateway/liveProviderPilot.mjs`；其行号 129/152 正确。
4. **修正：装配器计数**。既有文档记"五套 + 一个影子"，本文按"是否真进模型请求"重新数得**六套 + 一个影子**，另有三处功能自拼 payload（§2.5.1）；差异源于是否把 `hybridRetrieval`（只服务浏览、不进模型）计入装配器。
5. **不采信**：`docs/research/TIANYAN_SYSTEM_MAP_R0.md` 与 `TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md` 中任何与工作树文件存在性相关的陈述，一律以 §9.1-K 的 ref 实测为准。
6. **`FEATURE_INDEX.json` 的 `sourceCommit` 为 `19f3f276`**，滞后于基线 `93f41aa`。本文只引用其 `boundaries` 块（Owner 名单，稳定）与两条 `remainingGap` 自述，不引用其 feature 计数。

### 9.3 本文自身的不确定项（不假装已验）

- §2.1 中 `CharacterProfileEditor`、`CharacterInspectorCard`、`useCharacterDirectory` 的行号来自工作树遍读，基线上同一文件未被逐行重推（相关**结论**已由基线的 `storyStudioObjectProfile.ts`/`characterPreset.ts`/`CharacterProfileEditor.tsx:44-45,52,105` 独立复核，行号本身可能有漂移）。
- 各装配器内部未逐行通读，"是否有第七条隐式装配路径"未在 `dist/`、`ops/`、`bin/` 中排查。
- 本文**不运行** `npm run verify`、不启动 dev server、不做浏览器核对；文中不含任何"作者体验已确认"的判断（`AGENTS.md` 明令创始人体验验收必须人工独立完成）。
- 本文只读研究，未修改 `src/`、`apps/`、`tests/`、任何 worktree 与任何工作树文件；唯一产出是本文件。

### 9.4 与既有文档的关系

| 文档 | 关系 |
| --- | --- |
| `TIANYAN_PRODUCT_CORE.md` | 唯一产品核心；本文全部判据取自它（引用点已在文中标注行号） |
| `docs/product/TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md`（**未跟踪**） | 同基线的前序研究，按子系统组织并给六个月节奏；本文按六个点名能力面重组 + 独立重验 + 两处锚点修正。**该文件不在任何分支上，有丢失风险（§0.3）** |
| `docs/product/TIANYAN_ROADMAP.md` | 能力账本唯一项目内入口；本文沿用其状态口径，并把 FATE-F1、NUWA-N2A/B/C、N3A、MEM-Q1 的当前层级作为路线依据 |
| `docs/product/WORLD_REFERENCE_AND_CHARACTER_AGENT_PREP_R0.md` | 资料区 R1 为角色 Agent 预留的接口说明；`characterAllowedReferences` 的三条允许/禁止规则（作者笔记与传闻永不成为角色知识）与之完全一致 |
| `项目目录导航.md` | 责任区与 Owner 来源；**缺 `entity-dock` 条目**（U0-4） |

---

## 十、一句话交付判断

把 452 行已经写完、已经通过测试、已经逐字对齐产品红线的角色状态与命运契约接上生产者与消费者，比再造任何新能力都更接近"角色生命体"；而这件事的第一块砖不是代码，是**裁定角色状态到底由谁承载**——今天那扇门是被一行校验主动关着的。
