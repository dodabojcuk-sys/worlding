# 天衍 R0 外壳合同

本合同定义 Founder 看图确认前的唯一产品外壳。它不接入领域数据、会话、Provider、持久化或写入操作。

## 八空间

世界、天意、事件线、多元、女娲、资料、创作、数据按此固定顺序出现在全局导航。合册属于“创作”的工程目录项，不能成为第九空间。

天意页面的中央工作区只承载对话；其他面板只能辅助其上下文、工具或日志，不能替代主对话。

## 目录与状态

跨页面工程目录由 `src/storyContracts/tianyanR0ShellContract.ts` 唯一声明。每个目录项显式标为：已确定、待确定或可扩展。它是引用与导航模型，不持有故事数据。

## 布局与面板

每页拥有统一工具轨和默认开启的页面日志；二者均可关闭。全局天意面板与页面工具面板是两个独立表现面板，可并列打开。

`apps/story-studio/src/product-shell/layoutProtocol.ts` 声明停靠、浮动、换边所需的协议。R0 仅实现停靠/隐藏，不实现拖拽、吸附或布局持久化。

## Owner 表

| 关注点 | 唯一 owner | R0 权限 |
| --- | --- | --- |
| Canon 写入与作者确认 | `src/storyControlSurface/storyStudioAuthorControl.ts` | 不接入 |
| WorldState 与 Event 事实 | `src/storyControlSurface/storyStudioWorkspaceOperations.ts` | 不接入 |
| 天意会话、上下文与记忆 | `src/storyContinuity/` | 不接入 |
| Pi Agent 执行适配 | `src/storyAgent/piAgentAdapter.ts` | 仅定义合同，不执行 |
| 页面布局与可见性 | `apps/story-studio/src/product-shell/TianyanR0Shell.tsx` | 仅瞬时 UI 状态 |
| 工程目录信息架构 | `src/storyContracts/tianyanR0ShellContract.ts` | 静态合同，不含事实 |

Pi Agent、Provider、插件和 UI 不拥有故事事实、会话事实或作者确认权；它们只能在领域层授权后返回候选与回执。
