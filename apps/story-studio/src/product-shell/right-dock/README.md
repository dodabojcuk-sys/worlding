# 右侧工具 Dock 责任区

本目录负责页面工具轨、可同时开启的面板栈、面板顺序、瞬时高度与键盘调整。

本目录不拥有工具内容的业务状态，不负责 Canon/Event 写入、跨侧拖拽、磁吸、持久化或天意会话。

主要入口是 `RightDock.tsx`；瞬时状态由 `useDockLayoutState.ts` 管理，工具展示映射由 `dockPanelRegistry.ts` 提供。页面工具内容位于 `components/page-tools/`。

对应测试位于 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增 Dock 布局协议或工具轨表现放在这里，工具业务内容放回各自唯一责任区。
