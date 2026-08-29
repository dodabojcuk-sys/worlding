# Tianyan Workbench — Design QA

## 验收状态

- `FOUNDER_EXPERIENCE_STATUS=REJECTED / NEEDS_CORRECTION`
- 既有技术检查只保留为证据，不能替代 Founder 独立体验验收。
- R0.2 本轮只验收桌面和窄桌面防溢出。移动端将使用独立产品外壳与信息架构，当前暂缓；现有窄窗口状态不是手机版产品验收。

## 对照目标与证据

- R0.5 Founder 角色目录参考图：`/home/beelink/.codex/visualizations/2026/08/29/TIANYAN_R0_5_FOUNDER_VISUAL_CLOSURE/TIANYAN_R0_5_FOUNDER_CHARACTER_DIRECTORY_REFERENCE.png`（1561×1008；SHA-256 `0acbc7f2671a41b9833ffbf081be1929c8c3fb0a3d9472347c64b2057ad6e4de`；Founder 提供的原始临时剪贴板图已在仓库外证据目录持久保存。）
- 旧同尺寸对照（保留为问题证据）：`/home/beelink/.codex/visualizations/2026/08/28/01a04856-34b7-7740-b6d4-6f16950fd4aa/TIANYAN_WORKBENCH_R0_2/reference-vs-implementation.png`
- 本轮真实浏览器截图：
  - `data/2026-08-29_天衍工作台R0_2创始人桌面纠偏R0/screenshots/1920x1000-zh-event-line-expert-log.png`
  - `data/2026-08-29_天衍工作台R0_2创始人桌面纠偏R0/screenshots/1440x900-zh-event-line-expert-log.png`
  - `data/2026-08-29_天衍工作台R0_2创始人桌面纠偏R0/screenshots/1280x800-en-event-line.png`
  - `data/2026-08-29_天衍工作台R0_2创始人桌面纠偏R0/screenshots/1152x720-zh-narrow-desktop.png`

## 本轮桌面纠正

- 中央事件线已接回既有 `EventLineWorkbench`，通过既有只读 World Library、Verified Canon Event 与 Story Unit 端口展示当前项目数据。它不接入 Canon/Event 写入 owner、Provider 或业务传输，也不伪造模型输出。
- 初次加载不打开专家分析或其他页面工具。点击哪个工具，才在 Dock 打开哪个面板；面板栈严格保留本次用户打开顺序，和工具轨固定展示顺序无关。
- 宽屏由真实点击构造“专家分析＋工程日志”状态。中等及窄桌面在两侧区域不足以并列时使用覆盖式 Dock，避免将中央布局栅格压成窄条；关闭工具后页面工具面板数即时回到 0。
- `1920 × 1000`、`1440 × 900`、`1280 × 800` 和 `1152 × 720` 的真实浏览器检查均无水平溢出。`1280 × 800` 的英文空间轨标签完整；`1152 × 720` 为 56px 纯图标空间轨，不存在截断文字。

## 保留的技术检查事实

- 工程目录、页面工具 Dock、工具轨与全局天意保持各自边界；中央事件线仍是视觉主场。
- 工具按钮、关闭按钮和空间轨使用可访问名称、tooltip 与焦点样式；Dock 分隔线仍支持键盘调整并保持 `160..640` 边界。
- 天意仅显示界面与意图合同，未连接真实传输；没有真实 Provider、模型调用、Skill 安装或工作流执行。

## 已知缺口与重新验收条件

- 当前中央事件线与工程目录都是既有 owner 的只读投影，不是完整领域编辑页面；后续领域写入接线需单独授权。
- 移动端独立产品设计尚未开始，不能由桌面窄窗口替代。
- 本轮浏览器 smoke 通过，但 Founder 体验结论仍为 `REJECTED / NEEDS_CORRECTION`，等待 Founder 按新的真实事件线桌面工作面重新验收。
- 仓库 Playwright 脚本若仍找不到受支持 Chromium，应如实按环境阻断记录；本轮以 Codex 应用内真实 Chromium 保存桌面 smoke 证据。

final result: needs correction

## R0.5 Founder visual closure

- 捕获方式：仓库既有 Playwright smoke（隔离项目 `r05-character-directory`、真实应用组件、`PROVIDER_MODE=MOCK_OR_LOCAL_FAKE_ONLY`）；每张捕获的 URL、视口、项目与控制台状态在同目录的 `capture-manifest-*.json` 中。
- 证据目录：`/home/beelink/.codex/visualizations/2026/08/29/TIANYAN_R0_5_FOUNDER_VISUAL_CLOSURE/`。完整 15 张状态截图覆盖 `1920×1000`、`1440×900`、`1152×720` 各自的标准、检查器、缩略、多选和归档状态。
- 代表截图：`1920x1000-standard.png`、`1920x1000-inspector.png`、`1920x1000-multi.png`、`1920x1000-archive.png`、`1152x720-inspector.png`。
- 三档结果：目录只替换浅色目录槽；深色主导航与中央天意未被重载或挤压；检查器是右侧覆盖层；标准/缩略、多选、归档状态均可见。所有捕获的 `consoleProblems` 为空。
- `P0=none`；`P1=none`；`P2=归档状态下底部低频操作在窄目录中偏紧，但无裁切、溢出或关键操作遮挡，本轮不扩大范围重排`；`P3=像素级风格微调留待 Founder 后续反馈`。
- `R0_5_TECHNICAL_STATUS=PASS`。视觉证据已准备，Founder 视觉裁定仍需人工确认；这不覆盖上方历史 R0.2 的体验结论。
