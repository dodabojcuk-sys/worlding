# 天意输入区责任区

本目录负责天意输入、任务 Chip，以及权限、上下文、模型、麦克风和发送/停止等运行控件的表现与回调合同。

本目录不拥有权限策略、上下文回执、Provider 凭据、模型清单、会话或故事写入。

主要入口是 `TianyiComposer.tsx`；权限、上下文和模型控件分别由独立组件承载。真实配置与领域 owner 通过 ViewModel 或回调注入。

对应测试位于 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增输入区运行控件放在这里，不放进能力“＋”菜单。
