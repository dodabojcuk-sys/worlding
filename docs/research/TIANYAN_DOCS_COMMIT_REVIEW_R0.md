# 天衍 · docs 入库批次提交前审查 R0

> 状态：REFERENCE
> 作用域：仅 2026-09-19 `codex/world-materials @ f77b800` 暂存区内的 13 份 docs 文件。审查动作全部只读；本文落盘不改变暂存区。
> 基线：HEAD `f77b800`（与执行计划冻结基线一致，与 origin 同步）。
> 取代关系：—（审查记录，对账快照 → `docs/research/`，G-3.2）
> 依据：任务 TIANYAN_DOCS_ONBOARDING_REVIEW_R0；名单来源 `docs/operations/TIANYAN_REPOSITORY_CLEANUP_EXECUTION_PLAN_R0.md` §2.3"13 份直接入库"。

## 结论：PASS —— 可以 commit

五项检查中四项零问题；引用核验发现的悬空/死引用全部属于**计划内时序**（4 份门控件待 A3/C1 裁定后入库）或**已在审计中自我声明的历史陈述**，无一阻塞本批次。提交动作本报告不执行，留给用户确认后的后续任务。

## 一、暂存文件列表（13 份，全部新增跟踪 `A`，内容与工作树逐字节一致）

| # | 文件 | 字节 | 行数 |
| --- | --- | --- | --- |
| 1 | `docs/research/TIANYAN_REPOSITORY_CLEANUP_AUDIT_R0.md` | 69,875 | 617 |
| 2 | `docs/research/TIANYAN_DOC_CLEANUP_PLAN_R0.md` | 35,858 | 213 |
| 3 | `docs/research/TIANYAN_SYSTEM_MAP_R0.md` | 46,961 | 342 |
| 4 | `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` | 56,938 | 393 |
| 5 | `docs/research/TIANYAN_UI_VISUAL_ANALYSIS_R0.md` | 58,819 | 355 |
| 6 | `docs/research/TIANYAN_UI_REFERENCE_LIBRARY_R0.md` | 46,740 | 243 |
| 7 | `docs/research/TIANYAN_CHARACTER_AGENT_V2_RESEARCH_R0.md` | 73,246 | 619 |
| 8 | `docs/handoff/TIANYAN_CURRENT_STATE_SNAPSHOT_R0.md` | 46,018 | 400 |
| 9 | `docs/handoff/TIANYAN_NEXT_CODEX_ENTRY_R0.md` | 44,590 | 417 |
| 10 | `docs/handoff/TIANYAN_IMPLEMENTATION_ROADMAP_R0.md` | 113,297 | 886 |
| 11 | `docs/product/TIANYAN_CHARACTER_AGENT_PRODUCT_DESIGN_R0.md` | 61,987 | 599 |
| 12 | `docs/product/TIANYAN_PRODUCT_MAP_VISUAL_R0.md` | 37,361 | 618 |
| 13 | `docs/product/TIANYAN_WORLD_WORKBENCH_PRODUCT_DESIGN_R0.md` | 59,808 | 497 |

合计 6,199 行；暂存区无第 14 项，工作树无未暂存改动（`git diff` 为空）。

## 二、检查结果

| 检查项 | 方法（只读） | 结果 |
| --- | --- | --- |
| 名单一致性 | `git diff --cached --name-status` 对照执行计划 §2.3 | ✅ 恰好 13 份，逐份一致；4 份门控件（治理/设计原则/agent-evolution/执行包）与执行计划自身均未混入 |
| 敏感信息 | `git grep --cached` 扫描私钥块/证书、`sk-`/`ghp_`/`github_pat_`/`xox` token、AWS AKIA、Bearer 头、api_key/secret/password 赋值字面量 | ✅ 零命中 |
| 大文件/二进制 | numstat、`file`、mode 检查 | ✅ 全部 UTF-8 文本、mode 100644、无符号链接、无空文件；最大 113 KB（IMPLEMENTATION_ROADMAP），无媒体/压缩包 |
| 路径问题 | `core.quotepath=false` 全量核对 | ✅ 13 份全 ASCII 路径，无中文转义风险、无尾随空格、无大小写冲突；冲突标记扫描零命中 |
| 引用核验 | 提取 13 份文档中的仓库相对路径引用共 **350 个**唯一路径，逐个三态分类 | ⚠️ 227 可解析；53 在盘未跟踪；70 盘上不存在——明细与定性见下 |

### 引用核验明细（唯一不绿灯项，已逐类甄别）

**53 个"在盘但未跟踪"**——提交后这些引用在库内暂时悬空，**全部属于执行计划的计划内时序**：
- 4 份门控 docs（`TIANYAN_PROJECT_GOVERNANCE_R0` 被 3 份暂存件引用、`TIANYAN_DESIGN_PRINCIPLES_R0` 被 4 份、`TIANYAN_AGENT_EVOLUTION_ROADMAP_R0` 被 5 份、`TIANYAN_CODEX_FIRST_EXECUTION_PACKAGE_R0` 被 5 份）→ 等 A3/C1 裁定后入库（执行计划 §2.3/§5.1 步 7）。
- 47 个 `data/` 目录引用（R5_M6 变体、C2 四源、R3_1C、混合语义检索等）→ 数据入库在执行计划 §3.1 阶段 1/阶段 4 排序中。另 `apps/story-studio/dist`（构建产物，本就不该跟踪）。
- 两份新文档（`TIANYAN_REPOSITORY_CLEANUP_EXECUTION_PLAN_R0.md`、`TIANYAN_REPOSITORY_INDEX_R0.md`）**未被任何暂存件引用**，无新增悬空。

**70 个"盘上不存在"**——甄别后无一为阻塞项：
- 正则截断产物与模板占位符约 18 个（`data/2026-09-17_`、`data/YYYY-MM-DD_任务名` 等），非真实引用。
- 审计 §6.1a **已自我声明的历史死链** 6 个（`2026-08-27_天衍产品体验与代码审计/截图`、`2026-08-29_天衍R0_5创始人视觉收口`、`…创始人退回修复/截图`、`2026-09-14_天衍第一阶段功能收尾`、`docs/ops`、`docs/evidence`）——文档写的就是"曾经存在/禁止存在"，属合法历史陈述（G-3.15）。
- 基线树文件约 15 个（`characterContextPack.ts`、`worldReferenceProjection.ts`、`entity-dock/` 两件、`semanticIndexService.mjs` 等）——已实测在 `origin/codex/semantic-world-r3` 基线存在；SYSTEM_MAP/审计按基线取数，引用对其取数 ref 成立（G-5.5），审计 §7.3 已声明该口径。
- 设计冻结分支上下文 3 个（`docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/*`，存在于另一分支线）。
- 退役架构名的历史性提及约 20 个（`src/agentRuntime`、`src/cognition` 等，均在"不要再做/历史沿革"语境）。
- **真正的错路径引用 4 个**（见风险 R2）：`docs/research/TIANYAN_ROADMAP.md`、`docs/research/TIANYAN_CHARACTER_AGENT_EVOLUTION_ROADMAP_R0.md`、`docs/product/TIANYAN_LEGACY_KEEP_REWRITE_REMOVE_R0.md`（实际在 `docs/architecture/`）、`apps/story-studio/src/components/CardWorkbench.tsx`（工作树与基线均无）——全部出自 `TIANYAN_IMPLEMENTATION_ROADMAP_R0.md` 的叙述性提及。

## 三、风险

| # | 风险 | 等级 | 说明 |
| --- | --- | --- | --- |
| R1 | 提交后 53 个引用在库内悬空（指向未入库文件） | 低·计划内 | 本机文件都在；悬空随 A3/C1 裁定与 data 分批入库自愈。任何外部 clone 在那之前按 G-4.10 视这些引用目标为"不存在"，不影响 13 份文档自身的完整性 |
| R2 | `TIANYAN_IMPLEMENTATION_ROADMAP_R0.md` 内 4 处错路径引用 | 低 | 不阻塞入库；应在**后续内容修订批**就地更正（本任务禁改文件），改动属只增改引用串的小 diff |
| R3 | `TIANYAN_DOCUMENT_INDEX_R0.md` 的 docs 清单漏 11 份、治理 §9 计数过期 | 低·已登记 | 执行计划 §2.3 已把"入库后补齐"列为配套动作；不在本批 |
| R4 | 自指计数漂移（审计/索引内的 docs 计数随每批入库变化） | 信息 | 各文档状态块已声明冻结时刻；复跑按 G-6.3 重算即可 |

## 四、建议

1. **可以按当前暂存区原样 commit**（建议提交信息沿用仓库惯例：`docs(onboarding): track 13 research/handoff/product documents per cleanup execution plan §2.3`）；commit 后**不要 push**，等待用户对推送的单独指令。
2. 紧随本批之后（同日或下一批）执行 A3/C1 裁定与 4 份门控件入库，尽早消掉 R1 的悬空窗口。
3. R2 的 4 处错路径在**独立的内容修订批**就地更正（G-3.15：改引用不改历史正文的其他部分），并在 `TIANYAN_REFERENCE_CATALOG.md`/`TIANYAN_ROADMAP.md` 按 G-5.3 补本批 13 份的登记行。
4. 本报告自身为新增未跟踪文件，**不加入当前暂存区**；随下一批或与门控件同批入库。

## 五、是否可以 commit

**可以（PASS）。** 名单、内容、体积、路径、敏感面五项全部通过；引用悬空为计划内时序且已在执行计划中排定收敛路径。执行 commit 与否的决定权与操作均在用户侧。
