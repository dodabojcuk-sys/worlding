# Tianyan Workbench R0.2 — Design QA

## 对照目标

- Founder 参考图：`/tmp/codex-clipboard-bad0fa33-d972-4560-85e3-5be05734ed77.png`
- 实现截图：`/home/beelink/.codex/visualizations/2026/08/28/01a04856-34b7-7740-b6d4-6f16950fd4aa/TIANYAN_WORKBENCH_R0_2/1920x1000-zh-workbench.png`
- 同尺寸对照：`/home/beelink/.codex/visualizations/2026/08/28/01a04856-34b7-7740-b6d4-6f16950fd4aa/TIANYAN_WORKBENCH_R0_2/reference-vs-implementation.png`
- 视口与状态：`1920 × 1000`、事件线、专家分析＋工程日志、工具轨、天意 Agent。

## 可见差异判断

- 区域顺序、浅色内容面、深色全局轨、目录密度、上下工具栈、紧凑工具轨与最右天意符合参考图的结构语法。
- 参考图中央是完整事件线业务页面；R0.2 中央仍是既有中性 workspace outlet。该差异属于任务明确禁止的无关页面实现，不以伪造业务内容补齐。
- 参考图天意含真实推演结果；R0.2 只展示任务准备与未执行状态，避免伪造 Provider、Agent 或故事写入。
- R0.2 工具轨在宽屏显示图标和完整标签；中等视口自动使用带 tooltip/`aria-label` 的纯图标轨，避免英文长标签被压成不可读碎片。

## 响应式与交互结果

- `1920 × 1000`：工程目录、专家分析、工程日志、工具轨和天意同时可见，中央主区保持最大视觉面积。
- `1440 × 900`：右侧区域采用不占栅格宽度的覆盖式 Dock；能力、权限、上下文弹层均在视口内，运行控件不挤出输入框。
- `1280 × 800` 英文：展开空间轨所有标签 `scrollWidth <= clientWidth`；关闭工具面板后面板数为 0 且中央工作区不保留 Dock 宽度。
- `1152 × 720`：空间轨严格为 `56px` 图标轨，全部文字标签 `display:none`，无中间截断状态，页面无横向滚动。
- `390 × 844`：工程目录、Dock 与天意都是不透明全屏层；文档宽度等于视口宽度。能力菜单边界为 `x=68..378`，没有越出 `390px` 视口。
- 能力菜单支持方向键、Enter/Escape、点击外部关闭和焦点返回；Escape 后焦点回到“＋”。
- Dock 分隔线支持键盘上下调整，实测 `260 → 276`，并保留 `160..640` 边界。
- 对话/Agent 切换前后的共享会话标识均为 `shared-current-session`。
- 专家建议点击采纳后只显示“已记录采纳意图；尚未写入故事”。

## 资产、样式与可访问性

- 无内容型图片资产需求；沿用项目既有 Lucide 图标与主题 token，没有引入临时 SVG、CSS 图形或第二套视觉系统。
- 新样式按工程目录、右侧 Dock、天意侧栏拆分；组件样式不含本地颜色值。
- 工具按钮、关闭按钮、运行控件和折叠空间轨均有可访问名称、tooltip 和焦点环；状态不只依赖颜色。
- 浏览器 DOM 检查未发现水平溢出；没有真实 Provider、模型、token 百分比、Skill 安装或工作流执行的伪装状态。

## 已知缺口

- 中央各空间业务页面仍未接回 R0 Shell；这正是参考图与当前实现的最大视觉内容差异，需单独 Founder 授权。
- 仓库 Playwright 脚本找不到受支持的 Chromium 可执行文件；本轮改用 Codex 应用内真实 Chromium 完成上述 smoke，但 `npm run test:e2e` 仍如实记为环境阻断。
- Founder 独立体验验收尚未完成，技术 QA 不替代 Founder 验收。

final result: passed
