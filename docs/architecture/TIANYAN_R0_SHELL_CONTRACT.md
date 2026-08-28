# 天衍 R0 全局外壳合同

本合同定义 Founder 人工体验验收前的全局 UI 外壳。它只建立导航、全局状态、中央工作区和面板边界，不接入领域数据、会话、Provider、Pi Agent、持久化或写入操作。

`19893b1` 是可取证的错误方向技术草稿，不是 Founder 已验收 UI 基线。

## 产品入口

全局作者空间由 `src/storyContracts/storyStudioWorkspaceRegistry.ts` 唯一声明，顺序为：世界、天意、事件线、多元、女娲、资料、创作、数据。

“合册”是文章完成后的派生产物空间，必须作为独立入口呈现，不属于创作，也不成为第九个故事事实 owner。R0 只渲染其入口与空工作区，不实现内部功能。

全局导航必须由统一 registry 渲染，名称、顺序、路由或增减入口不得要求重写外壳。桌面端使用最左侧可收起空间轨，顶部横向 Tab 不是主导航。

## 区域职责

| 区域 | 唯一职责 | R0 内容 |
| --- | --- | --- |
| 全局空间轨 | 全局空间与合册入口 | 图标、翻译文字、当前状态、收起、键盘导航 |
| 顶部状态区 | 真正跨页面信息 | 当前作品、版本/分支、全局搜索、本地外壳运行状态、语言、主题、设置/账户入口 |
| 中央工作区 | 当前路由的页面主场 | 干净 outlet/slot；不在 App root 写业务页面 |
| 左侧工程目录 | 作品级浏览与引用边界 | 空结构插槽；不设计目录、状态、数量或实体详情 |
| 全局天意面板 | 共享天意能力的呈现宿主 | 独立空插槽；不创建会话、上下文或假 Agent 状态 |
| 页面专属右栏 | 当前页面将来的 Inspector/工具/日志宿主 | 独立空插槽；不实现页面工具或日志内容 |

左侧目录、全局天意、页面右栏是三种不同概念，不共享业务状态。两个右侧面板必须可以并列。

## 面板协议

`apps/story-studio/src/product-shell/layoutProtocol.ts` 只定义瞬时表现协议：

- 面板：`project-directory`、`global-tianyi`、`page-inspector`。
- 可见性：开启/关闭。
- 未来能力：停靠、浮动、换边、磁吸。
- R0 实现：开启/关闭与并列。
- R0 不实现：拖拽、磁吸、浮动、换边、布局持久化。

Shell Lab 可以用中性边界同时展示三个插槽，但不得进入正式导航、渲染业务数据或假装功能已完成。

## 主题、多语种与无障碍

- 组件只使用语义令牌：背景、表面、文字、次级文字、边框、强调、成功、警告、危险、焦点，以及字号、间距、圆角、阴影、轨道和面板宽度。
- 所有可见外壳文字通过 `zh-CN` / `en-US` 翻译 key 渲染，不依赖中文长度固定布局。
- 优先使用逻辑方向 CSS 属性。
- 全局导航可键盘操作，焦点环清晰，图标按钮有可访问名称和 tooltip。
- 125% 缩放和英文长标签不得遮挡持久控件。

## Owner 表

| 关注点 | 唯一 owner | R0 权限 |
| --- | --- | --- |
| Canon 写入与作者确认 | `src/storyControlSurface/storyStudioAuthorControl.ts` | 不接入 |
| WorldState 与 Event 事实 | `src/storyControlSurface/storyStudioWorkspaceOperations.ts` | 不接入 |
| 天意会话、上下文与记忆 | `src/storyContinuity/` | 不接入 |
| Pi Agent 执行适配 | `src/storyAgent/piAgentAdapter.ts` | 不运行 |
| 全局导航 registry | `src/storyContracts/storyStudioWorkspaceRegistry.ts` | 静态表现元数据 |
| 页面布局与可见性 | `apps/story-studio/src/product-shell/TianyanR0Shell.tsx` | 仅瞬时 UI 状态 |

Pi Agent、Provider、插件和 UI 均不拥有故事事实、会话事实或作者确认权。
