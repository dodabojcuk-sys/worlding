# 天衍文档资产盘点 R0

> 生成日期：2026-09-18。角色：项目分析助手（只读）。本文不修改代码、不移动文件、不删除文件、不提交 Git、不提实现方案。它只回答三个问题：这些文档现在是什么状态、哪些还在管事、哪些已经不管事了但删不掉。
>
> 状态词表只用六个：`CURRENT` / `REFERENCE` / `HISTORICAL` / `EXPERIMENT` / `OBSOLETE` / `UNKNOWN`。判据写在 §0.3。
>
> 修订（2026-09-19，G-3.11 就地改）：§2.2 追加 `docs/research/TIANYAN_CODE_NAVIGATION_R0.md` 一行与其后的"追加行规则"。本文其余快照值（§0.1 份数/体积、§1 总账、§2.2 标题"15 份"）**按该规则保持 2026-09-18 原值不回填**。
>
> 所有事实带 `path:line`。工作树 = `codex/world-materials` @ `f77b800`；实现基线 = `origin/codex/semantic-world-r3` @ `93f41aa`（工作树落后 44 个提交）。除注明"仅基线"外，本文按工作树（开发者实际看到的目录）判定。

---

## 0. 扫描范围与前提

### 0.1 扫描清单里有三个目录不存在

任务要求扫 `docs/` `data/` `research/` `design/` `handoff/`。前两个存在，后三个**在仓库根目录不存在**（`ls` 已核验）。它们的真实位置是 `docs/research/`、`docs/design/`、`docs/handoff/`。本文按实际路径扫描，并且把清单没点名的四类文档资产也纳入，否则索引有洞：

| 实际扫描区 | 文件数 | 体积 | git 状态 |
| --- | --- | --- | --- |
| `docs/architecture/` | 12 | 128 KB | 全跟踪 |
| `docs/design/references/` | 1 | 1,644 KB | 跟踪 |
| `docs/handoff/` | 2 | 20 KB | 全跟踪 |
| `docs/implementation/` | 1 | 20 KB | 跟踪 |
| `docs/operations/` | 2 | 16 KB | 全跟踪 |
| `docs/product/` | 11 | 172 KB | 10 跟踪 + 1 未跟踪 |
| `docs/research/` | 5 | 152 KB | 3 跟踪 + 2 未跟踪 |
| **`docs/` 小计** | **34**（31 md + 2 json + 1 png） | **2,156 KB** | **31 跟踪 / 3 未跟踪**（本会话三份研究文档，含本盘自身） |
| `data/`（81 个任务目录） | 1,046 | 397.6 MiB | 512 跟踪 / 534 未跟踪（193.4 MiB，占 49%）。534 = 485 可提交 + 49 被 `.gitignore:14 evidence/` 排除（集中在 `2026-09-04_天意事件线黄金闭环` 25 个、`2026-09-12_资料管理与世界设定方案` 11 个、`2026-09-05_天衍R2_2A工作面壳层` 9 个） |
| `evidence/`（3 个子目录） | 26 | 5.2 MiB | 全未跟踪，且 `.gitignore:14` 排除 |
| `ops/tianyan-review/` | 2 个 nginx conf | 16 KB | 全跟踪 |
| `output/` | 1 个 benchmark.json | 4.5 KB | 全未跟踪，`.gitignore:10` 排除 |
| 根目录 md | 6（`AGENTS` `CORE` `TIANYAN_PRODUCT_CORE` `design-qa` `日常入口` `项目目录导航`） | 1,144 KB | 全跟踪 |
| 代码区 md | 9（6 README + 2 INTEGRATION_REQUEST + 1 视觉 QA） | 12 KB | 全跟踪 |
| **合计** | **1,117** | **≈ 406 MiB** | 跟踪 551 / 未跟踪 566 |

`evidence/` 的 26 = 3 份 md + 12 png + 10 jpg + 1 contact sheet，`du` 5.2 MiB；`data/` 的 1,046 = 702 png + 126 md + 95 webm + 62 json + 24 log + 11 jpg + 9 txt + 7 mjs + 3 zip + 2 patch + 2 jsonl + 1 sse + 1 html + 1 cjs。`tests/fixtures/story-markdown-workspace-v1/**` 的 9 个 `.md` 是测试用的虚构正文，不是文档，**已从本索引排除**（只在 §9.2 提一句，避免被误当文档检索命中）。

### 0.2 仓库没有 README.md，也没有 CHANGELOG

与上一轮《系统地图》同一结论，再次核验：全仓 `README*` 只有 6 份组件级说明（§3）和 3 份 `data/` 内的本地说明（`…角色经历与记忆查询/浏览器链-最终/README.md`、`…女娲作者工作面视觉重构R6/证据包/README.md`、`…G1自适应任务主工作面/测试页面/README.md`，三份都未被跟踪；只有第一份算复现配方）；`CHANGELOG*` 零命中。基线 `93f41aa` 同样没有。承担"变更史"职责的是 `docs/handoff/`、`docs/implementation/` 和 81 个 `data/` 任务目录——这就是为什么 `data/` 占了这个仓库文档量的绝大部分，也是它最危险的地方。

### 0.3 状态判据（本盘统一口径）

| 状态 | 判据（必须可核验） |
| --- | --- |
| `CURRENT` | 它描述/规定的东西在生产代码里仍成立，或它是某次改动必须遵守的边界；未来开发要读它 |
| `REFERENCE` | 外部调研、权威视觉参考、对账输入——指导，不是承诺 |
| `HISTORICAL` | 记录某一次过去切片发生了什么，已被后续取代，只对演进考古有用 |
| `EXPERIMENT` | 一次性探针/重跑/调试变体/机器转储，结论没有被提升 |
| `OBSOLETE` | 已被取代、或描述的东西已不存在、或路径已失效 |
| `UNKNOWN` | 静态读不出来，或自述与现状冲突且无法裁定 |

### 0.4 方法

五路并行通读全部 33 份 `docs/` 文件（31 份已跟踪 + 本会话先前产出的 2 份；加上本盘自身现在共 34 份）、126 份 `data/*.md`、根与代码区 md；每条"已过期/已失效"结论都用 `git grep`、`git ls-tree`、`ls`、`git cat-file` 复核了它点名的具体路径/枚举/脚本名是否还在；引用图由 basename 反查构建；跟踪状态逐目录 `git ls-files` 判定。**没有采信任何一条未经复核的分类**——子代理报的"25 个 feature"、"522 个文件丢失"两处错误已在核验后剔除（真值：30 个；0 个丢失，那是 `core.quotepath` 转义假阳性）。

---

## 1. 总账

按本文赋定的**表行**统计（§2 + §3 共 53 行覆盖 56 份正式文档；§4 共 67 行覆盖 81 个 `data/` 目录）。行数与单位数不等，是因为 4 份镜像式 README 合成一行、7 个 R5_M6 重跑变体合成一行：

| 状态 | 正式文档（53 行 / 56 份） | `data/`（67 行 / 81 目录） | 备注 |
| --- | --- | --- | --- |
| `CURRENT` | 29 | 22 | 其中 8 份 md 被 lint 硬钉住（§2.3）；22 个 CURRENT data 目录里 **19 个含未提交内容**，15 个整目录未跟踪（§8.4） |
| `REFERENCE` | 8 | 13 | 外部参考、权威视觉参考、复现配方、机器输出 |
| `HISTORICAL` | 9 | 19 | 正常的一次一片的收口记录 |
| `OBSOLETE` | 6 | 0 | 集中在架构 pre-map、M2 delta、来源漂移 JSON |
| `EXPERIMENT` | 1 | 10 | 正式文档里只有 `LIVE_PI_PROBE_RECEIPT.md`；其余全在 `data/` |
| `UNKNOWN` | 0 | 3 | 只有截图、没有任何 md 结论的目录 |

另有 **9 处引用指向本机上不存在的东西**（§9.1，按引用行计）：4 个被权威文档点名的 `data/` 目录（3 个从未提交、不可恢复，1 个只是未迁移）、`design-qa.md` 承认的空证据目录、1 个 `/tmp` patch、`项目目录导航.md` 的 2 个失效代码路径、1 份缺失的 nginx 443 配置。

一句话总结：**`docs/` 小而老，`data/` 大而野。** 56 份正式文档里 29 份仍 CURRENT、6 份已 OBSOLETE；而真正约束当前 UI 的最新决定——女娲 R6/R6.1/R6.2、世界工作台 R4、混合检索 R3.1、G0/G1 工作面、动态对象手册、女娲十条硬约束——**一份都不在 `docs/` 里，全住在 `data/` 的 36 份未提交 md 中**（`data/` 里另有两项 CURRENT 决定已提交：R11 观察模型、叙事编排权威合同）。

---

## 2. `docs/` 全量索引

### 2.1 架构与合同（12 份）

|文件|类别|状态|是否影响未来开发|
|-|-|-|-|
| `docs/architecture/FEATURE_INDEX.json` | 机器索引（lint 强制） | CURRENT | 是——`npm run lint` 读它；工作树 30 项 / 基线 33 项；`:3` 的 `sourceCommit=19f3f276…` 在本仓**不可解析**（`git cat-file` 失败） |
| `docs/architecture/TIANYAN_R0_SHELL_CONTRACT.md` | 架构合同 | CURRENT | 是——外壳/导航改动的权威；`:9` 八空间顺序与 `storyStudioWorkspaceRegistry.ts:40-47` 一致 |
| `docs/architecture/TIANYAN_TIAN_YI_AGENT_MODE_AND_RUNTIME_R0.md` | 架构合同（Founder 硬规则 `:3`） | CURRENT | 是——dialogue/agent 双模式、三图层、Pi 六工具白名单；`:23` 版本 0.84.4 与 `package.json:25` 一致 |
| `docs/architecture/TIANYAN_RUNTIME_MODE_AND_SINGLE_ENTRY_R0.md` | 架构合同 | CURRENT | 是——4191/4192 双模式被 `storyStudioRuntimeMode.test.ts:20,23` 钉住。**但 `:62`「本轮不新增 systemd」已被 `scripts/deploy-tianyan-review-server.sh:107` 事实推翻** |
| `docs/architecture/TIANYAN_MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES_R0.md` | 架构合同 | CURRENT | 是——`:39` 向量后端准入门禁仍是前置条件；`:35` Milvus/pgvector/Qdrant/Chroma 仍只是候选（`VectorStoreBackend` 全仓 0 命中） |
| `docs/architecture/TIANYAN_PROVIDER_CATALOG_AND_EMBEDDING_BINDING_R0.md` | 架构合同 | CURRENT | 是——但两处标识已过期：`:32` 写 Provider Profile「当前 schema 为 v3」，代码 `PROVIDER_PROFILE_SCHEMA_VERSION = 4`；`:53` 的 `EmbeddingIndexBindingManifest` 在代码里叫 `EmbeddingIndexManifest`（`embeddingIndexBinding.ts:20`） |
| `docs/architecture/TIANYAN_R0_6_1_AGENT_RUNTIME_PLUGIN_ABI.md` | 架构合同 | CURRENT | 是——`:11` 封闭注册表（无动态 import/目录扫描/下载/安装）对应 `agentRuntimePluginRegistry.ts:57,97`；`:9` 的 upstream 0.84.2 已过期 |
| `docs/architecture/TIANYAN_WORKSPACE_LAYOUT_V1.md` | 架构合同 | CURRENT | 是——标题写 PRE_IMPLEMENTATION_MAP 但内容就是实现事实；`:9` `tianyan-package/v1` = `portableWorkspacePackage.mjs:7`；新增项目根文件会被包校验拒绝 |
| `docs/architecture/TIANYAN_MULTI_NODE_PREDICTION_REAL_PROVIDER_SMOKE_COMMAND_R0.md` | 授权门禁手册 | CURRENT | 条件性——`:3` 自述 `ADAPTER_READY_SMOKE_NOT_EXECUTED`；一旦授权真实调用必须照此命令与预算 |
| `docs/architecture/TIANYAN_R0_3_1_ACTIVE_TREE.md` | 清理前可达图 | HISTORICAL | 否——`:5` 明写"清理前"；它列的 DELETE_RETIRED 项已确认全部消失；冻结在 `238c892` |
| `docs/architecture/TIANYAN_LEGACY_KEEP_REWRITE_REMOVE_R0.md` | 取舍矩阵 | OBSOLETE | 否——`:38/:39` 的 REMOVE 项（`AppShell`/`GlobalHeader`/`layoutProtocol.ts`/`piAgentAdapter.ts`）已全部不在树里，决策已执行完 |
| `docs/architecture/TIANYAN_R0_6_AGENT_TEXT_VERTICAL_SLICE_PRE_IMPLEMENTATION_MAP.md` | 开工前盘点 | OBSOLETE | **否，但删不掉**——`:10/:18` 点名的 `src/storyAgent/piAgentAdapter.ts` 已被插件运行时取代；`FEATURE_INDEX.json` 把它列为 `sourceFiles`，删除即 lint 红（§2.3） |

### 2.2 产品 / 交接 / 实施 / 运维 / 研究 / 设计（15 份 + 1 份仅基线）

|文件|类别|状态|是否影响未来开发|
|-|-|-|-|
| `docs/product/TIANYAN_ROADMAP.md` | 路线图与能力账本 | CURRENT | 是——`:1` 自称唯一项目内入口，`项目目录导航.md:21` 承认。`:69` FATE-F1、`:71` ADAPT-L1 仍是"计划中"。**注意 `:69` 指向的 `characterFateProjection` 全仓 0 引用者**（见《系统地图》§5.A） |
| `docs/product/DESIGN.md` | 视觉与布局约束 | CURRENT | 是——`:21` 要求 1440/1195/1152/1024 四视口核对。**但 `:40-45` 女娲节已被 `data/2026-09-17_女娲R6_2微打磨/` 等三档推翻（§6.2）**；`:48-52` 的"已规划：地图 M1"其实早已交付 |
| `docs/product/TIANYAN_NUWA_RUN_AND_MULTIVERSE_DERIVED_VERSION_BOUNDARY_R0.md` | Owner 边界 | CURRENT | 是——`:3` `Status: frozen product and owner boundary`；`:75` 多元仍冻结待创始人。`项目目录导航.md:124` 称它是"测试输入"，但全仓无任何程序读取它（§9.2） |
| `docs/product/TIANYAN_MULTI_NODE_PREDICTION_IMPLEMENTATION_PLAN_R0.md` | 规则冻结 + 施工计划 | CURRENT | 是——`:24-42` 八条门禁无后继文档。**`:82-144` 施工段应视为 OBSOLETE**（`:86` 建议新增的文件已存在，`:100` "本切片不接生产 Provider" 已被真实 smoke 脚本反超） |
| `docs/product/TIANYAN_VISUAL_WORLD_EVOLUTION_R0.md` | 设计建议稿 | REFERENCE | 条件性——`:3` 明写"设计建议，未冻结需求"。例外：`:67` 多阵营重叠已由创始人 2026-09-16 确认，那一段是硬约束 |
| `docs/product/TIANYAN_DEV_SUGGESTIONS_R0.md` | 施工建议 | REFERENCE | 条件性——`:1` 「R0 简版，非开工承诺」。它点名的缺口（画笔预设/圈层/semanticZoom）至今 0 命中，即缺口未闭合 |
| `docs/product/TIANYAN_MATERIALS_MANAGEMENT_M2_IMPLEMENTATION.md` | 实施记录 | HISTORICAL | 条件性——内容已实现（`materialFileRepository.mjs` 在册），但进度权威是 `ROADMAP:55` |
| `docs/product/WORLD_MATERIALS_M1_PLAN.md` | 实施记录 | HISTORICAL | 否——`:19`「本里程碑已补齐」；`:39` 已把切换职责转交给 runbook |
| `docs/product/TIANYAN_MATERIALS_M2_DAILY_UPGRADE_DELTA.md` | 现场快照 | OBSOLETE | 否——`:16` 本轮没有取得切换确认；`:6` 记的工作树/分支属仓外现场，已过期。切换一律读 runbook |
| `docs/product/TIANYAN_EVENT_WORKSPACE_R9_FOUNDER_REVIEW_EVIDENCE.md` | 验收证据 | HISTORICAL | 否——`:3` `ENGINEERING_COMPLETE / FOUNDER_REVIEW_REQUIRED`；其分支 `codex/event-workspace-foundation-r8` 与 Draft PR #2 已被现链吞并 |
| `docs/handoff/TIANYI_R2_2B1_PHASE_CLOSURE_R1.md` | 阶段裁定 | CURRENT | 是——`:36` `ROOT_CAUSE_ATTRIBUTION=NOT_YET_PROVEN` 未被推翻；`:50` 明列禁止动作。继续 Story Intake 前必读 `:48-52` |
| `docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md` | 交接 | HISTORICAL | 条件性——`:44` `FOUNDER_VISUAL_VERDICT=REJECTED` 是已执行的历史判决；但 `:69`「Do not reopen these frozen decisions」列的 5 条冻结项仍然有效 |
| `docs/implementation/TIANYAN_R4_PI_ZERO_CALL_AND_NUWA_N1.md` | 现场状态与预算账本 | CURRENT | 是——`:3` 自称"唯一当前状态入口"并声明覆盖本文其余历史段落；Provider 预算与 N1 边界以它为准 |
| `docs/operations/TIANYAN_DAILY_4191_4192_UPGRADE_RUNBOOK.md` | 运维手册 | CURRENT | 是——预检先行、不以历史 PID 停服；`:9` 的"最终候选"字段仍是待补占位 |
| `docs/operations/TIANYAN_HK_REVIEW_DEPLOYMENT.md` | 运维手册 | CURRENT | 是——凭据/Origin/预算约束。**但它描述的 TLS/443 环节在本仓没有对应配置文件**（§9.1） |
| `docs/research/TIANYAN_REFERENCE_CATALOG.md` | 外部参考台账 | REFERENCE | 是——`:32-41` 固定版本表在吸收外部机制前必须核。两处陈旧：`:30` React Flow 实为 `@xyflow/react`；`:29` Leaflet 1.9.4 与 `package.json:29` 仍一致 |
| `docs/research/WEBNOVEL_WRITER_REFERENCE_MAP_R0_6.md` | 外部参考 | REFERENCE | 条件性——`:86-100` 指标未采集前不得选向量库；`:126-132` GPL 红线适用于任何借鉴；`:135` 自述"不是法律意见" |
| `docs/research/TIANYAN_MAINLINE_LINEAGE_AND_CAPABILITY_REALITY_MAP_R0.json` | 对账快照 | OBSOLETE | 否——`recordedAt 2026-08-25`，`:71` 的 `fixture=character-fate` 全仓 0 命中，`:91` 「`/nuwa` FIXTURE_ONLY_UI」已被 NUWA-N1 推翻，`:10-16` 分支/领先数全部失效。**`项目目录导航.md:125` 称其为"来源漂移对账测试输入"是错的：无任何测试或脚本读取它** |
| `docs/research/TIANYAN_SYSTEM_MAP_R0.md` | 系统地图（本轮前置产出） | REFERENCE | 是（作为定位图）——未提交、未经创始人确认，不覆盖 ROADMAP 与产品核心 |
| `docs/research/TIANYAN_CODE_NAVIGATION_R0.md` | 代码入口地图（2026-09-19 追加） | REFERENCE | 是（作为读码定位图）——生产代码地图、A–D 文件分级、AI 阅读路径与高/低风险区分档；测量 ref 与口径差异写在它自己的状态块与 §7。只读产出，不覆盖 ROADMAP、产品核心与 `项目目录导航.md` |
| `docs/product/TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md` | 能力演进研究 | REFERENCE | 条件性——同一：研究文档，非开工承诺，未提交 |
| `docs/design/references/tianyan-r0-5-founder-character-directory.png` | 权威视觉参考 | REFERENCE | 是——`design-qa.md(app):44` 以 SHA-256 `0acbc7f2…` 钉住；但它现在是**第二个视觉目标竞争者之一**（§6.2） |
| `docs/product/WORLD_REFERENCE_AND_CHARACTER_AGENT_PREP_R0.md` | 架构合同 | CURRENT | 是——**仅基线存在，本工作树没有**。`:34` 已写 R1 建立；`WorldReferenceWorkspace` / `worldReferenceProjection` / `characterAllowedReferences` 在工作树 0 命中 → 合并基线前不要按它施工 |

> 追加行规则（2026-09-19 起）：本节及其后各表是 2026-09-18 快照。此后新增文档只**追加行**，不回填 §0.1/§1 的份数与体积计数——回填会让快照值与现测值互相冒充。现测反查：`git -c core.quotepath=false ls-files docs | grep '\.md$'`。

### 2.3 被 lint 硬钉住的 8 份 md（不能"顺手归档"）

`docs/architecture/FEATURE_INDEX.json` 的 `sourceFiles` 数组里出现了 8 个 md 路径，`scripts/validate-feature-index.mjs:34-37` 要求**每一个都存在**，而它是 `npm run lint` 的一步（`scripts/run-selected-tests.mjs:117`）：

```
docs/architecture/TIANYAN_R0_SHELL_CONTRACT.md                    ← 状态 CURRENT
docs/architecture/TIANYAN_MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES_R0.md  ← CURRENT
docs/architecture/TIANYAN_PROVIDER_CATALOG_AND_EMBEDDING_BINDING_R0.md   ← CURRENT
docs/architecture/TIANYAN_RUNTIME_MODE_AND_SINGLE_ENTRY_R0.md     ← CURRENT
docs/architecture/TIANYAN_R0_6_AGENT_TEXT_VERTICAL_SLICE_PRE_IMPLEMENTATION_MAP.md  ← OBSOLETE，仍不可删
docs/implementation/TIANYAN_R4_PI_ZERO_CALL_AND_NUWA_N1.md        ← CURRENT
apps/story-studio/src/settings/agent/INTEGRATION_REQUEST.md       ← CURRENT（§3）
data/2026-09-03_天衍R12B2_1叙事编排权威合同/TIANYAN_NARRATIVE_ARRANGEMENT_CONTRACT_R0.md  ← CURRENT，且在 data/ 里
```

**最后一行是本次盘点最要紧的一条**：`data/` 目录中有 1 份 md 被 `docs/` 的机器索引当作源文件引用。任何对 `data/` 的整理、迁移、压缩包化或"清理未跟踪文件"，只要动到 `data/2026-09-03_天衍R12B2_1叙事编排权威合同/`，`npm run lint` 立刻红。这一目录不在"可归档"集合里。

另外：`validate-feature-index.mjs` 只校验"被索引的路径存在"，**没有任何机制校验 md 内容是否过期、也没有反向校验"已挂载组件必须登记"**。所以一个陈旧 md 永远不会让 lint 变红——这正是 §2.1 里那两份 OBSOLETE 能长期挂着的原因。

---

## 3. 根目录与代码区文档索引

|文件|类别|状态|是否影响未来开发|
|-|-|-|-|
| `TIANYAN_PRODUCT_CORE.md`（2488 行） | 产品定义 | CURRENT | 是——唯一产品定义；`:41` 一句话定义，`:560-568` 要求至少五种命运轨迹对照，`:2466-2468` 自承"最终固定入口尚未确认"。`:242` 起是术语表（本仓唯一"词汇表"文档，存在） |
| `AGENTS.md`（13 行） | 工程规则 | CURRENT | 是——最后一条"创始人体验验收必须人工独立完成"是硬门。风险：它比它所约束的分支老 8 天以上（末次提交 2026-08-29） |
| `CORE.md`（34 行） | 工程规则 | CURRENT | 是——定 `data/YYYY-MM-DD_任务名称/` 固定结构与"提交信息须带北京时间"。**`:27` 举例的 `data/2026-08-27_天衍产品体验与代码审计/截图/…` 已不存在**（该目录从未提交） |
| `项目目录导航.md`（207 行） | 导航地图 | CURRENT | 是——根目录唯一代码定位文档；§5 是不可重复 Owner 的权威表；`:26` 立了规矩："docs/ 只保留被代码、lint 或测试直接读取的文件"（本盘据此判 §2.1 三份 OBSOLETE） |
| `日常入口.md`（46 行） | 作者日常入口 | CURRENT | 是——`:20` 起记录 4192 由哪个目录承载。**`:45` 指向的 `data/2026-09-14_天衍第一阶段功能收尾/` 在本检出里不存在，只在 worktree `tianyan-map-m4-closeout` 里**（§9.1） |
| `design-qa.md`（38 行，根） | 视觉 QA | HISTORICAL | 条件性——`:3` `CODEX_DESIGN_QA_PASS_WITH_P2_LIMITS`，且明写"不是创始人验收"。`:8-10` 承认的对照输入 `对照/`、`真实运行证据/` **在本机是空目录**（§9.1） |
| `apps/story-studio/design-qa.md`（56 行） | 视觉 QA | HISTORICAL | 否——与根 `design-qa.md` **同名不同物**：`diff` 显示零共享文本，它覆盖 R0.2/R0.5/R0.6 且用另一套状态词（`FOUNDER_EXPERIENCE_STATUS=REJECTED`）。属命名冲突，不属重复内容（§7.1） |
| `apps/story-studio/src/product-shell/project-directory/README.md` | 区域责任说明 | CURRENT | 是——六份组件 README 里最深的一份；扩展了 `项目目录导航.md:74` 没写的 `character/` 细节 |
| `apps/story-studio/src/product-shell/right-dock/README.md` | 区域责任说明 | CURRENT | 是——与 `项目目录导航.md:75` 的"同时最多挂载一个可用工具"同义 |
| `apps/story-studio/src/components/page-tools/README.md`、`tianyi/{capability-launcher,composer,sidebar}/README.md` | 区域责任说明 | CURRENT | 条件性——四份都是 `项目目录导航.md:78` 的局部复述；改动这些区域时二者要同步 |
| `apps/story-studio/src/settings/agent/INTEGRATION_REQUEST.md` | 集成请求 | CURRENT | **是——请求尚未完成**：它要求宿主挂载 Agent 设置面，而 `AgentSettingsSection.tsx` 至今无任何导入者（`git grep "from '…settings/"` 只命中 storage）。它同时被 `FEATURE_INDEX` 钉住，删不掉 |
| `apps/story-studio/src/settings/storage/INTEGRATION_REQUEST.md` | 集成请求 | OBSOLETE | 否——请求已被实现：`ShellWorkspaceOutlet.tsx:5` 已导入 `SettingsStorageRoute`。全仓唯一英文 md，且其"多责任"表述与导航的"唯一责任"框架相冲 |
| `evidence/TIANYI_STORY_INTAKE_R0/LIVE_PI_PROBE_RECEIPT.md` | 一次性探针 | EXPERIMENT | 条件性——`:20-26` 三次真实 Pi 调用全部客户端取消、`STRUCTURED_TOOL_CALLED=NO`、`FORMAL_STORY_WRITES=0`；`:41-48` R1 分层探针 Gateway PASS / Pi 120s FAIL。结论**只有部分**进了 `docs/handoff/TIANYI_R2_2B1_PHASE_CLOSURE_R1.md`，而 receipt 本身被 `.gitignore:14` 排除 → 仅本机 |
| `evidence/TIANYI_STORY_INTAKE_R0/VERIFICATION_RECEIPT.md` | 验收证据 | HISTORICAL | 否——`:3-13` 记 `main@a401046` 的 typecheck/lint/999 unit/55 integration；`:21` "真实候选识别未通过" |
| `evidence/TIANYI_R2_2B1_CURRENT_UI/SCREENSHOT_MANIFEST.md` | 证据清单 | HISTORICAL | 否——8 张 1440×900 截图，基线 `ed81f39`；其 `testFixture=legacy-three-candidates` 仍在 `TianyiConversationWorkspace.tsx` |
| `ops/tianyan-review/nginx-http.conf` | 部署配置 | CURRENT | 是——`server_name tianyan.worlding.world`、代理到 `127.0.0.1:4194`、20m 上限。**与任何文档零接线**：`docs/operations/TIANYAN_HK_REVIEW_DEPLOYMENT.md:25` 只说 `nginx -T`，不提这两个文件 |
| `ops/tianyan-review/nginx-default-deny.conf` | 部署配置 | CURRENT | 是——非本域 Host 一律 `return 444`。同样是未接线的孤配置 |
| `output/story-intelligence-benchmark-v1/benchmark.json` | 机器输出 | REFERENCE | 否——由 `src/storyIntelligence/storyIntelligenceBenchmark.ts:59` 经单元测试重写；它自己写着 `liveModelExecutions=0`、`limitations=["deterministic-baseline-only","not-model-quality-evidence"]`。**不得当作模型质量证据** |
| `scripts/tianyan-storage-inventory.mjs` | 未接线的文档生成器 | OBSOLETE | 否——`:7-8` 硬编码外来 macOS 根 `/Users/m4-zhi/Documents/codex-workspace/天衍2`，`:10/:149` 往**不存在的 `docs/ops/`** 写一份 md；不在十个 package.json 脚本里，0 消费者。`scripts/repo-doctor.mjs:7` 同样硬编码该外来根 |

---

## 4. `data/` 索引（81 个任务目录）

按 `CORE.md` 规则，一个目录 = 一次任务。`是否影响未来开发` 一列里，"未提交"都指该目录完全未跟踪、只存在于这台机器。

### 4.1 2026-08-27 → 2026-09-08（39 目录 / 33 行）

|文件|类别|状态|是否影响未来开发|
|-|-|-|-|
| `data/2026-08-27_天衍工程重整/工作日志.md`(225行) | 工作日志 | HISTORICAL | 条件性——八空间与 Node22 基线的最早记录，已提升进导航 |
| `data/2026-08-28_天衍全局外壳重建R0/` | 验收证据 | HISTORICAL | 否——结论已在 `TIANYAN_R0_SHELL_CONTRACT.md` |
| `data/2026-08-28_天衍全局账户设置恢复R0_1_1/` | 验收证据 | HISTORICAL | 否 |
| `data/2026-08-28_天衍全局Chrome精修R0_1/` | 验收证据 | HISTORICAL | 否 |
| `data/2026-08-28_天衍R0_1_2缩放修复与公开同步/` | 验收证据 | HISTORICAL | 否 |
| `data/2026-08-28_天衍R0外壳/` | 工作日志 | HISTORICAL | 否 |
| `data/2026-08-29_天衍工作台R0_2创始人桌面纠偏R0/验收记录.md` | 创始人判决 | HISTORICAL | 条件性——记的是 `REJECTED`，docs 里没有落点；重启 R0.2 视觉时要回读 |
| `data/2026-08-29_天衍工作台R0_2顶栏与天意模式视觉修复/` | 验收证据 | UNKNOWN | 否——只有 2 张 png，无 md，且缺 `工作日志.md`（违反 `CORE.md` 固定结构） |
| `data/2026-08-29_天衍工作台R0_2目录Dock与能力入口/工作日志.md`(91行) | 施工前盘点 | REFERENCE | 是——内含 PRE_MAP/FORBIDDEN_DUPLICATES，是导航 §5"不可重复所有者"的前身 |
| `data/2026-08-29_天衍R0_6存储Agent外壳集成/` | 验收证据 | UNKNOWN | 否——15 png + 1 json，零 md |
| `data/2026-08-29_天衍R0_6角色目录信息密度修复/` | 机器转储 | EXPERIMENT | 否——4 manifest 可重生成 |
| `data/2026-09-02_天衍R11事件观察工作台/`（10 份 md，568 行） | 决策 + 权威矩阵 + 兼容矩阵 | **CURRENT** | **是——事件线观察/镜头任何改动必读 `R11_OBSERVATION_MODEL_DECISION.md`**；"五维观察配方"与 14 行概念边界表在 `docs/` 里 0 命中（未提升） |
| `data/2026-09-03_天衍R11_1参与表达与画布密度修复/` | 验收证据 | HISTORICAL | 条件性——"轨迹=默认/矩阵=审计"只有一句进了 ROADMAP OBS-1 |
| `data/2026-09-03_天衍R12B1统一工程基线/` | 基线报告 | REFERENCE | 是——`项目目录导航.md:127` 显式索引它 |
| `data/2026-09-03_天衍R12B2_1叙事编排权威合同/`（4 份 md，385 行） | 权威合同 | **CURRENT** | **是，且禁止移动**——`FEATURE_INDEX.json` 把其中 `TIANYAN_NARRATIVE_ARRANGEMENT_CONTRACT_R0.md` 列为 `sourceFiles`，动它 = lint 红 |
| `data/2026-09-03_天衍R12B2故事推进生产化/` | 缺口报告 | HISTORICAL | 否——它催生的合同就是上一行 |
| `data/2026-09-03_天衍RuntimeMode与单入口治理R0/` | 交付报告 | HISTORICAL | 否——报告顶部 `DOCS=` 字段自证已提升到架构文档 |
| `data/2026-09-04_天衍单根仓库收口/E2E_KNOWN_BLOCKER.md`(35行) | 阻塞项 | REFERENCE | 是——"未绑定 draft Event 时故事脊可见性"的合同**没有 docs 落点**，而断言仍活在 `apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs:7214` |
| `data/2026-09-04_天意三模式采纳与版本IF复核/`（3 份 md，667 行） | 交付 + prompt 存档 | HISTORICAL | 否——"摘要不得成为采纳第二 Owner"已提升；`CLAUDE_REQUEST.md` 是 prompt 存档 |
| `data/2026-09-04_天意事件线黄金闭环/`（26 文件 / 16 MB） | 证据包 | REFERENCE | 否——25/26 因 `.gitignore:14` 未提交；结论在 `docs/handoff/TIANYI_R2_2B1_PHASE_CLOSURE_R1.md` 与 `goldenLoopSourceAuthority.test.ts` |
| `data/2026-09-05_天衍G0产品设计与现场核对/`（2 份 md，807 行） | 产品设计 | **CURRENT** | **是——全未提交。**G1 选 A"自适应主工作面"+6 条冻结原则只在这份本地 md 里；`tianyiLane` 三泳道是活代码 |
| `data/2026-09-05_天衍G1自适应任务主工作面/`（48 文件 / 23 MB） | 交付 + 视觉目标 | **CURRENT** | **是——全未提交。**G1 恢复/撤销/Envelope 语义的唯一书面来源；`design-qa.md:7-10` 承认它的 `设计目标/`（该子目录 10 文件还在，`对照/`、`真实运行证据/` 已空） |
| `data/2026-09-05_天衍R2_2A工作面壳层/` | 证据包 | EXPERIMENT | 否——8 png + 1 webm，零 md，整目录被 ignore |
| `data/2026-09-06_天衍G1-R2连续作者工作面/`（58 文件） | 交付 + 设计 | **CURRENT** | **是——全未提交。**"全书概览 / 阅读所选"两层语义在 docs 里 0 命中；EventLine 密度改动必读 |
| `data/2026-09-06_天衍R4稳定视角与Pi准备/R4_ACCEPTANCE_REPORT.md` | 验收报告 | HISTORICAL | 否——报告顶部自述唯一入口已是 `docs/implementation/…R4_PI_ZERO_CALL_AND_NUWA_N1.md`（自我作废） |
| `data/2026-09-06_天衍R4-R2布局与上下文验收/` | 证据包 | UNKNOWN | 否——4 png，零 md |
| `data/2026-09-07_天衍女娲N1小闭环/ACCEPTANCE_REPORT.md` | 竞态修补表 | REFERENCE | 是——N1 取消/幂等/token 门规则的原始记录；被 `docs/implementation/…NUWA_N1.md` 按路径引用 |
| `data/2026-09-07_天衍R5_M2_M4连续证据/` | 验收证据 | HISTORICAL | 否——已提升进 ROADMAP R5 检查点 3 |
| `data/2026-09-07_天衍R5_M3连续交互证据/` | 验收证据 | HISTORICAL | 否——同上（item 4） |
| `data/2026-09-07_天衍R5_M4关系证据/` | 证据包 | EXPERIMENT | 否——1 png，无 md；M4 已并入 M2_M4 与 M6 |
| `data/2026-09-07_天衍R5_M6连续交互证据/`（12 文件） | 验收证据 | **CURRENT** | **是——路径不可动**：`docs/product/TIANYAN_ROADMAP.md:87` 逐路径引用它（其中 1 个 2.3 MB webm 未提交） |
| `data/2026-09-07_天衍R5_M6…{-debug,-final,-pass,-pass2,-pass3,-retry2}` + `…连续证据-retry/`（7 目录，61 文件） | 重跑变体 | EXPERIMENT | 否——**一个 md 都没有**；与 canonical 同名 PNG 的 1–2% 重截 + 多次录屏。合计 34.5 MiB 纯冗余，全部未提交 |
| `data/2026-09-08_天衍R5固定稿二次打开首因/`（22 文件 / 52 MB） | 根因分析 | **CURRENT** | 是——`creationSourceSelectionPort.mjs` 的 `sourceDriftCompare` 丢 `artifactId` 首因链、"多稿必须显式 artifactId"叙事未进 docs；改创作来源读取前必读。体积元凶是两个 `trace.zip`（45.4 MB，未提交、可重生成） |

### 4.2 2026-09-09 → 2026-09-18（42 目录 / 34 行）

|文件|类别|状态|是否影响未来开发|
|-|-|-|-|
| `data/2026-09-09_天衍N2人物注意力跨场景连续证据/` | 验收证据 | REFERENCE | 条件性——`ROADMAP:94` 显式引用本目录 |
| `data/2026-09-09_天衍N3连续交付证据/`、`…N3交付复核R1/` | 验收证据 | REFERENCE | 条件性——`ROADMAP:101/:103` 引用；固定稿/回溯合同改动时回读 |
| `data/2026-09-09_天衍N4世界关系与状态/` | 责任表 | HISTORICAL | 条件性——WorldState 分桶 |
| `data/2026-09-10_天衍角色经历与记忆查询/` | 证据 + 复现配方 | REFERENCE | 条件性——`浏览器链-最终/README.md` 是唯一 `TIANYAN_E2E_SCOPE=character-memory-query` 配方 |
| `data/2026-09-10_天衍B1可视化交付/`、`…B1-R1浏览器交付/` | 账本 + attempt 变体 | EXPERIMENT | 否——账本口径未进 docs；attempt-13 系失败重跑 |
| `data/2026-09-11_MEM-A1a-按问题检索故事依据/` | 实施记录 | HISTORICAL | 是——Gate Event Reference 上限 24 这条只在这里，且未提交 |
| `data/2026-09-11_MEM-A1a-R1检索闭环/` | 验收证据 | HISTORICAL | 条件性 |
| `data/2026-09-12_天衍资料管理M2/`、`…MAP-M3作者体验收尾/`、`…日常版本升级预演/` | 验收证据 | REFERENCE | 条件性——分别喂给 M2 实施文、WORLD_MATERIALS_M1_PLAN、runbook |
| `data/2026-09-12_天衍核心导航与作者便捷性整合/`（24 文件） | 证据 + attempt 噪声 | HISTORICAL | 否——`attempt-2/3` 是失败噪声 |
| `data/2026-09-12_资料管理与世界设定方案/`（192 行 md） | 设计方案 | **CURRENT** | **是——md 未提交。**"资料库统一组织方案"（MAT-M2 首批范围、收件箱/专题、文件夹单归属禁令）：任何 `/library` 改造须先对齐它 |
| `data/2026-09-13_天衍地图管理与AI共同编辑M4/`（139 文件 / 81 MB） | 证据包 | REFERENCE | 条件性——`ROADMAP:43` 逐路径引用其子证据 `calibration-r1-final/`（连项目/作品版本/SHA 一起写死）；底图像素语义与装饰笔触≠占地边界 |
| `data/2026-09-15_天衍真实AI审阅闭环R1/`（34 MB） | 验收 + 门禁 | **CURRENT** | 是——**`PRODUCTION_FILE` 凭据后端与 `TIANYAN_REAL_PROVIDER_PRODUCT_PATH` 授权回执门没有进 ROADMAP**；HK 部署前必读。1 个文件未跟踪 |
| `data/2026-09-15_日常服务切换主目录/`（209 行 md，39 文件仅 1 个跟踪） | 切换记录 | **CURRENT** | 是——结论进了 `日常入口.md:21-30`，**38 个证据文件只在本机** |
| `data/2026-09-16_天衍动态对象与世界观改造手册R0/`（292 行，未提交） | 改造手册 | **CURRENT** | **是——"动态对象四态投影路线"未提升**：禁新建 Owner、`change-state` 候选扩展、投影永不落库。对象状态/人格/演化工作台每个切片的前提 |
| `data/2026-09-16_天衍女娲分支与节点改造评估R0/`（349 行，未提交） | 改造评估 | **CURRENT** | **是——"女娲分支十条硬约束"未提升**：草稿 autosave≠revision、nodeId≠provenance、sceneKey 只铸一次、状态分层、生产快照纪律。任何分支/节点写路径的验收基线 |
| `data/2026-09-16_天衍真实AI作者闭环R2/`（58 文件 / 39 MB） | 证据 + 审阅索引 | **CURRENT** | 是——**"作者前提≠事实查询"未提升**（空证据允许 candidate/inference + uncertaintyReason、maxTokens 2400 钳制、`truncated-finish-length` 分类）；`ui-r1-evidence/UI_REVIEW_INDEX.md` 还记着一个未修复缺陷：U1 移除的人物在模式切换后被加回，根因未定位 |
| `data/2026-09-17_女娲分支纵向切片夜段一/`（未提交） | 实施记录 | **CURRENT** | **是**——分支存储路径 `.world-os/workspace/nuwa-branches`、主线条带天然不可见、重放同键必同负载。改分支持久化会破坏可移植导出白名单 |
| `data/2026-09-17_女娲分支浏览器验收R2/`（未提交） | 验收报告 | REFERENCE | 是——24/24 E2E 断言语义 + 4 项真实缺陷修复未入 docs；并声明了 `map-m4` scope 的既有失败例外 |
| `data/2026-09-17_女娲工作面视觉重构R1/` | 验收报告 | HISTORICAL | 否——它自称的"整体 PASS"已被 R2 明文收回（§6.1） |
| `data/2026-09-17_女娲入口与交互模型评估R2/`（5 份 md，186 行 + 1 个 14,982 B patch，未提交） | 评估 + **修订** | **CURRENT** | **是——最重要的一份"未提升设计"。**`交互模型修订报告R2b.md:32/:35/:46` 推翻三条初判，四层交互模型（共创/访谈/接管/干预）、零自动触发铁律、作用域引用合同、回合责任合同、五级干预范围全部未进 docs |
| `data/2026-09-17_女娲入口状态机修复R4/证据/nuwa-r4-probe.cjs` | 一次性探针 | EXPERIMENT | 否——无 md，且是禁止入 `data/` 的代码副本 |
| `data/2026-09-17_女娲视觉证据收尾R4_1/`（未提交） | 冻结规则 | REFERENCE | 是——Provider 单行、S3 查看器作者化：深链查看器不得暴露内部 ID |
| `data/2026-09-17_女娲工作面统一R5/`（0 字节 patch）、`…女娲统一工作面R5A/`（仅 2 png + 2 webm） | 空/无报告证据 | EXPERIMENT | 否——一个 patch 是 0 字节，一个没有任何报告 → 不可引用 |
| `data/2026-09-17_女娲作者工作面视觉重构R6/`（未提交） | 视觉重构验收 | **CURRENT** | **是——含"参考效果图.png"(1.57 MB) 与 12 项 MATCH 清单，是第二视觉目标；记录了 `dd245a2` 移除旧 N1 大表单**，与 `docs/product/DESIGN.md:40-45` 正面冲突（§6.2） |
| `data/2026-09-17_女娲聚焦与响应式打磨R6_1/`（未提交） | 响应式冻结 | **CURRENT** | 是——≤1200 右栏默认收起、composer 紧凑/完整双态 60/136 px、`--nuwa-composer-height` 安全区。docs 零记录 |
| `data/2026-09-17_女娲R6_2微打磨/`（未提交） | 最终视觉权威 | **CURRENT** | **是——女娲 UI 现状的唯一记录**（叙/景/动/心 左侧标识列、技术详情移至 composer 前）。整条女娲链按 HEAD 一路到这里（§6.3） |
| `data/2026-09-17_角色磁吸详情工作台R0/`（未提交） | 交互模型 | **CURRENT** | 是——通用 Entity Dock 四态（closed/peek/expanded/pinned）+ 九页签 + `buildCharacterContextPack` + 知识边界负例。全产品详情入口都收敛在这里 |
| `data/2026-09-17_资料板块世界观升级R1/`（未提交） | 交付报告 | CURRENT | 是——它声称的落点 `docs/product/WORLD_REFERENCE_AND_CHARACTER_AGENT_PREP_R0.md` **在工作树不存在**，只在基线 → 报告与仓库状态脱节 |
| `data/2026-09-17_天衍R5构建身份与路由一致性/` | 探针 + 脚本 | EXPERIMENT | 否——无 md，且含 `路由核验脚本.mjs`（3,121 B 代码副本，违规） |
| `data/2026-09-18_混合语义检索与世界工作台R3/`、`…世界构建因果演化工作台R2/` | 探针脚本 + 证据 | EXPERIMENT | 否——两份里各有一份**同字节** 3,220 B 的"密度探针脚本"（`密度bug-探针.mjs` / `密度bug/密度探针脚本.mjs`）；结论在下一行 |
| `data/2026-09-18_混合语义检索R3_1/`（3 份 md，97 行，未提交） | 收口报告 | **CURRENT** | **是——"作者秘密 LOCAL_ONLY 不出站"未提升**：IndexEligibility 先于任何远程调用、unknown 策略 fail-closed 到 LEXICAL_ONLY；32 条黄金查询 recall@5=0.75；Embedding/Rerank Profile 只存引用。任何远程索引前必须复核。另：`最终报告.md` 与 `收口报告.md` 同 HEAD、结构 90% 重叠（§7.2） |
| `data/2026-09-18_R3_1B视觉与GitHub收口/`（未提交） | 缺陷关闭记录 | REFERENCE | 是——8 项安全/一致性修复：`lstat` 逐组件拒 symlink、`path.relative` 防 sibling 逃逸、DO_NOT_INDEX 差集。索引安全审查的输入 |
| `data/2026-09-18_R3_1C_UI收口/`、`…_UI收口与证据/`、`…R3_1C证据与GitHub收口/` | 重复收口 | EXPERIMENT | 否——`R3_1C_UI收口/` 是"与证据"版的裸截图前缀副本（9 张里 6 张 md5 逐字节相同 ≈ 1.0 MB 冗余）；三者的 FINAL_HEAD（`261c597`/`686645e`/`0cffbfa`）都被 `93f41aa` 取代 |
| `data/2026-09-18_天衍世界观工作台R4/`（35 文件，未提交） | 视觉权威 + 取证脚本 | **CURRENT** | **是——"世界脉搏非卡片流首屏"未提升**（`DEFAULT_VIEW_IS_NOT_VERTICAL_CARD_LIST=true`、5 类类型化卡）。这是最新视觉权威，ROADMAP 完全没有它；4 个 `.mjs` 取证脚本是 `data/` 内代码违规 |

---

## 5. 重点识别 ①：当前有效设计

按"未来开发必须遵守"排序，14 项里**只有 5 项住在 `docs/`，9 项住在 `data/`——其中 7 项尚未提交**：

| 有效设计 | 现在住在哪 | 为什么算 CURRENT |
| --- | --- | --- |
| 八空间 + 唯一外壳合同 + 单一 activeToolId | `docs/architecture/TIANYAN_R0_SHELL_CONTRACT.md`、`项目目录导航.md:75` | 被 `tests/storyContracts/tianyanR0ShellContract.test.ts:24,47,52,56-58` 机器钉住；`禁用 panelOrder/expert-first/pinned/priority` 的反向断言在同文件 `:62-63` |
| 天意双模式 / 三图层 / Pi 六工具白名单 | `docs/architecture/TIANYAN_TIAN_YI_AGENT_MODE_AND_RUNTIME_R0.md` | `tianyiAgentMode.ts` 逐条对应 |
| 女娲/多元派生的唯一 Owner 边界（frozen） | `docs/product/TIANYAN_NUWA_RUN_AND_MULTIVERSE_DERIVED_VERSION_BOUNDARY_R0.md:3` | 派生版本落地前它是前提 |
| 能力账本与验收层级 | `docs/product/TIANYAN_ROADMAP.md` | 自称唯一入口，且被导航承认 |
| 真实 Provider 授权与预算纪律 | `docs/implementation/TIANYAN_R4_PI_ZERO_CALL_AND_NUWA_N1.md:3` + `docs/architecture/…REAL_PROVIDER_SMOKE_COMMAND_R0.md:3` | 授权门仍未开 |
| **女娲四层交互模型（共创/访谈/接管/干预）+ 零自动触发铁律** | `data/2026-09-17_女娲入口与交互模型评估R2/交互模型修订报告R2b.md`（未提交） | R2b 未被任何后续文件推翻 |
| **女娲 UI 现状 = R6 → R6.1 → R6.2** | `data/2026-09-17_女娲R6_2微打磨/`（未提交） | 链上最终 HEAD `101e31f`，其后只有磁吸 Dock 挂载点变化 |
| **通用 Entity Dock 四态九页签** | `data/2026-09-17_角色磁吸详情工作台R0/`（未提交） | `EntityInspectorDock.tsx:27` 就是它的实现 |
| **世界脉搏首屏 ≠ 卡片流** | `data/2026-09-18_天衍世界观工作台R4/`（未提交） | 最新视觉权威，ROADMAP 无记录 |
| **作者秘密 LOCAL_ONLY / IndexEligibility 先于远程调用** | `data/2026-09-18_混合语义检索R3_1/`（未提交） | 出站边界，违反即隐私事故 |
| **R11 五维观察配方 + 概念边界表** | `data/2026-09-02_天衍R11事件观察工作台/`（已提交） | 事件线观察改动的唯一书面依据 |
| **叙事编排权威合同** | `data/2026-09-03_天衍R12B2_1叙事编排权威合同/` | 且被 FEATURE_INDEX 钉住 |
| **G0/G1 自适应主工作面、G1-R2 两层语义** | `data/2026-09-05`、`data/2026-09-06`（未提交） | `tianyiLane` 是活代码，规则只在这些 md 里 |
| **动态对象四态投影路线 / 女娲十条硬约束** | `data/2026-09-16_*`（未提交） | 后续 R5/N 系列的改造前提 |

## 6. 重点识别 ②：已被否决的设计

这些是**必须显式记住"不要再做"**的东西，而不是可以删掉的垃圾：

### 6.1 被明文收回/推翻的（有逐字证据）

| 被否决的设计 | 否决它的原话 | 状态标注 |
| --- | --- | --- |
| R0.5 角色目录与检查器的"修复前"版本 | `docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md:44` `FOUNDER_VISUAL_VERDICT=REJECTED` | OBSOLETE（已由 `docs/design/references/…png` 版取代） |
| 19893b1 旧外壳方向 | `docs/architecture/TIANYAN_R0_SHELL_CONTRACT.md:5`「`19893b1` 是可取证的错误方向技术草稿」；`TIANYAN_LEGACY_KEEP_REWRITE_REMOVE_R0.md:38` REMOVE | OBSOLETE（已执行完） |
| 「VISUAL_REMODEL_R1 整体 PASS」 | `data/2026-09-17_女娲入口与交互模型评估R2/入口与交互模型评估报告.md:17`「此前…的表述收回：R1 的 PASS 仅指布局重构与既有 E2E 回归，不构成入口体验与创始人视觉验收通过」 | 已收回；R1 目录降为 HISTORICAL |
| 女娲「四种平级聊天模式」交互模型 | `data/2026-09-17_女娲入口与交互模型评估R2/交互模型修订报告R2b.md:32/:35/:46` 三处「不成立，修正如下」：共创直接绑定天意泳道 / 角色接管只需 UI 说话人标记 / 导演干预复用 cue 即可 | **这就是本盘找到的"已被否决设计"主案例**，且否决理由与修正版都未提升 |
| R3A「runtime.project 未绑定」结论 | `data/2026-09-17_女娲入口与交互模型评估R2/R3A执行记录.md:22`「推翻 R3A"未绑定"结论」 | 记录内部自我矛盾，取后者 |
| `/nuwa` 为 FIXTURE_ONLY_UI 的判定 | `docs/research/TIANYAN_MAINLINE_LINEAGE_AND_CAPABILITY_REALITY_MAP_R0.json:91-92` vs `ROADMAP:61-66` NUWA-N1..N3A | 该 JSON 整体 OBSOLETE |
| 单向量库/外部记忆后端选型 | `docs/architecture/TIANYAN_MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES_R0.md:35` 仍是候选；`WEBNOVEL_WRITER_REFERENCE_MAP_R0_6.md:86-100` 未采指标前不得选 | 未选型 = 尚未否决也未通过 |

### 6.2 被"事实推翻"的设计（文档之间正在互相冲突，需要裁定）

| 冲突 | 一方 | 另一方 |
| --- | --- | --- |
| 女娲首屏 | `docs/product/DESIGN.md:40-45`：已接通的女娲 N1 本地工程面，选 2 正式角色 + 1 场景，1440 双栏 | `data/2026-09-17_女娲作者工作面视觉重构R6/`（`dd245a2` 移除旧 N1 大表单）、R1 报告"首屏不再是 Provider/运行方式/范围/目标表单"、R6.1 把 1152 右栏改为默认收起 |
| 视觉目标 | `design-qa.md:7` 承认的唯一视觉目标 = `data/2026-09-05_…G1…/设计目标/` | `data/2026-09-17_女娲作者工作面视觉重构R6/参考效果图.png` + 12 项 MATCH；`docs/design/references/*.png`（R0.5 权威）；`data/2026-09-18_天衍世界观工作台R4/` 首屏——**至少四个视觉目标并存** |
| 文档存放规则 | `项目目录导航.md:26`「docs/ 只保留被代码、lint 或测试直接读取的文件」 | `docs/` 里 30 份 md 中只有 7 份被 FEATURE_INDEX 点名 → 规则与实际严重不符 |
| 状态载体角色 | `项目目录导航.md:125` 称 reality-map JSON 为"测试输入" | 无任何测试/脚本读取它 |
| systemd 运行合同 | `docs/architecture/TIANYAN_RUNTIME_MODE_AND_SINGLE_ENTRY_R0.md:62`「本轮不新增」 | `scripts/deploy-tianyan-review-server.sh:107` 已写 systemd unit |

### 6.3 序列重建（女娲，判 HISTORICAL/CURRENT 的依据）

`09-16 评估R0` → `09-17 夜段一(4897530, PARTIAL)` → `分支浏览器验收R2(6d51754)` → `视觉重构R1(dd245a2)` → `入口与交互模型评估R2 → R2b 修订` → `R3A–R3D` + `状态机修复R4` → `视觉证据收尾R4_1(44486f9)` → `工作面统一R5(0字节 patch)` / `统一工作面R5A(无报告)` → `作者工作面视觉重构R6(670067c)` → `R6_1(d6afcc5)` → **`R6_2(101e31f) = 现状权威`** → `角色磁吸R0(ecac1ad)` 只改 Dock 挂载点。

## 7. 重点识别 ③：重复文档

### 7.1 同名但不同物（不是重复，但是检索陷阱）

| 对 | 判定 |
| --- | --- |
| `design-qa.md`(38行/09-06) vs `apps/story-studio/design-qa.md`(56行/08-29) | `diff` 零共享文本。不同切片、不同状态词。**建议保留，但根 `design-qa.md` 的对照输入已丢失（§9.1）** |
| `data/*/README.md`(3 份) vs 组件级 `README.md`(6 份) | 三种角色：复现配方 / 责任边界 / 证据包元数据。第三份用 `README.md` 命名违反了 `CORE.md` 的固定结构 |

### 7.2 内容重复（同一事实多份，会各自漂移）

| 重复簇 | 成员 | 哪份最新 / 建议 |
| --- | --- | --- |
| **资料 M1→M2 三份** | `docs/product/WORLD_MATERIALS_M1_PLAN.md`、`…M2_IMPLEMENTATION.md`、`…M2_DAILY_UPGRADE_DELTA.md` | 进度权威是 `ROADMAP:54-55`。三份里只有 M2_IMPLEMENTATION 有实质 Owner 内容 |
| **多节点推演三份** | `docs/product/TIANYAN_MULTI_NODE_PREDICTION_IMPLEMENTATION_PLAN_R0.md:82-144`、`docs/architecture/TIANYAN_MULTI_NODE_PREDICTION_REAL_PROVIDER_SMOKE_COMMAND_R0.md`、`ROADMAP:67` | 施工段重复且已过期；门禁段(:24-42)独有 |
| **地图/圈层/势力两稿** | `docs/product/TIANYAN_DEV_SUGGESTIONS_R0.md:5-36` vs `…VISUAL_WORLD_EVOLUTION_R0.md:28-42,67` | 同日相隔 1 小时（11:27 > 10:17），DEV_SUGGESTIONS 更可施工；但"多阵营重叠"只在 VISUAL:67 → **互补，不能二删一** |
| **清理取证两份** | `docs/architecture/TIANYAN_LEGACY_KEEP_REWRITE_REMOVE_R0.md:36-39` vs `TIANYAN_R0_3_1_ACTIVE_TREE.md:40-47` | 一个定策略、一个记已删，无字段冲突，可合并成一份历史 |
| **七层记忆 + 四个候选后端** | `TIANYAN_MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES_R0.md` vs `docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md:67` | 近似重复；架构文档是权威，handoff 那份是交接摘录 |
| **R12B2_1 合同** | `data/…/TIANYAN_NARRATIVE_ARRANGEMENT_CONTRACT_R0.md` + 同目录 3 份配套 md + 导航 §引用 | 已被 FEATURE_INDEX 钉住，属"设计上的重复"，不可去重 |
| **女娲工作面 R5_M6 证据 8 份** | `data/2026-09-07_天衍R5_M6连续交互证据` + 7 个变体目录 | 只有 canonical 有 md；7 个变体零 md，34.5 MiB 纯重复 |
| **R3_1C 收口 4 份 / 混合检索 2 份** | 见 §4.2 | 6 张截图逐字节相同 ≈1.0 MB；`最终报告.md` 与 `收口报告.md` 90% 重叠 |
| **`data/` 内两份同字节探针** | `混合语义检索与世界工作台R3/密度bug-探针.mjs` vs `世界构建因果演化工作台R2/密度bug/密度探针脚本.mjs` | 各 3,220 B，字节级相同 |
| **区域 README vs 导航 §4** | 6 份组件 README | 全部是 `项目目录导航.md:74-78` 的局部复述；唯一有增量的是 `project-directory/README.md` 的 `character/` 细节 |

## 8. 重点识别 ④：可以归档 / 不可以归档

**本盘不建议移动或删除任何东西**（任务明令，且 §2.3/§8.2 有硬约束）。下面只给分级判断。

### 8.1 归档会立刻出事的两类

1. `data/2026-09-03_天衍R12B2_1叙事编排权威合同/` 与 `apps/story-studio/src/settings/agent/INTEGRATION_REQUEST.md` 及 §2.3 列出的另外 6 份 md —— 被 lint 校验存在，动 = 红。
2. `data/2026-09-07_天衍R5_M6连续交互证据/`、`…N2/N3…`、`…地图管理与AI共同编辑M4/calibration-r1-final/`、`…女娲N1小闭环/ACCEPTANCE_REPORT.md`、`…天衍R12B1统一工程基线/`、`docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md` 引用的 2 个 `data/` 目录 —— 被 `ROADMAP.md:87,94,101,103` 与 `docs/implementation/…`、`docs/handoff/…` 按路径引用，移动 = 悬空引用。其中 2 个引用目标**已经不存在了**（§9.1）。

### 8.2 判为可归档（HISTORICAL 且无入向引用）

`docs/architecture/TIANYAN_R0_3_1_ACTIVE_TREE.md`、`docs/product/TIANYAN_EVENT_WORKSPACE_R9_FOUNDER_REVIEW_EVIDENCE.md`、`docs/product/WORLD_MATERIALS_M1_PLAN.md`、`docs/product/TIANYAN_MATERIALS_MANAGEMENT_M2_IMPLEMENTATION.md`、`docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md`（保留 `:69` 冻结清单）、根与 app 两份 `design-qa.md`、`apps/story-studio/design-qa.md` 之外的 5 份"镜像式" README、`data/2026-08-28_*` 与 `2026-08-29_*` 全部（除 `目录Dock与能力入口/工作日志.md`）。

### 8.3 判为可安全丢弃的实验产物（EXPERIMENT，合计 ≈ 40 MB，全部本就未跟踪）

7 个 R5_M6 变体目录（34.5 MiB）、`R3_1C_UI收口/` 裸截图副本（≈1.0 MB）、`女娲工作面统一R5/`（0 字节 patch）、`女娲统一工作面R5A/`（无报告）、`R0_6角色目录信息密度修复/` manifest、`R2_2A工作面壳层/`、`attempt-2/3` 与 `attempt-13` 系、`2026-09-08_…固定稿二次打开首因/验证/**/trace.zip`（45.4 MB，可重生成）。**"安全"仅指不破坏引用与 lint；是否丢弃属于创始人决定，本文不主张执行。**

### 8.4 反而必须提交的（风险最大的反向结论）

`data/` 有 193.4 MiB / 534 文件未跟踪（占 49%），其中 **48 份 md**。§4 里标 `CURRENT` 且含未提交内容的 19 个目录中，除 `09-07 R5_M6`（1 个 webm）和 `09-08 固定稿首因`（1 份 md）外的 **17 个**（09-05 G0/G1、09-06 G1-R2、09-12 资料库统一组织方案、09-15 两份、09-16 两份、09-17 七份、09-18 两份）合计 **36 份未跟踪 md / 61.7 MiB**，其中 **15 个目录完全未跟踪**（另 2 个只是部分未提交：`09-15 真实AI审阅闭环R1` 1 文件、`09-15 日常服务切换主目录` 38 文件）。它们承载了 §5 表里 7 项仍未提交的有效决定。**这些内容只存在于这台机器上，一次磁盘故障或一次 `git clean -fd` 就永久消失**——这比"归档历史资料"紧迫得多。另有 18 个证据目录只存在于另外三个 worktree（§9.1）。

## 9. 重点识别 ⑤：缺失的重要文档

### 9.1 权威文档指向不存在的东西（9 处死链）

| 引用方 | 指向 | 实况 |
| --- | --- | --- |
| `CORE.md:27` | `data/2026-08-27_天衍产品体验与代码审计/截图/01-天意-1440x900.png` | 目录不存在，且**从未提交**（`git log --all -- <path>` = 0）→ 不可恢复 |
| `docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md:45` | `data/2026-08-29_天衍R0_5创始人视觉收口/…REFERENCE.png` | 不存在、未提交 → SHA-256 校验和失去可核对对象；仅 `docs/design/references/*.png` 副本存活 |
| 同上 `:43` | `data/2026-08-29_天衍R0_5创始人退回修复/截图/` | 不存在、未提交 |
| `日常入口.md:45` | `data/2026-09-14_天衍第一阶段功能收尾/` | **未丢失，未迁移**：只存在于 `/home/beelink/.codex/worktrees/tianyan-map-m4-closeout/` |
| `design-qa.md:8-10` | `…G1…/对照/设计目标-真实运行-*.png`、`/对照/旧版-G1-1440-*.png`、`/真实运行证据/` | 两个目录存在但**空（0 文件）**；未被提交过 → 唯一被承认的视觉对照证据已消失（`设计目标/` 10 文件还在） |
| `docs/handoff/TIANYI_R2_2B1_PHASE_CLOSURE_R1.md:7` | `/tmp/TIANYI_STORY_INTAKE_R0_pre_R1_a401046.patch` | `/tmp` 文件，必然已消失 |
| `项目目录导航.md:189` | `apps/story-studio/src/components/CardWorkbench.tsx` | 树内与盘上都没有 → "改资料卡片显示"这一行的定位是死的 |
| `项目目录导航.md:188` | `apps/story-studio/src/components/Creation*` | 真实目录是小写 `components/creation/` → 大小写错 |
| `docs/operations/TIANYAN_HK_REVIEW_DEPLOYMENT.md:7-9` | TLS 证书 + 443 server block | `ops/tianyan-review/` 只有 80 端口两份 conf（`nginx-http.conf`、`nginx-default-deny.conf`），**缺第三个配置文件**；而 `scripts/deploy-tianyan-review-server.sh:164` 探测 `--resolve host:443` |

**跨 worktree 的总量**：15 个 worktree 里，`tianyan-map-m2`（12 个独有 data 目录）、`tianyan-map-m4-closeout`（3 个，590 文件）、`tianyan-n2`（3 个）合计 **18 个证据目录从未出现在主检出**。

### 9.2 缺的类型化文档（按"是否已经有替代品"给出）

| 缺失项 | 判定 | 现有最近替代品 |
| --- | --- | --- |
| 顶层 `README.md` | **不存在**（基线也无） | `日常入口.md`（面向作者，非工程师）+ `项目目录导航.md:5-9` 使用顺序 |
| `CHANGELOG` / 发布说明 | **不存在** | 22 份 `data/**/工作日志.md`（17 跟踪 / 5 未跟踪）+ `docs/handoff/`。**注意：81 个任务目录里只有 22 个（27%）真的写了 `工作日志.md`**——`CORE.md` 规定的固定结构本身没人守 |
| 传输层 / API 契约 | **不存在** | `localTransport.ts` 3751 行（基线 3797）处理 **267 个不同 `basePath` 路由串**，无任何路由表文档 |
| 测试策略与分层 | **不存在** | 隐含在 `run-selected-tests.mjs:10-23` 与 `.github/workflows/verify.yml:23-28` |
| 数据模型 / Canon schema | **不存在**（部分） | `src/storyContracts/*` 是事实上的 schema，无文档化；`TIANYAN_WORKSPACE_LAYOUT_V1.md` 只覆盖工作区布局 |
| 持久化格式（`.tianyan` 便携包）规格 | **不存在**（部分） | `项目目录导航.md:166` 只写了"测试要验什么" |
| 新工程师上手文档 | **不存在**（部分） | 《系统地图》§7 是本会话补的阅读顺序，但它未提交、未经创始人确认 |
| 威胁模型 / 安全 | **不存在**（部分） | `TIANYAN_PRODUCT_CORE.md:2362`「安全与隐私」是原则条目；HK 手册 `:5-13` 是运维边界；没有攻击者模型、没有 `SECURITY.md` |
| 性能 | **不存在** | 全仓 `performance` 命中只在外部参考里 |
| 无障碍 | **存在但不完整** | `TIANYAN_PRODUCT_CORE.md:2238` 第 12 节 + `R0_SHELL_CONTRACT.md:49`；强制手段只有 4 条 `aria-*`/`role=` 断言 |
| 词汇表 | **存在** | `TIANYAN_PRODUCT_CORE.md:242` 起（15+ 术语，`:405` 命名锁定） |
| **"哪些文档权威、哪些已归档"的索引** | **不存在** | 本盘就是第一份。`项目目录导航.md:12-28` 分的是目录不是文档；除 FEATURE_INDEX 钉住的 8 份外，`docs/` 剩下 26 份（34 − 8）没有任何一份带状态标记 |
| 未提升决定的正式落点（§5 表右半边） | **不存在** | 女娲四层交互模型、女娲 UI 现状 R6→R6.1→R6.2、Entity Dock 四态九页签、世界脉搏首屏、作者秘密 LOCAL_ONLY、G1 两层语义、动态对象四态 + 女娲十条硬约束 —— 这 7 项散在 **36 份未跟踪 md** 里（§8.4），0 份在 `docs/`。另有 2 项（R11 观察配方、叙事编排权威合同）已提交但同样停留在 `data/`，未提升到 `docs/`。资料库统一组织方案（09-12）也在这 36 份里 |
| 机器校验文档新鲜度 | **不存在** | `validate-feature-index.mjs` 只校验路径存在；`sourceCommit: 19f3f276…` 不可解析也没人报错 |

## 10. 本盘的诚实边界

1. **只读，未做任何整理**：没有移动、重命名、删除、压缩、提交，也没有改 `.gitignore`。§8 的分级是判断记录，不是执行授权。
2. **未联网**：`docs/implementation/TIANYAN_R4_PI_ZERO_CALL_AND_NUWA_N1.md` 与 `ROADMAP:49-51` 里的 PR #4/#5、远端 CI 运行状态无法静态核实；HK 服务器是否真在跑未验证。
3. **截图/录像未打开**：702 个 png、95 个 webm 只按文件名、字节数与 md5 比较。判 EXPERIMENT/重复时用了 md5，但判视觉内容时没有——"哪个视觉目标更像创始人想要的"只能由人裁定。
4. **判 HISTORICAL/CURRENT 用的是静态一致性**（文档点名的路径/枚举/脚本名还在不在、被谁引用、提交日期）。它能抓出失效与漂移，抓不出"文字仍成立但意图已变"。这类段落我在 §2 与 §6.2 里显式标出，没有静默改判。
5. **密钥面**：42 + 39 个 `data/` 目录的 md/json/log/txt/jsonl/sse/patch 里未发现明文凭据赋值；命中的两处只是路径引用（`/etc/tianyan-review/…`），符合规则。**但这只覆盖当前内容——42 个含未跟踪文件的目录（其中 38 个整目录未跟踪）一旦准备 push，需要重新扫一遍。**
6. **状态词表是外部约束**：`MULTI_NODE_PREDICTION_IMPLEMENTATION_PLAN_R0.md`（半 CURRENT 半 OBSOLETE）、`DESIGN.md`（正文 CURRENT、女娲节 OBSOLETE）、`TIAN_YI_AGENT_MODE`（版本条目已过期）这类"逐段分裂"的文档被压成了一个值。分裂处一律写在 `是否影响未来开发` 列或 §6.2，不在此抹平。
