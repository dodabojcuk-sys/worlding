# 天衍 · 仓库结构索引 R0

> 状态：REFERENCE
> 作用域：全文。路径与结构在 2026-09-19 于盘 `codex/world-materials @ f77b800` 实测；标注"当前状态"的小节是带日期的快照，会过期，使用前重测（G-3.16/G-6.3）。
> 基线：不依赖代码改动。体积为 `du -sh` 现测值（活值，与审计冻结值不互比）。
> 取代关系：—（不取代任何权威；分工见下）
> 依据：2026-09-19 用户指令（为未来 AI 会话生成仓库定向地图）。

**本文是什么**：给未来 AI / 新会话的**空间定向地图**——仓库里有什么、在哪里、哪些地方不许碰。只回答"东西在哪"，不回答"代码谁负责、怎么改"。

**本文不是什么（分工声明，G-3.10）**：

| 已有权威 | 它独占的问题 | 本文态度 |
| --- | --- | --- |
| `项目目录导航.md` | 代码放哪、谁负责、改动影响与最低验证 | 本文只画目录地图，代码定位一律以它为准 |
| `CORE.md` | `data/` 任务目录固定形状与 Git 纪律 | 本文只描述现状，形状规则以它为准 |
| `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` | 每份文档是什么、什么状态 | 本文不逐份盘点文档 |
| `docs/architecture/FEATURE_INDEX.json` | lint 强制的功能入口/所有者/成熟度登记 | **本文与它无关**：不修改、不解读、不替代；动它前先读 `项目目录导航.md` §4/§6 |

---

## 1. 根目录结构

| 条目 | 大小（现测） | Git | 是什么 |
| --- | --- | --- | --- |
| `TIANYAN_PRODUCT_CORE.md` | ~110 KB | 跟踪 | 唯一产品定义（权威链①，2,488 行） |
| `AGENTS.md` | — | 跟踪 | Agent 强制工程约束：十脚本、唯一 Owner、Mock-only、受保护数据、人工验收 |
| `CORE.md` | — | 跟踪 | 目录/资料/Git 边界工程规则（`data/` 形状唯一权威） |
| `项目目录导航.md` | ~40 KB | 跟踪 | 代码定位唯一文档（权威链⑤） |
| `日常入口.md` | — | 跟踪 | 作者日常入口指针（快变，只作指针） |
| `design-qa.md` | — | 跟踪 | 根级设计 QA 记录（HISTORICAL；与 `apps/story-studio/design-qa.md` 同名不同物） |
| `apps/` | 6.6 MB | 跟踪 | 唯一产品入口 `story-studio`（UI + server） |
| `src/` | 3.8 MB | 跟踪 | 业务/权威/持久化内核（14 个域，见 §4） |
| `tests/` | 2.8 MB | 跟踪 | 按 `src/` 责任区对应的单元与集成测试（不建第二测试树） |
| `scripts/` | 148 KB | 跟踪 | 开发启动、验收门禁、功能索引验证、隔离 E2E fixture（19 个 `.mjs`，经 package.json 十脚本调用） |
| `bin/` | 24 KB | 跟踪 | `world-os-story.mjs` 唯一隔离兼容 CLI（不得成为第二入口/第二持久化根） |
| `data/` | 400 MB | 部分跟踪 | 81 个日期任务目录 = 全部非代码工作产物（见 §3） |
| `docs/` | 2.9 MB | 部分跟踪 | 文档区 49 份（见 §2） |
| `ops/` | 16 KB | 跟踪 | `tianyan-review/*.conf` 公网审阅部署配置 |
| `evidence/` | 5.2 MB | **被 ignore 吞** | R2_2B1 根级证据（G-4.7 违规现状；处置待人工确认，禁删） |
| `output/` | 16 KB | 被 ignore | 一次 benchmark 运行输出 |
| `.mimosa/` | 8.6 MB（活增长） | **既不跟踪也不 ignore** | Agent 运行态（hook 状态/history），非项目资产 |
| `node_modules/` | 284 MB | ignore | 依赖，重取 `npm ci` |
| `.git/` | 366 MB | — | 版本库本体 |
| `.github/` `.nvmrc` `.env.example` `.gitignore` `package.json` `package-lock.json` | — | 跟踪 | 工程配置；十脚本见 `package.json`（dev/build/serve/typecheck/lint/test/test:unit/test:integration/test:e2e/verify） |

## 2. docs 结构（49 份 = 31 跟踪 + 18 未跟踪）

权威链自上而下（G-3.1）：

```text
TIANYAN_PRODUCT_CORE.md（根）
  └─ docs/product/TIANYAN_ROADMAP.md      能力账本 + 冲突表（当前优先级、BLOCKED_ON 都在这）
      └─ docs/architecture/               架构合同（含 FEATURE_INDEX.json）
          └─ docs/product/DESIGN.md       可验证布局/密度/响应式约束
              └─ 项目目录导航.md（根）
                  └─ docs/implementation/ + docs/operations/
                      └─ 日常入口.md / design-qa.md（根）
                          └─ docs/research/ + data/    权威链最末层
docs/handoff/  链外落点：阶段裁定、跨 Agent 交接
```

| 子目录 | 份数 | 装什么 |
| --- | --- | --- |
| `docs/architecture/` | 12 | 架构合同、`FEATURE_INDEX.json`（lint 本体）、Legacy 处置账 |
| `docs/product/` | 14 | ROADMAP 账本、DESIGN.md、产品设计稿、能力演进建议 |
| `docs/research/` | 11 | 外部调研、仓库盘点/审计、参考库（全部 REFERENCE，不是承诺） |
| `docs/handoff/` | 6 | 阶段交接、执行包、状态快照（链外落点） |
| `docs/operations/` | 4 | 运维手册（4191/4192 切换、公网部署）、治理规则、资产清理执行计划 |
| `docs/implementation/` | 1 | 现场状态与预算账本（Pi zero-call / Nuwa N1） |
| `docs/design/references/` | 1 | 唯一权威视觉参考 png（SHA-256 钉住，1.67 MB） |

**当前状态（2026-09-19 快照，会过期）**：13 份未跟踪 research/handoff/product 文档已 `git add` 进暂存区、**未提交、等用户确认**；另有 5 份未跟踪未暂存（治理、设计原则、agent-evolution 三份 gate 在落点裁定 A3，执行包 gate 在 C1，加本文与清理执行计划）。明细见 `docs/operations/TIANYAN_REPOSITORY_CLEANUP_EXECUTION_PLAN_R0.md` §2.3。

## 3. data 结构（81 个任务目录 / ~1046 文件 / ~400 MB）

- **固定形状**（`CORE.md` 独占）：`data/YYYY-MM-DD_任务名称/` ＝ `工作日志.md` ＋ 中文直述报告 ＋ `截图/`（`NN-页面或状态-宽x高.png`）＋ `验证/` ＋ `附件/`。现状只有 22/81 有日志——缺日志目录按 G-4.2 视为"未交付"， remedy 是**补日志**不是删证据。
- **按日期分布**（2026-09-19 实测）：08-27×1、08-28×5、08-29×5、09-02×1、09-03×5、09-04×3、09-05×3、09-06×3、09-07×12、09-08×1、09-09×4、09-10×3、09-11×2、09-12×5、09-13×1、09-15×2、09-16×3、09-17×14、09-18×8。
- **体积主角**：`2026-09-13_天衍地图管理与AI共同编辑M4`（~84 MB）、`2026-09-08_天衍R5固定稿二次打开首因`（~54 MB，内含 2 件 G-4.5 禁存 trace.zip）、`2026-09-16_天衍真实AI作者闭环R2`（~40 MB）。
- **媒体性质**：`.webm` 是连续作者操作录像＝**创始人人工验收唯一凭据，不可重生成**；`.png` 702 件有 76 组逐字节重复；126 份 md 承载 9 项 D 级决定（0.2% 体积、100% 决定）。
- **三态划分**：已跟踪 512 / 未跟踪 485 / 被 `.gitignore:14` 裸模式 `evidence/` 静默吞掉 49。
- **逐目录裁决**不在本文重复——见 `docs/research/TIANYAN_REPOSITORY_CLEANUP_AUDIT_R0.md` §3 与 `docs/operations/TIANYAN_REPOSITORY_CLEANUP_EXECUTION_PLAN_R0.md` §3（四阶段计划）。

## 4. 代码主要目录

主运行链（摘自 `项目目录导航.md` §3，细则以它为准）：

```text
apps/story-studio/src/main.tsx
  → App.tsx / product-shell / components
  → src/lib/localTransport.ts
  → apps/story-studio/server/server.mjs（api-only / combined-static）
  → src/storyControlSurface/* → src/storyWorkspace | storyContinuity | storyIntelligence | storyCreation
```

### `apps/story-studio/src/`（产品 UI，7 个子目录）

| 目录 | 一句话职责 |
| --- | --- |
| `product-shell/` | 全局导航、顶栏、工程目录、右 Dock、Shell 状态；`TianyanR0Shell.tsx` 只做区域组合，禁堆逻辑（AGENTS.md） |
| `components/` | 事件线工作面、天意（tianyi/）、女娲（nuwa/）、多元（multiverse/）、世界/资料（world/）、页面工具 |
| `lib/` | 前后端传输与本地存储适配、投影辅助 |
| `settings/` | 设置工作区（存储/导入导出/Provider/Agent 权限） |
| `styles/` | 全局样式（桌面视口 1920/1440/1280/1152） |
| `hooks/` `storyDiagnostics/` | 挂载辅助与诊断 |

### `apps/story-studio/server/`（HTTP 层）

`server.mjs`（入口+路由）、`runtimeMode.mjs`、`publicAccess.mjs`（公网审阅边界）、`providerGateway/`（唯一模型 Broker，真实外部调用边界）、`storyIntakeBatchPort.mjs`（影响预览/回执/补偿撤销）、各 `*Port.mjs`；`*Fixture*.mjs` 是**过渡例外，禁止照此新增生产功能**。

### `src/`（14 个业务域）

| 域 | 一句话职责 |
| --- | --- |
| `storyContracts/` | 前后端共享契约（事件/关系/编排/地图校准/Intake Envelope） |
| `storyControlSurface/` | 用例编排、作者权限、候选审查、**Canon 唯一写入链**（最高风险） |
| `storyWorkspace/` | 项目文件、版本、`.tianyan` 备份仓储（磁盘数据唯一 Owner） |
| `storyContinuity/` | 天意会话、记忆、角色知识边界、授权 |
| `storyAgent/` | AgentRuntimePort、受控工具、Pi 适配、Story Intake 候选 |
| `storyIntelligence/` | 女娲计划/运行/注意力/候选综合、Agent 识别提案 |
| `storyCreation/` | 创作文档模型、中立故事包、格式适配、插件生命周期 |
| `storyCardPresentation/` | 卡片模板与表现投影 |
| `productWorkspace/` + `productWorkspaceRuntime/` | 工作区模型与运行视图投影 |
| `skillControl/` + `skillRuntime/` + `memorySkills/` | Skill 清单/预算、执行沙箱、外部记忆合同 |
| `domainTemplates/storyWorld/` | 确定性故事世界流程模板 |

唯一所有者表（Canon 写入、WorldState/Event、Provider 边界等）**以 `项目目录导航.md` §5 与 `FEATURE_INDEX.json` 为准**，本文不复写。`src/` 根级两个过渡文件（`storyProductPrototypeState.ts`、`nuwaSceneRuntimeContracts.ts`）是已知整改对象，新代码禁止模仿。

### 其他

`tests/` 镜像 `src/` 责任区（storyContracts/storyControlSurface/storyWorkspace/…＋`fixtures/`）；浏览器闭环在 `apps/story-studio/scripts/`；`scripts/` 里 2 个 OBSOLETE 脚本（`tianyan-storage-inventory.mjs`、`repo-doctor.mjs`）不得作参考格式（G-8.1）。

## 5. 当前不要碰区域（未来 AI 重点读这节）

### 5.1 规则级禁区（动了就红/就断链，G-3.19）

| 对象 | 为什么 |
| --- | --- |
| 8 份 LINTPIN md：`docs/architecture/` 下 MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES、PROVIDER_CATALOG_AND_EMBEDDING_BINDING、R0_6_AGENT_TEXT_VERTICAL_SLICE_PRE_IMPLEMENTATION_MAP、R0_SHELL_CONTRACT、RUNTIME_MODE_AND_SINGLE_ENTRY ＋ `docs/implementation/TIANYAN_R4_PI_ZERO_CALL_AND_NUWA_N1.md` ＋ `apps/story-studio/src/settings/agent/INTEGRATION_REQUEST.md` ＋ `data/2026-09-03_天衍R12B2_1叙事编排权威合同/` 内合同 | 被 `FEATURE_INDEX.json sourceFiles` 钉住，移动/改名/删除 = `npm run lint` 红 |
| 10 个被权威文档按路径钉住的 `data/` 目录（名单与行号见审计 §6.1a，含 canonical R5_M6、G1自适应、地图 M4、N2/N3、R12B1、R12B2_1、女娲N1小闭环等） | `ROADMAP`/`design-qa.md`/导航按完整路径引用，改路径 = 权威文档死链（G-8.2 禁止重造） |
| `docs/architecture/FEATURE_INDEX.json` | lint 功能索引本体：只在功能所有者/入口变化时同步（`项目目录导航.md` §4）；任何"整理"不得顺手改它 |
| `docs/design/references/tianyan-r0-5-founder-character-directory.png` | `design-qa.md` 以 SHA-256 钉住 |
| `bin/world-os-story.mjs` | `AGENTS.md` 指定的隔离兼容 CLI，永不清理 |

### 5.2 冻结区（裁定前禁写）

- **女娲视觉链 C2 四源**：`data/2026-09-17_女娲R6_2微打磨`、`…女娲作者工作面视觉重构R6`、`…女娲聚焦与响应式打磨R6_1`、`…女娲视觉证据收尾R4_1`——可入库可提升，但移动、改名、删除、**改写视觉结论**四件事都不许（G-4.13：第二个视觉目标出现即全区域冻结）。
- `docs/product/DESIGN.md` `:40-45` 女娲节——等 C2 裁定。

### 5.3 待人工确认区（未放行前只登记、不处置）

- R5_M6 七个重跑变体目录（`-debug/-final/-pass/-pass2/-pass3/-retry2/-retry`，61 文件 ~36 MB）＋ R3_1C 三兄弟目录 ＋ `女娲工作面统一R5`（0 字节空壳）。
- 2 件 trace.zip：`data/2026-09-08_天衍R5固定稿二次打开首因/验证/修复{前,后}/trace.zip`（~45 MB，G-4.5 禁存物，**从未入库**——保持未跟踪，先裁定后处置）。
- 49 件被 `.gitignore:14` 吞掉的 `data/*/evidence/` 文件（A4 裁定前不碰，`git add -f` 也在禁令内）。
- 0 字节产物 6 件；`evidence/`（根）；2 个 OBSOLETE 脚本的退役。

### 5.4 硬禁令（任何会话、任何理由都不做）

`git clean`（任何形式）｜批量删除｜自动删除 `data/`｜`git worktree prune`｜删除分支/worktree（G-2.22/G-2.26 前置未过）｜把技术测试通过说成创始人体验验收通过。

### 5.5 受保护数据（AGENTS.md 射程）

用户正文、项目数据、数据库、迁移、环境文件、密钥——永不纳入清理，也永不进 `data/` 或提交。

### 5.6 基础设施

`.git/`、`node_modules/`、`~/.codex/worktrees/*`（约 16 个 / 3.5 GB，**不在本检出内**；承载未提交证据者按 G-2.22/G-2.23 登记后才谈释放）、`/tmp/tianyan-*`（11 条，10 个 prunable——prune 本身也是执行动作，未放行不做）。

### 5.7 运行与验证纪律

`npm run *` 必须 Node 22 规范运行时（其他主版本不得宣称全量验证）；`verify` 是全量门槛但不替代创始人验收；测试只用 Mock/本地伪服务器，真实 Provider 调用必须为 0；日常服务 4192 的现状以 health 回执 `codeRevision` 为准。

---

## 6. 新会话建议读取顺序

1. `AGENTS.md`（硬约束）→ 2. `CORE.md` + `项目目录导航.md`（放置与 Owner）→ 3. 本文（空间地图＋不要碰区域）→ 4. `docs/product/TIANYAN_ROADMAP.md` 当前优先级表＋冲突表（做什么、什么被冻结）→ 5. 任务卡指定落点文档 → 6. 所涉 `data/` 目录的 `工作日志.md`。涉及仓库整理时加读：`docs/operations/TIANYAN_REPOSITORY_CLEANUP_EXECUTION_PLAN_R0.md`（执行计划）与 `docs/research/TIANYAN_REPOSITORY_CLEANUP_AUDIT_R0.md`（取证底稿）。

**自指声明**：本文是新增未跟踪件（docs 未跟踪 18→19）；入库建议走执行计划 §2.3 同款流程（无前置争议，可直接入下一批），但**未经用户确认不自行 `git add`**。
