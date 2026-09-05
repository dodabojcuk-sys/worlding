# 右侧工具 Dock 责任区

本目录负责 ToolLauncherRail 与唯一 ContextDock 的瞬时表现。同一时间最多挂载一个可用工具；切换工具替换当前工具，旧 `openPanelIds` 只作为向单一 `activeToolId` 归一化的兼容输入。

本目录不拥有工具内容的业务状态，不负责 Canon/Event 写入、跨侧拖拽、磁吸、持久化或天意会话。

主要入口是 `RightDock.tsx`；瞬时状态由 `useDockLayoutState.ts` 管理，工具展示与可用性由 `components/page-tools/pageToolRegistry.ts` 提供。页面工具内容位于 `components/page-tools/`，Shell 的 `wide / focused / narrow` 决策位于 `product-shell/layout/`。

对应测试位于 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增 Dock 布局协议或工具轨表现放在这里，工具业务内容放回各自唯一责任区。
