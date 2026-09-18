# 天衍 UI 视觉拆解 R0

> 生成日期：2026-09-18。角色：UI 研究员（只读）。本文不修改代码、不新增功能、不删除流程、不生成补丁；它只做一件事——把指定的效果图拆成可核对的结构、层级、组件与数据依赖，并逐条判定"能不能落到现在的天衍上"。
>
> 所有像素值来自对 PNG 的逐像素实测（脚本方法见 §0.3），所有代码结论来自双 ref 复核（工作树 `f77b800` 与实现基线 `origin/codex/semantic-world-r3` @ `93f41aa`）。子代理报告的两处路径错误已在核验后剔除（见 §0.3 末）。

---

## 0. 分析对象与核验前提

### 0.1 分析的是哪张图

| 项 | 值 |
| --- | --- |
| 仓库内路径 | `data/2026-09-17_女娲作者工作面视觉重构R6/参考效果图.png` |
| md5 | `9123a4dd4f2d8ab095c86be7178d73a7` |
| 画布 | **1586 × 992**（非 1440×900，见 §0.4） |
| 来源 | 与 `/home/beelink/下载/ChatGPT Image 2026年9月17日 06_33_54.png` **逐字节相同**（同 md5、同 1,573,467 B）→ 这是一张 AI 生成的效果图，不是 Figma 导出，也不是任何已实现界面的截图 |
| 仓库内引用 | `data/2026-09-17_女娲作者工作面视觉重构R6/验收报告.md:13-28` 的"效果图匹配清单"（11 项 MATCH + 1 项 NOT_APPLICABLE） |

图的内容：一个名为「女娲 叙事共创」的写作工作面，深色左导航 + 白卡主列 + 白卡右栏，主列里是"场景头 → 正文 → 三条走向 → 指令输入"。

### 0.2 它不是天衍唯一的视觉目标，而且两个目标互相冲突

本文不能假装只有一个目标。现状是：

| 目标 | 住在哪 | 状态 |
| --- | --- | --- |
| **效果图（本文对象）** | `data/2026-09-17_…R6/参考效果图.png`（未提交） | R6 验收报告判 `VISUAL_IMPLEMENTATION_RESULT=COMPLETE`，但 `VISUAL_EXPERIENCE_RESULT=READY_FOR_FOUNDER_REVIEW`（`验收报告.md:9/:11`）——创始人视觉验收**未做** |
| **R1 设计冻结** | `/home/beelink/.codex/worktrees/tianyan-ui-design-freeze-r1/docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/`（8 个文件，PR #31，HEAD `a37a314`） | **主检出与基线里 0 引用、0 副本**（`grep -rl UI_DESIGN_FREEZE` 全仓无命中）；R0 结论记为 `FOUNDER_VISUAL_REJECTED`（`FOUNDER_FEEDBACK.md:5`），且明写「创始人通过前禁止进入生产代码」（`:9`） |

两者在可测量几何上直接冲突（§3.2、§5.2）。**选哪个是创始人的决定，不是本文的决定**；本文只把冲突量化，供裁定时使用。

### 0.3 方法

1. **像素实测**：用 PIL 逐像素扫描，按颜色分类（`CARD ≥#fbfbfb` / `bg #f8fafc±` / `navy` / `ink`）求卡片矩形与间距，不靠目测估计。文中所有 px 都是这个方法的输出。
2. **双 ref 核验**：每条"已有实现"都用 `ls`/`wc -l`（工作树）与 `git -c core.quotepath=false show origin/codex/semantic-world-r3:<path>`（基线）分别确认，标注"盘"或"基线"。
3. **假功能判据**：一个图上元素只有在找到 (a) store/state 字段、(b) 传输路由或服务端 handler、(c) `src/storyContracts/` 合同类型三者之一时才算"有数据"。找不到就是假功能——**这一条是本项目"禁止假按钮/假数据"纪律的直接应用**。
4. 剔除的子代理错误：① 报告称女娲组件在 `apps/story-studio/src/nuwa/` —— 真路径是 `apps/story-studio/src/components/nuwa/`（两个 ref 都如此，`src/nuwa/` 不存在）；② 报告称 `NuwaUnifiedSceneWorkspace.tsx` 由 Shell 直接挂载 —— 实际 `ShellWorkspaceOutlet.tsx:58-60`（盘）/`:61-62`（基线）仍只挂 `NuwaN1Workspace`，其余组件从它内部组合。
5. **第二遍逐条复核**：本文初稿写完后，用脚本把全部 `path:line` 引用重放了一遍（`git show <基线>:<path>` + 按行取原文）。修正了 30 余处，主要是三类：**行号漂移**（基线 `NuwaN1Workspace.tsx` 右栏区整体下移 ~4 行）、**目录前缀缺失**（`tokens.css` 实在 `product-shell/theme/`，服务端实在 `apps/story-studio/server/`，合同在**仓库根** `src/storyContracts/` 而非 `apps/story-studio/src/`）、**ref 标注缺失**（`nuwa-n1.css` 盘上 196 行、基线 398 行，`:226` 只在基线存在）。下文所有引用均为复核后的值。
6. **下文的短名 → 完整路径**（表格里为了排版省掉了前缀，落码时按这张表展开）：`NuwaN1Workspace.tsx` → `apps/story-studio/src/components/nuwa/`（盘 + 基线都有）；同目录下的 `NuwaSceneOverview.tsx`、`NuwaDirectionCandidates.tsx`、`NuwaUnifiedSceneWorkspace.tsx`、`nuwaSceneWorkspaceModel.ts`、`nuwaWorkspaceView.ts` **只在基线存在**——盘上该目录目前只有 `NuwaN1Workspace.tsx` 一个文件。`NuwaRunReader.tsx` **不是文件**：它是 `NuwaN1Workspace.tsx` 内部的组件，引用时统一写 `NuwaN1Workspace.tsx:<line>`。`localTransport.ts` → `apps/story-studio/src/lib/`；`tokens.css` → `apps/story-studio/src/product-shell/theme/`；`tianyan-r0-shell.css`、`nuwa-n1.css` → `apps/story-studio/src/styles/`；`GlobalStatusBar.tsx` → `…/product-shell/topbar/`；`ProductShellNavigation.tsx` → `…/product-shell/navigation/`；`ShellWorkspaceOutlet.tsx` → `…/product-shell/workspace/`；`TianyanR0Shell.tsx` → `…/product-shell/`；`server.mjs`、`nuwaN1Port.mjs` → `apps/story-studio/server/`；`storyStudioWorkspaceRegistry.ts` → **仓库根** `src/storyContracts/`（不是 `apps/story-studio/src/`），`characterContextPack.ts`、`nuwaBranchNode.ts` 同目录且**只在基线**；`tianyanR0ShellContract.test.ts` → 仓库根 `tests/storyContracts/`。此外：下文简写 **`test.ts` = `tests/storyContracts/tianyanR0ShellContract.test.ts`**；`DESIGN_TOKENS.md`、`FOUNDER_FEEDBACK.md`、`INTERACTION_RULES.md`、`IMPLEMENTATION_MAPPING.md` 都指 §0.2 那个**外部 worktree** 里的 R1 冻结文件，本仓两个 ref 内均无副本。

### 0.4 三条必须先说的事实

1. **1586×992 不是受管视口。** `项目目录导航.md:86` 要求桌面检查 **1920 / 1440 / 1280 / 1152**，`:157` 要求人工检查 **1600 / 1440 / 1280 / 1195**。效果图的宽高都不在其中，所以**图上任何 px 都不能直接抄成 token**，必须重排到 1440 再量（§3.3 给了换算）。
2. **仓库不发布任何位图资产。** `apps/story-studio/` 下（排除 `dist/`、`node_modules/`）`.png/.jpg/.jpeg/.gif/.webp/.svg/.avif/.ico` 命中数 = **0**，没有 `public/` 目录；`background-image` 全是 CSS `linear-gradient`。图里的水墨山水、6 张人物照片头像、4 张场景缩略图、用户头像——**四类都无资产来源**。
3. **图上元素共 62 组，其中 23 组（37%）找不到任何数据后端。** 本文把它们统一编号 E01–E62，全部落在 §5 的三张表里（31 可借鉴 / 8 会破坏 / 23 假功能）。

---

## 1. 页面定位

### 判定：**B 创作工具（主）+ A 后台（外壳）+ D 阅读器**；不是 C 游戏编辑器。

| 候选 | 判定 | 依据 |
| --- | --- | --- |
| **B 创作工具** | **主形态，成立** | ① 正文卡 y340–770 = **430px 高、996px 宽**，占画布高度 43%、占主列 100%，是全图最大连续区域；② 底部不是表单提交而是自然语言指令框（placeholder「输入你的指令，或描述你希望发生的情节…」E44）+「应用选择，继续推演」——推进叙事，不是保存记录；③ 右栏 6 张卡全是**创作上下文**（单元/场景/约束/角色知晓/笔记/提示），不是属性编辑器；④ 没有任何后台硬特征：0 表格、0 分页器、0 批量选择、0 筛选侧栏、0 状态色矩阵 |
| **A 后台** | **外壳残留，成立但只在导航层** | ① 左导航 11 项里 **6 项是后台/SaaS 词表**：项目概览、素材库、文档与输出、版本管理、团队协作、数据看板——其中 4 项（项目概览、文档与输出、版本管理、团队协作）在天衍 8 空间里根本没有对应实现；连同 角色管理、剧情大纲，11 项共 **6 项无落点**（§5.2 E02）；② 顶栏是标准 SaaS 工具条（全局搜索 ⌘K / 目录 / 待确认 / 助手 / ⋯）； 团队协作与天衍的 LOCAL_ONLY 单作者前提直接矛盾（顶栏现有 `topbar.localOnly` 与 `common.notConnected` 状态，`GlobalStatusBar.tsx:185-186`） |
| **C 游戏编辑器** | **不成立** | 0 个编辑器特征：无节点图/画布、无时间轴、无资产浏览器、无视口工具栏、无属性面板+场景视图双联。图里的"方向卡/生成支线"是**叙事分支**（对应真实 `nuwa-branch` 合同），不是关卡编辑 |
| **D 其他 = 阅读器** | **成立，且是这张图最有价值的部分** | 衬线大标题（场景名 E23）+ 行高 1.8 的连续正文（R6 报告 `:28` 自述"正文行高 1.8"）+ 节点弱分隔（小字标题+虚线，无编号/无 kind/无内部 ID）+ 对白浅底气泡（E40）。这是天衍 8 空间里**唯一真正的沉浸式写作面**，也正是 R1 反馈第 3 条所要求的：「1440 默认态中，正文舞台被场景头、Run 条、候选卡和 composer 挤压，**稿纸感没有出来**」（`FOUNDER_FEEDBACK.md:22-23`） |

### 一句话定位

**它想当作者的书桌，但穿了一件后台的壳。** 主列（正文 + 走向 + 指令）是创作工具，而且是天衍目前所有工作面里最接近"作者舞台"的一版；但左导航、顶栏和右栏的堆叠方式，把它又拉回了控制台感——讽刺的是，「R0 女娲看起来更像一个后台控制台或文档管理页」+「白卡堆叠感强」正是 R0 被创始人退回的原话（`FOUNDER_FEEDBACK.md:35-36`）。

---

## 2. 信息层级

### 一级视觉焦点：**场景标题 + 连续正文**

- 手段：1586 宽画布里 996px 全宽白卡、无内边框；场景名用大号衬线（y≈181–215 区带，E23）；正文段落墨色、行距宽松；对白用浅底气泡 + 左侧竖线缩进，比叙述弱一级但比辅助卡强。
- 面积证据：主列 y140–770（630px）里正文卡占 430px = **68%**。

### 二级：**「接下来的走向」三张方向卡 + 底部指令输入**（决策带）

- 手段：A 字母徽标实心青绿（B/C 灰）、卡片标题加粗、卡内 2 行描述、效应小徽标（真相+1/风险+1…）、A 卡左侧青绿描边表示选中；指令框是圆角描边条 + 实心青绿圆形发送钮。
- 面积证据：y775–890（≈115px）+ y906–939（输入条 34px）+ y945–985（chips 与主按钮）。

### 三级：**场景头元数据 + 右栏 6 张辅助卡**

- 场景头（y140–332，193px）：序号 `3 / 12`、场景 chips（码头/雨棚/船舱/海上）、地点、三个情境标签、出场角色头像条、两行摘要。
- 右栏（x1215–1564，350px）：当前单元 / 相关场景 / 事件线约束 / 角色视角与知晓 / 场景笔记 / 创作提示。

### 四级：**左导航、顶栏、保存与撤销状态**

- 左导航 190px 深色但文字低对比（`#12334a` 底 + 浅字），顶栏 50px 只有小字，「自动保存于 14:24:36 / 撤销 / 重做」被压到页签行右侧灰字。

### 层级失衡（三处，必须点出）

| # | 问题 | 证据 |
| --- | --- | --- |
| 1 | **三张等宽方向卡与正文同权重**——二级吃掉了一级 | 方向卡区 115px 高、三卡等宽并列、彩色徽标；而 R1 反馈对 R0 的第 2 条否决理由正是这句：「默认态即显示三张等宽大卡，视觉重心压过正文舞台」（`FOUNDER_FEEDBACK.md:19`，同条 `:20`「方向卡与正式正文同权重，容易让作者误以为候选就是将要发生的正式情节」） |
| 2 | **照片头像的视觉重量高于方向卡** | 场景头里 3 张 56px 圆形彩色人像 + 姓名 + 分级标签（E30/E31），是全图饱和度最高的元素之一，但它在三级 |
| 3 | **唯一的高饱和红被放在三级** | 「事件线约束」的靶心图标（E55）是全图唯一红色强调，语义上应是硬约束，却排在右栏第三张卡；同时图上没有任何"硬约束不可违反"的反馈通道 |

---

## 3. 布局结构

### 3.1 ASCII 图（按实测 px 等比，画布 1586×992）

```
┌────────────┬──────────────────────────────────────────────────────────┬────────────────────┐
│ 左导航     │ 顶栏 50px  北溟创作案例（合成）  北溟主作品·r1 ▾   全局搜索 ⌘K │ 目录 待确认 天璇助手 ⋯│
│ 190px      ├──────────────────────────────────────────────────────────┴────────────────────┤
│ #12334a    │ Hero ~90px  女娲 叙事共创  ▏水墨山水底图（右）千般可能，皆为故事。——女娲       │
│ 深色       ├──────────────────────────────────────────────────────────┬────────────────────┤
│ 创作空间   │ ①场景头卡 y140-332 (193px)                                │ 右栏 x1215-1564      │
│ 项目概览   │  当前场景  ‹ 3 / 12 ›  → [码头] 雨棚 船舱 海上 ⋯           │ (350px, 6 张卡)      │
│ 世界设定   │  夜色下的北溟码头 (衬线)      出现角色（3）  ☺  ☺ ⊕添加   │                      │
│ 角色管理   │  📍北溟·码头 [夜晚][下雨][关键剧情]                        │ ①当前单元            │
│ 剧情大纲   │  摘要两行…                              林月如 沈砚 白璃   │  第一章 风起海岸      │
│ ▶ 女娲 ◀──│                                                  主角 重要 关键│ [进行中] 简介3行    │
│ 素材库     ├──────────────────────────────────────────────────────────┤ 查看全貌 →           │
│ 文档与输出 │ ②正文卡 y340-770 (≈430px)  ← 一级焦点                     │ ②相关场景 本单元·3/12│
│ 版本管理   │  [场景正文|推演过程]   ✓自动保存于 14:24:36  ↶撤销 重做 ⋯ │  ▣1初到北溟 ▣2雨棚下 │
│ 团队协作   │  ─────────────────────────────────────────────────────── │  ▣3夜色下的码头▣4船舱│
│ 数据看板   │  海面上起了薄雾，远处的渔灯…（叙述段落，行高 1.8）  ⊕继续生成 ⋯│ 码头·夜晚(选中) ‹ › │
│            │  ┌────────────────────────────────┐                      │ 查看地图 →           │
│            │  │☺ 林月如│"……你果然来了。"       │  ← 对白气泡           │ ③事件线约束 ◎(红)    │
│            │  └────────────────────────────────┘                      │  不可偏离的核心设定· │
│            │  沈砚从暗处走出，黑色的风衣被雨水打湿…（叙述）             │  1 北溟在本章不会发生│
│            │  ┌────────────────────────────────┐                      │  2 沈砚的真实身份…  │
│            │  │☺ 沈砚  │"我说过，会给你答案…"  │                      │  3 林月如必须在本章… │
│            │  └────────────────────────────────┘                      │ 查看详情 →           │
│            │  白璃站在两人不远处…                                      │ ④角色视角与知晓 [切换]│
│            │  ┌────────────────────────────────┐                      │  当前视角：林月如    │
│            │  │☺ 白璃  │"时间不多了…"          │                      │ [知晓|未知|内心动机] │
│            │  └────────────────────────────────┘                      │ · 4 条要点           │
│ ────────   ├──────────────────────────────────────────────────────────┤ ⑤场景笔记 [编辑]     │
│ ⚙ 设置     │ ③接下来的走向？ y775-890 (≈115px)  ← 二级                │  · 3 条              │
│ ❓ 帮助中心 ├──────────────────────────────────────────────────────────┤ ⑥创作提示 换一批    │
│ ───────   │ ─A 登上海船──┐ ┌─B 留在码头─┐ ┌─C 向白璃询问┐            │  · 3 条              │
│ ☺ 墨海     │ ││决定跟随沈砚…│ ││暂时不跟随… │ ││单独与白璃… ││  ↗       │                    │
│   创作者   │ ││[真相+1][风险+1]││[信息+1][关系+1]││[新线索+1][关系+1]│  │                    │
│            ├──────────────────────────────────────────────────────────┤                    │
│            │ ④✦ 输入你的指令，或描述你希望发生的情节…          📎  (→) │                    │
│            │ [↻继续当前情节][⇄更换叙述视角][♙加入新角色][◔调整气氛][生成支线] ⋯│              │
│            │                            [🔒仅保存草稿] [应用选择，继续推演 Ctrl⏎]│             │
└────────────┴──────────────────────────────────────────────────────────┴────────────────────┘
      190px        主列 996px（x200–1196）        gap 19px        右栏 350px   外边距 22px
```

### 3.2 实测尺寸 vs 天衍现状 vs R1 冻结

| 度量 | 效果图实测 | 当前代码（盘/基线） | R1 冻结值 | 差 |
| --- | --- | --- | --- | --- |
| 左导航宽 | **190px**（x0–188/192） | `--space-rail-width: 8.25rem` = **132px**（`product-shell/theme/tokens.css:41`） | **176px**（`INTERACTION_RULES.md:42`） | 图比代码 +58px；三方各不同 |
| 左导航收起宽 | 图上无收起态 | `--space-rail-collapsed-width: 3.5rem` = **56px**（`tokens.css:42`） | **56px**（`:43`） | 代码与 R1 **一致** |
| 顶栏高 | **50px**（y0–49） | `--topbar-height: 3.125rem` = **50px**（`tokens.css:40`） | 未规定 | **完全一致** |
| 右栏宽 | **350px**（x1215–1564） | 作者工作面实际生效值：`.nuwa-n1-body.nuwa-author-layout { … 19.5rem }` = **312px**（基线 `styles/nuwa-n1.css:264`）；旧版通用体 `18rem` = 288px（盘 `:57` / 基线 `:58`）；Dock `--dock-stack-width: 17rem` = 272px（`tokens.css:47`） | **320px**（女娲，`:22/:42`）；300px（世界观，`:25`） | 四个值：图 350 / R1 320 / **R6 已实现 312** / token 288。图比现状 +38px |
| 主列 ↔ 右栏间距 | **≈19px** | 16px（`nuwa-n1.css:57/264` `gap:1rem`；R6 报告 `:32` 亦记 16px） | 未规定 | +3px，可视为同值 |
| 场景头高 | **193px**（y140–332） | 基线 `.nuwa-scene-overview` 为两列 grid（`nuwa-n1.css:232`），无高度约束 | **≤96px**（`IMPLEMENTATION_MAPPING.md:9`） | **图是 R1 上限的 2.0 倍** |
| 走向区高 | **≈115px**（y775–890），三张等宽卡 | 基线 `NuwaDirectionCandidates.tsx:28-40` + `.nuwa-direction-grid { repeat(auto-fit, minmax(13rem, 1fr)) }`（`nuwa-n1.css:333`）——**3 个候选时确实渲染成 3 张等宽卡**，无高度约束 | **80–110px 紧凑栏**，默认只显示 1 个方向 + 另两个短标签 + "展开比较"（`INTERACTION_RULES.md:10`、`DESIGN_TOKENS.md:75`） | 高度接近，**形态相反**：R1 要单条紧凑，图与现状代码都是并列三卡 |
| 圆角 | 实测 8–12px（卡/chip/按钮）；R6 报告 `:28` 自述实现亦为"8–12px 圆角" | `--radius-sm/md/lg` = **6 / 10 / 16px**（`tokens.css:37-39`） | **4 / 7 / 10px**（`DESIGN_TOKENS.md:68`） | 三方不一致；**已实现的 R6 站在图这一边** |
| 主列宽 | 996px @1586 | 1440 下现状约 **980px**（1440 − 132 rail − 16 gap − 312 右栏）；若工程目录面板与工具条同时展开再扣 284px → **≈696px** | 主列自适应 | 见 §5.2 E62 |

### 3.3 换算到受管视口 1440×900

两条侧栏是固定宽度、只有主列收缩，因此不能整体缩放：

- 按图上固定值（导航 190 + 导航↔主列 10 + 主列↔右栏 19 + 右栏 350 + 右边距 22 = **591px**）→ 主列 **849px**；再叠加天衍现有的工程目录面板（`--directory-width: 14rem` = 224px，`tokens.css:43`）与工具条（`--panel-controls-width: 3.75rem` = 60px，`:45`）→ 主列 **565px**。图上 996px 的主列在 1440 里**最多只能拿到 849px，真实壳层下只有 565px**。
- 正文卡高度 430px 在 900 高视口里，扣掉顶栏 50 + Hero 90 + 场景头 193 + 页签行 45 = 378px → **首屏只剩 ~522px 给正文**，走向区与 composer 必然被推出首屏。而 R6 验收报告 `:33` 明确要求"首屏（不滚动）…正文为最大视觉区域…底部输入、保存状态全部可见"。**图与已验收的首屏约束不自洽**，落地前必须砍场景头或 Hero。

### 3.4 色彩实测 vs 现状 vs R1

| 角色 | 图上实测 | 当前 token | R1 token | 判定 |
| --- | --- | --- | --- | --- |
| 结构底（左导航） | `#12334a` | `--color-structure-background: #112b3f`（`product-shell/theme/tokens.css:3`） | 未规定（R1 走纸色） | **几乎同色**（ΔR1 ΔG8 ΔB11）→ 深色导航不是新发明，是现状 |
| 导航选中态 | `#16435c` + 青绿描边 | `.shell-space-link.is-active`（`styles/tianyan-r0-shell.css:279`） | `--jade-soft #e2ebe2`（`DESIGN_TOKENS.md:30`） | 图上形态更贴近现状 |
| 主强调色 | `#067a85`（应用按钮实心） | `--color-accent: #1f6b63`（`tokens.css:14`） | `--jade: #2e6d5e`（`:28`） | **色相不同**：图 185°（青蓝）/ 现状 174° / R1 166°（玉绿）→ 需显式选择，不能默认 |
| 页面底 | `#f7f6f5`（近中性） | `--color-surface: #fbf9f4`（暖纸，`tokens.css:6`） | `--paper: #f2eee3`（明显暖纸，`:12`） | 图比现状更冷、比 R1 更白 |
| 卡面 | `#fefefe` 纯白卡 + 浅灰底 | `--color-surface` / `--color-surface-muted` | R1 明写「层级靠纸色深浅 + 墨线，**不靠层层白卡**」（`DESIGN_TOKENS.md:9`；规则 `:53`「层级优先级 = 纸色深浅 → 墨线 → 留白 → 边框圆角。嵌套卡层最多两层」） | **方向冲突**：图正是被否决的白卡堆叠 |
| 次级强调 | 铜金 0 处 | `--color-accent-secondary: #b56b31`（`tokens.css:16`） | `--copper: #a0742c`（`:32`，"候选、当前故事位置、女娲轨迹"） | 图完全没用铜金 → 女娲"轨迹/织线"符号缺失（对应 `FOUNDER_FEEDBACK.md:36`） |

---

## 4. 可复用组件

只列**天衍已经存在、可直接承接图上元素**的组件。路径为盘（`f77b800`）时可直接改；标"基线"的需先合并 `origin/codex/semantic-world-r3`。

| 图上组件 | 图内坐标 | 天衍现状 | 现成资产（path:line） | 复用方式 |
| --- | --- | --- | --- | --- |
| 深色左导航 + 品牌区 | x0–190 | **盘** | `product-shell/navigation/ProductShellNavigation.tsx:52-53,88-89,103,105`；样式 `styles/tianyan-r0-shell.css:161-170,279`；宽 `tokens.css:41-42` | 换皮即可；**项数不能照抄**（§5.2 E02） |
| 顶栏（项目名/版本/搜索/目录/待确认/助手/⋯） | y0–50 | **盘** | `topbar/GlobalStatusBar.tsx:118`（项目）、`:128-173`（项目与新建菜单）、`:178`+`global-search/GlobalSearchControl.tsx:35`（搜索，**⌘K/Ctrl+K 已实现**）、`:189`（目录）、`:190`（待确认入口）、`:191`（天意）、`:193`（⋯） | 5 项原样复用；助手项改名需走 i18n（§5.2 E14） |
| 场景头（标签+翻页+chips+标题+标签+摘要+出场角色） | y140–332 | **基线** | `components/nuwa/NuwaSceneOverview.tsx:29-49`（pager `:30-33`、chips `:35-37`、标题 `:42`、标签 `:43-47`、摘要 `:49`）、`:51-61`（出场角色 + 首字头像 `:57` + 空态 `:60`） | 结构 1:1 复用，**只删不改**：图上多出的地点/下雨/关键剧情/分级/添加 无数据 |
| 页签（工作面切换） | y345–385 | **基线** | `NuwaN1Workspace.tsx:587-590` `nuwa-focus-tabs`（真实标签是「分支场景正文 / 排演现场」） | 复用容器，**标签文案不能照抄**（§5.2 E33） |
| 连续正文流（叙述/行动/对白/心理） | y388–770 | **基线** | `NuwaUnifiedSceneWorkspace.tsx`（69 行，`.nuwa-scene-node`/`.nuwa-dialogue-row`/`.nuwa-avatar`/`.nuwa-block-input`）+ 投影层 `nuwaSceneWorkspaceModel.ts:4-18`（`SceneBlockKind` 五态、`heardByTitles`、`delivery: spoken\|aside`、`source: persisted\|run-candidate`） | 直接复用；图上"连续正文 + 弱分隔"就是它的实现口径 |
| 对白行（头像+姓名+气泡） | 正文内 | **基线** | 同上 `.nuwa-dialogue-row`；`nuwaSceneWorkspaceModel.ts:59-66`（说话者/归属者/听闻映射为显示名，非内部 ID） | 复用，头像保持**首字**（照片无资产） |
| 走向卡（A/B/C，≤3 张） | y775–890 | **基线** | `NuwaDirectionCandidates.tsx:3`（`DIRECTION_LABELS`）、`:29-30`（`slice(0,3)` + 字母徽标）、`:32-38`（标题/`候选 · 尚未保存`/结果摘要/`<details>推演过程`）、`:27`（**诚实空态**）、`:19`（注释「不构造虚构方向」） | 复用卡壳；**效应徽标与选中态需先补数据**（§5.3 E42、§5.2 E43） |
| 指令输入 + 发送 | y906–939 | **基线** | `NuwaN1Workspace.tsx:720` `data-testid="nuwa-author-composer"`、`maxLength=800`、紧凑/展开双态；底部安全区高度由 `:198` 写入 `--nuwa-composer-height`，由**基线** `styles/nuwa-n1.css:226` 读取（该文件盘上 196 行、基线 398 行，`:226` 只在基线存在） | 复用；placeholder 换文案即可 |
| 采纳动作（多选步骤 → 待确认 / 自动应用） | 图上"应用选择" | **盘 + 基线** | 复选框「选择结果」在 `NuwaRunReader` 步骤行内（盘 `:384`、基线 `:776`）→ `selectedStepIds`（盘 `:56`、基线 `:73`）→ 基线调用点 `:431` `createNuwaN1Candidate` / `:440` `autoApplyNuwaN1Result`（`localTransport.ts:2714`/`:2719`，后者受 `run.authorization?.status === "active"` 门控，见基线 `:437` 的守卫） | **真实可用**，但入口在步骤列表不在方向卡（§5.2 E43） |
| 保存草稿 / 阶段版本 | 图上"仅保存草稿" | **基线** | `NuwaN1Workspace.tsx:687`（保存草稿）、`:688`（分支内采纳）、`:694`（保存阶段版本）+ 原文提示「只有阶段版本产生版本修订；草稿保存不产生。」（`:695`） | 复用，**图上文案会误导**（§5.2 E48） |
| 右栏辅助卡容器 | x1215–1564 | **基线** | `NuwaN1Workspace.tsx:723-725`（`aside.nuwa-n1-inspector` → `.nuwa-story-cards`）+ `nuwa-story-card` 样式；作者布局右栏宽 `nuwa-n1.css:264`（19.5rem = 312px） | 复用容器；宽度是四方冲突项 |
| 当前单元卡 | 右栏① | **基线** | `:726-728`（`nuwa-story-unit-card`；单元名 `sceneEntries[0]?.title ?? activeSceneTitle` `:727`，进度 `{i+1}/{n} 单元 · {steps}/{budget} 步 · 排演{status}` `:728`） | 复用；图上"进行中 + 简介"无源 |
| 相关场景列表 | 右栏② | **基线** | `:731-737`（`nuwa-story-scenes` 文字按钮 `:734` + `is-active` + 空态「分支还没有场景节点。」`:735`）；场景序号源 `NuwaSceneOverview.tsx:30-33` | 复用为文字列表，**不做缩略图** |
| 两个跨页跳转 | 右栏"查看全貌/查看地图" | **盘 + 基线** | `查看全貌` → `/event-line?projectId=…` 与 `查看地图` → `/library?libraryView=…` 同在基线 `:729`；盘上另有 `查看地图` 按钮 `components/world/WorldOverviewWorkspace.tsx:57` | 原样复用 |
| 事件线约束卡 | 右栏③ | **基线** | `:738-742`（范围 `{storylineLabel} · {mode}` 与预算 `{N} 步 / 12 次模型发送` 在 `:740`，「只读约束；正式写入仍走待确认或授权范围。」在 `:741`） | 复用现有三行文本，**3 条编号约束需先补合同** |
| 角色知情检查器 | 右栏④ | **盘 + 基线** | 三页签 `nav aria-label="检查器内容"`（盘 `NuwaN1Workspace.tsx:364`、基线 `:743`；角色知情/步骤结果/运行记录）；`ContextInspector`（基线 `:744`，定义 `:780`）；数据 `src/storyContracts/characterContextPack.ts:64-76`（**仅基线**：`includedFacts:70`/`includedMemories:71`/`relationSnapshot:72`/`visibleEvents:73`/`excluded:74`，排除理由 `:18` = `author-note\|rumor\|character-unknown`）；盘上另有仓库根 `src/storyContracts/characterStateProjection.ts:69-97`（`KnowledgeBoundaryClaim/Finding/Receipt`） | 复用真实五分法，**不套图上三段式** |
| 分支/节点合同（支线数据底座） | 图上"生成支线" | **基线** | 仓库根 `src/storyContracts/nuwaBranchNode.ts`（`NuwaBranchNode:32`/`NuwaBranchScene`/`mintNuwaNodeId:68`/`sceneKey`/`nuwaBranchNodeDigest:177`，`:43` `characterRefs`、`:49` `updatedAt`）；路由 `apps/story-studio/src/lib/localTransport.ts:2684-2713`（基线）；落盘 `src/storyControlSurface/storyStudioWorkspaceOperations.ts:4375-4378`（`nuwaBranchDirectory` → `realpath(project)/.world-os/workspace/nuwa-branches/<sha256(workVersionId)[0:32]>/`）、`readNuwaBranchScenes:4463`、`checkpointSnapshotFile:4486` | 底座**已在基线**，图上按钮仍是假（§5.3） |
| 右栏收起/展开 | 图上无 | **基线** | `NuwaSceneOverview.tsx:53`（`PanelRight` 按钮，`aria-pressed`）+ `data-sidebar-open`（`NuwaN1Workspace.tsx:586`） | 图上漏了，落地时应保留 |

**结论**：图上主列与右栏的**结构骨架 90% 已在基线存在**（R6 报告自述 11 项 MATCH 属实）。真正缺的不是组件，而是：① 23 组元素的数据；② 一个被 44 个提交之差隔开的合并动作。

---

## 5. 对当前天衍的适配

编号 E01–E62 与 §0.4 的统计一一对应：**§5.1 共 31 组、§5.2 共 8 组、§5.3 共 23 组**。

### 5.1 可以直接借鉴（31 组，零新增数据）

按"改一行样式就能落地"到"需要先合并基线"排序：

| 编号 | 可借鉴项 | 为什么零风险 |
| --- | --- | --- |
| E01 | 左导航品牌区（图形 + 天衍 Worlding + 副标语） | 现状已有 `shell-brand-home`/`shell-brand-copy`（`tianyan-r0-shell.css:341-342`），只换文案 |
| E03 | 导航选中态（描边 pill + 左高亮条） | 现状 `.shell-space-link.is-active`（`:279`）+ `aria-current`（`ProductShellNavigation.tsx:88`）已是同一语义 |
| E04 | 导航分组分隔线 | 纯样式 |
| E05 | 「设置」独立于工作空间 | 现状已是独立路由（`TianyanR0Shell.tsx:71,419`；`nav.settings` 键） |
| E08 | 顶栏项目名 | `GlobalStatusBar.tsx:118` |
| E09 | 项目 + 版本选择器 ▾ | `:128-173` 已有项目菜单与新建入口 |
| E10 | 全局搜索框 + ⌘K | `:178` + `global-search/GlobalSearchControl.tsx:35`（`ctrlKey\|\|metaKey` + `k`）**已实现**；读侧只读聚合、不建第二索引（`global-search/globalSearchReadAdapter.ts:5-8`「No source content is copied into this module and no write port is exposed」） |
| E11 | 目录开关 | `:189`（`aria-pressed` 双向） |
| E12 | 待确认入口 | `:190`（`data-panel-toggle="pending-review"`，真实动作已接） |
| E15 | ⋯ 溢出菜单 | `:193-198` |
| E17 | 页面标题「女娲」+ 副名 | 现状 `<h1>女娲</h1>`（盘 `NuwaN1Workspace.tsx:318`） |
| E18 | 一句话说明 + 侧栏引言 | 纯文案，但必须同时加 `zh-CN`/`en-US` 两键——`tianyanR0ShellContract.test.ts:33-41` 强制键集相等 |
| E19 | 「当前场景」标签 | `NuwaSceneOverview.tsx:41` |
| E20 | 场景翻页 `‹ N / M ›` | `:30-33`（含 `hasPrev/hasNext` 禁用态）。**注意**：`M` 只能来自分支场景数；Run scope 上限 3 单元（`apps/story-studio/server/nuwaN1Port.mjs:885` `startIndex + 2`）且 `currentSceneIndex` 服务端固定为 0（`:897`），所以图上的 "12" 不是排演作用域 |
| E21 | 场景 chips（横向切换） | `:35-37` |
| E23 | 场景大标题（衬线） | `:42` + `--font-display` |
| E25 | 情境标签「夜晚」 | `:44`（`worldTimeLabel`，真实世界时间投影） |
| E28 | 场景摘要 | `:49`（`sceneSummary` = 真实正文首段投影，R6 报告 `:17`） |
| E29 | 「出场角色（N）」计数 | `:52`（`cast.length`，来源是当前场景真实出场者） |
| E34 | 自动保存状态位 | `:38`（`saveStatusText`，`role="status"`） |
| E38 | 连续正文 + 节点弱分隔 | `NuwaUnifiedSceneWorkspace.tsx` + R6 报告 `:19`（无编号/无 kind/无内部 ID） |
| E40 | 对白气泡 + 听闻小注 | `.nuwa-dialogue-row` + `heardByTitles`/`delivery: aside`（`nuwaSceneWorkspaceModel.ts:12-13`） |
| E41 | 「接下来的走向」区（含诚实空态） | `NuwaDirectionCandidates.tsx:22/:27` |
| E44 | 指令输入框（含长度上限） | 基线 `:720`（`maxLength=800`） |
| E46 | 发送动作 | 基线 `:720`「加入后续步骤」→ `cue` 路由（`localTransport.ts:2711`） |
| E48 | 「保存草稿」按钮 | 基线 `:687`。**图上文案「仅保存草稿」需改**：真实语义是"草稿不产生版本修订"（`:695` 原文提示），不能暗示"只存本地不提交" |
| E50 | 当前单元卡 | 基线 `:726-728` |
| E52 | 相关场景列表（文字版） | 基线 `:731-737` |
| E54 | 查看全貌 / 查看地图 | 基线 `:729`、盘 `WorldOverviewWorkspace.tsx:57` |
| E55 | 事件线约束卡（范围 + 预算 + 只读声明） | 基线 `:738-742` |
| E57 | 角色知情检查器 | 基线 `:744`（页签 `:743`）+ 基线 `src/storyContracts/characterContextPack.ts:64-76` |

### 5.2 会破坏已有功能（8 组，落地前必须先解决）

| 编号 | 图上做法 | 会打到什么 | 证据 |
| --- | --- | --- | --- |
| **E02** | 左导航 **11 项**（创作空间/项目概览/世界设定/角色管理/剧情大纲/女娲/素材库/文档与输出/版本管理/团队协作/数据看板）+ 底部「设置」「帮助中心」 | **直接打红契约测试**，且 6 项无落点、3 个真实工作空间与 1 个派生目的地被抹掉 | `tests/storyContracts/tianyanR0ShellContract.test.ts:24` 断言 displayName 数组**恰为** `["世界","天意","事件线","多元","女娲","资料","创作","数据"]`，`:26` 断言 workspace 数 **= 8**；注册表 `src/storyContracts/storyStudioWorkspaceRegistry.ts:40-47`（改顶级空间的唯一入口，`项目目录导航.md:178` 明写）。**映射结果**：11 项里 5 项能对上真实空间（创作空间→创作、世界设定→世界、女娲→女娲、素材库→资料、数据看板→数据），**6 项无落点**（项目概览、角色管理、剧情大纲、文档与输出、版本管理、团队协作——这 6 个词全仓 0 命中；「数据看板」「帮助中心」作为字面串同样 0 命中）；同时图上**没有** 天意、事件线、多元 三个真实工作空间，也没有 合册 这个派生目的地（`src/storyContracts/storyStudioWorkspaceRegistry.ts:53-63` 定义 `kind: "derived"`，与 8 个 workspace 一起合成 `STORY_STUDIO_SHELL_NAVIGATION_REGISTRY` `:83-86`）|
| **E14** | 顶栏「天璇助手」 | 天意是唯一 Agent 入口，改名打断 i18n 键配对与面板 toggle | `GlobalStatusBar.tsx:191`（`panel.tianyiAgent`、`data-panel-toggle="tianyi-agent"`）；`test.ts:33-41` 要求中英键集完全相同；AGENTS.md「保持唯一…所有者」纪律。图上"天璇"在全仓 **0 命中**（`git grep 天璇`/`git grep 天玑` 均无结果） |
| **E33** | 页签「场景正文 / 推演过程」 | 真实页签是「分支场景正文 / 排演现场」，且**只在 branch 视图 + 有 Run 时**渲染；"推演过程"在真实实现里是方向卡内的 `<details>` 与工具条动作，不是页签 | 基线 `NuwaN1Workspace.tsx:587-590`；`NuwaDirectionCandidates.tsx:34-38`。照抄会造出一个没有内容的第二页签（= 假导航） |
| **E43** | 方向卡可点选（A 卡左描边）+「应用选择」 | 采纳合同是**多选 Run 步骤**（`selectedStepIds: string[]`），不是三选一；且方向卡组件**没有 onSelect 属性** | `localTransport.ts:2714/:2719`（盘 + 基线，`selectedStepIds: string[]`）、基线 `NuwaDirectionCandidates.tsx:10-16`（props 只有 `steps/visible/busy/onInspect`）、基线 `NuwaN1Workspace.tsx:715`（有分支节点时 `NuwaRunReader` **不渲染** → 图上这种"已有正文"状态下根本没有复选框入口）。要做"卡上直选"必须先决定它映射到哪个 stepId |
| **E47** | composer 首行平铺 5 个动作 chips（继续当前情节/更换叙述视角/加入新角色/调整气氛/生成分支） | **这正是创始人已明文否决过的形态** | `FOUNDER_FEEDBACK.md:30-32`（B.5「预留功能占据真实界面」）：「"角色访谈 / 角色接管 / 作者干预"等尚未实现的模式以 chip 形式平铺在 composer 首行，视觉上与"与女娲共创"并列。…预留功能必须明确标识且不可点击，不能占据默认主工作面」。图上 5 个 chips 里 4 个无后端（§5.3），照抄等于把 R0 的退回理由重做一遍 |
| **E49** | 「应用选择，继续推演 **Ctrl ⏎**」 | 组合了两个不同动作，且快捷键不存在 | 全仓 `git grep metaKey\|ctrlKey -- apps/story-studio/src/components/nuwa` = **0 命中**；"采纳"（`candidate`/`auto-apply`）与"连续推演"（`continuous`，`localTransport.ts:2701`）是两个独立写路径、两个 `expectedRevision`。合并成一个按钮会造成一次点击两次乐观并发写，且 `auto-apply` 受授权门控（`run.authorization.status === "active"`）——按钮态必须随授权状态变化，图上没有这个态 |
| **E58** | 角色知晓三段式（知晓信息 / 未知信息 / 内心动机） | 与真实五分法不同构，硬套会造假 | 真实合同 `src/storyContracts/characterContextPack.ts:64-76`（**仅基线**）：`includedFacts:70` / `includedMemories:71` / `relationSnapshot:72` / `visibleEvents:73` / `excluded:74`，排除理由 `:18` = `author-note\|rumor\|character-unknown`。**"未知信息"页签与 `excluded` 不是一回事**：① `excluded` 里混着"作者备注""传闻"两类**根本不是该角色未知**的条目，直接改名会给出错误语义；② 现状 UI 只露出**计数**（基线 `NuwaN1Workspace.tsx:315` `excludedCount`），从不把 `excluded[].title` 渲染进 DOM——把"未知信息"做成可点列表，等于把这条硬约束（`:5-9`「作者备注/传闻永不进入」）改成可出站展示；③ "内心动机"最接近的真实字段是 `goal:68` + `kernel:69`（检查器里已是 `localGoal`/`coreSummary`），不该另立第三段式 |
| **E62** | 整页只有 3 栏（导航 / 主列 / 右栏），没有工程目录面板、没有 ContextDock、没有工具条 | 打穿工作台顺序与默认布局契约 | `test.ts:44-47`：`TIAN_YAN_R0_DEFAULT_LAYOUT` 键集恰为 `["project-directory","tianyi-agent"]` 且 `project-directory.visible === true`，`R0_2_WORKBENCH_ORDER = ["global-space-rail","project-directory","central-workspace","context-dock","tool-launcher-rail"]`；`right-dock` 纪律「同时最多挂载一个可用工具」（`项目目录导航.md:75`）。图上把右栏当**信息流**，现状把右栏当**单工具槽**——两种模型不能同时成立 |

### 5.3 假功能（23 组：图上有，数据里没有）

判据见 §0.3 第 3 条。每组都写"要变真，先得有什么"——**在拿到之前，禁止做成界面**。

| 编号 | 图上元素 | 为什么假 | 要变真需要先有 |
| --- | --- | --- | --- |
| E06 | 「帮助中心」导航项 | 全仓 0 命中，无路由、无空间 | 一个真实目的地或删掉 |
| E07 | 用户卡（照片头像 +「墨海」+「创作者」） | 无头像资产（§0.4）；`product-shell/workspace/AccountCenterWorkspace.tsx` 按 `项目目录导航.md:73` 只允许"无后端账号能力前的个人信息占位，不拥有身份、用户名、充值、订阅或账户写入" | 账号能力与角色标签合同；现状只能显示占位名 |
| E13 | 顶栏「待确认」**计数** | 入口真（`:190`）但无计数徽标；真实计数在 `project-directory/pendingReviewAggregation.ts:135`（`pendingCount`），从未上顶栏 | 一个把既有聚合读到顶栏的只读投影（不需要新 owner） |
| E16 | Hero 水墨山水底图 | 仓库 0 位图资产；`background-image` 全为渐变 | 真实资产决策 + 无资产时的降级方案（R1 要的是"命运织线、轨迹、墨线稿纸"符号，不是照片山水，`FOUNDER_FEEDBACK.md:36`） |
| E22 | 场景 chips 尾部「⋯」溢出 | `NuwaSceneOverview.tsx:35-37` 全量渲染，无溢出折叠 | chips 溢出策略（纯 UI，可做，但别让它成为假按钮） |
| E24 | 地点「📍 北溟 · 码头」 | 场景头 props 无地点字段（`NuwaSceneOverview.tsx:3-20`） | 场景级地点投影（现有 WorldObject 有地点，但未绑定到 nuwa 场景） |
| E26 | 标签「下雨」（天气） | 无天气字段；`SceneBlockKind` 与 `NuwaBranchScene` 都没有 | 世界时间/环境事实合同；现状只有 `worldTimeLabel` |
| E27 | 标签「关键剧情」（重要度） | 无场景重要度字段，且现状角色分级是目录级 `subtype`（`项目目录导航.md:74`） | 场景分级合同 + 作者显式赋值 |
| E30 | 人物照片头像（3 张 + 对白行 + 用户卡） | 0 资产；现状是首字头像（`NuwaSceneOverview.tsx:57`）；`portrait` 字段只在角色目录（`localTransport.ts:640,:2876`）且 fixture 里 `portrait: null`（`eventLineFixture.ts:44,140`） | 资产管线 + 非假降级（首字/剪影）；否则保持首字 |
| E31 | 角色分级「主角 / 重要角色 / 关键角色」 | 无场景级分级；最接近的是目录级 `roleLevel: main\|supporting\|minor`（`CharacterCreateDialog.tsx:10,72`、`characterDirectoryPresentation.ts:81`），口径不同 | 决定"场景内分级"是否等于"作品内分级"，否则不要显示 |
| E32 | 「⊕ 添加」把角色加入场景 | 无动作、无写路径；`characterRefs` 只在节点创建时隐式写入（基线 `src/storyContracts/nuwaBranchNode.ts:43` ← 基线 `NuwaN1Workspace.tsx:288` 的 `createNuwaBranchNode` 调用） | 一个显式的"场景出场者"写端口 + 与正文块归属的一致性规则 |
| E35 | 「自动保存于 **14:24:36**」时钟戳 | 现状状态串是**修订号语义**：「草稿已自动保存 · 内容 r{n}」（基线 `NuwaN1Workspace.tsx:233`）；`updatedAt` 字段存在但从未露出（`nuwaBranchNode.ts:49`）；`formatTime()` 只用于运行记录收据（基线 `:812` 使用、`:830` 定义），且其格式是"时:分 + 月/日"，**根本没有秒**；`CreationAutosaveController`（仓库根 `src/storyCreation/autosaveController.ts:4`）**零 UI 消费者** | 决定展示口径（修订号 or 时间）并接到 `updatedAt`；否则保留现状文案 |
| E36 | 「↶ 撤销」 | 场景正文无 undo 端口；`apps/story-studio/src/hooks/useDocumentHistory.ts:3` 有真实 past/future 栈但**零消费者**（死代码）；地图另有线性 undo（`components/world/MapM1Workspace.tsx:124` 栈 + `:493` `undoAuthoring`）；**天意**写入侧才有具名撤销（`undoTianyiStoryIntakeBatch` `localTransport.ts:3434-3436`、`undoTianyiCreativeEvent` `:3452`），女娲正文没有 | 见右栏硬约束：正文写入走 `node-content` + `expectedContentRevision`（基线 `localTransport.ts:2701-2703`、`apps/story-studio/server/server.mjs:4285`），本地历史栈与之不兼容，接入即产生**第二正文写入者** |
| E37 | 「↷ 重做」 | 同 E36 | 同 E36 |
| E39 | 「⊕ 继续生成」 | 无正文续写路由；`runNuwaN1Action`（`:2693`）作用于 Run 而非草稿 | 一个明确的"续写"动作 + 它属于 Run 还是草稿的归属决策 |
| E42 | 效应徽标「真相 +1 / 风险 +1 / 信息 +1 / 关系 +1 / 新线索 +1」 | **全仓无类型化效应计分**。候选的真实形状是**句子数组**，不是数字：服务端投影 `apps/story-studio/server/server.mjs:4512-4530` 给的是 `change` / `after`（`stateDeltas.join("；")`）/ `causes`（`causalChain`）/ `uncertainty` / `risks` / `unknowns`，类型见仓库根 `src/storyIntelligence/storyIntelligenceTypes.ts:161`、`:203`（`preservedMysteries: string[]`）。唯一带 `riskLevel: 低\|中\|高` + `impacts` + `consequence` 的结构是 `src/storyProductPrototypeState.ts:40-49` 的**硬编码原型数据**，只被 `src/storyControlSurface/*` 引用，`apps/story-studio` 从不 import | 一套候选效应维度合同（谁算、算几次、是否出站给 Provider、+1 的对偶是什么）。**这是全图最危险的假功能**：数字看起来像依据，实际是编的；而现状刻意用句子而非分数 |
| E45 | 「📎 附件」 | 女娲 composer 无附件路径；真实附件只在天意（`components/tianyi/workspace/TianyiConversationWorkspace.tsx:489`、类型 `localTransport.ts:707` 的 `MaterialFileType`） | 复用天意附件端口，或删 |
| E51 | 「进行中」徽标 + 单元简介段落 | 卡片只有名字与进度数字（基线 `:726-728`）；"进行中"状态与单元文案简介均无源 | 单元状态合同（现有 `runState` 是 Run 态，不是单元态）；简介需真实摘要投影（可考虑复用 `sceneSummary` 口径） |
| E53 | 4 张场景缩略图（风景图） | 0 资产；真实列表是文字按钮（基线 `:731-737`）；`WritingBootstrap.chapters`（`localTransport.ts:759`）有 chapter→scenes 结构但**无 .tsx 消费者** | 缩略图资产管线；否则用序号 + 标题 + 世界时间文字（图上副标「码头·夜晚」正是 `worldTimeLabel` 可给的部分） |
| E56 | 3 条编号约束 + 「查看详情」 | 真实约束卡只渲染范围/模式/预算三行（基线 `:738-742`）。真实约束数组存在但**没有 UI 消费者**：`apps/story-studio/src/lib/nuwaBoundedContract.ts:34-35`（`forbiddenChanges`、`directorConstraints`）、`:62`（`constraintChecks`），且其服务端是 fixture（`apps/story-studio/server/nuwaBoundedScenarioFixture.mjs`，路由 `localTransport.ts:2290,:2306`） | 把 `nuwa-bounded-fixture` 面接进真实 Run 上下文（数据侧任务，不是样式任务） |
| E59 | 「当前视角：林月如」+「切换」 | 场景视角标签是**硬编码**「视角 · 作者全知」（基线 `NuwaSceneOverview.tsx:45`，与 `:44` 的真实 `worldTimeLabel` 并列）；真实观察者选择只在事件线（仓库根 `src/storyContracts/eventPerspectiveProjection.ts:16` 的 8 态 `PerspectiveVisibility` + `components/event-observation/StoryProgressionWorkspace.tsx:185` 的"观察者 / 知情视角"下拉） | 场景级 POV 状态 + 它与"作者全知"的关系（这是叙事语义决策，不是 UI 决策） |
| E60 | 「场景笔记」+ 3 条 +「编辑」 | R6 验收报告自己判 **NOT_APPLICABLE**：「产品尚无场景笔记事实数据；按纪律不伪造」（`验收报告.md:27`）。`authorNotes?: string[]` 只在 `src/storyIntelligence/nuwaAuthorReview.ts:39`，从不绑定场景或路由 | 场景笔记事实 owner 与持久化（新合同，不能由 UI 先占位） |
| E61 | 「创作提示」+ 3 条 +「↻ 换一批」 | 全仓无此路由/字段；最接近的是另一个工作面的规则小节（`components/world/MaterialsWorkspace.tsx:662` 的"可选写作提示"，是**已存在的资料条目**，不是生成动作） | 提示生成动作 + 批次语义 + 零自动触发约束（女娲 R2b 铁律，`data/2026-09-17_女娲入口与交互模型评估R2/交互模型修订报告R2b.md`） |

---

## 6. 工程拆解（给 Codex 的组件级任务列表）

**分档原则**：A 档不碰数据、不碰契约，可独立做；B 档必须先由创始人裁定视觉目标（§0.2）才能开工；C 档必须先补数据/合同，**禁止先做界面**（否则即 §5.3 的假功能）。三档之间不互相阻塞。

### A 档 · 纯表现（零新增数据、零契约风险）

| 任务 | 落点 | 依赖的真实数据 | 验收 | 禁止 |
| --- | --- | --- | --- | --- |
| A1 顶栏对齐图（搜索/目录/待确认/⋯ 的排布与 50px 高度） | `product-shell/topbar/GlobalStatusBar.tsx`、`styles/tianyan-r0-shell.css` | 无（5 个控件都已在盘） | `npm run typecheck`、`test:unit`（Shell 契约）、人工核对 1920/1440/1280/1152 无横向溢出 | 不新增第 6 个顶栏控件；不动 `data-panel-toggle` 值 |
| A2 导航宽与选中态对齐（132→? 需 B1 决定，先只做选中态样式） | `styles/tianyan-r0-shell.css:279`、`tokens.css:41` | `storyStudioWorkspaceRegistry.ts:40-47` | 同上 + `test.ts:24` 必须仍绿 | **不改注册表项、不改 displayName、不加导航项** |
| A3 正文排版对齐图（衬线标题、行高 1.8、节点弱分隔、对白浅底气泡） | `styles/nuwa-n1.css`、`NuwaUnifiedSceneWorkspace.tsx` | 无（投影层已给 kind/heardBy/delivery） | `tests/storyStudio/nuwaN1WorkspaceSource.test.ts` 全绿；1440 首屏正文仍为最大区域 | 不引入内部 ID/kind 标签到正文 |
| A4 圆角与描边统一（图 8–12px vs 现状 6/10/16px） | `product-shell/theme/tokens.css:37-39` | 无 | `lint`（含 `validate-feature-index`）+ 视觉对照 | 不硬编码颜色/尺寸（`test.ts:248` 禁 `#hex`/`rgba()` 字面量） |
| A5 右栏卡片视觉层级（辅助卡不抢眼、图标统一） | `styles/nuwa-n1.css`（`nuwa-story-card`） | 无 | 同上 | 不新增卡片；不删现有三张真实卡 |
| A6 composer 双态与 `--nuwa-composer-height` 对齐图（紧凑 34px / 展开） | 基线 `NuwaN1Workspace.tsx:198,:720`、基线 `nuwa-n1.css:226` | 无 | R6 报告 `:35` 的 ResizeObserver 行为不回退；1152 抽屉态不溢出 | 不加附件、不加快捷键、不加第 5 个动作 chip |

### B 档 · 先裁视觉目标（每项都对应 §3.2/§3.4 的一个多源冲突：图 / 现状代码 / R1 冻结，右栏宽度是四源）

| 任务 | 必须先有的决定 | 冲突值 |
| --- | --- | --- |
| B1 左导航宽度与项数 | 图 190px/11 项 vs R1 176px/八空间 vs 现状 132px/八空间 | 若选图 → 需先改 `test.ts:24/:26` 与注册表，并回答"天意/事件线/多元/合册去哪了" |
| B2 场景头高度 | 图 193px vs R1 ≤96px | 1440 首屏预算冲突（§3.3） |
| B3 走向区形态 | 图三张等宽卡 vs R1 80–110px 紧凑栏（1 主 + 2 短标签 + 展开比较） | R1 是创始人反馈的直接产物；选图等于撤回反馈 B.2「默认态即显示三张等宽大卡，视觉重心压过正文舞台」（`FOUNDER_FEEDBACK.md:18-20`） |
| B4 主强调色与纸色 | 图 `#067a85`/`#f7f6f5`+白卡 vs 现状 `#1f6b63`/`#fbf9f4` vs R1 `--jade #2e6d5e`/`--paper #f2eee3`+墨线 | R1 明写"层级靠纸色深浅 + 墨线，不靠层层白卡"（`DESIGN_TOKENS.md:9`） |
| B5 右栏模型 | 图 350px 常驻 6 卡信息流 vs 现状 312px 检查器（基线 `nuwa-n1.css:264`）+ Dock 单工具槽 | `test.ts:44-47,52` 与 `项目目录导航.md:73-75` |

**B 档的产出物是决定，不是代码。** 在拿到书面 `FOUNDER_VISUAL_PASS` 之前，R1 反馈的禁令仍然有效：「本轮 R1 为独立重做，必须在隔离设计分支完成；创始人通过前禁止进入生产代码」（`FOUNDER_FEEDBACK.md:9`）。

### C 档 · 先补数据/合同（**禁止先做界面**）

| 任务 | 目标 | 现状缺口 | 落点（合同/服务侧） | 变真的判据 |
| --- | --- | --- | --- | --- |
| C1 候选效应维度（E42） | 让"真相+1/风险+1"成为可解释的数 | 全仓无类型化计分；只有 `risks/preservedMysteries/stateDiff/causalChain` | `src/storyContracts/`（新合同）+ `server/nuwaN1Port.mjs` 投影 | 每个数字能指回一条真实候选字段；否则不显示 |
| C2 方向卡直选 → 步骤映射（E43） | 让"选中 A 再应用"成立 | 卡组件无 `onSelect`；有分支节点时 `NuwaRunReader` 不渲染（`:715`） | `NuwaDirectionCandidates.tsx` props + `selectedStepIds` 语义 | 一次点击只发一个 `expectedRevision` 写；采纳与推演不合并 |
| C3 场景元数据（E24/E26/E27） | 地点/天气/重要度 | 无字段 | `nuwaBranchNode.ts`（`NuwaBranchScene`）+ 投影 | 三个字段都有作者显式写入口，且可空时不显示 |
| C4 出场角色分级与添加（E31/E32） | 主角/重要/关键 + 加入场景 | 只有目录级 `roleLevel`；`characterRefs` 隐式写 | 角色目录 + 场景写端口 | 分级口径与 `subtype` 一致或有明确区分文档 |
| C5 事件线约束条目（E56） | 3 条编号约束 + 详情 | 数据在 `nuwaBoundedContract.ts:34-35,:62`，服务端是 fixture | `server/nuwaBoundedScenarioFixture.mjs` → 真实 Run 上下文 | 约束来自真实范围合同，且"不可偏离"有违反反馈 |
| C6 场景笔记（E60） | 作者笔记 | 无 owner（R6 已判 NOT_APPLICABLE） | 需新事实 owner + 持久化白名单（`.world-os/workspace/`，可移植导出） | 有 owner、有测试、有导出兼容 |
| C7 创作提示与批次（E61） | 提示 + 换一批 | 无路由 | 新动作 + 零自动触发铁律约束 | 打开页面不自动请求；`REAL_PROVIDER_CALLS=0` 可证 |
| C8 视角切换（E59） | 场景 POV | 硬编码"作者全知" | 与 `characterContextPack` 的 `excluded` 纪律对齐 | 保持 `:5-9` 的硬约束：作者备注/传闻永不进入，`知情=未知/怀疑` 的事实对该角色不可见（基线 `src/storyContracts/characterContextPack.ts:5-9`） |
| C9 图像资产策略（E16/E30/E53/E07） | 山水/头像/缩略图 | 仓库 0 位图 | 资产目录决策 + 降级方案 | **每个 `<img>` 都有非假降级**（首字/剪影/文字），否则保持现状 |
| C10 合并基线（前置） | 让 A/C 档对着真实组件做 | 工作树落后基线 **44 个提交**，§4 里标"基线"的 6 个女娲文件与 `/nuwa-branch/*` 全不在盘上（基线另有 4 个盘上没有的测试：`nuwaBranchVerticalSlice`、`nuwaBranchCheckpointCloseout`、`nuwaSceneWorkspaceModel`、`nuwaWorkspaceView`） | `codex/world-materials` ← `origin/codex/semantic-world-r3` | 合并后 `npm run verify` 绿；R6 报告的 11 项 MATCH 在盘上可复现 |

### 全局验收与禁令（适用所有任务）

- 十个脚本全用：`dev` `build` `serve` `typecheck` `lint` `test` `test:unit` `test:integration` `test:e2e` `verify`（`package.json`，由 `scripts/run-selected-tests.mjs:111-116` 锁定顺序）。
- 契约不回退：`tests/storyContracts/tianyanR0ShellContract.test.ts`（八空间 `:24`、中英键集 `:33-41`、工作台顺序 `:44-47`、右工作面五态 `:52`、单工具挂载 `:54-58`、禁 `panelOrder/expert-first/pinned/priority` `:62-63`、禁硬编码色值 `:248`、必须保留 `focus-visible` `:250` 与 `prefers-reduced-motion` `:251`、rail 宽度不得在 75rem 断点改值 `:208-209`）。
- 测试只用 Mock 或本地伪服务器，真实 Provider 调用必须为 0。默认态由 `apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs:183`（盘）钉住：`PROVIDER_MODE:"MOCK_OR_LOCAL_FAKE_ONLY"`、`REAL_PROVIDER_CREDENTIALS_USED:"0"`、`TIANYAN_AGENT_FAKE_PROVIDER_STREAM:"1"`。**同一文件 `:184-187` 有一个受门控的例外**：当 `TIANYAN_E2E_SCOPE=tianyi-real-creation-r6` + `TIANYAN_TIANYI_REAL_CREATION_ACCEPTANCE=1`（`:107`）或 `TIANYAN_MAP_REAL_AI_LIVE_ACCEPTANCE=1`（`:111`）时，两项被翻成 `REAL_PROVIDER_ALLOWED` / `"1"` 并追加 `TIANYAN_REAL_PROVIDER_PRODUCT_PATH:"1"`。视觉任务**不得**打开这两条通道；A/C 档任务的验收脚本沿用 `:183` 的默认态即可。
- 证据入 `data/YYYY-MM-DD_任务名/`，且**不得**在 `data/` 内放代码副本（现状已有 4 个 `.mjs`/`.cjs` 违规样本，见 `docs/research/TIANYAN_DOCUMENT_INDEX_R0.md` §4.2）。
- 创始人体验验收必须人工独立完成；技术全绿不等于视觉通过。
- **本文不新增任何功能定义、不删除任何现有流程、不为图上 23 组假功能设计实现方案**——它们只登记为"需要数据决策"。

---

## 7. 本拆解的边界

1. **只读**：未修改任何文件，未移动、未删除、未提交；本文是本次会话第 4 份未跟踪 markdown。
2. **像素是实测但不是规格**：§3 的 px 来自逐像素分类，误差 ±2px；它们是"图上是多少"，不是"应该是多少"。任何值进 token 前必须在 1440/1280/1152 重排后重量（§0.4 第 1 条）。
3. **未打开浏览器**：现状尺寸来自 CSS token 与代码常量推算，未在真实运行页面上量过 DOM。R6 报告 `:59` 记着 4192/4195 当日未拉起，本文按禁令未启动任何服务。
4. **"假功能"是静态判定**：结论是"当前代码里找不到数据后端"，不是"永远不该有"。每组都给了变真前置条件（§5.3 右列、§6 C 档）。
5. **两个视觉目标的取舍未裁定**：本文只量化冲突（§3.2/§3.4/§5.2）。R1 冻结文档在主检出与基线中 0 副本、0 引用，只存在于 worktree `tianyan-ui-design-freeze-r1`——这本身是一个待处理的事实，不是本文的结论。
6. **图内小字未逐字转录**：正文段落、要点文案按可读程度摘录；AI 生成图存在字形粘连，个别字符（如"谱台/船舱"类）识别可能有偏差，但不影响结构与数据判定。
