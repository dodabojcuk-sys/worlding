# 右侧天意责任区

本目录负责右侧天意面板的“对话 / Agent”表现、共享会话身份投影和面板组合。

本目录不创建天意会话、记忆、来源、权限或历史 owner，也不替代天意大页面的“创意 / 对话”产品模式。

主要入口是 `TianyiSidebar.tsx`，模式切换由 `TianyiModeSwitch.tsx` 表现。真实会话与上下文 owner 仍在 `src/storyContinuity/`。

对应测试位于 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增右侧天意专属 UI 放在这里，领域操作继续由既有天意边界注入。
