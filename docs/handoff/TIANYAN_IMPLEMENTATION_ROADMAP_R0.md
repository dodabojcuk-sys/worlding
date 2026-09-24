# 天衍施工路线 R0（研究 → 可执行任务）

> 生成日期：2026-09-18。角色：执行规划工程师（只读研究 + 规划产出）。
>
> 本文**不含代码、不含实现片段、不含架构迁移方案、不估算技术难度、不新增 Owner、不新增数据表**。它只把已有的四份研究转换成未来 Codex 可以一张张领走、一张张回滚的任务卡。
>
> 凡本文与 `TIANYAN_PRODUCT_CORE.md` 冲突，以产品核心为准；凡本文与 `项目目录导航.md` §5「不可重复的所有者」冲突，以导航为准。

---

## 〇、输入、基线与口径

### 0.1 本文的输入只有四份

| 输入 | 位置 | 在本文里承担什么 |
| --- | --- | --- |
| `TIANYAN_SYSTEM_MAP_R0.md` | `docs/research/`（未跟踪） | Owner 权威表（§4）、未接通清单（§5）、技术债分级（§6）→ 本文 P0/P1 的主要来源 |
| `TIANYAN_DOCUMENT_INDEX_R0.md` | `docs/research/`（未跟踪） | 哪些决定只活在本机、哪些 md 被 lint 钉住、哪些设计已被否决 → 本文 P0 的保全项与全局禁令 |
| `TIANYAN_UI_VISUAL_ANALYSIS_R0.md` | `docs/research/`（未跟踪） | 效果图 62 组元素的可借鉴/会破坏/假功能三分 + A/B/C 档拆解 → 本文 P2 全部、P0 的视觉裁定 |
| `TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` | `docs/research/`（已写，未提交） | 六个能力面现状、Q1–Q10 待裁定、U0–U3 路线 → 本文 P1/P3 全部 |

**因此本文不包含**世界模拟、规则前提化、规则检查器等切片——它们的研究载体是 `docs/product/TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md`，该文件不在本文的四份输入之内，且**不在任何 git 分支上**（见 P0-6）。等 P0-6 保全后应另立编号补进本路线，本文不提前引用。

### 0.2 基线口径（本文全部 `path:line` 的适用范围）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 代码基线 | `codex/semantic-world-r3`（`93f41aa`，2026-09-18 11:10 +0800） | `TIANYAN_SYSTEM_MAP_R0.md:5` |
| 最新 ref | `codex/tianyan-ui-design-freeze-r1`（`a37a314`，2026-09-18）；`a37a314` 的直接父就是 `93f41aa`，改动 `34 files / +1684` 全在 `design-prototypes/`、`docs/` 下 → **两 ref 代码逐字节等价** | `TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md:22`（其 §9.1-K 实测） |
| 当前工作树 | `codex/world-materials`（`f77b800`，2026-09-16）**落后基线 44 个提交**（严格祖先，无分叉） | `TIANYAN_SYSTEM_MAP_R0.md:34` |
| 日常服务构建 | `http://127.0.0.1:4192/` 跑的是 `f95fb7c` 构建，**既不在 main 也落后基线**；核对真实运行版本只能读 `/__local/story-studio/health` 的 `codeRevision` | `TIANYAN_SYSTEM_MAP_R0.md:260` |
| 主干 | `origin/main` 落后现实 **228 个提交**，分叉点 `0c110e2`（PR #23，2026-09-13） | `TIANYAN_SYSTEM_MAP_R0.md:249` |
| 规划时实测（本文唯一一条自测数字） | 本检出上 `git rev-parse origin/codex/semantic-world-r3` = **`93f41aa`**，与上表代码基线**当前无偏移**；`HEAD` = `f77b800` | 规划会话内 `git rev-parse` / `git rev-list --left-right --count` 实跑 |

**这一条实测不推翻"本文不重新核验代码"，但它标出了一个真实风险：本会话内有子代理执行过 `git fetch`，因此别的 worktree 上的 `origin/*` 可能已经前进。** P0-1 的第一步就是重新读一次远端 tip 并公告它，不能引用本文的表。

**本文所有行号取自基线，不取自工作树。** 四个关键文件在工作树上不存在（`entity-dock/EntityInspectorDock.tsx`、`entity-dock/entityInspectorDockStore.ts`、`src/storyContracts/characterContextPack.ts`、`src/storyContracts/worldReferenceProjection.ts`）。任何任务在开工前若对着工作树读这些路径，会得出"磁吸工作台不存在"的错误结论——这正是 P0-2 存在的原因。

本文未重新核验任何代码，全部锚点是从上述四份研究逐条搬运；四份研究自己声明的核验方法（静态导入闭包、双 ref 复核、逐像素实测、`core.quotepath` 修正）见各自的方法节。

### 0.3 三条必须先说明的前提（不迁就措辞）

1. **「严格复用已有 Owner」与"若干能力的 Owner 未裁定"冲突。** 有三件事今天**没有**合法落点：角色状态的承载者、因果本体的权威方、（女娲之外的）统一 Attention 信封。本文**不发明 Owner**，把它们写成"裁定任务"，并把依赖它们的施工任务显式标为阻塞。
2. **本文的 P0 大部分不是代码任务。** 用户给的 P0 定义是"必须先解决，否则后续开发容易返工"。按四份研究的实测，真正会导致返工的是**基线未锁、视觉目标未裁、角色状态归属未裁、一条潜伏的越界外泄、以及 36 份有效决定只存在于这台机器**。其中四项是决定或保全动作，只有一项改代码。这是诚实结果，不是回避施工。
3. **P1 的定义"已有代码，只缺接线"在本仓库比通常更成立。** 角色状态与命运两份契约合计 452 行、已写完、已带测试、已逐字对齐产品红线，生产可达性分别约 1/3 与 0（`TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §五末）。因此本文把"接线"和"补生产者"分开：前者进 P1，后者按依赖沉到 P3。

### 0.4 任务卡字段（每张卡固定八行，前七行是用户点名的字段）

`目标` / `背景` / `依赖现有代码` / `不允许修改什么` / `预计影响范围` / `验收标准` / `回滚方式`，另加两行本文的硬性约束需要：**`复用 Owner`**（必须是 `项目目录导航.md` §5 或 `FEATURE_INDEX.json` 的 `boundaries` 里已存在的一条，或写"未裁定"）和 **`前置`**（阻塞它的裁定或任务 ID）。

任务类型只用三种标记：`施工`（改代码）、`裁定`（创始人决定，产出是一句书面决定）、`保全`（文档/索引/登记，不改运行路径）。

### 0.5 状态口径

- 验收层级沿用 `docs/product/TIANYAN_ROADMAP.md:7`：`计划中 / 已有基础 / 实现中 / 本地通过 / 真实模型待验 / 作者待验 / 已接受` **并列，不得合并**，不得以测试通过冒充真实模型或作者体验验收。
- `FEATURE_INDEX.json` 另用一套英文状态词（`LOCAL_REVIEW / PARTIAL / FOUNDER_REVIEW / PRODUCTION_CONNECTED`）。两套不互换；`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §6 债务 7 已实测：33 项里 16 项 `providerDependency` 直接写 `none`，13 项 `PRODUCTION_CONNECTED` 的"production"里没有真实模型。**读 `remainingGap`，不要读 `status`。**
- 本文只给任务与判据，不给任何一项的当前层级判定；每项完成后由执行者把结果写回能力账本对应行。

---

## 一、任务总表

| ID | 优先级 | 任务 | 类型 | 关键前置 |
| --- | --- | --- | --- | --- |
| P0-1 | P0 | 锁定并公告施工基线（四线取一） | 裁定 | — |
| P0-2 | P0 | 把施工分支对齐到锁定基线 | 施工 | P0-1 |
| P0-3 | P0 | 修掉"被排除来源标题外泄"潜伏项 | 施工 | — |
| P0-4 | P0 | 裁定角色状态的承载者 | 裁定 | — |
| P0-5 | P0 | 裁定视觉目标（四个并存取一） | 裁定 | — |
| P0-6 | P0 | 保全只存在于本机的有效决定 | 保全 | — |
| P0-7 | P0 | 让"工程依据"重新可信（导航 + 索引可见性） | 保全 | — |
| P1-1 | P1 | 角色目录接入磁吸工作台，并修好那条死深链 | 施工 | P0-2 |
| P1-2 | P1 | 状态投影结果不再被丢弃 | 施工 | P0-2、P0-4 |
| P1-3 | P1 | 把两个零调用者函数接为展示与只读校验 | 施工 | P1-2、Q10 |
| P1-4 | P1 | 把「当前目标」与关系计数接成真实值 | 施工 | P0-2 |
| P1-5 | P1 | 天意上下文面板三行假值诚实化 + 未接入按钮禁用 | 施工 | P0-2 |
| P1-6 | P1 | 补齐四类角色记忆的写入者（挂在作者确认之后） | 施工 | P0-3、Q7 |
| P1-7 | P1 | 挂载 Agent 设置面（既有未完成的集成请求） | 施工 | P0-2 |
| P1-8 | P1 | 角色卡历史投影接第一个消费者 | 施工 | P0-2 |
| P1-9 | P1 | 结清"这个组件还有人用吗"（登记与退役清单） | 保全 | P0-7 |
| P2-1 | P2 | 顶栏对齐（不新增第 6 个控件） | 施工 | P0-2、P0-5 |
| P2-2 | P2 | 导航选中态与分组分隔线 | 施工 | P2-1 |
| P2-3 | P2 | 正文舞台排版：稿纸感 | 施工 | P0-2、P0-5 |
| P2-4 | P2 | 圆角与描边统一（禁硬编码色值） | 施工 | P0-5 |
| P2-5 | P2 | 右栏辅助卡视觉层级 | 施工 | P0-5 |
| P2-6 | P2 | composer 双态与安全区 | 施工 | P0-2 |
| P3-1 | P3 | 因果本体归一（先裁定，再纯去歧义收敛） | 裁定→施工 | Q11 |
| P3-2 | P3 | 规划/候选时间帧与 WorldContextPack 补生产者/消费者 | 施工 | P3-1 |
| P3-3 | P3 | 人格字段扩展（白名单 2 → 多项） | 施工 | Q2 |
| P3-4 | P3 | 底线关卡与"不行动"候选形态 | 施工 | P3-3、Q6 |
| P3-5 | P3 | 下一行动者由决策决定，替换轮转 | 施工 | P3-3、P3-4 |
| P3-6 | P3 | 记忆召回从过滤变为授权集合内排序 | 施工 | P1-6 |
| P3-7 | P3 | 目标在数据层可相撞（复用既有投影类型） | 施工 | P0-4、P1-2 |
| P3-8 | P3 | `observableResult` 的裁决者：事件效果以提案指向 N4 | 施工 | P0-4 |
| P3-9 | P3 | 统一 Attention 信封 + 负向理由/持久化/forbid/跨分支 | 裁定→施工 | Q3、P0-3 |
| P3-10 | P3 | 命运轨迹生产者与 K 线首版（actual + planned 两轨） | 施工 | P0-4、P3-1、Q4/Q5/Q9 |
| P3-11 | P3 | Agent 运行状态模型与后台活动 | 裁定→施工 | Q8 |

计数：P0 = 7，P1 = 9，P2 = 6，P3 = 11，**合计 33 张卡**。按类型：**纯施工 24 张**、`裁定` **3 张**（P0-1、P0-4、P0-5）、`保全` **3 张**（P0-6、P0-7、P1-9）、`裁定→施工` **3 张**（P3-1、P3-9、P3-11——先要一句书面裁定，裁定内容决定施工形态是否成立）。24 + 3 + 3 + 3 = 33。

---

## 二、P0 · 必须先解决，否则后续开发容易返工

### P0-1 锁定并公告施工基线

**目标**：让"对着最新代码改"这句话在本仓库重新变成可执行的指令，给出唯一的起始 SHA。

**背景**：同一时刻存在四条 2026-09-18 的线，且两两不连续（`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §6 债务 1–3）。`origin/main` 落后现实 228 个提交（分叉点 `0c110e2` = PR #23）；`semantic-world-r3`（`93f41aa`）是基线；`world-workbench-r4`（`d16563b`）在其 +1；`ui-design-freeze-r0`（`7b37ad8`）+3；`ui-design-freeze-r1`（`a37a314`）**与 r0 分叉**（r0 独有 3、r1 独有 1），其父提交直接是 `93f41aa`，即 **PR #31 不含 R4 世界工作台代码**。而 `docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md` 写的是"新工作必须从 fetch 后的 `origin/main` 开始"——**照这条已失效的交接执行会直接丢掉 44 个提交后的世界**。日常 4192 又跑第三种构建。

**依赖现有代码**：不需要读任何代码。需要 `git for-each-ref --sort=-committerdate` 的输出、`docs/operations/TIANYAN_DAILY_4191_4192_UPGRADE_RUNBOOK.md`、`日常入口.md`，以及**同一目录里已经存在的** `docs/handoff/TIANYAN_CODEX_FIRST_EXECUTION_PACKAGE_R0.md`（未跟踪）——它已经把作业基线写成 `BASELINE_BRANCH = codex/world-workbench-r4` / `BASELINE_HEAD = d16563b`，并说明 PR #29 是以 `93f41aa` 为 base 的堆叠 PR。**本卡不是推翻它，而是把它已经隐含做出的选择变成一句被公告的裁定**，否则它会长期停在"只对本机有效"的状态（P0-6 同一问题）。

**不允许修改什么**：不改任何分支指针、不合并、不 rebase、不 push、不动 tag。裁定结果只写进文档。不许按历史 PID 停任何服务（runbook 硬规则）。

**预计影响范围**：只有两处书面落点——`docs/handoff/`（新增一条裁定记录）与 `日常入口.md`（若裁定涉及日常分支）。零运行行为影响。

**验收标准**：存在一句可核对的裁定文字，形如"自 `X` 起的所有施工任务以 `<SHA>` 为起点；`origin/main` 的合并时点为 `<日期或另立任务>`"；且 P0-2、P2 各卡的起点 ref 与之一致。裁定必须同时回答"R4 世界工作台要不要并进视觉线"（这决定 P2 整波对着哪套女娲/世界代码做）。

**回滚方式**：决定可复议；改判时必须在同一文档追加"改判记录 + 受影响的已完成任务 ID 清单"，不删除原决定。

**复用 Owner**：`docs/product/TIANYAN_ROADMAP.md`（能力账本唯一项目内入口）与 `日常入口.md`；不新建状态载体。

**前置**：无。它是 P0-2、P2 全波的入口。

### P0-2 把施工分支对齐到锁定基线

**目标**：让磁盘上的施工目录包含 P1 全部任务所依赖的四个文件与女娲场景工作面子系统。

**背景**：工作树落后 44 个提交，落后的恰好是全部新能力：`src/storyContracts/` +10（含 `characterContextPack`、`worldReferenceProjection`、`hybridRetrieval`、`nuwaBranchNode`）、`apps/story-studio/src/` +8（含 `entity-dock/` 两文件、`NuwaUnifiedSceneWorkspace`、`NuwaSceneOverview`、`NuwaDirectionCandidates`、两个 model）、`server/semanticIndexService.mjs` +1、`tests/` +12（`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §0.2）。`docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §6 C10 已把"合并基线"列为整批视觉与数据任务的前置。

**依赖现有代码**：目标分支与被合并 ref 本身；`scripts/run-with-canonical-runtime.mjs`（Node 22 / npm 10 由它强制）；`package.json` 的十个脚本。

**不允许修改什么**：不重写历史（不 `rebase`、不 `--force`）；不使用裸 `git stash`/`git stash pop`（本仓库多 worktree 共享，会串台；若要暂存必须用带唯一 tag 的 ref 并逐条恢复）；不删除任何 `data/` 未跟踪证据；不动 4191/4192 日常服务；不合并 `codex/*` 叠成分支之间未经裁定的任意两条（P0-1 未裁定前只允许把工作树对齐到 P0-1 选定的那一条）。

**预计影响范围**：全仓运行代码。冲突热区可预期为四份未跟踪 md（`docs/research/TIANYAN_*_R0.md`）与 `docs/product/` 同路径文件；`tests/storyContracts/tianyanR0ShellContract.test.ts` 与 `scripts/run-selected-tests.mjs` 的 54 个禁止路径清单。

**验收标准**：`git rev-list --left-right --count HEAD...<锁定SHA>` 返回 `0 0`；上述四个"仅基线存在"的文件在盘可见；`npm run verify` 在 Node 22 下全绿（`build` 允许既有大 chunk 提醒）；`/health` 的 `codeRevision` 与合并结果一致的说明已写入工作日志。**并明确写下：这只证明本地门通过，不证明真实模型质量，也不证明创始人体验。**

**回滚方式**：合并前记录被合并分支的 HEAD SHA 写进 `data/` 工作日志；回滚 = `git merge --abort`（未完成时）或对该合并提交做 `git revert -m 1`（已完成时）。不涉及数据迁移，故无数据回滚面。

**复用 Owner**：无 Owner 变更——八个空间的注册表、四个"恰好一个"的写入者（`scripts/validate-feature-index.mjs:19-28` 强制 Canon Writer / WorldState Owner / Event Owner / NarrativeArrangement Owner 各一个）在合并前后都必须保持原样。

**前置**：P0-1。

### P0-3 修掉"被排除来源标题外泄"潜伏项

**目标**：让两条 AI 上下文链对"排除清单身份不得出站"采用同一条既有策略，消除一旦开真实 Provider 即触发的越界。

**背景**：`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §2.5.4 已在基线逐字复核：正确的一条是 `apps/story-studio/server/nuwaN1PiAdapter.mjs:109-111`——只发 `excluded:{count, reasonCodes:["not-known-by-actor"]}`，注释写明"排除身份本身可能泄露未来的秘密，作者检查器保留 ID"。外泄的一条是 `apps/story-studio/server/providerGateway/liveProviderPilot.mjs:129` 把 `attentionContext` 放进 `requestPayload`，`:152` 将 `JSON.stringify(requestPayload)` 作为 user 消息发出；而 `src/storyIntelligence/nuwaAttentionContext.ts:37` 的 `excludedSources` 元素类型（`:5-16`）携带 `label`、中文 `reason`、`excerpt`（`:96` 截到 240 字）。严重性限定：该路径需 `executionMode === "live-pilot-r2"`（`server.mjs:3395`）且 `TIANYAN_REAL_PROVIDER_PRODUCT_PATH === "1"`（`server.mjs:332`），默认关闭返回 `unavailable` 且 `providerCalls: 0`（`:3935`）——**是潜伏项，不是正在泄露；它触发的时点恰好是本文所有真实模型验收开始的时点**，届时整批验收证据作废重来。

**依赖现有代码**：`nuwaN1PiAdapter.mjs:109-111` 的既有策略（照搬语义，不另设计）；`nuwaAttentionContext.ts` 的胶囊结构与 `capsuleHash`；作者侧检查器的既有可见内容。

**不允许修改什么**：不新增第三套排除披露语义；不把 N1 侧更强的不变量弱化以"对齐"（方向只能从松收敛到严）；不削减作者检查器里已可见的排除条目身份（产品核心 `:1602` 作者对上下文有增删固定禁止权、`:2153` 未知明确写未知）；不改 `server.mjs:332/3395/3935` 三道闸门；不动 `aiProviderGateway.mjs` 的 Provider 合同形状。

**预计影响范围**：`server/providerGateway/liveProviderPilot.mjs` 一处 payload 组装；`goldenLoopOperation.mjs:20` 同来源的第二消费点需一并核对（`TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §2.5.1 装配器 3、5）。既有 `nuwa-n1` 与 real-pilot 相关测试的断言可能需同步。

**验收标准**：一条隔离测试证明——当 `attentionContext` 含非空 `excludedSources` 时，出站 body 中不出现任何 `excluded` 项的 `label` 或 `excerpt` 子串，但出现计数与理由码；作者侧检查器仍能看到条目身份；`REAL_PROVIDER_CALLS=0` 且用本地伪 Provider；`npm run verify` 绿。**注意 `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §2.3：`docs/implementation/TIANYAN_R4_PI_ZERO_CALL_AND_NUWA_N1.md` 被 lint 钉住存在，改它不能删它。**

**回滚方式**：单提交 `git revert`；本任务不改持久格式与合同类型，无数据面回滚。

**复用 Owner**：`boundaries.providerBoundary`（`apps/story-studio/server/providerGateway/aiProviderGateway.mjs`）为 Provider 边界权威，实现在同目录既有 pilot 文件内；有界运行与授权内注意力属 `src/storyIntelligence/`。**两者都不新建。**

**前置**：无（不等 P0-1，可在锁定基线的工作副本上先做）。

### P0-4 裁定角色状态的承载者

**目标**：给"角色当前状态"一个合法的、既有 Owner 内的落点判定，解开 L1/L7/L9 三条链的共用死结。

**背景**：角色状态是六个能力面里唯一没有任何"可用"评级的一个（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §2.3）。它撞的不是洞是墙：唯一持久 WorldState Owner 在校验层**主动**拒绝角色主体——`src/storyControlSurface/storyStudioWorkspaceOperations.ts:1540-1541`：`passage` 只许 location/facility、`holder` 只许 item；`WorldStateN4Value` 只有这两型。而 `src/storyContracts/characterStateProjection.ts` 已把状态做成"纯派生、可重算、`writes:0`、`providerCalls:0`"的投影并带完整测试。**两条路都合法，但产品后果相反**：扩展 N4 受理角色 = 动唯一 World 事实 Owner 的受理范围；保持投影 = 角色状态永远是只读视图、不得有"当前状态事实表"。这一刀决定 P1-2、P3-7、P3-8、P3-10 的落点，所以属于 P0。

**依赖现有代码**：`characterStateProjection.ts` 全套（8 维 `:24`、6 权威 `:3-9`、`compareCharacterStates:179`、`explainStateTransition:192`、`validateKnowledgeBoundary:196-211`）；`worldStateN4.ts:12-14`（两型）与 `:155-158`（证据必须是 confirmed-event 的 id+revision 否则抛错）及其 `mainline/workVersions`/`history[]` 分支感知；产品核心 `:543`（知道·相信·怀疑·误解·不知道）。

**不允许修改什么**：不新建任何状态表、Store 或第二 WorldState Owner；不把心理状态写成 World 事实；不修改 `:1540-1541` 的语义作为"顺手放开"（那是裁定的**结果**，不是裁定的替代品）；不引入 `confidence:number` 承载状态（`:558` 禁止神秘分数）。

**预计影响范围**：裁定文本 + 被解锁的 P1-2/P3-7/P3-8/P3-10 的 Owner 行。运行代码零改动。

**验收标准**：一句书面决定，明确到"角色八维状态由 X 承载，其中 `knowledge/belief` 是否继续只作投影、`physical/location/possession/goal/commitment/perceived_relation` 六维的写入者挂在哪条既有链上"；且明确"若为只读投影，界面上的'当前状态'必须写成'派生视图，可重算'"。

**回滚方式**：改判需追加记录并列出受影响的已完成任务；已按裁定写入的正式事实不得删除（受保护数据 + 账本"永不删除"纪律）。

**复用 Owner**：候选两条，都是既有的——`storyStudioWorkspaceOperations.ts`（WorldState 事实唯一 Owner）与 `storyContracts/`（只读投影，无写入）。**本文不选，未裁定即不动。**

**前置**：无。

### P0-5 裁定视觉目标

**目标**：从并存的至少四个视觉目标里选出一个（或明确组合规则），让 P2 整波有唯一对齐对象。

**背景**：`docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §0.2 与 `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §6.2 实测冲突：① `data/2026-09-17_女娲作者工作面视觉重构R6/参考效果图.png`（1586×992，AI 生成，R6 判 `VISUAL_IMPLEMENTATION_RESULT=COMPLETE` 但 `VISUAL_EXPERIENCE_RESULT=READY_FOR_FOUNDER_REVIEW`）；② R1 设计冻结（只存在于 worktree `tianyan-ui-design-freeze-r1`，主检出与基线 **0 引用 0 副本**，R0 结论 `FOUNDER_VISUAL_REJECTED`，且明写"创始人通过前禁止进入生产代码"）；③ `docs/design/references/tianyan-r0-5-founder-character-directory.png`（被 `design-qa.md` 以 SHA-256 钉住的 R0.5 权威）；④ `data/2026-09-18_天衍世界观工作台R4/` 的世界脉搏首屏（最新视觉权威，ROADMAP 无记录）。可测量几何直接打架：右栏宽四源（图 350 / R1 320 / 已实现 312 / token 288）、导航宽三源（190/176/132）、圆角三源、主强调色色相 185°/174°/166° 三个不同。更硬的一条：图上三张等宽方向卡与"照片头像高于方向卡"的层级，正是 R0 被创始人明文否决的理由（`FOUNDER_FEEDBACK.md:18-20`「默认态即显示三张等宽大卡，视觉重心压过正文舞台」）。**选图等于撤回这条已记录的反馈，那是创始人的权力，不是执行者的判断。**

**依赖现有代码**：`docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §3.2（实测尺寸对照表）、§3.3（换算到 1440 的主列只有 565–849px、正文首屏仅剩 ~522px）、§3.4（色彩三源表）、§5.2（8 组"会破坏已有功能"）、§6 B 档（B1–B5 五项待裁决定）。

**不允许修改什么**：不改 `src/storyContracts/storyStudioWorkspaceRegistry.ts:40-47`（顶级空间注册的唯一入口，`项目目录导航.md:178`）；不为凑图上 11 项导航而新增/改名空间（`tianyanR0ShellContract.test.ts:24,:26` 断言八空间与数量 = 8）；不在裁定前把任何 C 档假功能做成界面（见 §七"明确不做"）。

**预计影响范围**：决定 P2 全部 6 卡的对齐对象与 B1–B5 的取值；若选图，需先决定 `test.ts` 契约测试的处理方式（那是裁定后果，不是可自行放宽的前提）。

**验收标准**：书面 `FOUNDER_VISUAL_PASS`，逐项落到 B1 导航宽与项数、B2 场景头高、B3 走向区形态、B4 主强调色与纸色、B5 右栏模型五个点；并写明"1586×992 不是受管视口，任何 px 必须在 1440/1280/1152 重排后重量"已被接受。

**回滚方式**：视觉裁定不产生数据变更；改判时新增一份裁定记录并在 §六依赖图上标注被撤销的任务。

**复用 Owner**：`product-shell/theme/tokens.css` 与 `apps/story-studio/src/styles/` 是既有表现层；`docs/product/DESIGN.md` 是视觉约束文档（注意 §6.2 已判它的 `:40-45` 女娲节被 R6/R6.1/R6.2 事实推翻，裁定时应一并处置而不是留着互相矛盾）。

**前置**：无。是 P2 全波入口。

### P0-6 保全只存在于本机的有效决定

**目标**：让"当前有效设计"从一次磁盘故障或一次 `git clean -fd` 里活下来。

**背景**：`docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §5、§8.4 实测：`data/` 有 534 文件 / 193.4 MiB 未跟踪（占 49%），其中 **48 份 md**；19 个 `CURRENT` 目录含未提交内容，**17 个合计 36 份未跟踪 md / 61.7 MiB、15 个目录完全未跟踪**。承载的是 §5 表右半边 7 项有效决定：女娲四层交互模型 + 零自动触发铁律（R2b 推翻了初判的三条）、女娲 UI 现状链 R6→R6.1→R6.2、通用 Entity Dock 四态九页签、世界脉搏首屏 ≠ 卡片流、作者秘密 LOCAL_ONLY / IndexEligibility 先于远程调用、G1 两层语义、动态对象四态投影路线 + 女娲十条硬约束。**另有本次输入之外的一份前序研究 `docs/product/TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md`（476 行）不在任何分支上**（五个 ref 逐一确认缺失），一次 `git clean -fd` 即永久丢失；本文 §0.1 因此无法把它纳入路线。同类风险：`docs/research/TIANYAN_SYSTEM_MAP_R0.md`、`TIANYAN_UI_VISUAL_ANALYSIS_R0.md`、`TIANYAN_DOCUMENT_INDEX_R0.md`、本目录下的本文与角色 Agent 研究自身全部未跟踪。

**依赖现有代码**：`CORE.md`（`data/YYYY-MM-DD_任务名称/` 固定结构、提交信息须带北京时间）；`docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §8.1–8.3 的可归档/不可归档分级。

**不允许修改什么**：**不移动、不重命名、不删除、不压缩包化任何 `data/` 目录**——`data/2026-09-03_天衍R12B2_1叙事编排权威合同/` 里那份 md 被 `FEATURE_INDEX.json` 的 `sourceFiles` 钉住，动它 = `npm run lint` 红（§2.3）；被 `ROADMAP.md:87,94,101,103` 按路径引用的证据目录移动 = 悬空引用（§8.1）。不清理 §8.3 判为"可安全丢弃"的 ≈40 MB 实验产物（"安全"只指不破坏引用与 lint，是否丢弃属创始人）。不提交 `evidence/`、`output/`（被 `.gitignore:14`、`:10` 排除）。

**预计影响范围**：Git 索引与提交历史。**push 前必须先做凭据复扫**——`docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §10.5 明写：本轮未发现明文凭据，但那"只覆盖当前内容；42 个含未跟踪文件的目录一旦准备 push，需要重新扫一遍"。

**验收标准**：`git ls-files --others --exclude-standard` 中不再存在被判 `CURRENT` 的 md（用 `git -c core.quotepath=false` 统计，否则中文路径转义会产生假阳性"丢失"）；四份研究 + 前序研究 + 本文在盘上均可 `git log -- <path>` 追到；提交信息含北京时间；一次 `git clean -nd` 的输出里不再有点名过的有效决定。

**回滚方式**：保全动作只新增提交；`git revert` 即可撤销提交而**不丢内容**（工作树文件保留）。这是本路线里唯一"回滚不损失工作"的类别，因此排在 P0。

**复用 Owner**：`docs/research/`（研究文档）、`docs/handoff/`（交接）、`docs/product/`（产品文档）、`data/`（任务证据）；不新建文档区。

**前置**：无。任何 `git clean` / 大规模整理之前必须完成。

### P0-7 让"工程依据"重新可信

**目标**：补上 AGENTS.md 第二条要求、但实际缺失的责任区条目，并记录索引的已知失真。

**背景**：`AGENTS.md` 明写"新增、移动、拆分或定位代码前必须阅读根目录的 `项目目录导航.md`；责任区、入口、所有者或验证路径改变时必须同步更新导航"。实测：`entity-dock` / `EntityInspectorDock` 在 `项目目录导航.md` 中**命中数为 0**，在 `FEATURE_INDEX.json` 中命中 18 处；磁吸工作台（`character-agent-magnetic-workbench-r0`）挂在**所有 outlet 之外**、是八空间之上的一层通用实体工作面（`ShellWorkspaceOutlet.tsx:105`），但导航里没有任何一行说明它归谁、不许干什么（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §9.1-J、U0-4）。另外索引本身失真：`FEATURE_INDEX.json:3` 的 `sourceCommit = 19f3f276` 在本仓**不可解析**（`git cat-file` 失败），`validate-feature-index.mjs:34-37` 只校验"被索引的路径存在"，**既不校验新鲜度也不做反向可达性**——基线 `apps/story-studio/src/` 的 124 个 `.ts/.tsx` 中 **54 个不在任何 feature 的 `entrypoints`/`sourceFiles` 里**，其中包含 **`/world` 的默认工作面 `WorldOverviewWorkspace.tsx`** 与一整个女娲统一场景工作面子系统（5 个文件 + 4 个自己的测试）（`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §5.E）。后果是：下一个进入的 Agent 会重复发明同一个定位。

**依赖现有代码**：`项目目录导航.md` §4 内容分区与 §5 不可重复所有者表；`docs/architecture/FEATURE_INDEX.json` 的 `features` 与 `boundaries`；`scripts/validate-feature-index.mjs`（只读，理解它校验什么）。

**不允许修改什么**：不改 `boundaries` 块的任何一条 Owner 指向；不新增 feature 的 `status`（状态变更属切片收口，不属登记）；不改 `validate-feature-index.mjs` 去"让红变绿"；不删除 §2.3 列出的 8 份被 lint 钉住的 md（含两份判为 OBSOLETE 的，仍不可删）。

**预计影响范围**：`项目目录导航.md`（新增条目）+ `FEATURE_INDEX.json`（补 `entrypoints`/`sourceFiles`）。索引变化会让 `npm run lint` 重跑，但不改变运行行为。

**验收标准**：`项目目录导航.md` 里 `entity-dock` 命中 ≥1，且写明它**不拥有**哪些事实（Canon / WorldState / Event / Relation / 记忆 / Provider）；`WorldOverviewWorkspace.tsx` 与 5 个女娲场景文件出现在某个既有 feature 的 `entrypoints`/`sourceFiles` 里（**不新建 feature 条目**）；`npm run lint` 绿；工作日志显式记录"`sourceCommit` 不可解析"是一个已知失真及本文对此的态度。

**回滚方式**：`git revert` 单个文档提交。

**复用 Owner**：登记动作本身归 `项目目录导航.md` + `FEATURE_INDEX.json`；被登记物的 Owner 一律写既有的那一个。

**前置**：无（建议在 P0-2 之后做，以免登记一个不存在的文件）。

---

## 三、P1 · 已有代码，只缺接线

> 本波共同特征：**契约、组件、数据源三样里至少两样已经存在，缺的是一个调用点或一个实参。** 因此本波一律禁止新增契约类型、禁止新增面板、禁止新增 Store。共同前置 P0-2（多数目标文件在工作树上不存在）。

### P1-1 角色目录接入磁吸工作台，并修好那条死深链

**目标**：让作者在世界角色目录里点一个角色就能打开它的磁吸详情，并让工作台内"编辑档案"链接真的到达 `CharacterWorkspace`。

**背景**：dock 已在 `ShellWorkspaceOutlet.tsx:105` 全局挂载；`openEntityDock({kind:"object", objectId, openedFrom})` 已有两个真实调用面（`NuwaN1Workspace.tsx:42,533,611`、`WorldReferenceWorkspace.tsx:17,248,255`），但**角色目录不调用它**（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` U1-3）。同时存在八空间深链里唯一的参数名不一致：`EntityInspectorDock.tsx:159` 的「在角色目录中编辑档案」发 `/world?worldView=character&objectId=…`，而 Shell 读的是 `characterId`（`TianyanR0Shell.tsx:95`；另外 4 个生产者 `:317/:341`、`WorldOverviewWorkspace.tsx:66`、`FocusedRelationsWorkspace.tsx:155`、`MapM1Workspace.tsx:948` 全部用 `characterId`）。后果是**该链接永远进不了 `CharacterWorkspace`，静默回落到世界总览**（`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §5.F）。

**依赖现有代码**：`apps/story-studio/src/components/entity-dock/entityInspectorDockStore.ts`、`EntityInspectorDock.tsx`、`TianyanR0Shell.tsx:95` 的 query 解析、`product-shell/project-directory/character/`（`CharacterProfileEditor.tsx`、`useCharacterDirectory`）、`WorldOverviewWorkspace.tsx:66`。

**不允许修改什么**：不改 `entityInspectorDockStore` 的状态形状、不新增 dock 页签、不给 dock 任何写入能力；**不新建第二个角色详情作者面**（`FEATURE_INDEX` 的 `character-agent-magnetic-workbench-r0.remainingGap` 已把"角色目录入口迁移"列为未决开口，两页并存即违反）；不向 `App.tsx`（7 行）与 `TianyanR0Shell.tsx` 堆菜单或业务状态（`AGENTS.md`）；不新增 query 参数别名来"两边都支持"（选一个、修另一个）。

**预计影响范围**：`product-shell/project-directory/`（入口实参）、`EntityInspectorDock.tsx:159` 一处 URL。`openedFrom` 增加一种取值会影响埋点式文案但不影响事实层。

**验收标准**：隔离夹具项目里，从角色目录点击角色 → dock 在四态下（closed/peek/expanded/pinned）正确出现且只读；从 dock 点「在角色目录中编辑档案」→ URL 含 `characterId` 且中央页真的渲染 `CharacterWorkspace`（不是世界总览）；一条断言钉住"目录打开 dock 不产生任何写请求"；1440/1280/1152 三视口无溢出；`npm run verify` 绿。

**回滚方式**：单提交 `git revert`（入口实参 + URL 一处）。无数据影响。

**复用 Owner**：`product-shell/project-directory/`（只拥有导航、组织与引用 UI）；档案写入仍归 `storyStudioWorkspaceOperations.ts`；不新建入口 Owner。

**前置**：P0-2。

### P1-2 状态投影结果不再被丢弃

**目标**：把已经算出来的角色状态交给界面，替换掉「心理与状态」页签的诚实占位句。

**背景**：`src/storyContracts/characterStateProjection.ts` 的 `projectCharacterState` 在生产里**已经被真实调用**——`src/storyContracts/eventStoryCrossingKnowledge.ts:117`（全仓唯一调用点）。但三层断链：① 喂进去的证据由 `knowledgeEvidence()` 合成，每事件恰好一条，`category` 只可能 `knowledge|belief`，另六维永远空数组；② 作用域是写死伪值（`eventStoryCrossingKnowledge.ts:113-130`：`branchId:"main"`、`worldTime:{kind:"unknown",sortKey:null}`、`sceneId:null`、`narrativePosition: input.events.length`）；③ 投影结果对象不外传，只有 `characterStateProjectionRevision`（一个 hash）活到 `:184-188`，显示在 `CharacterInspectorCard.tsx:122`。**没有任何 UI 或模型读到过 `knowledgeState`/`beliefState`**（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §2.3.2，其 §9.1-F 逐字复核）。页签 `EntityInspectorDock.tsx:160` 今天逐字写着"合同已定义，但当前没有生产喂入"。

**依赖现有代码**：`eventStoryCrossingKnowledge.ts:117` 的调用与 `knowledgeEvidence()`、投影结果的 8 类分桶、`EntityInspectorDock.tsx:160` 的页签位（**位置已预留**）、`CharacterInspectorCard.tsx:80-99,122` 的展示与空态/失败态分离写法（`:97` 空 vs `:89` 读取失败，可照抄这个诚实口径）。

**不允许修改什么**：不新建投影、不改 `knowledgeEvidence` 的合成规则或校验强度；不新建状态表（P0-4 未裁定前六维保持空，不为了"看着满"而造数据）；不把伪作用域显示成世界时间——`branchId:"main"`、`worldTime.kind:"unknown"`、`sceneId:null` 必须在界面上原样标注为"当前编排范围"；不改 `writes:0`/`providerCalls:0` 的字面量类型；不在本卡里让投影进入任何模型请求。

**预计影响范围**：`eventStoryCrossingKnowledge.ts` 的返回值形状（增加透出内容而非只透出 revision）→ 它的 7 个消费者（EventLineWorkbench、EventGraphCanvas、StoryProgressionWorkspace、EntityInspectorDock、CharacterInspectorCard、CharacterWorkspace、`localTransport.ts`）需逐个确认不被破坏；`EntityInspectorDock.tsx` 一个页签。

**验收标准**：隔离夹具里一个有两起正式事件的角色，"心理与状态"页签显示**非空且逐条带证据引用**的 `knowledge`/`belief` 分桶；缺证据的条目显示为"缺少事件依据"而不是消失；六维显示"本切片无生产者"而非空列表冒充"没有"；把投影内容改坏时页签显示读取失败而不是空态；`npm run verify` 绿；真实 Provider 0 次。

**回滚方式**：回退"透出内容"这一处即可回到只透出 revision 的现状；无数据变更。

**复用 Owner**：`src/storyContracts/`（只读投影，无写入）。

**前置**：P0-2、P0-4。

### P1-3 把两个零调用者函数接为展示与只读校验

**目标**：让"能力已在、只缺接线"性价比最高的一处真正上线：状态比对与越界校验进入作者视野与派发前检查。

**背景**：`compareCharacterStates`（`characterStateProjection.ts:179`）、`explainStateTransition`（`:192`，已输出中文「由事件 X 形成／缺少事件依据」）、`validateKnowledgeBoundary`（`:196-211`，六种结论含 `boundary_violation`「把作者全知或另一角色的秘密错误地共享给了当前角色」）**全部已实现且带完整测试**（`tests/storyContracts/characterStateProjectionR0.test.ts`），但在 `src`+`apps` 内**零命中**（仅剩定义文件自身）——`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §9.1-B 实测。产品核心 `:159-166` 明令 AI 不得"让角色知道它不可能知道的信息"，今天这条红线在状态投影侧**没有任何执行者**。

**依赖现有代码**：上述三个函数与其测试；`nuwaN1Runtime.ts:388-415` `compileNuwaN1Context`（已只挑该角色自己的 `knownFacts`/`beliefs`）；`:780-787` 越权角色与越出 `allowedActions` 抛错；`:286-307` 的 `blocked` 语义（超预算 → 选择清空 → 发送前阻断且零发送）；`contextHash` 已随步骤持久化（`:297`、`:309`、`:366`）。

**不允许修改什么**：**不改预算与 fail-closed 常量**——`NUWA_N1_MAX_COMMITTED_STEPS=6`（`nuwaN1Runtime.ts:14`）、`NUWA_N1_MAX_DISPATCHES=12`（`:15`）、`NUWA_N1_STEPS_PER_SCOPE_UNIT=2`（`:16`）、角色数 `>=2 && <=3`（`:741`）、`inputTokenBudget 4096 / outputTokenBudget 1024`（`:394`）；不绕过 `:836,:858` 的人物修订哈希校验与 `:714` 的每次读重规范化；不与 `actionPermissionBroker.ts` 的授权混用；不新建第三个校验函数。

**预计影响范围**：`EntityInspectorDock.tsx` 状态页签（加"与上一版比较"）+ `nuwaN1Runtime.ts` 派发前一个只读调用点。**失败语义未裁定前只能接到展示侧。**

**验收标准**：先有 Q10 裁定；隔离夹具覆盖三种输入（一致 / 漂移 / 越界），越界例输出 `boundary_violation` 且解释文本指到具体 Event ID；若裁定为"阻断"，则断言 `providerCalls = 0` 且回执状态为 `blocked`（不是伪装成执行失败）；同一冻结输入重复运行结果一致；`npm run verify` 绿。

**回滚方式**：移除调用点即回到"函数在、无人调"的现状（零副作用）。若已产生回执记录，用既有非破坏失效元数据标记，不删除。

**复用 Owner**：`src/storyContracts/`（判定）＋ `nuwaN1Runtime.ts` 所在的女娲有界运行（派发前读取，不新增 Owner）。

**前置**：P1-2、Q10（越界校验失败语义）、P0-4。

### P1-4 把「当前目标」与关系计数接成真实值

**目标**：清掉两处字面量占位——它们让一个真页签看起来像假页签。

**背景**：`EntityInspectorDock.tsx:162` 传 `graphRelationCount={0}`（页签本身真读关系，计数是字面量 0）；`:103` 传 `goal: null`（"当前目标"恒显示"未记录"），而**逐角色本场目标在服务端已经存在**（NUWA-N2A：创建 Run 时冻结角色核心、底线、本场目标与人物修订；`docs/research/TIANYAN_ROADMAP.md` 的 N2A 行）。`TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §6.2 把这两处编为 M8、M9。

**依赖现有代码**：唯一关系 Owner `src/storyControlSurface/storyStudioRelationOperations.ts`（+ 持久化 `storyWorkspace/relationRepository.mjs`）的只读列表；女娲上下文里的 `localGoal`（与 `ContextInspector` 同源的冻结字段）；`EntityInspectorDock.tsx:159-166` 页签框架。

**不允许修改什么**：不新建计数接口、不在组件里自己扫一遍关系再数（那是第二读取路径）；不把 `goal` 从 Run 冻结值改为"当前人物 Profile 的最新值"（人物后续编辑不得使旧 Run 漂移，这是 N2A 的既有不变量）；不改 dock 的写入能力（保持零写）；不把 `excluded` 身份显示到计数之外的任何位置。

**预计影响范围**：`EntityInspectorDock.tsx` 两处实参 + 一个既有的关系只读投影调用点。

**验收标准**：夹具里 3 条已确认关系 → 计数显示 3，且删到 0 时显示"无"而非"未加载"；有活跃 Run 且冻结了本场目标 → "当前目标"显示该冻结文本，重开同一 Run 数值不变；无 Run 时显示"未记录（本角色今天未参加排演）"而不是空白；`npm run verify` 绿。

**回滚方式**：两处实参改回字面量，单提交 revert。

**复用 Owner**：关系 = `storyStudioRelationOperations.ts`（唯一）；目标 = 女娲既有冻结上下文，不新增目标 Owner。

**前置**：P0-2。

### P1-5 天意上下文面板三行假值诚实化 + 未接入按钮禁用

**目标**：把"一半真一半假"的作者可见面板变成全真或全诚实，且未接入动作不再可点。

**背景**：`apps/story-studio/src/components/tianyi/composer/ContextControl.tsx` 的形状完全按产品核心 `:1591-1600` 的八项清单（页面/选中/引用/记忆/已排除/用量/预算 + 管理上下文），view model 是正经类型（`:7-15`）。但实参构造点 `TianyiSidebar.tsx:313` 逐行拆开是 **7 行里 4 真 3 假**，且假在恰好最难的那三项：`selection` = `t("context.noneSelected")` 常量、`memoryState: "not-connected" as const` 字面量、`excludedScope` = `t("context.otherBranches")` 常量（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §2.4.2，其 §9.1-H 逐行拆分并修正了第一轮"整块空壳"的过判）。同区另一处：`TianyiSidebarComposer.tsx:41` 的「管理上下文…」按钮真实动作是弹 `translations.ts:396`「上下文管理尚未接入」——产品核心 `:2074` 要求**未接入的工具必须禁用或隐藏**。（注：`memoryState:"not-connected"` 本身已是诚实态，诚实化重点是前两项与按钮。）

**依赖现有代码**：`EventLineWorkbench` 已有的通用选择状态（"选中"的真实来源）；`nuwaAttentionContext.excludedSources`（"已排除"的真实来源）；`ContextControl.tsx` 的 view model 类型本身；`pageToolRegistry.ts:9-12` + `DockToolRail.tsx:48` `disabled={!available}` 这一套既有的"未接入即禁用"表达法（照抄语义，不发明新的）。

**不允许修改什么**：**不在 UI 侧另拼一份上下文**——任何新上下文必须走 Gate（`docs/product/TIANYAN_DEV_SUGGESTIONS_R0.md:40` 已规定），否则即形成第二装配出口；不改 `storyStudioTianyiOperations.ts` / `tianyiGroundedContextGate.ts` 的语义；不把 `excludedSources` 的身份在天意侧直接列出来（与 P0-3 的排除披露裁定保持一致）；不删八项清单的形状（它是产品定义的可见投影）。

**预计影响范围**：`TianyiSidebar.tsx:313` 的实参构造、`ContextControl.tsx` 的降级显示、`TianyiSidebarComposer.tsx:41` 的按钮态。i18n 需同时加 `zh-CN`/`en-US` 两键（`tianyanR0ShellContract.test.ts:33-41` 强制中英键集完全相同）。

**验收标准**：三行要么真、要么显式未接入态（不允许静默常量）；「管理上下文…」在无后端时不可点且不改变任何挂载状态；一条断言证明未接入按钮点击后上下文状态不变；真实 Provider 0 次；`npm run verify` 绿。

**回滚方式**：实参退回常量、按钮 `disabled` 撤掉，单提交 revert。

**复用 Owner**：`components/tianyi/composer/`（只表达 UI）；上下文正确性与依据快照仍归 `storyContinuity/`。

**前置**：P0-2。

### P1-6 补齐四类角色记忆的写入者

**目标**：让角色记得"我经历了什么"和"我相信什么"，而不只记得"谁对我说过什么"。

**背景**：查询侧声明五种记忆（`src/storyContinuity/characterMemoryQuery.ts:7`：`experienced|witnessed|informed|belief|heard`），持久账本的写入校验**硬拒**除 `heard` 外的一切（`characterMemoryRepository.ts:194`：`if (input.epistemicState !== "heard") throw`）。唯一持久生产者是女娲 `synchronizeCharacterHeardMemories`（`nuwaN1Port.mjs:224`，来自 `step.heardStatements`）。账本本身的**全部规则已实现**：owner id = sha256(接收者)、落 `<project>/continuity/character-memory-ledgers/`、确定性 ID 使重放幂等（`:255`）、内容不同抛错（`:153`）、回溯只翻 `invalidated` 且强制理由 `"source-rollback"` 且永不删除（`:109-135`、`:204-206`）、root 取 `revision ≤` / derived 取精确等值（`:247-253`）。**所以这是"缺一个写入者"而不是"缺一个系统"**（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` L3 / U2-1）。

**依赖现有代码**：账本全部上述机制；正式写入链唯一路径 `storyStudioAuthorControl.ts:977` `applyAuthorChangeSet` → `:1038` → `storyStudioWorkspaceOperations.ts:1453` `createConfirmedEventOnce`；`eventStoryCrossingKnowledge.ts` 已能回答"X 在事件 Y 是亲历/目击/被告知/听闻"（`experienced|witnessed|informed|heard|public|relation|world-state`）。**写入时机必须是作者确认之后，由确认成功路径派生。**

**不允许修改什么**：**不得由排演/推演结果自动写**（产品核心 `:167`「不得把推演结果自动当正式故事」）；**只写在 `characterMemoryRepository.ts`，不写在 `run.json`**（`docs/product/TIANYAN_ROADMAP.md:64` N2C 明令"RunPack 不成为第二个永久人物记忆库"）；不动 `nuwaRehearsalContract.ts:92-99/102-110` 的候选增量形状（`writeNuwaRehearsalRevision` 无应用调用者这件事另案处理，不在此顺手接上）；**不得误用 `memoryGrantRepositories.ts` / `personaPolicyRepositories.ts`**——它们的 `MemoryKind` 是 `working-preference|shared-decision|unresolved-thread|author-provided-fact`、作用域 `author-global|project`、**没有 `recipientId`/`speakerId`**，那是天意助手自己的记忆与 persona，写进去等于把运行底座人格和领域人格混成一谈，直接违反产品核心 `:423-429`；不建第二份记忆事实库、不加向量库；`TIANYAN_PRODUCT_CORE.md:1621-1641` 主线/派生/Run 临时三类互不污染的既有可见性规则不得弱化。

**预计影响范围**：`characterMemoryRepository.ts` 的写入校验（`:194` 白名单从 1 项到 5 项）+ `storyStudioAuthorControl.ts` 确认成功路径的一个派生写入点 + `characterMemoryQuery.ts` 的读取（已支持五类，应无需改）。回执与工程日志（M0 起就是既有 Owner 的只读投影）会多出条目。

**验收标准**：夹具覆盖"确认一起两角色参与的事件 → 亲历者得 `experienced`、在场未参与者得 `witnessed`、被告知者得 `informed`，未在场者三类皆无"；重放同一确认不产生第二条（幂等）；内容不符抛错；回溯后记录仍在且 `invalidated` + 理由，召回立即排除；**未确认的排演步骤不产生任何持久记忆**（专门一条断言）；derived/IF 作用域按 Q7 裁定结果断言；`TIANYAN_E2E_SCOPE=character-memory-query` 既有链不回退；`npm run verify` 绿、真实 Provider 0 次。

**回滚方式**：把 `:194` 的限制恢复到只允许 `heard`（一行）即停止新 kind 写入；**已写入的非 `heard` 记录一律用既有 `invalidated` + `reason` 元数据非破坏停用，禁止删除**（受保护数据 + 账本"永不删除"纪律）。回滚提交里必须写明被停用的记录数量与操作理由。

**复用 Owner**：`src/storyContinuity/characterMemoryRepository.ts`（角色记忆唯一 Owner，已在 `FEATURE_INDEX.nuwa-primary-workspace.domainOwners`）。

**前置**：P0-2、P0-3（记忆身份一旦出站，先确认排除披露策略一致）、Q7（IF/派生分支角色能否获得长期记忆）。

### P1-7 挂载 Agent 设置面

**目标**：完成一份已经写在仓库里、至今未履行的集成请求。

**背景**：`apps/story-studio/src/settings/agent/INTEGRATION_REQUEST.md` 要求宿主挂载 Agent 设置面，实测 **`AgentSettingsSection.tsx` 至今无任何导入者**（`git grep "from '…settings/"` 只命中 storage）。对照：同目录 `settings/storage/INTEGRATION_REQUEST.md` 已被实现（`ShellWorkspaceOutlet.tsx:5` 已导入 `SettingsStorageRoute`），那份可判 OBSOLETE，agent 这份仍是未完成请求。`docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §3 明确记它"是——请求尚未完成"。**注意它同时被 `FEATURE_INDEX.json` 钉住（§2.3），删不掉。**

**依赖现有代码**：`settings/agent/AgentSettingsSection.tsx` 自身；已实现的同类挂载先例 `SettingsStorageRoute`（`ShellWorkspaceOutlet.tsx:5` 的 outlet 分支写法）；`src/storyAgent/` 既有的运行端口与 `persistentProviderProfileStore.mjs` 既有 profile 存储。

**不允许修改什么**：不改 `FEATURE_INDEX.json` 的 `boundaries`（Agent 运行时 Port = `src/storyAgent/tianyiAgentRuntimePort.ts`、宿主 ABI = `agentRuntimePlugin.ts`、唯一 Pi SDK 导入点 = `plugins/builtinPiAgentRuntimePlugin.ts`、Provider 边界 = `aiProviderGateway.mjs`）；不通过设置面暴露任何真实凭据值（只走既有 profile 引用存储）；不在设置面新增动作权限授予（权限仍归 `actionPermissionBroker.ts`，受保护动作恒 `requires-author` 除非服务端校验范围精确匹配 run+unit+全部 actor）；不在 `App.tsx`/`TianyanR0Shell.tsx` 加逻辑（outlet 加分支即可）；不引入 `panelOrder/expert-first/pinned/priority` 字样（`tianyanR0ShellContract.test.ts:62-63` 对源码做 `doesNotMatch` 机器锁）。

**预计影响范围**：`ShellWorkspaceOutlet.tsx` 一个分支 + 设置路由入口；`FEATURE_INDEX.json` 的 `entrypoints`（与 P0-7 同类）。

**验收标准**：`AgentSettingsSection.tsx` 至少有一个非自身的运行时导入者（这是本卡的机器判据，可用 `git grep` 复核）；打开设置能看到 Agent 区且只读投影既有 profile；未授权项显示为未接入而非可点假控件；`npm run verify` 绿。

**回滚方式**：撤掉 outlet 分支的导入即回到"组件在、无导入者"的现状；不产生数据。

**复用 Owner**：`src/storyAgent/`（Agent 运行端口）+ `apps/story-studio/server/providerGateway/`（Provider 边界与 profile 存储）。

**前置**：P0-2。

### P1-8 角色卡历史投影接第一个消费者

**目标**：让"这个角色卡是什么时候、被哪次确认改成现在这样的"在作者面前可见。

**背景**：`src/storyCardPresentation/characterCardHistoryProjection.ts` 被判为**"合同活着、运行不活着"**——有测试、无运行时调用者，属"只有测试引用"的 10 个文件之一（`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §5.C）。角色卡本身是 Markdown + frontmatter 落盘（唯一写入链在 `storyStudioWorkspaceOperations.ts`），且文档修订历史在产品里是既有概念（MAT-M1 行：Document Revision History）。这是 §三 表里"变更历史 = 仅合同"那一行的直接接线项。

**依赖现有代码**：`characterCardHistoryProjection.ts` 及其测试；`EntityInspectorDock.tsx:159-166` 的既有人生/演化页签位；`storyStudioWorkspaceOperations.ts` 的 revision 语义；`CharacterProfileEditor.tsx:44-45` 已声明的 `writeMarkdown: true, writePresentation: false` 分工（**说明卡片组合已有另一条链，本卡不得越进去**）。

**不允许修改什么**：不改投影的历史计算规则；不新建修订存储；不给历史页签任何"回滚到旧版"的写动作（回溯属未来独立裁定）；不把 markdown 标签正则当作状态来源（`docs/research/TIANYAN_CHARACTER_AGENT_EVOLUTION_ROADMAP_R0.md` 对同类做法有明确禁令，本文只沿用其结论）。

**预计影响范围**：dock 一个页签 + 一个只读调用点。

**验收标准**：夹具里对同一角色做两次作者确认 → 页签显示两条带时间与来源标识的历史项；未确认的草稿修改不出现在正式历史里；读取失败与"暂无历史"分开显示（照 `CharacterInspectorCard.tsx:89/:97` 的口径）；`npm run verify` 绿。

**回滚方式**：去掉调用点，投影退回"只有测试引用"状态；无数据。

**复用 Owner**：`src/storyCardPresentation/`（卡片投影）+ `storyStudioWorkspaceOperations.ts`（写入方，本卡不改）。

**前置**：P0-2。

### P1-9 结清"这个组件还有人用吗"

**目标**：为 17 个生产不可达域文件 + 4 个零引用 UI 文件 + 10 个只有测试引用文件给出书面处置结论（接线 / 保留 / 待退役），不擅自删。

**背景**：`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §5.C 用静态导入闭包 + `git grep` 复核给出：`src/`+`server/` 的 288 个域文件中 17 个不在生产闭包内（完全零引用 2 个：`characterFateProjection.ts`、`legacyNuwaCreationHandoffAdapter.ts`；只有测试引用 10 个），另有 `apps/story-studio/src/` 侧 4 个任何地方都不引用的文件（`worldObjectCatalog.ts`、`lib/initialWritingFlow.ts`、`lib/skillRegistryProjection.ts`、`lib/providerCredentialInput.ts`）。而 §6 债务 12 的结论是：**54 个未登记 UI 文件意味着"这个组件还有人用吗"无法由索引回答**。本卡是 P0-7 的下游清账，不做代码删除。

**依赖现有代码**：`scripts/run-selected-tests.mjs:34-94`（54 个禁止路径 = 已退役路径必须保持不存在）、`scripts/validate-feature-index.mjs`、`docs/architecture/TIANYAN_R0_3_1_ACTIVE_TREE.md`（HISTORICAL，但它是上一次同类清点的方法先例）。

**不允许修改什么**：**不在本卡删除任何文件**（一旦删除且判断错了，恢复成本远高于收益；且 `docs/product/TIANYAN_LEGACY_KEEP_REWRITE_REMOVE_R0.md` 这类历史取证文档不能反推）；不动被 `FEATURE_INDEX.json` 列为 `sourceFiles` 的 8 份 md；不把"零引用"直接当"可删"证据——可达性是按静态导入解析算的，`dynamic import()`、字符串拼接路径、服务端路由名到函数的反射映射不在闭包内（§8 本图诚实边界 2）。

**预计影响范围**：一份清单文档（放 `docs/research/` 或 `data/` 任务目录），零运行影响。

**验收标准**：清单里每一项都有"引用者是谁（只有测试 / 完全为 0 / 反射可达待人工确认）"与"处置结论"两栏；`legacyNuwaCreationHandoffAdapter.ts` 与 `characterFateProjection.ts` 两个真孤儿被显式点名（后者是 P3-10 的主体，结论应为"保留并接线"而非退役）；不产生任何删除。

**回滚方式**：纯文档，`git revert`。

**复用 Owner**：不改变任何 Owner 归属；本卡只登记事实。

**前置**：P0-7。

---

## 四、P2 · 视觉与体验优化

> 本波共同规则：**全部卡在 P0-5 之后。** `docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §6 B 档的产出物是决定，不是代码；在拿到书面 `FOUNDER_VISUAL_PASS` 之前，R1 反馈的禁令仍然有效（"创始人通过前禁止进入生产代码"）。本波只做 A 档（零新增数据、零契约风险），**C 档（先补数据/合同）禁止先做界面**，其 23 组假功能全部列入 §七。
>
> 共同验收：`npm run verify` 全绿；人工核对 **1920 / 1440 / 1280 / 1152** 无横向溢出（`项目目录导航.md:86`，另 `:157` 要求 1600/1440/1280/1195）；证据落 `data/YYYY-MM-DD_任务名/截图/`；**1586×992 不是受管视口，图上任何 px 必须先换算到 1440 重排后重量**（§0.4 第 1 条）。
>
> 共同禁止：不引入位图资产（仓库发布 0 位图、无 `public/`，`background-image` 全是 CSS 渐变；任何 `<img>` 必须有非假降级：首字/剪影/文字）；不硬编码色值与尺寸（`test.ts:248` 禁 `#hex`/`rgba()` 字面量；`rail` 宽度不得在 75rem 断点改值 `:208-209`）；保留 `focus-visible`（`:250`）与 `prefers-reduced-motion`（`:251`）。

### P2-1 顶栏对齐

**目标**：把顶栏五个既有控件的排布与 50px 高度对齐裁定后的视觉目标。

**背景**：效果图顶栏 50px 与现状 `--topbar-height: 3.125rem` = **完全一致**，五个控件全部已在盘（`GlobalStatusBar.tsx:118` 项目、`:128-173` 项目与新建菜单、`:178` + `global-search/GlobalSearchControl.tsx:35` 搜索且 **⌘K/Ctrl+K 已实现**、`:189` 目录、`:190` 待确认、`:191` 天意、`:193` ⋯）。A 档风险最低的一项。

**依赖现有代码**：上列 `GlobalStatusBar.tsx` 各行；`styles/tianyan-r0-shell.css`；`product-shell/theme/tokens.css:40`。

**不允许修改什么**：不新增第 6 个顶栏控件；不动 `data-panel-toggle` 值；不把「天璇助手」写进界面（图上 E14：天意是唯一 Agent 入口，"天璇"全仓 **0 命中**，改名打断 i18n 键配对与面板 toggle）；不给「待确认」加计数徽标（图上 E13 属假功能：真实计数在 `project-directory/pendingReviewAggregation.ts:135` 的 `pendingCount`，从未上顶栏——**上顶栏需要一个新的只读投影，不是样式任务**）。

**预计影响范围**：`GlobalStatusBar.tsx` 与两个样式文件；无逻辑影响。

**验收标准**：四视口无溢出；`test.ts` 全绿（尤其 `:33-41` 中英键集、`:44-47` 工作台顺序）；未接入项仍按既有规则不可点。

**回滚方式**：样式与 JSX 单提交 revert。

**复用 Owner**：`product-shell/topbar/`；既有只读聚合仍归 `project-directory/`。

**前置**：P0-2、P0-5。

### P2-2 导航选中态与分组分隔线

**目标**：只做选中态与分组的表现层，不碰导航项集合。

**背景**：现状 `.shell-space-link.is-active`（`styles/tianyan-r0-shell.css:279`）+ `aria-current`（`ProductShellNavigation.tsx:88`）与图上"描边 pill + 左高亮条"**已是同一语义**；深色导航底 `#12334a` 与现状 `--color-structure-background: #112b3f` 实测 ΔR1 ΔG8 ΔB11 —— 深色导航不是新发明，是现状（§3.4）。**宽度 190/176/132 三源冲突属 B1，本卡不做。**

**依赖现有代码**：`styles/tianyan-r0-shell.css:161-170,279`；`tokens.css:41-42`（`--space-rail-width` 132 / `--space-rail-collapsed-width` 56，后者代码与 R1 **一致**，是少数不用裁定的值）；`storyStudioWorkspaceRegistry.ts:40-47`（只读）。

**不允许修改什么**：不改注册表项、不改 displayName、不加/删导航项（`test.ts:24` 断言 displayName 数组**恰为** `["世界","天意","事件线","多元","女娲","资料","创作","数据"]`、`:26` 断言 workspace 数 = 8；图上 11 项里 6 项无落点、且缺 天意/事件线/多元 与合册）；不新增「帮助中心」（图上 E06：全仓 0 命中、无路由、无空间）。

**预计影响范围**：一个样式文件 + 导航组件的类名。

**验收标准**：`test.ts:24/:26` 仍绿；键盘 Tab 序列与 `aria-current` 一致；四视口无溢出。

**回滚方式**：单提交 revert。

**复用 Owner**：`product-shell/navigation/`；空间集合归 `storyStudioWorkspaceRegistry.ts`。

**前置**：P0-5、P2-1。

### P2-3 正文舞台排版（稿纸感）

**目标**：让"连续正文 + 弱分隔 + 对白浅底气泡"在 1440 首屏成为最大视觉区域——这是 R1 反馈唯一被反复点名的诉求。

**背景**：`docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §1 判定这张图最有价值的部分是"阅读器"形态（衬线大标题 + 行高 1.8 连续正文 + 节点弱分隔 + 对白浅底气泡），正对应 R1 反馈第 3 条：「1440 默认态中，正文舞台被场景头、Run 条、候选卡和 composer 挤压，**稿纸感没有出来**」（`FOUNDER_FEEDBACK.md:22-23`）。投影层已给全部所需字段（`nuwaSceneWorkspaceModel.ts:4-18`：`SceneBlockKind` 五态、`heardByTitles`、`delivery: spoken|aside`、`source: persisted|run-candidate`）。**冲突要正视**：图上场景头 193px 是 R1 上限（≤96px）的 2.0 倍，正文卡 430px 在 900 高视口里首屏只剩 ~522px 给正文，走向区与 composer 必然被推出首屏——**图与已验收的首屏约束不自洽，落地前必须砍场景头或 Hero。**

**依赖现有代码**：`styles/nuwa-n1.css`；基线 `NuwaUnifiedSceneWorkspace.tsx`（69 行，`.nuwa-scene-node`/`.nuwa-dialogue-row`/`.nuwa-avatar`/`.nuwa-block-input`）；`nuwaSceneWorkspaceModel.ts:12-13,59-66`（说话者/归属者/听闻映射为显示名，**不是内部 ID**）；`NuwaSceneOverview.tsx:29-61`；`--font-display`。

**不允许修改什么**：不引入内部 ID / kind 标签 / 编号到正文（图上口径就是"无编号、无 kind、无内部 ID"，R6 报告 `:19`）；**不加撤销/重做按钮**（图上 E36/E37：`useDocumentHistory.ts:3` 有真实 past/future 栈但零消费者，而女娲正文写入走 `node-content` + `expectedContentRevision`（基线 `localTransport.ts:2701-2703`、`server.mjs:4285`），本地历史栈与之不兼容，**接入即产生第二正文写入者**）；不加"⊕ 继续生成"（E39：无正文续写路由，`runNuwaN1Action` 作用于 Run 不是草稿）；不改头像为照片（0 资产，保持首字，`NuwaSceneOverview.tsx:57`）；不加水墨山水底图（E16）。

**预计影响范围**：两个样式文件 + `NuwaUnifiedSceneWorkspace.tsx` 的类名/结构；场景头与 Hero 的高度取舍（属 B2，可能回到 P0-5）。

**验收标准**：1440 不滚动时"正文为最大视觉区域 + 底部输入、保存状态全部可见"（R6 报告 `:33` 的既有约束）；`tests/storyStudio/nuwaN1WorkspaceSource.test.ts` 全绿；对白行与听闻小注读的是 `heardByTitles`/`delivery` 真实字段；四视口无溢出。

**回滚方式**：样式提交 + 组件类名提交分别 revert；无数据。

**复用 Owner**：`apps/story-studio/src/components/nuwa/` + `styles/`；正文写入仍归 `server.mjs` 既有 `node-content` 路径。

**前置**：P0-5。

### P2-4 圆角与描边统一

**目标**：把 `tokens.css` 的圆角/描边统一到裁定后的那一套，消掉三方不一致。

**背景**：实测三源不一致：圆角 图 8–12px / 现状 `--radius-sm/md/lg` = 6/10/16px（`tokens.css:37-39`）/ R1 = 4/7/10px（`DESIGN_TOKENS.md:68`）；且**已实现的 R6 站在图这一边**（R6 报告自述实现为 8–12px）。这正是 P0-5 必须裁的一个点——但裁定之后落地是本卡，纯 token 活。

**依赖现有代码**：`product-shell/theme/tokens.css:37-39`；`styles/nuwa-n1.css`；`styles/tianyan-r0-shell.css`。

**不允许修改什么**：不在组件里写死数值（`test.ts:248` 禁硬编码色值，`test.ts:208-253` 禁旧轨宽 token）；不同时维护两套圆角（不给"图版/R1 版"各加一组 token 名，那会把冲突固化进代码）；不改颜色语义角色（主强调色色相三源属 B4，若未裁定不得先动）。

**预计影响范围**：一个 token 文件 + 消费它的样式。

**验收标准**：`npm run lint` 与 `npm run verify` 绿；视觉对照截图入 `data/`；全仓无新增 `#hex`/`rgba()` 字面量。

**回滚方式**：单提交 revert（token 单点）。

**复用 Owner**：`product-shell/theme/`。

**前置**：P0-5。

### P2-5 右栏辅助卡视觉层级

**目标**：让右栏辅助卡不抢正文的眼，并修掉"唯一高饱和色放在三级信息"的失衡。

**背景**：§2 层级失衡三条：三张等宽方向卡与正文同权重（二级吃掉一级）、照片头像视觉重量高于方向卡、**"事件线约束"的靶心图标是全图唯一红色强调，语义上应是硬约束却排在右栏第三张卡，且图上没有任何"硬约束不可违反"的反馈通道**。现状右栏容器已在基线（`NuwaN1Workspace.tsx:723-725` `aside.nuwa-n1-inspector` → `.nuwa-story-cards`，作者布局宽 `nuwa-n1.css:264` = 19.5rem = 312px）。

**依赖现有代码**：`.nuwa-story-card` 样式；`NuwaN1Workspace.tsx:726-742` 三张真实卡（当前单元 / 相关场景 / 事件线约束）；`NuwaDirectionCandidates.tsx:22,27,29-38`（含诚实空态与"不构造虚构方向"的注释）。

**不允许修改什么**：**不新增卡片、不删现有三张真实卡**；不做图上右栏 ④「角色视角与知晓」的三段式（知晓/未知/内心动机）——真实合同是五分法（`characterContextPack.ts:64-76`：`includedFacts/includedMemories/relationSnapshot/visibleEvents/excluded`，排除理由 `:18` = `author-note|rumor|character-unknown`），且现状 UI **只露计数**（`NuwaN1Workspace.tsx:315` `excludedCount`），把 `excluded[].title` 渲染成可点列表等于把"`:5-9` 作者备注/传闻永不进入"这条硬约束改成可出站展示（图上 E58）；不做「场景笔记」「创作提示」两张卡（E60 已被 R6 报告自判 NOT_APPLICABLE「产品尚无场景笔记事实数据；按纪律不伪造」；E61 全仓无路由）；不改右栏宽度（属 B5 四源冲突）。

**预计影响范围**：`styles/nuwa-n1.css` + 卡片类名；若加"硬约束不可违反"的反馈通道，那是合同任务不是样式任务（列 C5，不进本卡）。

**验收标准**：1440 下正文区视觉重量 > 任何辅助卡（截图对照）；右栏三张真实卡数据字段不变；`excluded` 身份仍不出现在 DOM；`npm run verify` 绿。

**回滚方式**：样式单提交 revert。

**复用 Owner**：`components/nuwa/` + `styles/`；上下文数据仍归 `characterContextPack` 投影与女娲冻结上下文。

**前置**：P0-5。

### P2-6 composer 双态与安全区

**目标**：保住已经做出来的紧凑/展开双态与安全区，只对齐裁定后的外观。

**背景**：基线 `NuwaN1Workspace.tsx:720` 有 `data-testid="nuwa-author-composer"`、`maxLength=800`、紧凑/展开双态；底部安全区高度由 `:198` 写入 CSS 变量 `--nuwa-composer-height`，由**基线独有**的 `styles/nuwa-n1.css:226` 读取（**该文件盘上 196 行、基线 398 行，`:226` 只在基线存在**——这是"读哪个 ref"能坑到执行者的典型一处，也再次说明 P0-2 不可跳）。R6.1 已冻结 ≤1200 右栏默认收起、双态 60/136px（只存在未提交 md 里，见 P0-6）。

**依赖现有代码**：上列三处；`GlobalStatusBar` 与导航不受影响。

**不允许修改什么**：**不加附件按钮**（E45：女娲 composer 无附件路径，真实附件只在天意 `TianyiConversationWorkspace.tsx:489`）；不加快捷键（E49：「应用选择，继续推演 Ctrl⏎」组合了两个独立写路径、两个 `expectedRevision`，且全仓 nuwa 组件内 `metaKey|ctrlKey` **0 命中**；"采纳"与"连续推演"不能合并成一个按钮，`auto-apply` 还受 `run.authorization?.status === "active"` 门控）；**不加第 5 个动作 chip**（E47：这正是创始人已明文否决的形态，`FOUNDER_FEEDBACK.md:30-32`「预留功能必须明确标识且不可点击，不能占据默认主工作面」，图上 5 个 chips 里 4 个无后端）；不删 ResizeObserver 行为（R6 报告 `:35`）；1152 抽屉态不得溢出。

**预计影响范围**：两个样式文件 + composer 区块的类名。

**验收标准**：紧凑/展开切换后安全区高度仍正确写入并生效；1152 与 1200 两个断言视口不溢出；`npm run verify` 绿。

**回滚方式**：单提交 revert。

**复用 Owner**：`components/nuwa/`。

**前置**：P0-2（`nuwa-n1.css:226` 只在基线）。

---

## 五、P3 · 长期能力

> 本波是"角色生命体"的真正内容。排序原则与前面一致：**依赖解锁，不是工作量。** 全部禁止新建库、新建 Owner、新建第二套契约；凡找不到既有承载者的，本波只写"待裁定"，不提前施工。

### P3-1 因果本体归一（先裁定，再纯去歧义收敛）

**目标**：在世界模拟与命运 K 线任何能力叠加之前，明确两套因果投影谁是权威、谁降为视图。

**背景**：`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §6 债务 6 判它是**两条产品线的共同前置阻塞**：一套从标签与对象类型推导（`src/storyContracts/worldCausalEvolution.ts:105-123`，权威枚举 `author|confirmed-event|planned|candidate`，消费者 `EntityInspectorDock.tsx:16,262`）；另一套从关系标签正则推导（`src/storyContracts/eventCausalIndex.ts:24-26,71-88`，权威枚举 `author-confirmed|ai-candidate|speculative|conflict`，消费者 `EventLineWorkbench.tsx:83,1299`）。**两者各有且仅有一个消费者、权威枚举互不兼容**，且 `eventCausalIndex.ts:41,47` 把 Relation 对端中不是焦点的那个**无条件当作 event**，无类型检查。不先做，则同一次偏移在事件线和 K 线上显示成两条不同因果，作者立刻失去信任。

**依赖现有代码**：上述两个投影 + 各自唯一消费者；`storyStudioRelationOperations.ts`（`eventCausalIndex.ts:3-5` 自己声明"Relation 仍是唯一关系所有者，本模块不推断正式边"）。

**不允许修改什么**：**不删任何一边**（这是纯去歧义，不是取舍）；不新建第三个因果 Owner；不为"合并视图"放宽 `compareCharacterStates` 的校验强度（产品核心 `:568` 不同分支轨迹只能显式对照）；不在 `storyContracts/` 下新增目录名含 `simulation`/`prediction`/`worldGraph` 的模块（`scripts/run-selected-tests.mjs:34-89` 的 54 个禁止路径——"世界模拟器""决策引擎"这类直觉命名在本工程**没有合法落点**）。

**预计影响范围**：两个投影文件 + 两个消费者 + 一条裁定记录。

**验收标准**：一个夹具里同一事件的"因"在两处显示**同一组 ID 与同一权威值**；被降级的视图在自己界面上写明"派生视图，权威为 X"；`eventCausalIndex` 的类型误判（对端不是 event 却当 event）有一条红→绿断言；`npm run verify` 绿。

**回滚方式**：回退收敛提交回到"两套并行"（可工作但歧义），不丢功能；无数据。

**复用 Owner**：`src/storyContracts/`（两个投影都住这里，权威方仍在这两者中产生，**不新建**）。

**前置**：裁定 Q11（因果本体权威方）。

### P3-2 规划/候选时间帧与 WorldContextPack 补生产者/消费者

**目标**：清掉两处"类型可用、生产分支缺席"，让界面不再承诺系统给不出的东西。

**背景**：`worldCausalEvolution.ts:44` 的 `CausalTimeFrame.frameAuthority` 允许 `planned|candidate`、`:40` 标签允许"规划/候选"，但 `attachTimeFrames`（`:164`、`:166`）**只发 `confirmed-event`**——所以 `EntityInspectorDock.tsx:322` 只能诚实显示「暂无 planned/candidate 数据」；同时 `:203` `buildWorldContextPack` **只有 `tests/storyContracts/worldCausalEvolution.test.ts` 引用，无任何生产消费者**（`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §5.B）。`planned` 事件是一等公民（守卫在 `storyStudioWorkspaceOperations.ts:3730-3741`），所以 planned 侧是接线；candidate 侧不是（见下）。

**依赖现有代码**：`attachTimeFrames` 及其既有 confirmed-event 路径；`status:"planned"` Event 的既有守卫；`buildWorldContextPack` 本体；P3-1 的权威裁定。

**不允许修改什么**：candidate 帧**在候选 Event 身份未裁定前不做**（与 Q4 同源，见 P3-10）——不得为了填 UI 而把派生 WorkVersion 下的任意对象伪装成可引用候选；不新建 `confidence:number`（`:558`）；不改 confirmed-event 路径的证据强度；不读 markdown 标签正则当推理来源。

**预计影响范围**：`worldCausalEvolution.ts` + dock 的世界变体页签；`buildWorldContextPack` 的第一消费者属上下文链，须与 P3-9 的统一信封裁定协调。

**验收标准**：一条含 `planned` 事件的夹具使时间帧显示"规划"权威且理由可回溯到该事件 ID；candidate 帧在没有可引用候选身份时仍显示诚实空态（**不允许被本卡顺手填上**）；`npm run verify` 绿。

**回滚方式**：两个调用点分别 revert；无数据。

**复用 Owner**：`src/storyContracts/`（投影）+ `storyStudioWorkspaceOperations.ts`（planned 事件的既有 Owner，本卡不改）。

**前置**：P3-1；candidate 部分前置 Q4。

### P3-3 人格字段扩展

**目标**：把进入模型的人格从两个字符串扩到产品核心列出的那几项。

**背景**：`NuwaN1ProfileBasis = {core, boundaries}`（`nuwaN1Runtime.ts:25-30`），`normalizeProfileBasis` 只接受 `field ∈ {character_core, boundaries}` 且 `source === "author-profile"`，其余抛错（`:755-764`）。产品核心 `:530-548` 列的欲望、恐惧、底线、价值观、智力与判断方式、文化水平、素质习惯性格、说话方式，**在数据层不存在**，只存在于 Markdown 卡片标题文字（`characterTemplate.ts:267-278`），女娲不读。载体是现成的：`StoryStudioObjectProfile.fields` 是**开放字典**（`storyStudioObjectProfile.ts:29`，加 key 不需改契约），`CharacterProfileEditor.tsx:105` 是唯一构造点（今天只产出 `summary`/`character_core`/`boundaries` 三个活字段）。

**依赖现有代码**：上述 profile 载体与唯一构造点；N2A 已建立的 `authorConfirmed` 闸门（`nuwaN1Port.mjs:1042-1055`）；`ContextInspector` 的展示位（新增可读项直接进这个组件，不必新建面板）。

**不允许修改什么**：新字段**必须作者确认后才进入排演**（沿用既有闸门，不得为"少点一次"而放开）；不把猜测写成 profile（`:159-166`）；不借用 `personaPolicyRepositories.ts`（那是天意自己的 persona，`defaultTianyiPersona`，消费方全是 `tianyiIdentityReadiness`/`continuityPackRepository` 一路，误用违反 `:423-429`）；不新建人格库、不改 `fields` 的字典形状；不新增第二个档案写入入口（`CharacterProfileEditor` 的 `writeMarkdown: true, writePresentation: false` 分工保持）。

**预计影响范围**：`normalizeProfileBasis` 白名单、`CharacterProfileEditor`、发送上下文体积（→ 必须复核 UTF-8 预算与"必需项超限即阻断"链，`nuwaN1Attention.ts:51-55`、`nuwaN1Runtime.ts:286-307`）。

**验收标准**：先有 Q2 裁定（逐字段结构化填 vs 作者自由写后 AI 提结构候选）；夹具里新字段进入发送上下文**且进入作者可见的同一上下文**（保持"作者看到的==模型收到的"）；未确认字段不出现在 payload；预算超限时发送前 `blocked` 且零发送；`npm run verify` 绿。

**回滚方式**：白名单收回两项（一处），旧 Run 的冻结输入不受影响（人物编辑不得使旧 Run 漂移是既有不变量）。

**复用 Owner**：WorldObject / Profile 唯一写入者 `storyStudioWorkspaceOperations.ts`；运行侧读取 `nuwaN1Runtime.ts`。

**前置**：Q2；建议接在 P1-2 之后。

### P3-4 底线关卡与"不行动"候选形态

**目标**：把人格从提示词升级为可拒绝行动的约束，且拒绝以候选形式呈现给作者裁定。

**背景**：人格进了 prompt（`fixedContext` 含 `localGoal/coreSummary/profileBasis`，`nuwaN1Runtime.ts:394`），但**没有任何一处让"底线"能阻止一个行动**——约束目前是措辞，不是关卡（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` L2、L6、U2-4）。同时 `authorCue: string|null`（`:74`）是纯建议，新 cue 到达只会作废当次尝试（`:597-609`），不会导致角色"因为不符合我的人设/目标/知情而拒绝"。

**依赖现有代码**：`CharacterStateEvidence.authority` 已含 `candidate`，且 `projectCharacterState` 已把 candidate 与 ordinary 分流（`characterStateProjection.ts:150`、`:172-173`）；`NuwaN1ActorResult`（`:82-92`）已是候选交接（`formalWrites: 0`，`:191`）；`NuwaN1Attempt`（`:129-154`）已是 attempt 级带理由记录容器。

**不允许修改什么**：**判定结果建议不落地为独立对象**——作为 attempt 内的一次带理由拒绝记录，随 Run 的 `run.json` 走、与 `NuwaN1Attempt` 同生命周期，**不进入任何事实 Owner**（若创始人希望它成为长期可审计对象，需另案裁定归属）；**绝不与 `actionPermissionBroker.ts` 混用**——后者既有不变量原样保留（受保护动作恒 `requires-author`，除非服务端校验的范围授权精确匹配 run+unit+全部 actor：`:179-185`、`:238-240`；铸造授权必须 `full-access` profile 且 2–3 角色：`:139-141`）；新动作不得越出 `nuwaN1Port.mjs:1032` 的封闭清单语义（世界状态动作缺 `world-state` 精确证据引用即 409，`nuwaN1Port.mjs:513`）；拒绝不得自动写成正式故事。

**预计影响范围**：`nuwaN1Runtime.ts` 循环内 + 派发前校验；候选审阅面多一种结果形态。

**验收标准**：先有 Q6 裁定（拒绝是否消耗一次派发，直接影响 6 步/12 次硬上限的语义）；夹具里"作者提示要求角色做违反底线的事" → 得到"不行动 + 理由 + 依据的人格/底线/知情条目"，且**原回复与拒绝都保留**、无正式写入；`formalWrites = 0`；`npm run verify` 绿。

**回滚方式**：移除关卡调用点；attempt 记录随 Run 一起被回滚，不污染事实层。

**复用 Owner**：`nuwaN1Runtime.ts` 所在女娲有界运行 + `StoryStudioObjectProfile`（数据）。

**前置**：P3-3、Q6。

### P3-5 下一行动者由决策决定，替换轮转

**目标**：让"下一个谁行动"由该角色的目标 + 信念 + 已授权记忆共同决定，而不是轮转。

**背景**：`nuwaN1Runtime.ts:282` 是 `actors[steps.length % actors.length]`——**纯轮转调度**，人格、目标、信念对它的选择零影响（L5）。这是六个能力面里"最不像生命体"的一处，但它排在 P3 尾部：它依赖 P3-3/P3-4 有人格可依据，且它是唯一会破坏"同一冻结输入可复现"这一既有验收条款的动作。

**依赖现有代码**：轮转点 `:282`；全部预算门、fail-closed、冻结人物修订哈希校验（`:836`、`:858`）、每次读重规范化（`:714`）、`contextHash` 随步骤持久化（`:297`、`:309`、`:366`）；已授权集合的既有构造（`compileNuwaN1Context:388-415`）。

**不允许修改什么**：**不得引入随机性或时间依赖**（任何非确定性都会破坏回放；`docs/product/TIANYAN_ROADMAP.md:93` 的 N2B 检查点明写"相同冻结输入可复现"，另 `nuwaSceneSimulationRuntime.ts:602` 有"replay hash must match"同类约束）；不放宽预算/fail-closed；绕过 `:836/:858/:714` 任一处都不算完成本卡；`intent` 若不引用实际使用的目标/信念 ID 也不算完成（决策"更聪明"不等于更不可解释，R3 风险）。

**预计影响范围**：`nuwaN1Runtime.ts` 循环内部 + 回放测试 + `nuwa-n1` 浏览器闭环。

**验收标准**：同一冻结输入连跑两次结果逐字节一致；改变某一角色目标后下一行动者可观察地改变；`intent` 文本带可核对的 ID 引用；暂停/刷新/恢复/停止/回放链不回退；`npm run verify` 与 `TIANYAN_E2E_SCOPE=nuwa-n1` 全绿。

**回滚方式**：`：282` 改回轮转即恢复既有行为序列；单提交 revert；旧 Run 冻结输入不受影响。

**复用 Owner**：`nuwaN1Runtime.ts`（循环内部，不新增 Owner）。

**前置**：P3-3、P3-4、P1-6。

### P3-6 记忆召回从过滤变为授权集合内排序

**目标**：让"她记得"真的影响"她下一步做什么"。

**背景**：`listRecallableCharacterMemories`（`characterMemoryRepository.ts:96-107`）只按 active + 作用域 + 时点筛，**无相关性评分、无显著性、无衰减、无巩固**（L4）。排序的正确姿势在本仓库已有权威先例并写进注释：`nuwaN1Attention.ts:20-21` 确立了"排序永远不能授予访问，只接受已授权集合"这一全仓最重要的不变量（`permission-first-lexical-utf8/v1`）。

**依赖现有代码**：`nuwaN1Attention.ts` 的语义与预算上界（UTF-8 字节覆盖完整请求、必需项超限发送前阻断）；账本的可见性规则（root `revision ≤`、derived 精确等值，`:247-253`）；召回侧五类 kind 读取（P1-6 之后才有四类可排）。

**不允许修改什么**：**排序不得授予任何访问**（既有不变量不得因"更好用"而弱化）；不引入向量库/外部记忆后端（`docs/architecture/TIANYAN_MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES_R0.md:35` 至今仍是候选、`VectorStoreBackend` 全仓 0 命中；`WEBNOVEL_WRITER_REFERENCE_MAP_R0_6.md:86-100` 未采指标前不得选）；不把权限排除项的身份用**排序位置**暗示出来（§2.5.4 同一产品语义的另一种泄漏形态）；不改账本失效规则。

**预计影响范围**：`characterMemoryQuery.ts`（排序）+ 女娲上下文编译 + 检查器显示（入选来源、原因与预算须与检查器同源）。

**验收标准**：同一冻结输入排序稳定可复现；一条断言证明"未授权条目不因任何排序分数进入 payload"；被排除项在作者侧仍可见身份、在模型侧仍只有计数；`npm run verify` 绿。

**回滚方式**：排序函数退回既有过滤（恒序）即恢复现状；无数据。

**复用 Owner**：`storyContinuity/`（召回）＋ `storyIntelligence/`（预算内选择，不授予来源）。

**前置**：P1-6。

### P3-7 目标在数据层可相撞

**目标**：让两个角色的目标能**在数据上**冲突，而不只在散文里被读出来。

**背景**：今天目标是三个平面字符串——`run.authorGoal ≤1000`（`:163`）、`actor.localGoal ≤800`（`:34`）、场景目标即 `scene.label`——唯一用途是当检索词（`` `${localGoal}\n${authorGoal}` ``，`:398`）。没有目标 ID、优先级、达成/放弃追踪，两角色目标在数据层**无法相撞**（L7）。现有唯一"分歧"结构是角色级而非人物级：`NuwaDisagreement` 按 `claim.key` 聚合专家**角色**（`storyIntelligenceTypes.ts:183-192`、`nuwaSynthesis.ts:194-217`）。**修法不需要新结构**：用已存在的 `CharacterStateEvidence{category:"goal"|"commitment"}`（`characterStateProjection.ts:24`），冲突检测复用同文件的 `authority:"contradiction"` 与 `conflictGroupId`（`:27`、`:37`）——"两人目标相撞"= 两个既有投影类型落在同一 `conflictGroupId`。

**依赖现有代码**：上述投影类型与其 `conflicts`/`openQuestions` 出口；P1-2 已透出的投影内容；`eventStoryCrossingKnowledge.ts` 的知情来源。

**不允许修改什么**：不建目标表、不建冲突表（明确禁止"当前状态事实表"）；不新建投影类型；`conflictGroupId` 的赋值必须来自真实依据（作者确认的目标条目），不得由模型自由生成；不建第二关系 Owner（人际冲突与 Relation 的 `contradiction` 分工要写清，不改 Relation Owner 语义）。

**预计影响范围**：投影生产者（P0-4 裁定的落点）+ 检查器一个展示块。

**验收标准**：夹具里两角色各有一条作者确认目标、语义互斥 → 投影输出同一 `conflictGroupId` 且 `authority:"contradiction"`；无依据时输出"缺少事件依据"而不是不显示；`npm run verify` 绿。

**回滚方式**：停止产出 goal/commitment 证据（一个生产者开关）；投影层无状态，无数据回滚。

**复用 Owner**：`characterStateProjection.ts`（纯投影，已含 conflict）+ P0-4 裁定的承载者。

**前置**：P0-4、P1-2。

### P3-8 `observableResult` 的裁决者

**目标**：让角色"自述发生了什么"变成对世界状态的**提案**，而不是既成事实。

**背景**：`observableResult`（≤1200 字）是模型自述文本，**从不与任何解析器核对**（`nuwaN1Runtime.ts:363`）；唯一被结构化的世界影响是 `action.worldState` 的 `passage|holder`（`:78-80`，校验 `:788-798`）。这意味着一个角色说"我锁了闸门"和闸门真的锁了，今天之间没有裁决者（L8）。**不需要新设计**：`WorldStateN4Change`（`src/storyContracts/worldStateN4.ts:16-27`）已经是归因于事件、且强制证据必须是 confirmed-event 的 id+revision 否则抛错（`:155-158`）的真实效果结构，append-only，`compensatesChangeId` 必须指向同一主体既有变更（`:89`）。缺的只是"从事件推导"——今天全靠手工录入。

**依赖现有代码**：`worldStateN4.ts` 全套（含 `mainline/workVersions` 分支感知、按 `effectiveAt` 的 `history[]`、补偿取旧值或 `unknown`）；正式写入链 `applyAuthorChangeSet`；`nuwaN1Port.mjs:513` 的 `world-state` 精确证据引用 409 门。

**不允许修改什么**：**不自动写入**（`:167` 推演结果不得自动当正式故事；采纳必须走唯一 Author Confirmation 链）；不新建效果结构；不绕过 `:155-158` 的证据强制去"先生成再补证据"；N4 不受理角色的限制本卡不改（属 P0-4）。

**预计影响范围**：候选审阅多一种"效果提案"；`storyStudioWorkspaceOperations.ts` 的 N4 写入被多一个来源调用（仍是同一 Owner、同一校验）。

**验收标准**：夹具里模型自述与结构化动作不一致时 → 只生成待审提案、不写 WorldState；作者采纳后才产生 `WorldStateN4Change` 且其证据是本次确认事件的 id+revision；拒绝提案时世界状态零变化；补偿路径可回退且不删历史；`npm run verify` 绿。

**回滚方式**：断开推导调用点，回到手工录入；已确认写入属正式故事，**禁止删除**，只能走补偿版本。

**复用 Owner**：`storyStudioWorkspaceOperations.ts`（唯一 WorldState Owner）+ `storyStudioAuthorControl.ts`（唯一采纳权威）。

**前置**：P0-4。

### P3-9 统一 Attention 信封

**目标**：把承担"分支感知的注意力隔离"的 6+1 套装配器收敛到一份经裁定的信封，并补齐负向理由、持久化、forbid、跨分支四件缺件。

**背景**：今天承担该职责的互不相连装配路径实测有六条 + 一个影子（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §2.5.1）：真进模型的只有 N1 那一条（`nuwaN1Attention.ts:22`）；影子 `characterContextPack.ts:88-134` 才是形状最接近"Attention Pack"的东西（kernel、边界裁剪后的 includedFacts、上限 6 条记忆、relationSnapshot、visibleEvents、**带 `reason` 的 excluded[]**、UTF-8÷3 估算、`providerCalls: 0` 字面量类型），但它只到 React 组件为止（非自身引用仅 `EntityInspectorDock.tsx:15,100`）。四件缺件：① **负向理由只有一条**——预算内排除只有 `lower-relevance-within-budget`（`nuwaN1Attention.ts:14`、`:67-68`），产品核心要的"与本任务无关/已被作者禁止/会剧透/已过期"**一类都答不出**（更完整的十理由码 `tianyiGroundedContextGate.ts:24-34` 与八类分类器 `excludedSourceReason.ts:19` 已有但没接线，后者只有测试调用者）；② **排除清单不持久**，装出来的 pack 不落盘，只有 `contextHash` → Run 结束后"当时被拒了什么、为什么"无任何记录可回看；③ **作者主权缺 forbid**（`:1602` 授权增删固定禁止；`pinnedSourceIds` 已在 `nuwaAttentionContext.ts:29`，天意侧 pin/remove 也已接，但 forbid 不存在、N1 表面无 pin/forbid 控件）；④ **跨分支只在 N1 成立**（装配器 2/3/4/5 无任何分支/版本字段；`TianyiSimulationSource.branchOrUniverse` 类型上有、值恒 `null`，两处赋值 `server.mjs:607`、`:617`）。另有单位不一致：N1 用 UTF-8 字节、`hybridRetrieval.ts:63-65` 用 `ceil(bytes/3)+1`、Gate 用 NFC 码点；`outputTokenBudget 1024` 对适配器 `maxOutputTokens: 512`。

**依赖现有代码**：两个候选信封（`nuwaAttentionContext.ts` 与 `characterContextPack.ts`）；`tianyiGroundedContextGate.ts` 的十理由码与逐源 contentHash；`buildContextManifest`（`server.mjs:553-576`：校验 active work-version 相等、拒绝角色/仅展示访问、为非作者观察者剪隐藏事件引用——真的，但没共享给其余五个）；N1 的分支门控（`nuwaN1Port.mjs:936-989` 按 `ownerWorkVersionId`）。

**不允许修改什么**：**不得新建第三套信封**（两者各有既有消费者，第三套 = 三套真相，违反 `CORE.md:6`）；不改 N1 的权限先于排序不变量；不在统一前放宽任何一侧的排除强度；不把作者侧可见性削成只显数量（`:1602`）；不新增装配出口绕过 Gate。

**预计影响范围**：本波最大的一次收敛，跨 `storyIntelligence/`、`storyContracts/`、`storyContinuity/`、天意侧 UI。必须在 P0-3 之后（否则外泄策略先动）。

**验收标准**：先有 Q3 裁定（选哪一份形状）；负向清单**持久化且事后可回看**（Run 结束后能查到当时被拒的来源与理由码）；作者 forbid 一个来源后它不进入 payload 且理由码可核对；四个装配器输出同一信封的同一字段名与同一单位；跨分支排除不再是静态字符串；`npm run verify` 绿、真实 Provider 0 次。

**回滚方式**：按装配器逐个接回旧来源（每步一个提交，可逐个 revert）；持久化的排除清单是新增记录，回滚时用既有非破坏失效方式标记，不删。

**复用 Owner**：天意侧上下文 = `src/storyControlSurface/storyStudioTianyiOperations.ts` + 持久化 `storyContinuity/receiptStoppingRepositories.ts` + 发送前重验 `storyContinuity/tianyiGroundedContextGate.ts`；女娲侧 = `src/storyIntelligence/nuwaN1Attention.ts` + `src/storyContracts/characterContextPack.ts`。**不新建。**

**前置**：Q3、P0-3。

### P3-10 命运轨迹生产者与 K 线首版

**目标**：把已经写完的命运契约接上生产者，并用不依赖图表库的两轨视图替换界面上的诚实占位句。

**背景**：`src/storyContracts/characterFateProjection.ts`（230 行）逐条满足产品红线且**是结构性保证**：`confidence` 是分类 `"author"|"rule"|"model"|"unknown"`（`:31`），**类型上就不可能是数值**（满足 `:558` 不得有无法解释的神秘分数）；`:144` 强制点必须复用既有 Event ID 否则抛错；`:147` actual 轨**禁止**含 planned/candidate/inferred 权威；`:150` confirmed 点必须有来源锚点；`:151` stale 必须显式保持为 stale；世界时间四态 `exact|relative|range|unknown`（`:5-9`）不插值（`:108` 理由逐字写明）。但它在 `src`+`apps`+`tests`+`scripts` 内**零引用、零测试、零 UI**（其 §9.1-D 在最新 ref 实测），`docs/product/TIANYAN_ROADMAP.md:69` 的 FATE-F1 状态仍是**计划中**。三个硬前置：① 契约自身还没覆盖产品核心 `:560-566` 要求的五条轨（**缺女娲排演 lane 与跨分支对照轴**，`branchId` 是过滤器不是并列维度）→ 契约本身还差一段，不是"只差接线"；② 横轴今天只能是叙事顺序（排序键实测 `narrativeOrder` 然后 `observationId`，`:186-188`，不含 `worldTime.sortKey`），根因是正式 Event 无结构化世界时间字段；③ UI 侧**零图表依赖**（实测 `echarts`/`d3`/`recharts`/`visx`/`victory`/`plotly` 全部 0 命中，只有 `@xyflow/react`、`@dagrejs/dagre`、`leaflet`），所有 `<polyline>`/`<path d=>` 属于地图绘制。

**依赖现有代码**：契约全部上述条目；三条轨迹的存储在层都已有一等公民——规划 = `status:"planned"` Event（守卫 `:3730-3741`）、候选 = 派生 WorkVersion 下的 `NuwaBranchNode` 或多节点预测 bundle、实际 = `committed` + 作者确认；既有连接 `canonicalLinks` 的 `planningEventId→canonicalEventId`；偏移回溯的既有能力 `buildEventCausalIndex` 的 `cause|trigger|necessary-condition|result|downstream-impact` + 深度 1-2（作者已在事件线上看得到）；两处界面预留 `EntityInspectorDock.tsx:164` 与 `contextualCapabilityRegistry.ts:40` 的 7 项 `data-fate-*`。

**不允许修改什么**：**禁止 K 线读任何 `confidence:number`**（最省事的实现会拿 `temporalProjection.ts:29`、`:42` 与 `derivedEventLineR1.ts:54-70` 当轨迹高度，直接违反 `:558`）；不建 `src/prediction`/`src/simulation` 等禁止路径；不把预测自动升级为 IF（`:2464` 门槛已确认）；不做跨分支合并视图（`:568` 只允许显式对照，`compareCharacterStates:218` 的校验强度不得为合并视图放宽）；**不要用 `TianyiEventLineCandidateTrajectory.tsx`（17 行候选审阅叠层）当命运线视图去扩展**；candidate 轨在 Q4 裁定前不进图；三个"看起来像但不是"的邻近物（`ParticipationObservation.tsx` 的参与轨迹、`characterStateImpactFixture.mjs` 的硬编码 `impactPreview()`、`multiverseSingleDerivedR0.ts:109`/`creationSourceDriftR0.ts:132` 里的字符串 `"Character Fate"`）不得当作能力证据。

**预计影响范围**：新生产者（纯投影，`writes: 0`、`providerCalls: 0`）+ 一个两轨视图 + 契约内补 lane 与对照轴的裁定。

**验收标准**：actual 点全部可回溯到 confirmed Event ID（不能回溯的不进图）；planned 点来自规划 Event；横轴**在界面上显式标注为叙事顺序**（不是世界时间）；stale 点显式保持为 stale；无任何数值型高度/概率/权重；固定入口按 Q5 裁定；`npm run verify` 绿。

**回滚方式**：生产者与视图各为独立提交，逐个 revert；纯投影不写事实，零数据回滚面。

**复用 Owner**：`src/storyContracts/`（投影）+ `product-shell/`（呈现）；事件与编排仍是 `storyStudioWorkspaceOperations.ts` 与 `narrativeArrangement.ts`。

**前置**：P0-4、P3-1、Q4、Q5、Q9。

### P3-11 Agent 运行状态模型与后台活动

**目标**：要么实现产品核心 `:468-476` 的五种运行状态，要么把它改写并记账——**当前状态是两边同时声称，不能长期并存**。

**背景**：这是四份研究里唯一一处**产品定义与工程不变量的正面冲突**（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §4.1）。产品核心要求 Agent 有"后台活动"（在作者允许的范围、预算、时间内持续工作）；工程侧 `src/storyContinuity/checkpointBAcceptance.ts:27` 却把 `backgroundActivityCount`、`backgroundModelCallCount` 列入 `TIANYI_CHECKPOINT_B_BOUNDARY_COUNTERS`（**逐项归零**的边界计数器），且全仓**没有任何** `setInterval`、cron、scheduler 或 worker 队列——"女娲连续运行"是**一次 HTTP 请求内的同步 while 循环**（`nuwaN1Port.mjs:236-248`）。同时 §七.2 的五态运行状态（休眠/按需响应/事件触发/后台活动/排演活动）全仓**零命中**、连契约都没有（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §三 表末行）。**两者不是"实现没跟上"，是验收口径与产品定义不能同时成立。**

**依赖现有代码**：`checkpointBAcceptance.ts:27` 及其验收测试；`tianyiAgentRuntimePort.ts`（799 行，真实 `startRun → planFor → executeContextStep → executeAnalysis → 工具/审批/转向/回执`，事件溯源，`idle|planning|awaiting_author|running|paused|completed|failed|cancelled` 全套可暂停恢复取消重试）；`providerRequestBudgetLedger.mjs:35`（派发前预扣、幂等、`PROVIDER_BUDGET_EXHAUSTED`）。

**不允许修改什么**：**不得为"看起来像后台"而引入未授权常驻进程/定时器**（这会同时打穿预算账本与"零自动触发铁律"，且 4191/4192 单入口运行合同在 `docs/architecture/TIANYAN_RUNTIME_MODE_AND_SINGLE_ENTRY_R0.md`）；不得放宽 `providerRequestBudgetLedger` 的预扣与幂等；不得改 `checkpointBAcceptance` 的计数器口径来让验收变绿（那是裁定后果，不是手段）；不让 Pi 拥有 Canon/WorldState/Event/Session/作者确认权（`boundaries` 明令）。

**预计影响范围**：一句产品核心或验收口径的改写；若选"实现"，则新增运行状态契约 + 调度落点（**必须先裁定归属，本文不提供落点**）。

**验收标准**：书面决定二选一并写进 `TIANYAN_PRODUCT_CORE.md` 或能力账本；若为实现，必须同时给出预算归属（后台活动消耗谁的额度）与停止条件；若为改写，`:468-476` 那一段必须标为"暂不承诺"。

**回滚方式**：决定可复议；本卡若只做裁定，零代码回滚。

**复用 Owner**：`src/storyAgent/tianyiAgentRuntimePort.ts`（Agent 运行端口唯一 Owner）；预算归 `providerRequestBudgetLedger.mjs`；**调度落点未裁定**。

**前置**：Q8。

---

## 六、依赖图与最短路径

```
P0-1 锁定基线 ── P0-2 对齐工作树 ──┬── P1-1 目录入口/深链
                                   ├── P1-4 目标与计数
                                   ├── P1-5 上下文诚实化
                                   ├── P1-7 Agent 设置面
                                   ├── P1-8 卡历史投影
                                   └── P2-1…P2-6（全部还需 P0-5 视觉裁定）
P0-3 排除外泄 ──┬── P1-6 四类记忆写入
                └── P3-9 统一信封（还需 Q3）
P0-4 状态归属 ──┬── P1-2 投影不再丢弃 ── P1-3 闸门接线（还需 Q10）
                ├── P3-7 目标可相撞
                ├── P3-8 效果裁决者
                └── P3-10 K 线（还需 P3-1、Q4/Q5/Q9）
P0-5 视觉裁定 ── P2 全波
P0-6 保全 ──────（保护本文与全部研究、36 份未提交决定）
P0-7 索引/导航 ── P1-9 结清清单
P3-1 因果归一 ──┬── P3-2 时间帧与 WorldContextPack
                └── P3-10 K 线
P3-3 人格 ── P3-4 底线关卡 ── P3-5 决策替换轮转 ──（依赖 P1-6）
P3-6 召回排序（依赖 P1-6）
P3-11 运行状态（独立，依赖 Q8）
```

**若只允许做三件事**：P0-3（一条已在隔壁实现正确、且决定所有真实验收是否作废的安全策略）→ P0-4（一次裁定，解开 P1-2 / P3-7 / P3-8 / P3-10 四条链共用的死结）→ P1-3（把两个已写完、已测过的函数接上）。**三件都不新增契约、不新增 Owner、不新增库**，却能立刻让"状态可读、越界可拦"从界面上的占位句变成真实内容。

---

## 七、全局禁令与"明确不做"

### 7.1 适用所有任务

- **十个脚本全用**：`dev` `build` `serve` `typecheck` `lint` `test` `test:unit` `test:integration` `test:e2e` `verify`（`package.json`，顺序由 `scripts/run-selected-tests.mjs:111-116` 锁定）。Node 22 / npm 10 由 `scripts/run-with-canonical-runtime.mjs` 强制，**错误工具链必须在启动前停止，不在门禁里伪造通过**。
- **测试只用 Mock 或本地伪服务器。** 默认态钉在 `apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs:183`：`PROVIDER_MODE:"MOCK_OR_LOCAL_FAKE_ONLY"`、`REAL_PROVIDER_CREDENTIALS_USED:"0"`。同一文件 `:184-187` 有两条受门控的例外（`TIANYAN_E2E_SCOPE=tianyi-real-creation-r6` + `TIANYAN_TIANYI_REAL_CREATION_ACCEPTANCE=1`；`TIANYAN_MAP_REAL_AI_LIVE_ACCEPTANCE=1`），会翻成 `REAL_PROVIDER_ALLOWED`。**本文 33 张卡里没有一张授权打开这两条通道**；真实模型验收属独立的创始人授权，不在本路线内。
- **契约测试不回退**（`tests/storyContracts/tianyanR0ShellContract.test.ts`）：`:24/:26` 八空间与数量、`:33-41` 中英 i18n 键集完全相同、`:44-47` 工作台顺序与默认布局键集、`:52` 右工作面五态、`:54-58` 同时最多挂载一个可用工具且未接入工具点不动、`:62-63` 对 `useDockLayoutState.ts` 源码 `doesNotMatch(/panelOrder|expert-first|pinned|priority/)`、`:208-209` rail 宽度不得在 75rem 断点改值、`:248` 禁硬编码 `#hex`/`rgba()`、`:250/:251` 保留 `focus-visible` 与 `prefers-reduced-motion`。**这些锁红了不代表行为坏了，但解红只能靠改设计而不是改断言**（`tianyanWorkbenchR02.test.ts:51` 甚至用 `doesNotMatch(/\.map\(/)` 禁止多面板堆叠）。
- **54 个禁止路径保持不存在**（`scripts/run-selected-tests.mjs:34-94`）：`src/simulation`、`src/prediction`、`src/predictionEngine`、`src/scenario`、`src/worldBranching`、`src/world`、`src/worldGraphEngine`、`src/agentRuntime`、`src/agentRuntimeEngine`、`src/runtimeOrchestration`、`src/director`、`src/cognition`、`src/storyCognition`、`src/trace`、`src/persistence`、`src/workbench`、`src/governance` 等。**"世界模拟器""决策引擎""认知层"这类直觉命名在本工程内没有合法落点**——这正是本文一律把新能力挂到既有 Owner 名下的原因。
- **不向 `App.tsx`（7 行）与 `TianyanR0Shell.tsx` 堆菜单、Dock 状态、业务数据或执行逻辑**（`AGENTS.md`）。
- **受保护数据**：用户正文、项目数据、数据库、迁移、环境文件与密钥**禁止纳入任何破坏性清理**；本文所有"回滚方式"一律不使用 `git clean`、`reset --hard`、删除正式事实。（注意 `scripts/tianyan-storage-inventory.mjs:7-8` 与 `scripts/repo-doctor.mjs:7` 硬编码了一个外来 macOS 根并往不存在的 `docs/ops/` 写文件——**这两个脚本不可当作清理工具使用**。）
- **证据入 `data/YYYY-MM-DD_任务名/`**，且 `data/` 内不得放代码副本（现状已有 4 个 `.mjs`/`.cjs` 违规样本）；提交信息须带北京时间（`CORE.md`）。
- **单一写入者**：任何新能力都必须停在 `applyAuthorChangeSet` → `createConfirmedEventOnce` 之前，以候选身份存在。BaseVersion 串行化、不 last-write-wins；回溯用补偿版本而非删历史。

### 7.2 明确不做（本文替执行者挡掉的越界项）

常驻逐角色模型实例（产品核心 `:429` 明令"角色/物品/地点/组织/规则 Agent ≠ 各自常驻一个 Pi Agent 实例"）；向量数据库与完整 RAG/rerank/ASR/TTS（`provider-runtime.remainingGap` 原话"明确不存在"，且 R0.5 一个都不选）；自动文明演化；统一世界时钟与虚构历法（Q9 未裁定前不做）；任何概率、权重、"命运指数"式单分数（`:558`）；跨分支轨迹合并视图（`:568`）；把预测自动升级为 IF（`:2464` 门槛已确认）。

**效果图上 23 组假功能一律禁止先做界面**（`docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §5.3；判据是"找到 store/state 字段、传输路由或服务端 handler、`src/storyContracts/` 合同类型三者之一"）。其中风险最高的四组：

| 元素 | 为什么必须先补数据/合同 |
| --- | --- |
| 效应徽标「真相+1/风险+1/信息+1/关系+1/新线索+1」（E42） | 全仓**无类型化效应计分**；候选真实形状是句子数组（`server.mjs:4512-4530` 给 `change`/`after`/`causes`/`uncertainty`/`risks`/`unknowns`）。唯一带 `riskLevel` 的结构在 `src/storyProductPrototypeState.ts:40-49` 的**硬编码原型数据**里，`apps/story-studio` 从不 import。**数字看起来像依据，实际是编的** |
| 方向卡直选 +「应用选择」（E43） | 采纳合同是**多选 Run 步骤**（`selectedStepIds: string[]`）不是三选一；卡组件 props 只有 `steps/visible/busy/onInspect`，无 `onSelect`；且有分支节点时 `NuwaRunReader` 不渲染（`NuwaN1Workspace.tsx:715`），图上这种"已有正文"状态下根本没有复选框入口 |
| 场景笔记（E60） | R6 报告自己判 NOT_APPLICABLE「产品尚无场景笔记事实数据；按纪律不伪造」；`authorNotes?: string[]` 只在 `nuwaAuthorReview.ts:39` 且从不绑定场景。**要变真需要一个事实 owner——本文不发明它** |
| 自动保存时钟戳「14:24:36」（E35） | 现状状态串是**修订号语义**（「草稿已自动保存 · 内容 r{n}」，`NuwaN1Workspace.tsx:233`）；`formatTime()` 的格式根本没有秒；`src/storyCreation/autosaveController.ts:4` 零 UI 消费者。必须先决定展示口径（修订号 or 时间），否则保留现状文案 |

其余（天气、场景重要度、出场者添加、人物照片头像、场景缩略图、Hero 山水、创作提示换一批、场景级视角切换、事件线三条编号约束、chips 溢出、帮助中心、用户卡、顶栏待确认计数）同理：先有数据合同，再谈界面。

---

## 八、阻塞施工的前置裁定（汇总）

以下 **13 条**不裁定就无法开工。第 1–3 条（Q11、C1、C2）来自本文新识别的基线与视觉问题，第 4–13 条（Q1–Q10）来自 `docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §八。

| # | 待裁定 | 阻塞的任务 | 为什么规划工程师不能替你定 |
| --- | --- | --- | --- |
| Q11 | 因果本体的权威投影是哪一套 | P3-1、P3-2、P3-10 | 两者各有且仅有一个消费者、权威枚举互不兼容；降级谁都是产品可见行为变更 |
| C1 | 施工基线取哪条线（R4 是否并入视觉线） | P0-1、P0-2、P2 全波 | 四线两两不连续；PR #31 不含 R4 代码。`docs/handoff/TIANYAN_CODEX_FIRST_EXECUTION_PACKAGE_R0.md`（未跟踪）已按 R4 线排了第一阶段，需要一个正式确认或改判 |
| C2 | 视觉目标取哪一个（四个并存） | P0-5、P2 全波 | R1 冻结文档明写"创始人通过前禁止进入生产代码"；选图等于撤回已记录的否决反馈 |
| Q1 | 角色状态由谁承载 | P0-4、P1-2、P3-7、P3-8、P3-10 | `:1540-1541` 是**有意的限制**不是疏漏 |
| Q2 | 人格录入形态（逐字段 vs 自由写后 AI 提候选） | P3-3 | `:515-550` 列了字段但未定体验 |
| Q3 | 唯一 Attention 信封选哪一份形状 | P3-9 | 新建第三套 = 三套真相，违反 `CORE.md:6` |
| Q4 | 候选轨迹点的 ID 语义（预测 bundle 可否作候选 Event 身份） | P3-2、P3-10 | `characterFateProjection.ts:144` 强制复用既有 Event ID |
| Q5 | 命运 K 线的固定入口 | P3-10 | `:2466` 原文列为未冻结；本文只提示两处既有预留 |
| Q6 | 角色"拒绝行动"是否消耗一次派发 | P3-4、P3-5 | 直接影响 6 步／12 次硬上限的语义 |
| Q7 | IF／派生分支里的角色能否获得长期记忆 | P1-6 | `nuwaN1Port.mjs:386-388` 目前**直接阻断** derived 的 full-access 写入，是有意设计；解开牵动 `:1641` 三类记忆不污染 |
| Q8 | 后台活动 vs 零值验收不变量 | P3-11 | 二者不能同时成立（§4.1） |
| Q9 | 是否为本代产品引入虚构历法/世界时间结构 | P3-10、时间线切片 | 不引入则 K 线与时间线只能以叙事顺序为横轴并显式标注 |
| Q10 | 越界校验失败语义：阻断派发 vs 标注后交作者 | P1-3 | 选错会把可解释性变成新的静默拦截，或变成"提醒了但照样越界" |

---

## 九、本计划的边界

1. **本文不写代码、不给实现方案、不估难度、不提重构。** 每张卡的"依赖现有代码"是**必须复用的既有物清单**，不是改动建议。"预计影响范围"只回答"会不会打到契约/事实层/运行时"，不回答工作量。
2. **本文不重新核验任何代码。** 全部 `path:line` 从四份研究逐条搬运；四份研究自己全部在基线 `93f41aa`（等价 `a37a314`）上做过复核，并各自记录了被修正的结论（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §9.2 六条；`docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §0.3 第 4–5 条，含 30 余处行号漂移与目录前缀修正；`docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §0.4 两处子代理假阳性）。**搬运不等于再核验**：执行者开工第一步仍是 `git rev-parse` 对基线，行号漂移按 `docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §0.3 的三类原因处理。
3. **计数与 ref 绑定。** 本文出现的每个数字都注明来自哪个 ref：44 / 228 / 288 / 17 / 54 / 33 / 124 / 62 / 23 / 36 / 61.7 MiB 全部是基线或工作树特定口径（`docs/research/TIANYAN_SYSTEM_MAP_R0.md` §0.2、§5.C、§5.E、§6；`docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` §0.4；`docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §4、§8.4）。**注意本仓库几乎每条路径都含中文**，任何 `git ls-files` 比对必须先 `git -c core.quotepath=false`（或 `-z`），否则会产生"522 个文件丢失"这类假阳性（该错误已实际发生并被记录在 `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §0.4）。证据还散在 15 个 git worktree 下（18 个 `data/` 目录从未出现在主检出），**一个"不存在"的路径可能只是未迁移**，P0-6 与 P1-9 判定前必须先看 worktree。
4. **本文不含世界模拟/规则前提化切片**，因为它的研究载体未列入本文的四份输入。P0-6 完成保全后应补一份同基线的研究，再判断它是否成为第五个 P3 波次；**本文不为它预留卡位**——没有研究依据的方向写进计划，等于用计划给未核验的东西背书，这正是 `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §9.3 警告的"把研究文档当开工承诺"的反向版本。
5. **本文没有运行任何验证。** 未执行 `npm run verify`、`typecheck`、`lint`、`test`，未启动 4191/4192，未打开浏览器。所有"验收标准"是**该交给 Codex 与创始人的判据**，不是本文已经取得的结论。特别注意 `lint` 那一条：`docs/architecture/FEATURE_INDEX.json` 的 `sourceFiles` 硬钉住 8 份 md（含 `data/2026-09-03_天衍R12B2_1叙事编排权威合同/` 内那 1 份），任何整理动作碰到它们立刻红（`docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §2.3）——**所以三张保全卡都要过这道门：P0-7 的验收已把 `npm run lint` 绿写成硬条件；P0-6 与 P1-9 的验收是清单与 `git ls-files` 状态，但同样会在碰到被钉住的文件时把 lint 弄红**——先动文件后跑 lint 在本仓可行，先动 `data/` 后想补救则要重算索引。
6. **创始人体验验收不在本文射程内。** P2 全波与 P3-10 的"界面能不能看出"部分，最终判据是人工独立验收（`AGENTS.md` 最后一条），本文只写"必须有人看"，不写"看起来会怎样"。**测试通过不得冒充真实模型或作者体验验收**（`docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` §0.4 沿用 `TIANYAN_ROADMAP.md:7` 的口径）。
7. **本文不含排期、人力与里程碑日期。** 只有依赖图与"最短路径"（§六）。原因：§八 的 **13 条前置裁定一条都还没有落笔**，其中 8 张卡（P1-3、P1-6、P3-1、P3-3、P3-4、P3-9、P3-10、P3-11）的"前置"栏里直接写着一个待裁定编号——任何日期都是假数字。

---

## 十、一句话交付判断

**天衍今天不缺设计、不缺契约、不缺界面位置，缺的是三件更靠前的事：一条被共同承认的施工基线、一组还没有落笔的归属裁定、和 36 份随时会消失的有效决定。** 所以本计划把 P0 的 7 张卡里 **5 张**写成了裁定与保全而不是代码（P0-1／P0-4／P0-5 裁定，P0-6／P0-7 保全；纯施工只有 P0-2、P0-3 两张）——这不是回避施工，而是因为 `origin/codex/semantic-world-r3`、`codex/tianyan-ui-design-freeze-r1`、`codex/world-workbench-r4`、当前工作树 `codex/world-materials` 四条线两两不连续（§〇.2、§八 C1），在这种前提下任何"先写起来"的决定都会有一整波返工。

三件事按顺序做完，后面 26 张卡才有共同的落点：**P0-1 定基线 → P0-2 对齐工作树 → P0-6 保住那些只活在本机上的决定**。P0-3 是唯一一张与裁定无关、今天就能独立修完的施工卡（一条已确认的潜伏外泄，`nuwaN1PiAdapter.mjs:109-111` 已有正确写法可抄），建议插在最前面单独结清。