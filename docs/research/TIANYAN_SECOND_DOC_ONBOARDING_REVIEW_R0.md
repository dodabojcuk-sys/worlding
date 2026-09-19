# 天衍 · 第二批文档入库前审查 R0

> 状态：REFERENCE
> 作用域：仅 2026-09-19 盘 `codex/world-materials`（HEAD `8093bc9` 线）上列名的 6 份未跟踪文档。审查全部只读；本文不改任何文件、不执行入库。
> 基线：不依赖代码改动。
> 取代关系：—（对账快照 → `docs/research/`，G-3.2）
> 依据：任务 TIANYAN_SECOND_DOC_ONBOARDING_REVIEW_R0；口径沿用 TIANYAN_DOCS_COMMIT_REVIEW_R0（第一批审查）。

## 结论：PASS —— 六份全部适合入库

无密钥、无大文件、全部 REFERENCE 状态块、全部落点表内位置、零 C1/C2 代裁内容；引用悬空全部属"计划内时序或登记性引用"。本审查只出结论，**不执行入库**。

## 一、待入库清单（6 份，合计 92.6 KB，全部 UTF-8 文本）

| # | 文件 | 字节 | G-3.2 落点 | 落点判定 |
| --- | --- | --- | --- | --- |
| 1 | `docs/handoff/TIANYAN_AI_READ_ORDER_R0.md` | 14,419 | handoff（交接） | ✅ 表内 |
| 2 | `docs/research/TIANYAN_REPOSITORY_INDEX_R0.md` | 14,538 | research（仓库盘点） | ✅ 表内 |
| 3 | `docs/operations/TIANYAN_REPOSITORY_CLEANUP_EXECUTION_PLAN_R0.md` | 41,153 | operations（手册式） | ✅ 表内 |
| 4 | `docs/research/TIANYAN_DOCS_COMMIT_REVIEW_R0.md` | 7,571 | research（对账快照） | ✅ 表内 |
| 5 | `docs/research/TIANYAN_NUWA_BRANCH_IDEMPOTENCY_REVIEW_R0.md` | 8,273 | research（对账快照） | ✅ 表内 |
| 6 | `docs/research/TIANYAN_WORLD_CONTEXT_PACK_FAIL_CLOSED_REVIEW_R0.md` | 6,696 | research（对账快照） | ✅ 表内 |

六份第一段落均为 G-3.4 五字段状态块（状态：REFERENCE），各自声明计数为冻结时刻值。

## 二、检查结果

| 检查 | 方法 | 结果 |
| --- | --- | --- |
| 密钥 | 私钥块/证书、`sk-`/`ghp_`/`github_pat_`/`xox`、AKIA、Bearer、api_key/secret_key/password 字面量 | ✅ 零命中 |
| 大文件 | 体积 6.7–41 KB，全文本，无媒体/压缩包/二进制 | ✅ 无 |
| 冲突标记 | `<<<<<<<`/`>>>>>>>` 扫描 | ✅ 无 |
| C1/C2 未裁定内容 | 逐份核对 | ✅ 零代裁：六份只**引用** C1/C2/A3/A4 作为门与冻结条件，无任何一条替创始人裁定；两份代码审查记录的是 BASE 线已完成事实（nuwa 修复属快照"第 1 档"C1 无关任务，文中已声明） |

## 三、引用路径核验（111 个唯一路径，三态分类）

| 类 | 数量 | 定性 |
| --- | --- | --- |
| 已跟踪 | 77 | ✅ 提交后即可解析 |
| 在盘但未跟踪 | 9 | ✅ 全部计划内（见下） |
| 盘上不存在 | 25 | ✅ 甄别后无一为阻塞（见下） |

**9 个在盘未跟踪**：4 份门控文档（执行包 C1、治理/设计原则/agent-evolution A3——入库后悬空，随裁定自愈）；`REPOSITORY_INDEX` 与 `EXECUTION_PLAN` 互相引用（**同批入库后自愈**）；`trace.zip` 路径（执行计划明文引用其"保持未跟踪"状态，本就不该入库）；C2 四源目录 `女娲R6_2微打磨`（数据阶段排序）；`apps/story-studio/dist`（构建产物语境）。

**25 个"盘上不存在"甄别**：正则截断/模板占位符约 10 个（`apps/.../lib`、`data/YYYY-MM-DD_任务名` 等）；BASE/FR1 线文件 5 个（`worldCausalEvolution.ts`、`nuwaBranchCheckpointCloseout.test.ts` 等——**已随 80a1bbb/3683183 推送，在 semantic-world-r3 线上解析**；`TIANYAN_UI_DESIGN_FREEZE_R1` 两件在 `origin/pr-31`，AI_READ_ORDER 明示用 `git show` 读）；历史/禁令语境引用约 7 个（`docs/ops`、`docs/evidence`、`src/agentRuntime` 等退役名，均为"不存在/禁止"语境的合法历史陈述）；**错路径引用 3 个**（`docs/research/TIANYAN_ROADMAP.md` 等）——全部出自 `TIANYAN_DOCS_COMMIT_REVIEW_R0.md` 的 §四 R2 风险描述本身，是**对该缺陷的登记引文**，非新错误。

## 四、风险与后续项

| # | 项 | 等级 |
| --- | --- | --- |
| R1 | 入库后 4 份门控文档引用悬空（同第一批模式，随 A3/C1 自愈） | 低·计划内 |
| R2 | 六份中的冻结计数（如"docs 未跟踪 18→19"）相对当下已漂移——各文档状态块已自声明冻结语义，按第一批先例**入库时原样保留、不回写**（G-3.11） | 信息 |
| R3 | `characterAllowedReferences` 与 `buildWorldContextPack` 的语义分歧尚无 ROADMAP 冲突表登记行（WCP 审查 §四 已登记于文档层）——建议随本批或下一批在 ROADMAP 补一行（G-6.10） | 低·待办 |
| R4 | EXECUTION_PLAN §3.1 引用的 data 阶段清单在其数据阶段执行前持续膨胀漂移——其状态块已声明"执行前复跑" | 信息 |

## 五、是否适合入库

**适合（PASS）。** 六份构成完整闭环：执行计划（怎么整）→ 仓库索引（在哪/别碰什么）→ AI 阅读入口（新会话 5 分钟上手）→ 三份审查记录（三批操作的判决留痕）。入库方式沿用第一批：`git add` 原地、一批一提交、不 push；本审查自身为第 7 份新未跟踪件，**建议随本批一并入库**，但按任务约束本轮不执行任何 git add。
