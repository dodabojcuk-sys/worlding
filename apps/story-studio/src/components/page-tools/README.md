# 页面工具责任区

本目录负责工程日志、专家分析及其他页面工具的展示组件与 UI 注册映射。

本目录不拥有操作回执、故事事实、作者确认、Provider 或持久化。工程日志只读取注入的回执 ViewModel；专家分析只通过回调表达采纳或忽略意图。

主要入口是 `pageToolRegistry.ts`，具体内容由各工具面板组件承载。Dock 布局和尺寸状态位于 `product-shell/right-dock/`。

对应测试位于 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增页面工具内容放在这里，并通过注册表接入工具轨。
