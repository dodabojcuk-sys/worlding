# 天意能力入口责任区

本目录负责“＋”能力启动器的搜索、最近/推荐、分组、可用状态、键盘操作和调用意图。

本目录不拥有 Skill、Workflow、Agent Runtime、权限或真实执行函数。真实能力来源仍是 `src/storyAgent/`、`src/skillControl/` 与 `src/skillRuntime/`；UI 只消费适配后的条目。

主要入口是 `CapabilityLauncher.tsx`，展示注册适配位于 `capabilityMenuRegistry.ts`。

对应测试位于 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增来源适配放在注册表层，菜单组件保持通用。
