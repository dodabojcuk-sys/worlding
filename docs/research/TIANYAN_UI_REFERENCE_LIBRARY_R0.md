# 天衍 UI 参考库 R0

> 生成日期：2026-09-18。角色：UI 研究员（只读）。本文不修改代码、不新增功能、不删除流程、不建议引入任何依赖、不建议整体重做。
>
> 任务对象：BEUI / BOARDUI / THREEUI / FLUID FUNCTIONALISM / WATERMELON UI / HEROUI PRO 六个外部 UI 体系。目标不是选替代组件库，而是建立一份**可核对的模式参考库**。
>
> 编号 R25–R30 与状态码沿用 `docs/research/TIANYAN_REFERENCE_CATALOG.md` 的既有约定（C=读过源码 / D=读过官方文档原文 / U=待调查 / I=身份待确认 / X=访问未成功），不新造等级。

---

## 0. 前提、判据与三条必须先说的事实

### 0.1 核验方法（本文每条外部事实都带来源标记）

| 标记 | 含义 |
| --- | --- |
| **[已核]** | 本次会话由我本人取到原始数据：`curl` 抓取 `beui.dev/llms.txt`、`ui.watermelon.sh/registry.json`、`unpkg.com/@heroui/styles/.../variables.css`、`registry.npmjs.org/@heroui/react`、`registry.npmjs.org/boardui`；`gh api` 取 6 个仓库元数据；WebFetch 取 fluidfunctionalism.com 首页与 /docs、heroui.com、heroui.pro/docs/react/components/chat-conversation |
| **[代理读]** | 由子代理读回、我未逐条复核的细节（只用于描述，不用于结论） |
| **[第三方]** | 媒体/目录站说法，非官方 |
| **[推断]** | 我的判断，明确标出 |

仓库侧事实全部为只读实测，并且**每条都标了来自哪条线**（2026-09-18 实测三个 ref）：

| 简称 | ref | 说明 |
| --- | --- | --- |
| **盘** | `codex/world-materials` @ `f77b800`（工作树，2026-09-16） | 落后 r3 **44** 个提交、落后 r4 **45** 个（实测 `git rev-list --count HEAD..<ref>`） |
| **r3** | `origin/codex/semantic-world-r3` @ `93f41aa`（PR #28） | **本文所称"基线"= 这一条**：PR #28 仍是本轮功能基线（`M0_STATUS.md:6`），也是创始人否决后唯一还成立的生产代码线 |
| **r4** | `origin/codex/world-workbench-r4` @ `d16563b`（PR #29） | r3 **+1** 个提交（实测 `--left-right --count` = `0 1`），提交时间上最新，但**已被创始人判为 `FOUNDER_VISUAL_REJECTED`——"禁止合并、禁止作为基础"**（`FR1:docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/M0_STATUS.md:7`，另 `FOUNDER_FEEDBACK.md:63`「不把 PR #29 的生产文件带入 R1」）。本文只把它当作**一份被否决形态的取样**，不当作实现线 |

关键区分：r4 那一个提交（`feat(world): R4 world workbench rework`，2026-09-18 12:52）只碰了 4 个源文件——`WorldReferenceWorkspace.tsx`、`EntityInspectorDock.tsx`、`product-shell/theme/tokens.css`（+12 行 → 112 行）、`styles/tianyan-r0-shell.css`（+131 行）。所以**除 token 统计外，本文所有"基线"事实在 r3 与 r4 上取值相同**（本项审计 r3、r4 同为 22 / 155 / 140）；涉及 token 的每条单独给 r4 值。另需注明一处反直觉事实：`nuwa-n1.css` 盘上 196 行、r3/r4 均 398 行——**盘在这里不是"更新"而是"更早"**，因此盘的 token 数字系统性偏小，不能代表实现线。

书写约定：正文里只写文件名者，指 `apps/story-studio/src/` 递归下的同名文件（如 `GlobalStatusBar.tsx` = `product-shell/topbar/GlobalStatusBar.tsx`）；`test.ts:NNN` 是 `tests/storyContracts/tianyanR0ShellContract.test.ts:NNN` 的缩写；`PRODUCT_CORE:NNNN` 是根目录 `TIANYAN_PRODUCT_CORE.md`。**下文"基线"一律指 r3**（PR #28，`93f41aa`）——r4 已被否决，不作为基线称谓；凡出现 "r4" 字样者，都明确是**被否决形态上的取样**。之所以本文的 token 审计在 r3 与 r4 上取值相同（22 / 155 / 140），是因为那 4 个改动文件里没有一个新增无定义 token 的消费；本文以"基线"称谓引用的文件（`nuwa-n1.css`、`Nuwa*.tsx`、`TemporalCanvas.tsx`、`TianyiConversationWorkspace.tsx`、`EventGraphCanvas.tsx` 等）都不在 r4 那 4 个改动文件之内；唯一被 r4 改过的两张表——`tokens.css` 与 `tianyan-r0-shell.css`——在本文里的每处引用都显式标了"盘"或"r4"（`tianyan-r0-shell.css` 的 reduced-motion 块 `:895` 经实测三线同行，故例外）。**第四类来源**：R1 冻结设计文档（`docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/*`，含 `FOUNDER_FEEDBACK.md`）不在这三条线上，实测只在 `origin/pr-31`（`refs/remotes/origin/pr-31` 本次已取到，故本文能读到原文）与工作树 `/home/beelink/.codex/worktrees/tianyan-ui-design-freeze-r1` 存在，引用时一律写完整路径。

### 0.2 六个名字的核验结果：全部可解析，但两处需要纠正前提

| 给定名 | 真实身份 | 判定 |
| --- | --- | --- |
| BEUI | **beUI**，作者 Saurabh Chauhan，仓库 `starc007/ui-components`（MIT，⭐1,614，created 2024-01-31，last push **2026-09-18**） | **RESOLVED** [已核] |
| BOARDUI | **BoardUI**，作者 Mertcan Esmergül，`www.boardui.com` + 镜像 `BoardUI/boardui`（⭐479，created **2026-09-01**，last push 2026-09-05） | **RESOLVED**（且很年轻）[已核] |
| THREEUI | **ThreeUI**，Meng To / Design+Code，`threeui.com` + `MengTo/threeui`（MIT，⭐5,927，last push 2026-09-03） | **RESOLVED，但不是框架**：它是 three.js 组件/模板/着色器**目录**，不是保留模式 UI 框架 [已核] |
| FLUID FUNCTIONALISM | **不是一种风格标签，是一个真实的开源 shadcn registry**：`mickadesign/fluid-functionalism`（MIT，⭐896，last push 2026-09-16），站点 `fluidfunctionalism.com` | **RESOLVED** [已核] |
| WATERMELON UI | **`ui.watermelon.sh`**（WatermelonCorp，平台仓库 MIT ⭐530，pushed 2026-09-18；registry.json 实测 **778 条**） | **RESOLVED** [已核] |
| HEROUI PRO | 拆成两个东西：**HeroUI** = NextUI 改名（`heroui-inc/heroui` ⭐30,739；`@heroui/react` v3.2.6，npm modified 2026-09-17）；**HeroUI Pro = 独立域名 `heroui.pro` 的付费产品**，不是 OSS 库的一个 tier | **RESOLVED**，但需纠正："HEROUI PRO" 不在 heroui.com 上（我抓 heroui.com 只见 "HeroUI"，无 Pro 字样）[已核] |

两个**假朋友**，登记以免日后误引：① 中文「西瓜UI」指 2017 年用友 IUAP 的设计规范（`iuap-design/xiguaui`），与 Watermelon UI 无关；② `WatermelonDB`（React Native 数据库）与它同词不同物，官方与代码均无关联。另：npm 名 `boardui` 上存着一段**无关的** 2020-01-23→2020-02-06 的 1.0.0–1.2.1 旧发布（`registry.npmjs.org/boardui` 同一文档可见，当前线从 0.1.0 起，latest 0.5.6）——引用时必须按版本号区分。

### 0.3 本文不可能交付"引入方案"，因为禁令在技术层面已经先否掉了六个

根目录 `package.json`（盘）只有 9 个运行时依赖，实测 `dependencies` 键数 = 9，且 `apps/story-studio` 没有自己的 package.json：`@dagrejs/dagre`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@geoman-io/leaflet-geoman-free`、`@xyflow/react`、`leaflet`、`lucide-react`、`react`、`react-dom`。**没有 Tailwind、没有 React Aria、没有 Framer Motion / motion、没有 Radix/Base UI、没有任何 CSS-in-JS。** 这 9 个的实测归宿分三档：① 浏览器产品代码真在用的 4 个——`react`、`react-dom`、`lucide-react`（`apps/story-studio/src` 里 import 命中盘 57 / 基线 60 个文件）、`@xyflow/react`（两 ref 各 8 个文件：7 个组件模块 + `main.tsx:15` 引入其样式表）；② 服务端专用 2 个——`@earendil-works/pi-agent-core`、`pi-ai` 唯一导入点是 `src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts:102` 的动态 `import()`，并且 `tests/storyStudio/piPredictionRuntimeBoundaryR0.test.ts:23` 明确断言它们不得出现在浏览器文件里；③ **声明但零 import 3 个**——`leaflet`、`@geoman-io/leaflet-geoman-free`、`@dagrejs/dagre` 在盘与基线的 `src` + `scripts` 里 import 命中均为 0（实测 `git grep`）。③ 正好复用了既有台账对 R23/R24 的纪律："已安装 ≠ 已采用"；它同时说明 §5 的画布缺口**不是依赖缺口，而是规范缺口**。六个体系的技术前提：

| 体系 | 必需运行时前提 | 与仓库的差距 |
| --- | --- | --- |
| HeroUI v3 | `@heroui/react` peer 实测要求 `tailwindcss >= 4.0.0` + `react-aria` + `react-aria-components` [已核] | 3 套新栈（CSS 体系 / 交互原语 / provider-less 暗色机制） |
| BoardUI | React 19 + **Tailwind CSS v4** + **React Aria Components**（Next.js app） | 同上 |
| beUI | shadcn registry 复制源码（`npx shadcn@latest add @beui/<name>`），组件源码依赖 Tailwind 类 + motion | 需 Tailwind + motion |
| Fluid Functionalism | 同上（`npx shadcn@latest registry add @fluid`，Next.js 15 / Tailwind v4 / Framer Motion / Radix 或 Base UI） | 同上 |
| Watermelon UI | shadcn registry（`npx shadcn@latest add`），Tailwind 语义类（`bg-card`/`text-muted-foreground`）+ `motion/react` | 同上 |
| ThreeUI | three.js/WebGL 组件目录 | 需整个 3D 运行时 |

所以本文的定位被两条约束同时钉死：**「不引入依赖」+「不替换 React 架构」⇒ 只能吸收"规格"**（一条阈值、一个状态命名、一档控件音量、一份可机读规则）。这不削弱价值——§6 的 12 条里没有一条需要新依赖。

### 0.4 判据不用我的口味，用仓库已经写死的规则

| 判据来源 | 内容 |
| --- | --- |
| `TIANYAN_PRODUCT_CORE.md:2131-2153` §6 语义状态视觉 | 10 种状态（已确认/候选/预测/派生副本/未归类/已过期/冲突/未知/已归档/外部输出）；**颜色不是唯一表达方式**，需同时用标签、边框、线型、图标、文字 |
| `:2155-2174` §7 画布巧思 | 事件线/关系图/地图**共享一套空间交互语言**（缩放、适应视图、聚焦当前、缩略图、折叠、搜索、筛选、选择连续片段、复制稳定 ID、拖入天意、预测幽灵节点、对照叠加、差异高亮、影响范围预览），"这些画布看起来可以不同，但操作语法应一致" |
| `:2176-2182` §8 拖拽与引用 | 所有拖拽必须有点击式"添加引用"替代，支持键盘与触控 |
| `:2184-2193` §9 空状态 | 必须说明为什么为空／什么会出现／从哪开始／AI 怎样帮；"不能为了填满页面而制造无意义卡片" |
| `:2195-2213` §10 视觉统一 | 八空间共享字体层级/间距/卡片半径/边框/按钮/标签/输入框/空状态/抽屉/对话/详情面板/状态颜色；"不能像七个不同团队做出的产品" |
| `:2215-2236` §11 移动端 | 明确列 **"无透明栏遮挡"**（`:2231`） |
| `:2238-2247` §12 无障碍 | 重要状态不能只靠颜色；支持键盘与读屏；**技术术语默认翻译**；高级技术信息可展开查看 |
| 机器钉住（`tests/storyContracts/tianyanR0ShellContract.test.ts`） | `:246` 只把 **6 张**样式表纳入色值审查，`:248` 禁 `#hex`/`rgba()` 字面量，`:249` 要求消费 `var(--color-workspace-background)`，`:242` 要求 shell/导航/顶栏等源文件**不含任何汉字**（中文必须进 i18n），`:250` 要求 `focus-visible`，`:251` 要求出现 `prefers-reduced-motion`，`:252` 要求出现 `shell-command-palette`，`:253/:254` 把 `--space-rail-collapsed-width: 3.5rem` 与 `--topbar-height: 3.125rem` 钉死在 tokens 里。**该测试文件在盘、r3、r4 上 md5 同为 `87faa36b`，故本文所有 `test.ts:NNN` 对三条线同时成立** |

### 0.5 三条必须先说的事实

**事实一：仓库的 token 层已经在漏，先补它再谈吸收任何外来视觉语言。** 我对全仓 11 个 CSS 文件（`tokens.css` 作定义源 + `src/styles/` 下 10 张组件样式表）里所有 `var(--x)` 引用，减去一份"定义集"（全部 CSS 的 `--x:` 声明 + TS/TSX 里的 `"--x":` / `'--x':` 内联键与 `setProperty("--x", …)`）。三条线的实测：

| 线 | CSS 行数 | 全仓无定义的属性 | 被消费次数 | 其中**连 fallback 都没有** |
| --- | --- | --- | --- | --- |
| 盘 | 6,374 | 17 | 143 | **140** |
| r4（实现线） | 6,851 | 22 | 155 | **140** |

r4 比盘多出的 5 个全部在 `nuwa-n1.css`（`--border`5、`--text-muted`4、`--status-candidate`1、`--status-confirmed`1、`--text-body`1），且**12 处全部带 fallback**——所以"140 次无 fallback"在两条线上完全相同，**漏的是同一批**：

| 缺失别名（两线相同） | 次数 | tokens.css 里真正有的 |
| --- | --- | --- |
| `--color-text-secondary` | 54 | 只有 `--color-text-muted` |
| `--color-border-subtle` | 47 | 只有 `--color-border` / `--color-border-strong` |
| `--color-canvas` | 8 | 只有 `--color-workspace-background` |
| `--space-7` | 6 | 间距档为 1,2,3,4,5,6,8,10，**跳过了 7** |
| `--shadow-sm` | 6 | 只有 `--shadow-panel` |
| `--color-text-primary` | 5 | 只有 `--color-text` |
| `--radius-xs` | 4 | 档位为 `radius-sm/md/lg` |
| `--color-surface-raised`、`--font-mono`、`--font-family-ui` | 各 2 | `--color-surface`、`--font-ui`/`--font-display` |
| `--shadow-md`、`--radius-full`、`--color-on-accent`、`--font-size-2xl`、`--font-family-display` | 各 1 | — |
| `--color-warning-text`、`--color-warning-soft` | 各 1 | **带 fallback**（`event-line-projection.css:857`），属安全写法 |

分布按表（r4）：`tianyi-workspace.css` 89、`tianyan-r0-shell.css` 26、`nuwa-n1.css` 12、`event-line-projection.css` 14、`project-directory.css` 9、`tianyi-sidebar.css` 3、`right-dock.css` 1、`settings.css` 1。两条要点：① 大头是 `tianyi-workspace.css`（89/155），单表 `--color-border-subtle` 43 次；② **被色值审查覆盖的表同样在漏**（`tianyan-r0-shell.css` 26 次、`tianyi-sidebar.css` 3 次）——因为 `test.ts:248` 只禁字面量、不检查引用能否解析；而 `var()` 取不到值时按 CSS 规则整条声明失效，所以一个不存在的 token 可以永久静默地渲染成继承值。

同因后果的第二半是字面色：tokens.css 之外**只有 3 张表**写字面量（r4）——`tianyi-workspace.css` **27 处**（26 个 `#hex` + 1 处 `rgba(`：`#fffefb`×13、`#f3f0e9`×3、`#b7791f`×2、`#fff`×2、`#f8f6f1`/`#f2efe8`/`#ede9e0`/`#faf8f2` 各 1；只有 `#f7f4ed`×2 是 `--color-workspace-background` 已有值被手抄，其余 **25 处都不在 tokens.css 的色值集合里**）、基线 `nuwa-n1.css` **11 处**（盘上为 0，因为盘是更早的 196 行版本）、`character-directory.css` **2 处**（`#b64a47` + 一处 `rgb(`）。而 `test.ts:246` 的审查名单恰好**只覆盖这 3 张之外的表**：`tianyan-r0-shell`、`project-directory`、`right-dock`、`tianyi-sidebar`、`event-line-projection`、`settings`——被审的 6 张实测字面色全为 0。名单外的 4 张是 `global-search.css`(0)、`nuwa-n1.css`(11/基线)、`character-directory.css`(2)、`tianyi-workspace.css`(27)。**禁令没失效，是覆盖面 6/10，而基线上全部 40 处字面色恰好都在名单外。**

再加一条在 r4 上取到的证据，它把上面的抽象论证变成了已发生的事故——**但请注意它的身份：r4 是被否决的形态，这条不是"基线上待修的缺陷"，而是"那种结构一旦增色就会漏"的实例证明**：**r4 那个提交往 `tokens.css` 加了 6 个世界色（`--color-world-location/rule/faction/item/clue/secret`，`:21-26`），并在 cloud-ink 块里把同样 6 个值逐字抄了一遍（`:84-89`），而第三个主题块 `night-paper`（`:92` 起）一个都没有**——消费方 `tianyan-r0-shell.css:1839` 的 `.wb-root { --wb-rule: var(--color-world-rule); … }` 在暗色主题下会回落到 `:root` 的亮色值。实测补充：**这 6 个 `--color-world-*` 在基线 r3 的 `tokens.css`（100 行）里根本不存在**（`git show` 对比 r3→r4 的 diff 全部为 `+` 行），所以漏配是 r4 引入的，不是基线现状。这不是口味问题：**"同一组色值手抄 3 遍"的结构，第一次增色就漏抄了 1/3。** 详见 §2 T1。

这条不是理论：`tianyi-workspace.css:182` 的 `.tianyi-workspace-composer` 写着 `border: 1px solid var(--color-border-subtle)`（无 fallback）。按 CSS 的 invalid-at-computed-value 规则，整条 `border` 简写失效 ⇒ `border-style` 回到初始 `none`，也就是**天意输入区的边框很可能根本没被画出来**；同一条规则里还有 `rgba(0,0,0,.08)` 字面量，而这张表正是名单外 27 处字面色的所在地。（未在浏览器实测，见 §8.7。）

这不是本文要修的东西（只读），但它是 §2 的第一条结论：**参考库若被当成"给天衍换一套视觉语言"的许可证，最先坏掉的就是这里。**

**事实二：女娲的"正文"目前是单行 `<input>`，因此一切"阅读面"参考没有宿主。** 基线 `NuwaUnifiedSceneWorkspace.tsx:24,:32` 把每个 block 渲染成受控 `<input class="nuwa-block-input">`（没有只读 `<p>` 分支），基线 `nuwa-n1.css:216`（`width:100%; border:0`）、`:305`（`font-size:.88rem; line-height:1.8`）。`<input>` 不能换行 ⇒ 超出一行的段落只能在输入框内横向滚动；且 `.88rem` 比 UI 正文 `--font-size-md: .9375rem` 还小。这直接解释了 R1 反馈第 1 条为什么是"正文主位不足、稿纸感没有出来"，也意味着 **Watermelon `reveal-copy`、beUI `Scroll Animation` 阅读进度、HeroUI markdown 面这类模式，在换行问题解决前无法评估**。

**事实三：外部参考库在"关系图/时间线"两栏几乎全部为空，而这两栏恰是天衍最难的部分。** 见 §1 矩阵与 §5。

---

## 1. 六个关注点 × 六个体系（先给总览）

评级只表示"该体系里有多少现成的、机制说得清的对应物"，不表示质量。

| 关注点 | beUI | BoardUI | ThreeUI | Fluid Functionalism | Watermelon UI | HeroUI (+Pro) |
| --- | --- | --- | --- | --- | --- | --- |
| **AI Agent 工作台** | **★★★** 17 个 agents 组件（实测分类计数 42/23/17） | ★★☆ `agent-chat`/`agent-log`/`composer-loader` | ✗ 无 | ★★☆ `ThinkingIndicator`/`ThinkingSteps`/`AskUserQuestions`（实测存在） | ★☆☆ registry 里 `agent` 命中 2 条（实测） | **★★★** Pro：`ChatConversation`+`ScrollAnchor`、`ChainOfThought`、`PromptInput` 四态 |
| **动态界面** | **★★★** 共享布局变形（面板从触发器"长出来"） | ★★☆ 侧栏/面板受控状态 | ★☆☆ 3D 场景切换非 UI 组装 | ★★☆ spring 物理取代时长 | **★★★** 招牌即"就地展开替代模态"（`disclosure` 命中 24 条，实测） | ★★☆ CSS-only，靠 `[data-entering]`/`[data-pressed]` 状态属性 |
| **上下文展示** | ★★☆ `AI Sidebar`（官方原话含 keyboard navigation / optimistic moves）、`Preview Rail` | ★★☆ ticket detail **side panels**（Pro） | ✗ | ★★☆ hover=preview | ★★☆ `macos-sidebar`、`scroll-island`、`morphing-sidebar-controls` | **★★★** `AppLayout` 把右侧 aside 当**一等布局**而非浮层 |
| **时间线** | ✗ 实测无 timeline 条目 | ✗（`agenda` 类无） | ✗ | ✗ | ✗ **registry.json 778 条里 `timeline`/`node`/`graph` 命中 0**（实测） | ★☆☆ Pro `Timeline`＝**只读编年** `ol/li` + `aria-current`，与 `Stepper` 分开 |
| **关系图 / 节点画布** | ✗ | ✗ | ★☆☆ 有 3D 场景，但不是节点图 | ✗ | ✗ 实测 0 | ✗ 有 kanban/agenda/data-grid，**无节点图** |
| **创作工具 / 长文** | ★★☆ `Prompt Input`、`Chat App`、`File Diff` | ★☆☆ `textarea` 自增高 + 字数 | ✗ | ✗ | ★★☆ `inline-edit`、`inline-table-control`（"不打断焦点"） | **★★★** Pro `RichTextEditor`（Tiptap，选区气泡菜单"inline, never modal"）、`markdown`、`code-block` |

一句话读法：**能偷的都集中在"Agent 工作台的感知层"和"布局级上下文"两列；画布一列六家全空。** 因此 §6 的价值集中在 12 条小规格，而不是任何一次重做。

---

## 2. 哪些适合天衍（产品级 / 壳层）

| 项 | 来源与机制 | 天衍落点 | 为什么适合 |
| --- | --- | --- | --- |
| **T1 从少量基色派生，而不是逐色枚举** | HeroUI v3 实测 `@heroui/styles` 的 `variables.css` 共 331 行 / 178 个 `--` 定义：`--accent` 用 **oklch**，角色名 `--surface/-secondary/-tertiary`、`--overlay`、`--segment`、`--field-*`，每个语义角色再派生 `-foreground`/`-hover`/`-soft`；官方设计原则写 "semantic intent over visual style"。BoardUI 同向：官方 registry token 文档称改 **11 个变量即可整套重染** [代理读] | `tokens.css`：盘 21 色 × 3 处复制（`:1-20` 定义、`:58-78` cloud-ink 重列、`:80-100` night-paper 重列）；r4 涨到 112 行、27 色 | **强适合，且 r4（被否决线，见 §0.1）已经给出事故证据**（§0.5 事实一末段）：r4 新增 6 个 `--color-world-*` 时只写了 `:root`(`:21-26`) 与 cloud-ink(`:84-89`)，**night-paper(`:92+`) 一个都没有**，暗色下 `.wb-root`(`tianyan-r0-shell.css:1839`) 回落到亮色值。派生化把"改色要动 3×N 行"变成"改 1 个基色"，**纯 CSS 重构，零依赖** |
| **T2 暗色 = token 块，不用 provider** | HeroUI 官方：`.dark` + `data-theme="dark"` 双属性驱动，无 JS provider | 已是同一形态：`TianyanR0Shell.tsx:415` 二值切换、`:481` 写 `data-theme` | 印证，不是新增。可吸收的只有"再没有第三种机制"这条纪律 |
| **T3 规则要机读** | 六个体系**全部**发布 `llms.txt`；HeroUI 另有 `@heroui/react-mcp`、Agent Skills、`AGENTS.md`；BoardUI 直接以 `MCP server + SKILL.md + AGENTS.md + llms.txt` 作为分发面；Watermelon 有托管 `mcp.watermelon.sh/mcp`（Streamable HTTP，无密钥）+ `openapi.json` + 只读 catalog API | 现状 UI 规则散在三处：契约测试（`tianyanR0ShellContract.test.ts`）、`项目目录导航.md`、`TIANYAN_PRODUCT_CORE.md §6-§12` | 对天衍**最实用的一条**：Codex 与外部 agent 每次都要重读一遍。产出一份 `UI 规则机读清单`（哪些断言机器钉、哪些只有文档、哪些属 B 档未决）是纯文档工作 |
| **T4 尺寸档可预测** | HeroUI 原则 "predictable `sm/md/lg` sizes"、实测 `--field-radius: calc(var(--radius) * 1.5)`；BoardUI 记 `2lg=10px`（中等按钮）与 `2-5xl=20px`（源码注释"kanban columns and other large inset panels"）[代理读] | `tokens.css:37-39`（盘；r4 因插入 6 色而下移）只有 `radius-sm/md/lg`；**没有控件尺寸档**；`:29-36` 间距跳 `--space-7` | 天衍的输入框/按钮/标签各自定尺寸，所以 `test.ts:246` 名单外的样式表会长出 27 处字面色。**先有档位，才有地方写色值** |
| **T5 reduced-motion 当作被设计的状态** | beUI 官方 motion guides 公布 `EASE_OUT`/`EASE_IN_OUT`/`SPRING_PRESS`/`SPRING_LAYOUT` 与时长表（press 100–160ms、tooltip 125–200ms、dropdown 150–250ms、modal/drawer 200–500ms，"<300ms 为默认）并把 reduced-motion 列为一种设计态；HeroUI 官方 CSS-only，提供 `motion-reduce` 与 `data-reduce-motion`；Fluid Functionalism 用 `MotionConfig` 处理 reducedMotion（该项我只在单次抓取里看到，标 **[待复]**） | 盘 6,374 行 / r4 6,851 行 CSS 里只有 **1 个 `@keyframes`**（`tianyi-workspace.css:254` `tianyi-spin`，两线同行）、**`transition` 盘 11 处 / r4 12 处**（只分布在 `tianyan-r0-shell`5–6、`event-line-projection`3、`character-directory`2、`settings`1 这 4 张表）、**3 处 `prefers-reduced-motion`**（`tianyan-r0-shell.css:895`、`character-directory.css:158`、`settings.css:505`，两线相同）；`test.ts:251` **只断言这个字符串出现过** | 关键差别：天衍是**零动效产品**。所以吸收的正确方向不是"加动效"，而是"要么不加，加就一次性把时长/缓动/降级写进 token 与断言"。现状 `:251` 是**存在性断言**，不是逐动画审查——测试会绿而体验会坏 |
| **不适合天衍的** | 见 §7 | — | BoardUI 的 Inter 单家族（天衍是 Noto Sans/Serif CJK 双家族，中文换字体会连带行高与栅格重排）、任何库的营销页数值（既有纪律 R22 已明写"不套用 Linear/Notion 等第三方品牌或营销页数值"） |

---

## 3. 哪些适合女娲（作者工作面 / 长文）

先给边界：女娲正文**没有流式**（基线 `NuwaN1Workspace.tsx` 中 `stream` 命中 0）、采纳是**多选 Run 步骤**、正文是 block 序列。因此外部模式只能进"感知层"。

| 项 | 来源与机制 | 天衍落点 | 判定 |
| --- | --- | --- | --- |
| **N1 控件音量档（最高价值的一条）** | Fluid Functionalism `TabsSubtle`——为信息密集区提供"更安静的控制变体"（实测该组件在 registry 中） | 基线 `NuwaDirectionCandidates.tsx:29-38` 三张等宽卡 + `nuwa-n1.css:333` `repeat(auto-fit,minmax(13rem,1fr))` ⇒ **现状代码本来就渲染三张等宽大卡** | **强适合**。它能同时满足：不改数据、不改流程、不新增功能，只把走向区从"与正文同权重"降到"比正文弱"。这正面回应创始人 R1 反馈 B 组第 2 条（`docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/FOUNDER_FEEDBACK.md:19`「默认态即显示三张等宽大卡，视觉重心压过正文舞台」，原文实测 [已核]；**该文件只在 PR #31 ref 与工作树 `tianyan-ui-design-freeze-r1` 上，盘 / r3 / r4 三处均不存在**，来源分级见 §0.1） |
| **N2 就地编辑同一面，不做模态** | Watermelon 招牌：`inline-disclosure-menu`（一列上下文动作就地展开，**两步删除确认也在同一面内**）、`inline-edit`（display↔edit 靠布局动画切换）、`inline-table-control`（"不打断焦点"的改进行） | 基线 `NuwaUnifiedSceneWorkspace.tsx:24,:32` 已经是"就地受控输入"，方向正确 | **印证 + 一条前置**：宿主元素要换。见 §0.5 事实二，`<input>` 不能换行 ⇒ 先把 block 输入改成可换行元素（或只读 `<p>` + 就地切换），否则任何长文模式无从评估 |
| **N3 预览目标而不是高亮** | Fluid Functionalism docs 第二条 "Hover as preview"；beUI `Preview Rail`（官方注明 Codex 启发：紧凑刻度组成悬停金字塔，浮出目标预览） | 基线 `NuwaSceneOverview.tsx:35-37` 场景 chips、`NuwaN1Workspace.tsx:731-737` 相关场景文字列表 | **有条件适合**：预览必须 focus 可对等触发（`test.ts:250`、`PRODUCT_CORE:2243`），且**只能浮在右栏/浮层里，不能盖正文**（`PRODUCT_CORE:2231`「无透明栏遮挡」；`:2153`「未知明确写未知，不显示假数据」⇒ 预览不得是生成内容） |
| **N4 执行披露的紧凑完成态** | beUI `Tool Result` 官方原话："…that collapses into a compact completed state" | 基线 `NuwaDirectionCandidates.tsx:34-38` 的 `<details>推演过程` | 适合：把"展开/收起"改成"收起态也携带一行结论"，是文案与状态位，不是新功能 |
| **不适合女娲** | ThreeUI 全部（WebGL 深度、指针速度材质、容器 morph 取代路由——正文页是成本最低收益最差的目标，且 `:2231` 直接否决透明遮挡）；beUI `Morphing Tabs`（可重排页签无语义：女娲只有「分支场景正文/排演现场」两个固定视图，基线 `NuwaN1Workspace.tsx:587-590`）；HeroUI `RichTextEditor`/Tiptap（会引入 contentEditable + 选区状态，与 block-`<input>` 模型冲突，且是依赖）；BoardUI `project-board` 看板（把叙事分支塞进 ticket 板＝换语义模型，且它是 **Pro 付费**） | — | 记为不吸收，见 §7 |

---

## 4. 哪些适合天意（AI Agent 工作台）

天意在**生命周期层已经比这六家严格**，缺的几乎全在**感知层**：

| 天衍已有（实测） | 外部同级 |
| --- | --- |
| 6 态预测视图机 `task/running/overview/focus/review/receipt` + **浏览器生命周期的终止栅栏**：`tianyiPredictionViewState.ts:9-11` 注释——组件重挂载会使 ref 消失，故用内存栅栏防止"作者终止前捕获的响应把 Run 复活" | 六家均无 Run 生命周期/终止语义 |
| 执行图 5 种节点：`process / tool / gate / result / human-review`（`AgentExecutionGraph.tsx:10` `nodeTypes`）——人在环是**图上的一类节点** | beUI `Approval Card`、HeroUI `ChainOfThought`、Fluid `AskUserQuestions` 都是"卡/条"，不是节点 |
| 写入边界自陈：`TianyiConversationWorkspace.tsx:1210`「Canon 写入 0 · 已确认资料对象 N」；测试夹具显式告示 `:1203` | 无对应（这是天衍的原创纪律） |
| 两车道 tablist `:1179`、跨重挂载恢复滚动 `:576/:591`（sessionStorage 按车道存 scrollTop）、切道归零 `:166` | — |

可吸收（全部不需要新依赖）：

| 项 | 来源与机制 | 天衍落点 | 判定 |
| --- | --- | --- | --- |
| **Y1 跟随直播边缘、读者一上翻即让位** | HeroUI Pro `ChatConversation` 实测官方措辞 "A stick-to-bottom conversation viewport for streaming chat messages"，实现是**底部放一个 `ScrollAnchor` 哨兵**，另有 `ScrollButton` 仅在"视口离底部"时出现；beUI `Message Scroller` 官方措辞 "reader-aware … follows streamed output at the live edge and releases control when the reader moves away"，**阈值 56px**，props `followOutput` / `followThreshold`（我直接抓到该文档原文） | `TianyiConversationWorkspace.tsx:94` 有 `intakeStreamText` 流式文本，但**全仓没有任何 near-bottom 判定**（`scrollIntoView`/`scrollTop` 只出现在锚点恢复与归零） | **最适合的一条**：天意有流、有 1,386 行的对话面，却没有"跟随—让位"。约 20 行 DOM 代码，无依赖 |
| **Y2 一条自适应活动流 ≠ 把图画成流** | beUI `Agent Activity` 官方原话："One adaptive activity stream for reasoning, searches, tool calls, structured execution traces, or a chronological mix" | 天意已有 `AgentExecutionGraph`（左→右、`setCenter` 聚焦 running 节点、`readableZoom=.9`） | **部分吸收**：活动流适合"正在发生什么"的窄条，图适合"整条链审计"。**两者并存，不得互相替换**（否则打断 `data-graph-layer="AGENT_EXECUTION_GRAPH"` 的稳定阅读位置） |
| **Y3 引用：内联标记 + 可折叠引用集** | beUI `Citations`："Inline citation markers paired with a collapsible, progressively rendered reference collection for grounded agent responses" | 天意有 `sourceLabel`（事件线）、`getVerifiedCanonEvent`、`verified` 资料跳转；`tianyi-intake-runtime-details` 已是 `<details>`（`:1212`） | 适合，且方向已对 |
| **Y4 审批三态** | beUI `Approval Card`："human-in-the-loop decision surface for approvals, single or multiple-choice questions, custom responses, and multi-step review flows" | `gate`/`human-review` 节点 + 待确认面板（`GlobalStatusBar.tsx:190`）+ 女娲授权门控 `run.authorization.status === "active"` | **先对齐语义再谈形状**：allow-once / remember / deny 必须映射到现有授权与 `expectedRevision`，不得新造一个"记住了"状态 |
| **Y5 状态可读性优于状态动效** | Fluid Functionalism `ThinkingIndicator`/`ThinkingSteps`；beUI `loading-states`："shimmering status text, live agent progress, and cycling reasoning phrases" | `:1206` `LoaderCircle className="is-spinning"` + 时长文案 | **只吸收前两项**。**"cycling reasoning phrases"（轮播推理短语）不吸收**：滚动展示"正在思考…"式短语是本文所禁"假数据/假按钮"的典型形态 |
| **Y6 组合式 composer** | HeroUI Pro `PromptInput`：单行 pill 在文本换行或有附件时切成堆叠外壳；四态 `submitted/streaming/ready/error`；`PromptInput.Queue` 作为 `.Shell` 的兄弟，把排队追问渲染在 composer **上方** | 天意 composer（`tianyi-workspace.css:182` `position: sticky; bottom: 0`）、女娲 composer 双态（基线 `nuwa-n1.css:347-349` "R6.1 紧凑态"用 `:not(.is-expanded)`；高度由 `NuwaN1Workspace.tsx:198` 的 `setProperty("--nuwa-composer-height", …)` 注入、在 `nuwa-n1.css:226` 带 `0px` fallback 消费）。**另注**：基线上 `.nuwa-n1-composer` 有两条规则（`:159` 与 `:345`），后者按层叠覆盖前者 | 适合"排队追问显示在输入区上方"与"四态按钮"；**不适合**其实现方式（Tailwind 类 + framer） |

---

## 5. 哪些适合世界观（关系图 / 地图 / 时间线）

**总判：六个体系在这里给不了参考，缺口是内部的。** registry 实测：Watermelon 778 条里 `graph`/`node`/`timeline`/`diff`/`trace` **命中 0**；beUI 82 项无节点图与时间线；BoardUI 6 条含 `board` 字样但是 ticket 板；ThreeUI 是 3D 场景目录；Fluid Functionalism 无画布；HeroUI 有 `Timeline` 但官方定义是**只读编年列表**（`ol/li` + `aria-current`），与画布无关。

| 项 | 内容 | 依据 |
| --- | --- | --- |
| **S1 唯一真吸收：把"画布操作语法"写成可验收规范** | `PRODUCT_CORE:2155-2174` 已列 14 条手势并要求跨画布一致。实测四张画布**各有一套**：<br>· `EventGraphCanvas.tsx`（1,647 行，`@xyflow/react`）：`<Controls>` + `<MiniMap>`（唯一有缩略图的画布）+ `fitView` + `selectionOnDrag` + 折叠(6) + 搜索(2) + 筛选(4) + 影响范围(1) + 复制(1)<br>· `TemporalCanvas.tsx`（370 行，xyflow）：`<Controls>` + `setCenter` + `LocateFixed`，**无 MiniMap、无 fitView**<br>· `FocusedRelationsWorkspace.tsx`（313 行，**手写** `GraphViewport`/`fitView`/`setCenter`，非 xyflow）：放大/缩小/筛选关系类型/搜索人物或地点/阵营图例<br>· `AgentExecutionGraph.tsx`（91 行，xyflow）：`<Controls>` + `setCenter` + `LocateFixed`，无 MiniMap<br>**14 条里 4 条全仓 0 实现**：预测幽灵节点（`ghost` 命中 0）、对照叠加（`对照` 0）、差异高亮（`差异` 0）、拖入天意（拖拽只有角色观察一条窄链：`CharacterDirectoryPanel.tsx:117-119` → `StoryProgressionWorkspace.tsx:251-254`） | 这是文档任务，不是组件任务 |
| **S2 浮动工具岛** | Watermelon `scroll-island`（钉住的浮动进度 + 上下文动作）[代理读] | 正好承载 S1 的"聚焦当前 / 适应视图 / 回到全局"，且天衍已有先例，但**极稀**：`backdrop-filter` 全仓盘 4 处 / r4 5 处，只落在 3 个元素上——`event-line-projection.css:169`（`.story-modeling-toolbar` blur16）、`:239`（`.story-progression-controls` `position: sticky` + blur14）、`:1930`（同元素在 `@media (min-width:75.001rem) and (max-width:90rem)` 里连 `box-shadow` 一起被置回 `none`）、`nuwa-n1.css:158`(盘)/`:159`(r4) 与 `:345`(r4)（`.nuwa-n1-composer` blur9）。注意 `:2231`「无透明栏遮挡」——吸收**形状**（浮动岛），不吸收**透明材质**；`:1930` 说明仓库自己已经在按视口档位回收这层材质 |
| **S3 世界观已经领先的地方（别回退）** | `TemporalCanvas.tsx:14` 七态不确定性编码 `anchored/inferred/range/relative/fuzzy/unplaced/conflict`；`:22` 三档 detail `compact/standard/expanded`；`:25` 轨道来源含 **`ai-suggested-stale`**（AI 建议可过期）；`FocusedRelationsWorkspace.tsx:15` 的 `FACTION_MEMBER_RELATION_TYPE_IDS` 是空数组，其上方注释说明此时**投影保持暂停、什么都不渲染**，因为"非成员关系不能因为碰到派系就变成成员" | 六家里没有任何一家把"预测可过期"和"无数据就不渲染"做进组件。**这两条是要反向输出给参考库的，不是要吸收的** |
| **S4 不吸收** | ThreeUI 的 depth-as-hierarchy 与指针速度材质（WebGL 像素不进入无障碍树：不可选、不可查找、不随缩放重排）；BoardUI/Watermelon 的图表族（17 charts、bento/marketing blocks）——世界观不是仪表盘 | 见 §7 |

---

## 6. 值得吸收的交互理念（12 条，可直接进交接）

每条格式：**理念 → 机制 → 落点 → 前置/成本 → 验收**。都不需要新依赖。

| # | 理念 | 机制（含来源与已验证锚点） | 天衍落点 | 前置 / 成本 | 验收 |
| --- | --- | --- | --- | --- | --- |
| P01 | **流式跟随，读者优先** | HeroUI `ScrollAnchor` 哨兵 + "离底才出按钮"；beUI `followThreshold=56px` [已核] | 天意 `intakeStreamText`（`TianyiConversationWorkspace.tsx:94`）；与 `:576/:591` 的滚动恢复共存 | 约 20 行；须先定"谁拥有滚动状态"（现在由 sessionStorage 车道键拥有） | 流式途中上翻不被拉回；下翻能重新接管；读屏不因 `aria-live` 重复播报（`PRODUCT_CORE:2240-2244`） |
| P02 | **控件分音量档** | Fluid `TabsSubtle` [已核：registry 存在该组件] | 女娲方向卡、右栏辅助卡 | 需先裁视觉目标（图 vs R1）→ **B 档** | 1440 首屏里正文仍是最大区域。**注意**：现状首屏清单在 `data/2026-09-17_女娲作者工作面视觉重构R6/验收报告.md:33`，它只列"首屏有什么"、不含面积比较，所以这条验收必须新测（且需先解掉 §8.7 的未拉起服务） |
| P03 | **收起态也要说一句结论** | beUI `Tool Result` "collapses into a compact completed state" [已核，官方原话] | 方向卡 `<details>推演过程`（基线 `NuwaDirectionCandidates.tsx:34-38`）、天意 `TianyiConversationWorkspace.tsx:1212` | 文案位＋状态位，无新数据 | 收起态一行内可判断"要不要展开"，且不出现图上那种效应分数徽标 |
| P04 | **就地展开替代模态，危险动作两步同面** | Watermelon `inline-disclosure-menu`（实测 24 条 disclosure 命中；两步确认在同一面） | 待确认面板入口（`GlobalStatusBar.tsx:190` 的 `data-panel-toggle="pending-review"`）、天意 `<details>来源与运行诊断`。**不含效果图上的"场景笔记"**：该 affordance 在盘与基线 `src` 里 0 命中，无宿主 | 必须键盘对等（`test.ts:250`） | 无新增 `<dialog>`；Esc/焦点归还可验证 |
| P05 | **预览目标而非高亮触发器** | Fluid "Hover as preview" [已核 docs 标题]、beUI `Preview Rail` | 场景 chips（基线 `NuwaSceneOverview.tsx:35-37`）、相关场景列表（基线 `NuwaN1Workspace.tsx:731-737`） | 预览内容只能来自已持久化投影，不得现生成 | hover **与 focus** 同效；预览不落在正文之上；无内容时不渲染 |
| P06 | **色彩按角色派生，不按色号枚举** | HeroUI 实测：`--accent` oklch + `-foreground/-hover/-soft` 派生、`--field-radius: calc(--radius*1.5)` | `tokens.css:1-100`（盘：21 色 × 3 处复制）；r4 已涨到 112 行 / 27 色 | 纯 CSS；须先把未定义别名补齐（§0.5 事实一） | `test.ts:246` 的名单从 6 张扩到全部 10 张组件表后仍全绿（**今天必红**：基线尚有 40 处字面色在名单外） |
| P07 | **reduced-motion 是设计态，不是字符串** | beUI 时长/缓动表 + 把降级列为设计状态 [代理读]；HeroUI `motion-reduce`/`data-reduce-motion` [已核] | `test.ts:251` 现状只是存在性断言 | 需新增 token（时长/缓动各一组）＋测试升级 | 任何新 transition 都能在 reduce 下找到等价静止态 |
| P08 | **画布共用一套动词** | 内部规范（非外部）：`PRODUCT_CORE:2157-2172` 的 14 条 | 四张画布（§5 实测四套语法） | 文档 + 逐画布勾选表；`fitView`/MiniMap 缺失属实现补齐 | 同一手势在四张画布同义；缺失的 4 条要么实现要么显式声明不做 |
| P09 | **UI 规则机读化** | 六家全发 `llms.txt`；HeroUI `AGENTS.md`+Agent Skills+MCP；Watermelon 托管 MCP + `openapi.json` [已核] | 现规则散在 `test.ts`/`项目目录导航.md`/`PRODUCT_CORE §6-§12` | 纯文档 | Codex 一次读取即可判断"某改动能不能做、被哪条断言拦" |
| P10 | **排队追问显示在输入区上方** | HeroUI Pro `PromptInput.Queue` 作为 `.Shell` 兄弟 [代理读，我在该页未复核] | 天意 composer（`tianyi-workspace.css:182`）、女娲 composer 双态 | 需先定"队列归谁拥有"（现 `cue` 路由是即时发送） | 不新增第二条写路径；不产生第二个 `expectedRevision` |
| P11 | **引用成对：内联标记 + 可折叠集合** | beUI `Citations` 官方原话 [已核] | 天意 `sourceLabel`、资料/事件线跳转 | 复用现有跳转，不建第二索引 | 每个标记可点回原对象；集合按需渐进渲染 |
| P12 | **技术细节默认翻译，高级信息展开** | Fluid `AskUserQuestions`/`ThinkingSteps` 的"触发器即摘要" [代理读] | `TianyiConversationWorkspace.tsx:1203` 夹具告示、`:1210` 写入边界、`:1212` `<details>` 已是正解 | 只需检查术语表（`PRODUCT_CORE:2245-2246`） | 正文里不出现裸 `Run`/`ContextPack`/`expectedRevision`；展开才见 |

---

## 7. 明确不吸收（防止实现时顺手做）

| 不吸收 | 原因 |
| --- | --- |
| WebGL 深度、折射、指针速度驱动材质（ThreeUI） | 像素不进无障碍树；`PRODUCT_CORE:2231` 禁透明栏遮挡； vestibular/低功耗代价；正文与表格页是反向场景 |
| "容器 morph 取代路由切换" | 破坏前进/后退与 URL 状态；天意/女娲跨页跳转（`/event-line`、`/library?libraryView=map`）依赖真实路由 |
| 只由 hover 触发的预览 / 只由拖拽触发的动作 | `test.ts:250` 与 `PRODUCT_CORE:2182`、`:2243` 要求键盘与点击式替代 |
| 轮播"推理短语"式 loading（beUI `loading-states` 第三态） | 属本文禁区：没有数据支撑的外观＝假数据 |
| 把 Tailwind / shadcn / React Aria 作为落地形态（六家共同前提） | 违反「不引入依赖」；且盘 6,374 行 / 基线 6,851 行手写 CSS 与现有 token 体系要整体重写 |
| 单字体家族排版（BoardUI 全栈 Inter） | 中文正文依赖 Noto Serif CJK 显示族（盘 `tokens.css:22-23`，r4 因插入世界色下移到 `:28-29`）；换字体＝重排行高与栅格 |
| 778 条变体式组件目录（Watermelon：`tabs-1…26`、`hero-1…43` 等编号变体，实测条目量 778） | 与 §10 视觉统一正相反，会把"不能像七个团队做的产品"变成制度化的 778 种样子 |
| 看板/工单板承载叙事分支（BoardUI `project-board`，且为 Pro 付费） | 分支语义已由 `nuwa-branch` 合同拥有；换容器＝换语义模型 |
| 把执行图改写成消息流（或反之） | 图=审计面、流=实时注意力面，二者并存（§4 Y2） |
| 效应分数徽标（真相+1/风险+1…） | 候选的真实形状是**句子数组**（`server.mjs:4512-4530`、`storyIntelligenceTypes.ts:161/:203`）；分数只存在于从未被引用的原型数据 `storyProductPrototypeState.ts:40-49` |
| 用组件库补齐时间线/关系图 | §1 矩阵：六家该列全空；`PRODUCT_CORE` §7 的 4 条未实现手势也没有任何一家提供参考 |

---

## 8. 本参考库的边界与未决问题

1. **只读**：未修改、移动、删除任何文件，未提交，未生成补丁，未运行任何写产物的 npm 脚本。实测复核（2026-09-18，本文完成时）：`git status --porcelain` 中**已跟踪文件改动数 = 0**，`git diff --stat` 与 `git diff --cached --stat` 均为空，HEAD 仍是 `f77b800`，无新提交。`docs/` 下当前有 **11 份未跟踪 markdown**（实测 `git status --porcelain -- docs` 计数；全仓库排除 `data/` 后同为 11），本文 `TIANYAN_UI_REFERENCE_LIBRARY_R0.md` 是任务 H 新增的那一份；其余 10 份是本次连续会话早前几轮（请求 A–G）的交付物，本文不声称它们的作者身份，只登记"未跟踪"这一事实——因此这 11 份都存在被误删风险，任何 `git clean` 类操作前必须先读它们。
2. **六家里没有一个被"采用"**：按既有台账纪律，登记≠采用（`docs/research/TIANYAN_REFERENCE_CATALOG.md:29-30` 对已安装的 Leaflet / React Flow 也写明"不因已安装就默认采用"；本文 §0.3 另把这条纪律落成了实测：`leaflet`、`@geoman-io/leaflet-geoman-free`、`@dagrejs/dagre` 在盘与基线的 import 命中为 **0**，而真正被使用的画布依赖只有 `@xyflow/react` 那 8 个文件）。本文把六家一律记为 **D**（读过官方文档原文；HeroUI 另读其发布的 token 源文件，Watermelon 另读其 registry.json 原文），**无一家记 C**（未逐组件读源码）。
3. **维护成熟度差异极大，引用必须带日期**：BoardUI 镜像仓库建立于 **2026-09-01**、最后 push 2026-09-05、npm latest 0.5.6（2026-09-17）——**17 天龄**；Watermelon 平台仓库 pushed 2026-09-18；beUI pushed 2026-09-18；Fluid Functionalism pushed 2026-09-16；ThreeUI pushed 2026-09-03；HeroUI v3.2.6 published 2026-09-17。**只有 HeroUI 与 beUI 同时具备"久 + 活"。**
4. **未独立复核的项**：BoardUI 的 `theme.json` 派生细节、Fluid Functionalism 的 `MotionConfig reducedMotion`、HeroUI `ChainOfThought` 的收起行为（我的直接抓取返回 403）——均标 **[代理读]/[待复]**，不作为任何一条结论的唯一依据。Reddit 上关于 HeroUI v3 的两条争议帖我只拿到标题（403），因此"v3 移除了 v2 的输入框标签动画、迁移负担是主调"这条**只有 InfoQ 一篇（2026-07-01）支撑**，不作为判断。
5. **两个前置缺陷会放大外来影响，建议优先处理（本文只登记）**：① §0.5 事实一——基线 **22 个无定义 token 被消费 155 次（140 次无 fallback）**、色值审查覆盖面 **6/10**（基线 40 处字面色全在名单外），外加被否决的 r4 线上 night-paper 主题漏配 6 个世界色（实测基线 r3 的 `tokens.css` 里没有这 6 个 token，故属 r4 引入）；② §0.5 事实二（正文为单行 `<input>`，长段落不能换行）。二者的共同点是**都不是"要不要吸收外部"的问题，而是"吸收了也会坏"的问题**。
6. **B 档未决**：P02/P06/P07 依赖视觉目标裁定（效果图 vs R1 冻结），该裁定属创始人；在其之前，§6 里可无条件推进的是 P01、P08、P09，以及 P03/P04/P05/P11/P12 中与数据无关的部分。
7. **未做**：浏览器实测。本文的天衍现状尺寸全部来自 CSS token 与代码常量推算，未拉起任何服务（沿用上一轮验收现场记录的 4192/4195 未启动状态，`data/2026-09-17_女娲作者工作面视觉重构R6/验收报告.md:59`）。因此 §0.5 那句"天意 composer 边框可能没画出来"、以及一切"渲染结果"级别的表述，都只到**代码与 CSS 规则层面成立**为止。
