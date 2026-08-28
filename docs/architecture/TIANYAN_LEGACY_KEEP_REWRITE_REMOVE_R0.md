# 天衍全局外壳旧实现取舍矩阵 R0

## 取证基线

```text
BASE_COMMIT=19893b1524b33808a0dcbc402f2e440d09394bf5
CURRENT_BRANCH=master
WORKTREE_STATUS=DIRTY (Founder 已明确授权继续；无关改动必须原样保护)
LEGACY_R0_COMMIT=19893b1
```

`19893b1` 只是技术草稿，不是 Founder 验收基线。本矩阵只判断代码边界与可恢复性，不使用沉没成本作为保留理由。

## 矩阵

| 文件或模块 | 当前职责 | 依赖与混合情况 | 决定 | 证据 | 替换或删除风险 |
| --- | --- | --- | --- | --- | --- |
| `apps/story-studio/src/main.tsx` | React 唯一启动入口 | 只组装 `App` 与全局样式 | **KEEP** | 符合唯一产品入口规则 | 仅可替换样式入口，不能建第二 root |
| `apps/story-studio/src/App.tsx` | 当前 R0 启动组装 | 无业务依赖，但只挂载一个巨型 Shell 组件 | **REWRITE** | 入口边界正确，内部分层不足 | 必须保持唯一产品 root |
| `apps/story-studio/src/product-shell/TianyanR0Shell.tsx` | 导航、目录、顶栏、工作区、工具、日志与右栏全部混合 | 一个组件同时持有路由表现和全部面板状态，并展示模拟工具/日志内容 | **REWRITE** | 违反本轮“只建立插槽”与分层要求 | 重写时不得引入业务内核或假数据 |
| `apps/story-studio/src/styles/tianyan-r0-shell.css` | 当前 R0 全局样式 | 与组件结构紧耦合，颜色、渐变、尺寸和媒体规则混在一个文件 | **REWRITE** | 颜色不是完整语义令牌，视觉为错误草稿方向 | 必须先建语义令牌，再分层布局样式 |
| `src/storyContracts/tianyanR0ShellContract.ts` | R0 空间、目录与中文标签合同 | 与 `storyStudioWorkspaceRegistry.ts` 重复空间声明，并把合册归入创作 | **REWRITE** | 本轮权威输入明确要求合册为独立入口 | 必须先消除第二空间 registry，保持路由兼容 |
| `src/storyContracts/storyStudioWorkspaceRegistry.ts` | 唯一产品空间 registry 与旧路由兼容 | 被旧导航与领域选择投影复用 | **KEEP + EXTEND** | 是已有唯一静态 registry，不持有事实 | 不更改业务 owner；只增加外壳所需的 i18n/独立派生入口元数据 |
| `apps/story-studio/src/product-shell/layoutProtocol.ts` | 面板位置与模式合同 | 当前把页面日志和工具设为正式默认面板 | **REWRITE** | 本轮只需目录、全局天意、页面专属右栏三类插槽 | 必须保留未来关闭、停靠、浮动、换边、磁吸的可扩展类型，但不实现行为 |
| `apps/story-studio/src/product-shell/navigation/*` | 旧生产导航和 registry 转发 | 未被当前 `App` 挂载，但包含可复用的图标与键盘语义 | **REWRITE IN PLACE** | 路由 registry 思路可保留，旧组件绑定中文与过时移动端分组 | 新导航必须只从唯一 registry 渲染 |
| `apps/story-studio/src/product-shell/{AppShell,GlobalHeader,ModuleSidebarHost,GlobalTianyiDockHost}.tsx` | 19893b1 之前的生产外壳与业务接线 | 与众多页面、会话、设置及业务状态深度耦合；当前 App 未导入 | **REMOVE FROM ACTIVE PATH** | 已不是产品入口，只作为旧实现取证 | 本轮不删领域功能；仅保证新 Shell 无静态/运行时依赖 |
| `apps/story-studio/src/components/**` | 角色、事件、天意、女娲、资料与创作业务 UI | 依赖传输、领域投影和多个 owner | **KEEP ISOLATED** | 它们包含唯一领域合同的消费端，不属于本轮删除范围 | 不接回 R0 外壳，不用假数据冒充完成 |
| `apps/story-studio/src/lib/localTransport.ts` 与 `server/**` | 前后端传输、Provider 与本地服务边界 | 业务内核与外部调用边界 | **KEEP DISCONNECTED** | 本轮 Provider/真实模型调用必须为 0 | 新 Shell 不得导入运输或启动服务请求 |
| `src/storyControlSurface/**` | Canon 写入、作者确认、WorldState/Event 所有权 | 唯一权威领域路径 | **KEEP UNCHANGED** | 项目规则与功能索引明确唯一 owner | 任何 UI 直写都会破坏作者确认边界 |
| `src/storyAgent/{piAgentAdapter,tianyiAgentRuntimePort}.ts` | 可替换 Agent 运行合同与天意运行端口 | 只应返回候选与回执 | **KEEP DISCONNECTED** | 已正确声明 Pi 不拥有事实与确认权 | 本轮不运行 Pi Agent，不新建会话 owner |
| `tests/**` 与 `scripts/run-selected-tests.mjs` | 单元、集成、lint 与边界验证 | 部分旧 UI 源码断言绑定已退役 App 结构 | **KEEP + REBASE SHELL TESTS** | 领域测试仍有效；旧 UI 结构断言不能决定新产品基线 | 不恢复旧 UI 只为通过测试；要单独报告过时断言 |
| `docs/architecture/FEATURE_INDEX.json` | 功能入口、owner、成熟度和测试索引 | 当前同时索引新静态 Shell 与旧 unified shell | **REWRITE SHELL ENTRIES** | lint 会验证所有文件与测试路径 | 必须只改 Shell 相关条目，不改领域 owner |

## 决策结果

- **KEEP**：唯一产品入口、构建与测试设施、领域 owner、Pi 边界、单一作品空间 registry。
- **REWRITE**：当前巨型 R0 Shell、全局样式、面板协议、Shell 导航表现、R0 合同与相关测试。
- **REMOVE FROM ACTIVE PATH**：旧生产外壳、旧顶栏/目录/天意 Dock 与业务页面对新 R0 入口的任何依赖。
- **UNDECIDED**：旧业务 UI 的最终删除或重接时机；它们当前只能作为取证，不可自动回到产品入口。

## 数据与可恢复性

- 本轮不删除任何用户正文、项目数据、数据库、迁移、环境文件或密钥。
- 本轮不新建 Canon、Event、WorldState、Relation 或会话 owner。
- 所有要替换的已跟踪代码都可通过 Git 历史恢复；回滚使用 `git revert`，不使用破坏性 reset。
