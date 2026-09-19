# TIANYAN_UI_DESIGN_FREEZE_R1 — 截图与视觉证据

所有 after 截图来自同一 FINAL_HEAD、同一原型构建（`design-prototypes/tianyan-ui-freeze-r1/`），由 `capture.mjs` 使用 Playwright Chromium 生成；未使用缩放截图，1440 与 1152 为独立视口实测。

## 女娲（`nuwa.html`）
| 文件 | 状态 |
| --- | --- |
| `r1-nuwa-1440-default.png` | 1440 默认态：场景头 + Run 条 + 正文舞台 + 紧凑走向栏 + composer |
| `r1-nuwa-1440-compact-bar.png` | 1440 紧凑走向栏（同默认态，专拍走向栏区域） |
| `r1-nuwa-1440-directions.png` | 1440 展开方向比较（A/B/C 全描述 + 依据/影响/来源） |
| `r1-nuwa-1440-inspector.png` | 1440 检查器（固定右栏 320px） |
| `r1-nuwa-1440-composer.png` | 1440 composer 展开（队列 / 待确认 / 阶段版本） |
| `r1-nuwa-1152-default.png` | 1152 默认态（检查器收起，正文占满） |
| `r1-nuwa-1152-inspector.png` | 1152 检查器覆盖抽屉 + 遮罩 |

## 世界观（`world.html`）
| 文件 | 状态 |
| --- | --- |
| `r1-world-1440-default.png` | 1440 默认工作态：当前故事镜头 + 世界任务区 + 右栏上下文 |
| `r1-world-1440-lens.png` | 1440 当前故事镜头区域 |
| `r1-world-1440-detail.png` | 1440 对象详情抽屉（潮汐信令） |
| `r1-world-1440-causal.png` | 1440 因果视图按需打开 |
| `r1-world-1440-search.png` | 1440 搜索结果（第二状态） |
| `r1-world-1440-object.png` | 1440 对象详情（同 detail，供对照） |
| `r1-world-1152-default.png` | 1152 默认态 |
| `r1-world-1152-context.png` | 1152 当前故事上下文覆盖抽屉 |

## 并排对照
- `compare-r0-r1-nuwa.png`：R0 / R1 女娲 1440 默认态并排。
- `compare-r0-r1-world.png`：R0 / R1 世界观 1440 默认态并排。
- 目标参考图：仓库内 `data/2026-09-17_女娲作者工作面视觉重构R6/证据包/Target-Before-After.png` 与 `data/2026-09-05_天衍G1自适应任务主工作面/设计目标/`（工作区外附件，不随 PR 复制）。

## 关键几何（1440×900 实测，详见 `geometry.json`）
- 女娲场景头：94px（≤96px）
- 女娲紧凑走向栏：96px（80–110px）
- 女娲 composer（紧凑）：101px
- 正文舞台占主列可见高度：约 67%（含走向栏与 composer 之间的可见主列）
- 横向溢出：1440 与 1152 两档全部为 0（`capture.mjs` 对 15 个状态逐一实测）

## 交互检查
- Escape：女娲检查器 / 世界观对象详情、因果视图、当前故事上下文抽屉均可关闭。
- 外点（遮罩）：同上。
- `:focus-visible` 全局生效（proto.css）。
- 1152 布局为独立视口渲染，非缩放截图。

## 本轮工程验证（Node 22.22.0 + npm 10，均在 R1 worktree 实测）
- `npm run typecheck` PASS
- `npm run lint` PASS
- `npm run build` PASS；`apps/story-studio/dist` 仅 3 个文件，grep `tianyan-ui-freeze-r1` 与原型文案 0 命中
- 生产 tracked diff = 0（`git status` 仅有 `design-prototypes/` 与 `docs/design/TIANYAN_UI_DESIGN_FREEZE_R1/` 两个新增未跟踪目录）
- 原型边界：不 import 生产代码（grep `from "src|apps"` 0 命中）、无 fetch/XHR/EventSource、无 Provider Key/凭据字面量
- HTML 校验：`xmllint --html --noout` 对 index/nuwa/world 三个文件 0 error
- 原型 Playwright 检查：`capture.mjs`（15 状态截图 + 逐状态横向溢出=0）、`geometry.mjs`（关键几何 JSON）、`compare.mjs`（R0/R1 并排与目标参考三图）
