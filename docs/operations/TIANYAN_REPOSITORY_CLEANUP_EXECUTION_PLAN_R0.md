# 天衍 · 仓库资产整理执行计划 R0

> 状态：REFERENCE
> 作用域：全文。所有路径、字节、计数仅在 2026-09-18 22:40 +0800 于盘 `codex/world-materials @ f77b800` 成立（口径与复核命令见 `docs/research/TIANYAN_REPOSITORY_CLEANUP_AUDIT_R0.md` §0.4，下称「审计」）；执行任何一条之前必须按本文 §1.4 复跑核验，不得沿用冻结值。
> 基线：不依赖代码改动。输入 = 审计 + `docs/research/TIANYAN_DOC_CLEANUP_PLAN_R0.md`（下称「清理计划」）+ `docs/operations/TIANYAN_PROJECT_GOVERNANCE_R0.md`（下称「治理」）。
> 取代关系：—（不取代审计与清理计划；本文只把二者转译为人工执行顺序，全部分类与判定回指原文，不双写——G-3.10/G-3.11）
> 依据：2026-09-19 用户指令（生成执行计划；不删除、不移动、不改代码、不提交 Git）。规则依据治理 §3.1/§3.9/§4/§8/§10、`AGENTS.md` 受保护数据条、`CORE.md` `data/` 形状。落点 `docs/operations/` 按用户指令与 G-3.3「运维、部署、切换」行。

---

## 0. 本文定位（先读三句）

1. **本文一条删除都不安排。** 审计 §6.4 的全部 P3 候选与一切"移除、退役、处置掉"语义的动作，在本文统一写成 **待人工确认**，并全部排在 §5 顺序表的最末段；未获创始人逐条放行前，任何 Agent 都不得执行。
2. **本文不新增分类体系。** 只沿用审计的六动作词（`不动`/`登记`/`入库`/`标状态`/`可压缩`/`待放行`）、A/B/C/D 分类、五桶与 P0–P3，以及治理的规则编号。凡本文与审计逐行判定不一致处，以审计逐行判定为准。
3. **自指声明。** 本文落盘前 `docs/` 未跟踪为 17 份（2026-09-19 实测复核）；本文落盘后变为 18 份。本文引用的全部计数是冻结时刻值，本文每被编辑一次，`docs/` 相关计数即漂移一次——执行前一律重算（G-6.3/G-6.6）。

---

## 1. 第一部分：执行原则

### 1.1 四步顺序（总闸，不可跳步、不可倒序）

| 步 | 名称 | 动作定义 | 放行人 | 完成凭据 |
| --- | --- | --- | --- | --- |
| 1 | **先入库** | `git add` 已存在的文件，**原地**：不移动、不改名、不改写内容。入库前按 G-4.8 区分"未跟踪"与"被忽略"，按 G-4.11 重扫凭据面；同一切片的 `data/` 与文档进**同一次提交**（G-4.9）。 | 创始人放行批次（清理计划 A1 / G-10.2 第 5 项） | 提交 SHA + 工作日志记录 |
| 2 | **后标状态** | 按审计 P1 清单就地加状态：`docs/` 用 G-3.4 状态块，`data/` 报告用 G-3.5 两行（`基线：`＋`结论落点：`），缺 `工作日志.md` 的目录补日志（G-4.2：补日志而不是删证据）。只增不删；历史正文一字不改；不移动。 | 创始人放行批次 | 状态块/两行在盘中可见 |
| 3 | **再压缩** | 仅对**可重生成且已在其 `工作日志.md` 登记重生成方式**（G-4.5 可核验条款）的重型产物；与所属目录**同一次提交**处置；`.webm` 整体不在其内（审计 §6.3：人工验收唯一凭据，不建议）。 | 创始人逐项 | 每项独立提交 |
| 4 | **最后逐项放行** | 一切删除语义动作（移除多余副本、移除 trace.zip、变体目录处置、退役脚本、0 字节件处置、被 ignore 的 49 件处置）＝ **待人工确认**：逐条、不批量、每条一个独立提交、前置按审计 §6.4「唯一合法路径」。 | 创始人**逐条** | 书面回执，落 ROADMAP 冲突/否决表 |

### 1.2 回滚语义两分法（决定"什么先入库"）

- **默认：先入库。** 未跟踪内容只有进了 Git 才谈得上可恢复；之后的移除动作都是对已跟踪内容的 `git rm`＋提交，随时 `git revert` 找回。凡"将来可能被放行移除"的普通文件，一律先入库再谈处置。
- **唯一例外：先裁定后入库。** G-4.5 明判禁存的可重生成重型物——两件 `trace.zip`（合计 45,386,608 B，实测**从未被跟踪**）一旦 `git add` 即 45 MB 永久进历史，事后移除需要改写历史的高危手术。它们保持未跟踪原状，其去留与所在目录的入库**同一次裁定**（审计 P0 第 4 项：不可单独处置）。

### 1.3 全局禁止清单（任何阶段、任何会话都不得）

| # | 禁止 | 理由 |
| --- | --- | --- |
| 1 | `git clean`（任何参数组合，含 `-n` 预演后的真实执行） | 17 份未跟踪 `docs/` + 485 件未跟踪 `data/`（含 9 项 D 级决定）一次即永久丢失（G-4.10、审计 §2.5） |
| 2 | 批量删除（按模式、按清单、按脚本的一次性多件删除） | 用户纪律 + G-2.26 精神：删除只逐条放行 |
| 3 | 自动删除 `data/`（按 age、size、规则的任何自动化清理） | `AGENTS.md` 受保护数据条：`data/` 702 png + 95 webm 是创始人体验录像与截图 |
| 4 | 移动、改名、压缩包化 G-3.19 不可移动清单（8 份 LINTPIN md、被路径钉住的 10 个 `data/` 目录）及 §3.0 排除面 | 动 = `npm run lint` 红或权威文档死链（G-8.2 禁止重造死链） |
| 5 | `git add -f` 绕过 ignore（`.gitignore:14` 改根锚定裁定前） | 被 ignore 的 49 件是否该入库 = 清理计划 A4，创始人裁定 |
| 6 | 把 `UNKNOWN` 猜成 `CURRENT`；把"入库"当"采纳"；把技术测试通过表述为创始人体验验收通过 | G-3.4、G-5.6、`AGENTS.md` 最后一条 |
| 7 | 在 C2（视觉目标唯一化）裁定前往女娲视觉链写任何生产视觉代码、改写任何视觉结论 | G-4.13 冻结 |
| 8 | `git worktree prune`、删除任何分支或 worktree | 属执行动作，前置 G-2.22/G-2.26 未核验；不在本计划射程内 |

### 1.4 每次执行会话的通用前置（复跑核验，全部实测、不采信旧值）

```bash
pwd && git rev-parse HEAD                       # 基线是否仍是任务卡声明值（G-6.3）
git status --porcelain                          # 脏度（G-6.3）
git -c core.quotepath=false ls-files --others --exclude-standard docs | wc -l   # 未跟踪 docs 现值
git -c core.quotepath=false ls-files --others --exclude-standard data | wc -l   # 未跟踪 data 现值
# 审计 §0.4 的全部命令按需复跑刷新计数；全程 -c core.quotepath=false（G-6.6，中文路径口径）
```

外加四条纪律：

1. `npm run *` 必须在 Node 22 规范运行时下执行（审计 §7.4：默认 v24 会 `BLOCKED=CANONICAL_RUNTIME`）；构建/测试按既有 Worktree 整合协议在隔离目录进行，不覆盖日常 4192 服务的 dist。
2. 每次执行会话 = 一个切片：开本会话自己的 `data/YYYY-MM-DD_任务名称/` 目录（G-2.6），`工作日志.md` 首段写切片 ID 与分支名，日志附 G-6.11 读取清单（本次读了哪些文件、取自哪个 ref、发现的不符之处）。
3. 动手前先打印排除面：G-3.19 的 8 份 LINTPIN（审计 §2.4）、路径钉住的 10 个 `data/` 目录（审计 §6.1a）、C2 冻结面（G-4.13 四源）。这三张表命中者只可入库与标状态，不可移动/改名/改写结论。
4. 遇冲突停：文档与代码、两份文档对同一问题结论相反时，不投票不取新者，按 G-6.10 停下登记冲突表请求裁定。

### 1.5 通用回滚原则

| 情形 | 回滚方式 |
| --- | --- |
| 入库/标状态/登记类提交 | `git revert <sha>`（逐条）；未推送且无他人依赖时 `git reset` 亦可 |
| 已放行的移除类提交 | `git revert <sha>`——因为按 §1.2，被移除内容必然先已入库，历史里有完整副本 |
| 状态块/两行写错 | 直接改状态块本身（G-3.4 细则），历史正文不动 |
| 误将 trace.zip `git add`（未提交） | `git reset HEAD <path>`，文件原样留在盘上 |
| 误将 trace.zip 提交 | 停止，回报创始人裁定（改写历史属高危动作，不在本计划授权内） |
| 变体目录处置后反悔 | 若按 §3.4 先入库后处置，`git revert` 即整体找回 |

---

## 2. 第二部分：docs 整理计划

### 2.0 总则

`docs/` 在盘 48 份（冻结时刻）＝ A 22 + B 17 + C 8 + 权威图 1，**D 类 0 份、无重复文件、一份都不可丢**（审计 §2.3/§2.5）。因此本部分只有三种动作：**保留**（零动作或条内标注）、**入库**（`git add` 原地）、**就地标状态**（G-3.4 状态块，不移动）。全部 17 份未跟踪文件入库前，任何"清理未跟踪文件"类操作都是 P0 事故（审计 §6.1 第 8 项）。

### 2.1 先读的排除面（动手前打印）

- **LINTPIN 8 份**（G-3.19，动 = lint 红）：审计 §2.4 全表——`docs/` 内 6 份（MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES、PROVIDER_CATALOG、R0_6_AGENT_TEXT_VERTICAL_SLICE_PRE_IMPLEMENTATION_MAP、R0_SHELL_CONTRACT、RUNTIME_MODE_AND_SINGLE_ENTRY、R4_PI_ZERO_CALL_AND_NUWA_N1）＋ 代码区 1 份（`apps/story-studio/src/settings/agent/INTEGRATION_REQUEST.md`）＋ `data/` 1 份（`data/2026-09-03_天衍R12B2_1叙事编排权威合同/` 内那份合同）。
- **被路径钉住的 `data/` 目录 10 个**（审计 §6.1a，改路径 = 权威文档死链）：只能入库与标状态，禁移动/禁改名。

### 2.2 A 必须保留（22 份 + 1 权威图，动作＝保留，零删除零移动）

| 文件 | 保留动作细则 | 风险 |
| --- | --- | --- |
| `docs/architecture/FEATURE_INDEX.json` | 已在库。`sourceCommit`（`19f3f276…`）本仓不可解析 → **就地重算并刷新**（审计 §2.2），不新建第二索引（清理计划 §一） | 重算值要当场 `git cat-file -e` 核验（G-3.15） |
| 6 份 LINTPIN md（名单见 §2.1） | 禁移动；其中 `R0_6_AGENT_TEXT_VERTICAL_SLICE_PRE_IMPLEMENTATION_MAP.md` 已 OBSOLETE 但只允许**头部加一行**"已被插件运行时取代" | 多改一个字都可能碰 index 契约测试 |
| `docs/product/TIANYAN_ROADMAP.md` | 保留；作为 G-5.3 登记行与冲突表的落点，会被后续步骤反复追加 | 只增行，不改既有行 |
| `docs/product/DESIGN.md` | 保留；`:40-45` 女娲节、`:48-52` 地图段冻结，等 C2 裁定后一次性改准（清理计划 §一） | C2 未裁前任何"顺手更正"都是违规 |
| `docs/product/TIANYAN_MULTI_NODE_PREDICTION_IMPLEMENTATION_PLAN_R0.md` | 保留；`:24-42` 门禁段独有且有效，`:82-144` 段级标 OBSOLETE（留在原文件内，不拆文件） | 段级标注必须写进状态块 `作用域`（G-3.4 允许逐段分裂） |
| `docs/research/WEBNOVEL_WRITER_REFERENCE_MAP_R0_6.md` | 保留；`:126-132` GPL 红线与 `:86-100` 选型前置是已生效门禁（G-5.7） | — |
| `docs/operations/TIANYAN_DAILY_4191_4192_UPGRADE_RUNBOOK.md` | 保留；`:9`「最终候选」占位需补实值（按 G-3.16 写可核验表达式，不写会过期的值） | — |
| `docs/operations/TIANYAN_HK_REVIEW_DEPLOYMENT.md` | 保留；加一行指向 `ops/tianyan-review/*.conf`（不搬文件） | — |
| `docs/implementation/TIANYAN_R4_PI_ZERO_CALL_AND_NUWA_N1.md` | 保留（LINTPIN）；Provider 预算与 N1 边界以它为准 | — |
| 其余 11 份 A 类（SMOKE_COMMAND_R0、R0_6_1_PLUGIN_ABI、TIAN_YI_AGENT_MODE、TIANYI_R2_2B1_PHASE_CLOSURE_R1、DEV_SUGGESTIONS_R0、NUWA_RUN_AND_MULTIVERSE_BOUNDARY、VISUAL_WORLD_EVOLUTION、WORKSPACE_LAYOUT_V1、MEMORY_BOUNDARIES、RUNTIME_MODE、REFERENCE_CATALOG） | 零动作保留；`REFERENCE_CATALOG` 需追加 R25–R30 六项登记行（清理计划 §一，G-5.3） | — |
| `docs/design/references/tianyan-r0-5-founder-character-directory.png` | 零动作（1.67 MB，`design-qa.md` 以 SHA-256 钉住）；C2 未裁前不得自称"当前目标" | 体积占 `docs/` 六成，但被钉住 → 不动 |

### 2.3 B 需要入库（17 份未跟踪，动作＝`git add` 原地入库）

| 文件 | B 字节 | 前置 | 入库后配套动作 | 风险 |
| --- | --- | --- | --- | --- |
| `docs/research/TIANYAN_REPOSITORY_CLEANUP_AUDIT_R0.md` | 69,875 | 无 | 在 ROADMAP 登记一行（G-5.3） | 自身体积随编辑漂移 |
| `docs/research/TIANYAN_DOC_CLEANUP_PLAN_R0.md` | 35,858 | 无 | 同上 | — |
| `docs/research/TIANYAN_SYSTEM_MAP_R0.md` | 46,961 | 无 | — | 它按基线 `93f41aa` 取行号，读者勿把行号用于工作树（G-5.5） |
| `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` | 56,938 | 无 | 入库后**同批补齐**其 §2 漏掉的 11 份在盘件（只增条目，不删旧条目） | 与本文计数互为函数 |
| `docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` | 58,819 | 无 | — | §5.3 的 23 组假功能清单是防假按钮权威，不得整段改写 |
| `docs/research/TIANYAN_UI_REFERENCE_LIBRARY_R0.md` | 46,740 | 无 | 在 `TIANYAN_REFERENCE_CATALOG.md` 补 R25–R30 登记行（G-5.3，否则等于没做过） | — |
| `docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` | 73,246 | 无 | 施工顺序段显式标"建议，未冻结"（G-5.1） | — |
| `docs/handoff/TIANYAN_CURRENT_STATE_SNAPSHOT_R0.md` | 46,018 | 无 | — | 快照内容随时间过期 → 状态块写明快照时刻 |
| `docs/handoff/TIANYAN_NEXT_CODEX_ENTRY_R0.md` | 44,590 | 无 | — | 自称"总入口"须被上游承认（G-3.1）；它已自带限定声明，是最合规模板 |
| `docs/handoff/TIANYAN_IMPLEMENTATION_ROADMAP_R0.md` | 113,297 | 无 | 需被 `TIANYAN_ROADMAP.md` 承认一行，否则按 G-4.10 视为不存在 | 与账本的施工口径差异要在承认行里写清 |
| `docs/product/TIANYAN_CHARACTER_AGENT_PRODUCT_DESIGN_R0.md` | 61,987 | 无 | §7 各项须创始人书面裁定后才进实现 | 引用面仅 1 处且来自未跟踪件 |
| `docs/product/TIANYAN_PRODUCT_MAP_VISUAL_R0.md` | 37,361 | 无 | 头部补"派生视图，权威为 `TIANYAN_PRODUCT_CORE.md`，核对日期"一行；CORE §八 每次改动回扫它 | 派生视图必然滞后上游 |
| `docs/product/TIANYAN_WORLD_WORKBENCH_PRODUCT_DESIGN_R0.md` | 59,808 | 无 | — | 自报 R4 基线已否决 → 只入库不采纳 |
| **待裁 4 份（先裁后入库）** | | | | |
| `docs/operations/TIANYAN_PROJECT_GOVERNANCE_R0.md` | 45,515 | **A3**：治理落点（`docs/operations/` 还是根级）未裁 | 裁定后入库；其 §9 的 `docs/` 计数（31+5）已过期，入库时按当日实测刷新 | G-10.3 禁止另起"治理 R1"，位置一旦漂移会长出第二份 |
| `docs/research/TIANYAN_DESIGN_PRINCIPLES_R0.md` | 18,581 | **A3**：落点（`docs/product/` 或并入 `DESIGN.md`）未裁；"先查本文"是权威自称，G-5.6 未确认不得为权威 | 裁定后入库；确认前 §13"三问"只作建议 | 入库 ≠ 采纳 |
| `docs/product/TIANYAN_AGENT_EVOLUTION_ROADMAP_R0.md` | 63,406 | **A3**：落点（研究→`docs/research/`？）未裁；与 V2 研究同题需 G-5.4 差量声明 | 裁定后入库＋补差量声明 | — |
| `docs/handoff/TIANYAN_CODEX_FIRST_EXECUTION_PACKAGE_R0.md` | 15,293 | **C1**：其作业基线（`codex/world-workbench-r4 @ d16563b`）已被 PR #29 否决，与 `TIANYAN_NEXT_CODEX_ENTRY_R0` 互相冲突 | 先裁 C1 再入库；任务内容仍可用 | 未裁前按 G-3.13 双方都不得作施工依据 |

**执行方式**：13 份直接入库一批（一批一提交，可 revert）；4 份待裁件在 A3/C1 裁定落表后各自一批。入库是"让它存在"，不是"让它生效"（G-4.10/G-5.6）——所有 B 类文档在被上游承认前对下游仍不构成权威。

### 2.4 C 标历史状态（8 份已在库，动作＝就地加状态块，不移动不删除）

| 文件 | 就地标注内容（G-3.4 状态块） | 风险 |
| --- | --- | --- |
| `docs/product/TIANYAN_EVENT_WORKSPACE_R9_FOUNDER_REVIEW_EVIDENCE.md` | HISTORICAL——其分支与 Draft PR #2 已被现链吞并，本文是唯一判决留痕 | 它是唯一留痕，正文一字不动 |
| `docs/product/WORLD_MATERIALS_M1_PLAN.md` | HISTORICAL（`:19` 已自述补齐、`:39` 已移交 runbook） | — |
| `docs/product/TIANYAN_MATERIALS_MANAGEMENT_M2_IMPLEMENTATION.md` | HISTORICAL（M1→M2 三份里唯一有实质 Owner 内容） | — |
| `docs/product/TIANYAN_MATERIALS_M2_DAILY_UPGRADE_DELTA.md` | OBSOLETE——停止引用，切换一律读 runbook | — |
| `docs/architecture/TIANYAN_R0_3_1_ACTIVE_TREE.md` | HISTORICAL——清理前可达图，唯一记录"哪些真被删了"的账；停止作为现状引用 | — |
| `docs/architecture/TIANYAN_LEGACY_KEEP_REWRITE_REMOVE_R0.md` | `:38/:39` REMOVE 项已消失 → 头部加"决策已执行完"一行 | — |
| `docs/handoff/TIANYAN_R0_5_TO_R0_6_MEMORY_HANDOFF.md` | `:69`"从 fetch 后的 origin/main 开始"**就地标失效**（照做会丢 44 个提交）；五条冻结项仍有效 | 标注必须逐行精确，不能整篇降级 |
| `docs/research/TIANYAN_MAINLINE_LINEAGE_AND_CAPABILITY_REALITY_MAP_R0.json` | OBSOLETE——头部加"快照日期 2026-08-25，非现状"；`项目目录导航.md:125`"测试输入"说法待更正（改导航不改本文） | json 头部加注释行需符合 json 语法 → 若无法合法注释，改用 `项目目录导航.md` 登记行承载 |

### 2.5 docs 部分风险汇总与回滚

| 风险 | 缓解 | 回滚 |
| --- | --- | --- |
| 入库把不该公开/含凭据的内容带进历史 | 每批入库前 G-4.11 凭据重扫（不沿用旧结论） | revert 提交；已 push 则立即报告创始人 |
| 状态块覆盖历史正文 | 只增状态块，正文字节不动 | revert |
| 4 份待裁件被"顺手"直接入库 | 批次清单写死 13 份名单，多一份即停 | revert |
| 中文路径转义导致 `git add` 漏件 | 全程 `-c core.quotepath=false`，`git status` 复核 | 补 add 即可 |

---

## 3. 第三部分：data 整理计划（四阶段）

### 3.0 总则与排除面

- `data/` 1046 文件 / 81 目录 / 416,908,543 B（Σ st_size 口径）。**不存在"安全的自动清理面"**（审计 §3.5）：0.2% 体积的 md 承载 9 项 D 级决定；52.2% 体积的 webm 是人工验收唯一凭据。
- **排除面（四个阶段全程有效）**：① G-3.19 钉住的 10 个目录——只可入库与标状态（其中 `2026-09-05_天衍G1自适应任务主工作面` 48/48 未跟踪、canonical R5_M6 1 件未跟踪，正是"路径已写进权威文档、内容却等于不存在"的最高危组合，必须入库）；② C2 四源（R6_2、R6、R6_1、R4_1）——可入库＋可提升，但**移动、改名、删除、改写视觉结论四件事都不许**（G-4.13）；③ R5_M6 七变体 ＋ R3_1C 三兄弟 ＋ `女娲工作面统一R5`（0 字节空壳）——**暂缓入库**，保持未跟踪原状，归阶段 4；④ 被 `.gitignore:14` 吞的 49 件——A4 裁定前不碰（`git add -f` 也在禁令内）。

### 3.1 阶段 1：入库与补状态（内容零改动）

**目标**：把"对下游等于不存在"的内容变成存在（G-4.10），把历史目录的状态说清楚（G-3.5/G-4.2）。全程不改任何既有文件内容、不移动、不删除；这是四步原则中"先入库＋后标状态"两步的落地。

**输入**（冻结时刻清单，执行前复跑）：

- docs 侧：§2.3 B 类 17 份、§2.4 C 类 8 份。
- data 侧需 `git add` 的目录（清理计划 §3.1 的 16 行 19 目录取其未跟踪件 ＋ 审计 §3.2/§3.3 判"入库/标状态"且仍有未跟踪件的目录，共 27 个）：

| # | 目录 | 未跟踪件 | 备注 |
| --- | --- | --- | --- |
| 1 | `2026-09-05_天衍G0产品设计与现场核对/` | 2 | D 级：G1 选 A ＋ 6 条冻结原则只在这里 |
| 2 | `2026-09-11_MEM-A1a-按问题检索故事依据/` | 2 | Gate Event Reference 上限 24 只在这里 |
| 3 | `2026-09-16_天衍动态对象与世界观改造手册R0/` | 2 | D 级：动态对象四态投影路线 |
| 4 | `2026-09-16_天衍女娲分支与节点改造评估R0/` | 2 | D 级：女娲十条硬约束 |
| 5 | `2026-09-05_天衍G1自适应任务主工作面/` | 48 | 路径被 `design-qa.md:7-10` 钉住（G-3.19） |
| 6 | `2026-09-06_天衍G1-R2连续作者工作面/` | 58 | 两层语义唯一书面来源 |
| 7 | `2026-09-07_天衍R5_M6连续交互证据/`（canonical） | 1（2.3 MB webm） | 路径被 `ROADMAP:87` 钉住，只补这一件 |
| 8 | `2026-09-08_天衍R5固定稿二次打开首因/` | 16 → **剔除 2 件 trace.zip 后 14** | 首因链 D 级；trace.zip 归阶段 3 |
| 9 | `2026-09-15_天衍真实AI审阅闭环R1/` | 1（311 KB verify `.log`） | 其余 29/30 已在库 |
| 10 | `2026-09-15_日常服务切换主目录/` | 38 | 运维切换链 |
| 11 | `2026-09-17_角色磁吸详情工作台R0/` | 10 | Entity Dock 四态九页签设计来源 |
| 12 | `2026-09-17_女娲入口与交互模型评估R2/` | 11 | 四层交互模型＋零自动触发铁律 |
| 13 | `2026-09-17_女娲R6_2微打磨/` | 7 | **C2 四源** |
| 14 | `2026-09-17_女娲作者工作面视觉重构R6/` | 20 | **C2 四源** |
| 15 | `2026-09-17_女娲聚焦与响应式打磨R6_1/` | 11 | **C2 四源** |
| 16 | `2026-09-17_女娲视觉证据收尾R4_1/` | 27（另 2 件被 ignore，gate A4） | **C2 四源** |
| 17 | `2026-09-18_天衍世界观工作台R4/` | 33（另 2 件被 ignore，gate A4） | 入库为证据；PR #29 已否决 → 禁作施工起点 |
| 18 | `2026-09-18_混合语义检索R3_1/` | 10 | D 级：出站隐私边界 |
| 19 | `2026-09-15_天衍真实AI作者闭环R2/` | 0 | 已在库，仅标状态（U1 证据，58/58 跟踪） |
| 20 | `2026-09-17_女娲工作面视觉重构R1/` | 18 | 历史 → 入库后标 HISTORICAL |
| 21 | `2026-09-17_女娲分支浏览器验收R2/` | 12 | 历史 → 入库后标 HISTORICAL |
| 22 | `2026-09-18_R3_1B视觉与GitHub收口/` | 15 | 历史 → 入库后标 HISTORICAL |
| 23 | `2026-09-18_世界构建因果演化工作台R2/` | 12 | 历史 → 入库后标 HISTORICAL |
| 24 | `2026-09-18_混合语义检索与世界工作台R3/` | 12 | 降 HISTORICAL，注明 `R3_1/` 为权威 |
| 25 | `2026-09-17_天衍R5构建身份与路由一致性/` | 8 | 历史 → 入库后标（无结论 md） |
| 26 | `2026-09-06_天衍R4-R2布局与上下文验收/` | 4 | 历史 → 入库后标（无结论 md） |
| 27 | `2026-09-17_女娲分支纵向切片夜段一/` | 2 | 历史 → 入库后标 |

已确认"入库是空动作"的三个目录（`2026-09-02_R11事件观察工作台`、`2026-09-03_R12B2_1叙事编排权威合同`、`2026-09-04_单根仓库收口`）只剩"提升正文进 `docs/`"——提升动作见下文第 4 条，**不在本阶段执行**。

**输出**：

1. 上述目录的全部非排除件进入 Git 跟踪（分批提交：建议按 D 级内容目录 → 视觉四源 → 历史目录三批）。
2. 补状态件（与入库同批或紧随其后一批）：
   - C 类 8 份 docs 状态块（§2.4 全表）。
   - 审计 §6.2 的 **2026-08 系列 11 目录**标 HISTORICAL（以审计 §3.2/§3.3 逐行建议为准；其中被路径钉住者只补状态、不降级引用关系）。
   - 女娲证据链 `R1/`、`R5/`、`R5A/`、`R6_1/` 标"HISTORICAL，现状见 R6_2"（`R6_2` 为现状权威；`R5` 只有 0 字节 patch、`R5A` 无报告 → 补 `工作日志.md` 说明而非改报告）。
   - **9 个"有媒体、目录内零 `*.md`"目录补 `工作日志.md`**（2026-09-19 复核实测，61 文件 / 11,498,417 B，与审计 §3.4/§6.2 逐字节吻合）：`2026-08-29_天衍工作台R0_2顶栏与天意模式视觉修复`、`2026-08-29_天衍R0_6存储Agent外壳集成`、`2026-08-29_天衍R0_6角色目录信息密度修复`、`2026-09-05_天衍R2_2A工作面壳层`（整目录被 ignore，gate A4）、`2026-09-06_天衍R4-R2布局与上下文验收`、`2026-09-07_天衍R5_M4关系证据`、`2026-09-17_女娲统一工作面R5A`、`2026-09-17_天衍R5构建身份与路由一致性`、`2026-09-18_R3_1C_UI收口`（同时属变体集，处置归阶段 4）。
   - 6 件 0 字节产物（1 patch ＋ 1 工作日志 ＋ 4 webm）：在所在目录补日志**说明为何为空**（审计 §6.4）；处置本身＝待人工确认。
   - `apps/story-studio/src/settings/storage/INTEGRATION_REQUEST.md` 加"已完成"一行（请求已被 `ShellWorkspaceOutlet.tsx:5` 实现）。
3. **登记（不执行）**：9 项 D 级决定的提升清单（清理计划 §3.1 第 1/3/8/10/11/12/13/14/16 行）→ 逐项写进 ROADMAP 登记，等 A6 放行后按 G-3.7"一次提交三件套"执行（见 §5 顺序第 9 步）。

**风险**：

| 风险 | 缓解 |
| --- | --- |
| trace.zip 随目录整批 `git add` 进历史（45 MB 永久） | 第 8 行目录**必须显式排除**两件 zip；`git status` 复核暂存区 |
| 凭据/密钥混入 | 每批 G-4.11 重扫；`.env`/正文/数据库类文件一律不 add |
| 49 件被 ignore 件被误 `add -f` | 禁令 §1.3 第 5 条；A4 未裁不碰 |
| C2 冻结面被改写 | 四源目录只 add 媒体与既有报告，不改任何视觉结论字句 |
| webm/大图入库使仓库变胖 | 这是可逆性代价，接受；但变体十目录不入库（暂缓）控制总量 |
| 中文路径漏 add | `-c core.quotepath=false` ＋ 提交前后 `git status` 对账 |

**回滚方式**：整批按提交粒度 `git revert`；由于内容零改动，revert 后工作树与执行前逐字节一致。补状态件（新增的状态块/日志文件）随其所在提交一起 revert。未提交的暂存用 `git reset HEAD <path>`。

### 3.2 阶段 2：重复媒体处理

**目标**：把 76 组逐字节重复媒体的归属与保留侧裁定清楚，形成逐组放行材料。**本阶段不移除任何字节**——移除属删除语义＝待人工确认（§5 第 10 步）。

**输入**：审计 §3.1 桶③ / §3.4——76 组 / 111 件多余副本 / 19,605,854 B（跨目录 52 组 87 件 16,019,190 B；同目录 24 组 24 件 3,586,664 B）。实测重灾区：`地图管理与AI共同编辑M4` ↔ `核心导航与作者便捷性整合` 整批相同 png（两者均已在库）；`女娲工作面视觉重构R1` 与 `R4_1` 有 4 份相同"改造前"png；`R3_1B` 与 `混合语义检索R3_1/证据/` 有 2 份相同 png。

**输出**：

1. 逐组 md5 清单（组内每件路径、所在目录、建议保留侧、建议移除侧），写进执行会话的 `data/` 任务目录（按 `CORE.md` 形状），并登记一行进 ROADMAP（G-5.3）。
2. 保留侧裁定规则（供放行人参考，不自动执行）：canonical/被钉住目录 > 历史目录；已在库 > 未跟踪。`R5_M6` 变体与 `R3_1C` 目录**内部**的重复组不单独出清单（整个目录的处置归阶段 4，避免同一文件被两个动作碰两次）。
3. 4 对逐字节相同的 `固定稿A-回溯前/后…md` **明确不处理**——"回溯前后内容完全相同"本身就是证据（清理计划 §3.3 末行）。

**风险**：保留侧选错（钉住目录的件被当作多余副本）→ 清单必须把 G-3.19 钉住面作为硬约束字段；变体目录内组被误登记 → 阶段 4 未结前跳过。

**回滚方式**：本阶段只产出清单文件，`git revert` 清单提交即可，媒体零接触。

### 3.3 阶段 3：trace.zip 处理

**目标**：让两件 G-4.5 禁存物**不进入 Git 历史**，并补齐 G-4.5 的日志义务；把移除决定打包成待人工确认项。

**输入**：`data/2026-09-08_天衍R5固定稿二次打开首因/验证/修复前/trace.zip`（21,979,782 B）＋ `…/修复后/trace.zip`（23,406,826 B）；2026-09-19 实测**两者均未被跟踪**。属审计桶⑤，是全仓可回收最大单体（合计 43.4 MiB）。

**输出**：

1. 阶段 1 对该目录入库时**显式排除**两件 zip（保持未跟踪、留在盘上原位）。
2. 该目录补 `工作日志.md` 时按 G-4.5 可核验条款写明：哪些件可重生成、重生成方式——重生成命令必须**当场实测可复现**后才写（G-3.15），不得凭记忆写命令。
3. 移除提议（含"与所在目录入库/提升同一次提交处置"的约束，审计 P0 第 4 项）→ 写进待人工确认清单（§5 第 10 步）。**在创始人放行前，这两件既不删除也不入库。**

**风险**：误 `git add`（45 MB 永久进历史）→ 暂存区复核；若已提交按 §1.5 停止上报。放行移除时单独删 zip 而不动目录其他件 → 违反审计"同一次提交处置"约束，放行材料里要写明捆绑关系。

**回滚方式**：未跟踪状态零 Git 动作即零风险；误暂存用 `git reset HEAD`；已提交则停止上报创始人（不自行做历史手术）。

### 3.4 阶段 4：R5_M6 / R3_1C 变体整理

**目标**：把 G-4.4（后缀表达第 N 次尝试）与 G-4.3/G-4.4（同切片散多目录）违规的 10 个变体目录登记清楚、 canonical 裁定提请、入库作回滚保险；**处置（删除/合并）＝待人工确认**。

**输入**：

- `R5_M6` canonical `data/2026-09-07_天衍R5_M6连续交互证据/`（`ROADMAP:87` 逐路径钉住，不动）＋ 七变体：`-retry2`(11,615,072 B/12 件)、`-pass3`(5,155,577/9)、`-pass2`(4,273,780/9)、`-final`(4,098,758/8)、`-pass`(4,097,277/8)、`-debug`(3,544,998/8)、`…连续证据-retry`(3,391,144/7)——合计 61 文件 / 36,176,606 B，0 md、0 引用者。
- `R3_1C` 三兄弟：`…_R3_1C_UI收口/`(9 件/1,475,982 B，引用者 2)、`…_R3_1C_UI收口与证据/`(10/1,510,710，引用者 0)、`…_R3_1C证据与GitHub收口/`(7/12,144，引用者 0)——26 文件 / 2,998,836 B；9 png 中 6 份逐字节相同。

**输出**：

1. **差异比对清单**：每个变体目录与 canonical（R3_1C 则三目录互比）逐件比对（md5＋路径），标出"变体独有、canonical 没有"的件——变体 0 md 无法自证，比对是放行前置。
2. **归属登记**：把"canonical 的 attempt 变体"关系写进 ROADMAP 登记行与执行会话日志（清理计划 §3.3 的登记方案）。
3. **canonical 裁定提请**：R3_1C 三目录哪个算 canonical＝创始人裁定（审计明确"待裁定"，本文不代答）。
4. **入库作回滚保险**：比对完成、无独有结论缺失后，将 10 个变体目录整体 `git add` 入库（先入库原则的直接应用——之后任何放行处置都可 revert）。`R3_1C_UI收口` 引用者 2，入库同时消除"引用了不存在内容"状态。若创始人倾向整体不入库，则登记 `LOCAL_ONLY`（G-4.10 的另一合法出口），二选一，不静默。
5. **处置＝待人工确认**：七变体/三兄弟的删除或合并，前置＝审计 §6.4（G-2.26 五前置逐条过 → 创始人逐条放行），排在 §5 第 10 步。

**风险**：变体内藏 canonical 没有的独有证据（0 md 无法自证）→ 比对清单是硬前置，比对不全不入库不放行；入库使 36 MB 变体进历史 → 这是可逆性代价（与 §1.2 一致）；canonical 误判 → 只登记"关系"，不登记"谁对谁错"，裁决归创始人。

**回滚方式**：登记/比对件随提交 revert；变体入库后的一切处置都可 `git revert` 整体找回；未入库（LOCAL_ONLY 路线）时任何处置动作都不允许启动。

---

## 4. 第四部分：代码整理计划（不删代码）

### 4.0 总则

生产代码 442 个 `.ts/.tsx/.mjs/.cjs`（排除 `tests/`、`*.test.*`、`*.spec.*`、`node_modules/`、`dist/`）。**本部分零行代码改动**：只做索引补全与登记；"零 importer"不等于可删（审计 §4.2 口径声明）。工作树落后基线 93f41aa 44 个提交（审计 §7.3）——全部候选判定只对盘有效，C1 裁定切换基线后必须对基线重测。

### 4.1 FEATURE_INDEX 缺口（293/442 未登记）

| 项 | 内容 |
| --- | --- |
| 现状 | 149/442 在索引任何列表（`entrypoints`/`sourceFiles`/`tests`/`boundaries.*`）；**293 未登记（66.3%）**。最集中：`src/storyContinuity` 35、`src/storyContracts` 20、`src/storyCreation` 18、`scripts` 17、`src/storyIntelligence` 13、`src/storyWorkspace` 11、`server/providerGateway` 11、`apps/.../lib` 11、`src/storyControlSurface` 9、`src/skillControl` 8 |
| 动作 | ① `sourceCommit` 就地重算（当前值本仓不可解析）；② 缺口**分批补登记**：每批一个域，补进对应 feature 的 `sourceFiles`/`tests`，批后必跑 `npm run lint` ＋ `typecheck`（Node 22 运行时、隔离目录） |
| 顺序建议 | 先重算 `sourceCommit`；再按"域内文件最稳定者先行"分批，`scripts/` 一批最后（多属假阳性，见 §4.4） |
| 风险 | lint 只校验存在不校验新鲜（G-6.8）——补登记绿 ≠ 索引与现实一致；登记 ≠ 验收层级提升，成熟度字段不得顺手拔高 |
| 回滚 | revert 该批提交；`FEATURE_INDEX.json` 是单文件，批次间冲突面小 |

### 4.2 零引用候选（真候选 8 ＋ 空壳 2；动作＝只登记，不删不改）

| 文件 | 字节 | 登记动作 |
| --- | --- | --- |
| `src/storyContracts/characterFateProjection.ts` | 11,236 | 登记"零 importer 候选——命运契约已写完、零调用者"，处置（接线/退役）＝待人工确认 |
| `src/storyCreation/legacyNuwaCreationHandoffAdapter.ts` | 3,899 | 同上（名含 legacy，优先判退役意向） |
| `apps/story-studio/src/lib/skillRegistryProjection.ts` | — | 同上 |
| `apps/story-studio/src/lib/initialWritingFlow.ts` | — | 同上 |
| `apps/story-studio/src/lib/providerCredentialInput.ts` | — | 同上 |
| `apps/story-studio/src/worldObjectCatalog.ts` | 1,781 | 同上 |
| `apps/story-studio/src/product-shell/right-dock/DockResizeHandle.tsx` | 1,500 | 同上 |
| `apps/story-studio/src/hooks/useDocumentHistory.ts` | 1,385 | 同上 |
| `src/storyContracts/sourceImportReviewR0.ts`（空壳） | 148 | 类型转发层，**不是重复实现**；登记后不动作 |
| `apps/story-studio/src/vite-env.d.ts`（空壳） | 38 | 声明文件，永不清理 |

登记落点＝`docs/product/TIANYAN_ROADMAP.md` 债务/冲突表加行（不新建文档）。退役（删除）属代码改动＝待人工确认（审计 §6.4 同款约束）。

### 4.3 test-only 文件（14 件；动作＝逐个裁定"接线 or 登记"，代码不动）

`src/storyCreation/derivedEventLineR1.ts`(20,564)、`src/storyContinuity/tianyiRequestContextBudget.ts`(17,928)、`src/storyCreation/novelEventProposal.ts`(15,081)、`apps/.../lib/timelineProjection.ts`(10,660)、`src/skillControl/skillRecipeDraft.ts`(8,676)、`…/graphAuthoring.ts`(8,020)、`…/localDiagnosticService.ts`(6,006)、`src/storyAgent/piR4ValidationContract.ts`(4,236)、`src/storyCreation/{screenplayFormatAdapter, markdownDocumentModel, autosaveController, compositionBuffer}.ts`、`src/storyCardPresentation/characterCardHistoryProjection.ts`(2,856)、`apps/.../components/event-observation/eventLineFixture.ts`(14,351)。

- 每件二选一（待创始人/账本裁定）：接线进生产入口，或在 `FEATURE_INDEX.json` `tests` 列登记为测试专用。
- `eventLineFixture.ts` 是夹具住在生产目录 `src/components/` 下且索引未登记 → 至少完成登记（归 §4.1 批次）。
- 风险：它们有测试保护，删了会红——本计划本来就删不了；登记是让下一个人不再重测一遍。

### 4.4 obsolete 脚本（2 件；动作＝登记退役意向，删除＝待人工确认）

| 脚本 | 字节 | 状态 | 动作 |
| --- | --- | --- | --- |
| `scripts/tianyan-storage-inventory.mjs` | 7,259 | G-8.1 已判 OBSOLETE（硬编码外来 macOS 根、写向不存在的 `docs/ops/`、不在十脚本、0 消费者） | 不删；在 ROADMAP 登记退役意向；任何会话不得以其为参考格式（G-8.1） |
| `scripts/repo-doctor.mjs` | 4,716 | 同上 | 同上 |

其余 26/83 零 importer 的 `.mjs/.cjs` 绝大多数是假阳性（`server.mjs` 主服务、`bin/world-os-story.mjs` 兼容 CLI——`AGENTS.md` 明令保留、`scripts/*` 十脚本调用件、677 KB 专项 smoke）→ 不列候选。`src/` 根级两个过渡文件（`storyProductPrototypeState.ts` 32,466、`nuwaSceneRuntimeContracts.ts` 864）是 G-8.1 已确认整改对象，但其归位属重构不在清理射程 → 登记，不动。

### 4.5 明确禁区

`apps/story-studio/src/main.tsx`、`vite.config.ts`、`mjs-modules.d.ts`（入口/配置/声明假阳性，审计已显式排除）；`bin/world-os-story.mjs`；一切 `App.tsx`/`TianyanR0Shell.tsx` 责任区规则（`AGENTS.md`）约束下的代码。

---

## 5. 第五部分：未来 Codex 执行顺序（低风险 → 高风险）

### 5.1 顺序表

| 步 | 内容 | 对应章节 | 风险 | 放行门 |
| --- | --- | --- | --- | --- |
| 0 | 复跑核验（§1.4）＋ 打印排除面（LINTPIN/钉住面/C2 冻结面）＋ 开会话任务目录 | §1.4 | 0 | 无 |
| 1 | docs B 类 13 份直接入库（一批一提交） | §2.3 | 低 | A1（批次化，可整批 revert） |
| 2 | data 有效设计目录入库三批：D 级内容目录（表 1–6、9–12、18 行）→ C2 四源＋世界观 R4（13–17 行）→ 历史目录（20–27 行）；首因目录剔除 trace.zip | §3.1 | 低–中 | A1；G-4.11 每批重扫 |
| 3 | docs C 类 8 份 ＋ 2026-08 系列 11 目录 ＋ 女娲链/混合语义 R3 降级 ＋ 9 个补日志目录 ＋ 0 字节说明 ＋ storage INTEGRATION_REQUEST 完成行 | §2.4、§3.1 | 低 | 无（只增不改） |
| 4 | 阶段 2 重复媒体逐组登记清单（只登记） | §3.2 | 低 | 无 |
| 5 | 阶段 3 trace.zip：排除确认 ＋ G-4.5 重生成方式登记 ＋ 移除提议打包 | §3.3 | 中 | 无（移除本身在步 10） |
| 6 | 阶段 4 变体：差异比对 → 归属登记 → R3_1C canonical 提请 → 变体目录入库（或 LOCAL_ONLY） | §3.4 | 中 | canonical 裁定＝创始人 |
| 7 | 4 份待裁 docs 入库（A3/C1 裁定后各自一批） | §2.3 | 中 | A3 ×3、C1 ×1 |
| 8 | `FEATURE_INDEX.sourceCommit` 重算 ＋ 缺口分批补登记（每批 lint＋typecheck） | §4.1 | 中 | 无（机器验证兜底） |
| 9 | 9 项 D 级决定提升进 `docs/`（G-3.7 一次提交三件套，逐项独立提交） | §3.1 输出 3 | 中–高 | A6 逐项；进 `DESIGN.md` 女娲节者另需 C2 先裁 |
| 10 | **一切删除语义动作——全部待人工确认**：trace.zip ×2 移除、重复副本逐组移除（≤111 件）、R5_M6 七变体与 R3_1C 处置、49 件被 ignore 件处置（A4 先行）、2 个 obsolete 脚本退役、0 字节 6 件处置、`女娲工作面统一R5` 空壳处置 | §3.2–§3.4、§4.4 | 高 | **创始人逐条**；每条独立提交，前置按审计 §6.4 唯一合法路径 |

### 5.2 创始人放行门对照（执行前检查哪扇门还关着）

| 门 | 内容 | 阻塞的步骤 |
| --- | --- | --- |
| A1 | 未跟踪 docs/`data` 是否入库 | 步 1、2 |
| A2 | `docs/` 存放规则（导航 `:26`）是否修订 | 步 1 的合规性表述 |
| A3 | 治理/设计原则/agent-evolution 落点 | 步 7 |
| A4 | `.gitignore:14` 改根锚定 `/evidence/` | 步 2 的 4 件、49 件处置（步 10） |
| A5/C2 | 视觉目标唯一化 | 步 9 中女娲节提升；四源的一切结论改写 |
| A6 | 9 项 D 级决定提升 | 步 9 |
| C1 | 施工基线（执行包 vs NEXT_CODEX_ENTRY） | 步 7；基线一变，§4.2/§4.3 候选须重测 |
| G-10.2 第 6 项 | 分支/worktree 删除逐条放行 | 不在本计划射程（§1.3 第 8 条） |

### 5.3 执行纪律

- **每轮单一目标完成后停**：一步一个（最多一小组）提交，完成后停下回报，不把两步压进一个会话。
- 每步完成即在会话 `data/` 日志贴 G-7.1 收口清单勾选结果；交付附 G-6.11 读取清单。
- 步 10 的每一"条"都是独立放行请求：清单里写明对象、字节、差异比对结论、回滚方式、前置是否已过。**没有清单的移除请求不受理。**
- 任何一步发现与审计冻结值不符（文件数、跟踪态、引用者变化）：停，回报差异，不自行选择"看起来更新的那个"（G-6.3/G-6.10）。

---

## 6. 本文边界

| 本文做了 | 本文没做 |
| --- | --- |
| 把审计的 P0–P3 候选转译为四步原则、docs 三分类动作、data 四阶段、代码登记项、十步执行顺序 | 未删除、未移动、未修改任何既有文件；未提交 Git；未执行任何一条 |
| 全程沿用审计/清理计划/治理的既有分类与规则编号，未新增分类体系、落点或 Owner | 未裁决 C1/C2/A1–A6/R3_1C canonical——全部保持原状态并引来源（G-3.13） |
| 删除语义一律写"待人工确认"并集中于 §5 步 10 | 未给任何批量删除、`git clean`、自动清理留口子（§1.3 禁令） |
| 核实了三个执行关键事实：17 份未跟踪 docs 名单与审计一致；两件 trace.zip 从未入库；9 个补日志目录 61 文件 / 11,498,417 B 与审计逐字节吻合 | 未复跑审计全部计数（体积类数字沿用冻结值，执行前按 §1.4 重算） |

**自指声明**：本文属 B 类新未跟踪件，落盘即令"docs 未跟踪 17→18"；本文入库时应与 §2.3 步 1 批次同批或紧随，并在 `TIANYAN_REFERENCE_CATALOG.md` / `TIANYAN_ROADMAP.md` 各补一行登记（G-5.3）。执行过程中不回写本文的完成状态——完成标记只记在 ROADMAP 登记行与会话 `data/` 日志，本文保持冻结快照身份（G-3.11 禁双写）。
