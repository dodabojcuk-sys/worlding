# 工程目录责任区

本目录负责全局工程目录的导航投影、搜索、已分类目录树和小型待确认入口。

本目录不拥有 Canon、Event、WorldState、故事正文、操作日志或操作系统文件树。

主要入口是 `ProjectDirectoryPanel.tsx`；目录展示数据由 `projectDirectoryViewModel.ts` 组装，语义合同位于 `src/storyContracts/projectDirectoryContract.ts`。状态 owner 是当前 Shell 的瞬时 UI 状态与既有领域 owner 提供的只读投影。

对应测试位于 `tests/storyContracts/projectDirectoryContract.test.ts` 与 `tests/storyContracts/tianyanR0ShellContract.test.ts`。以后新增目录分组、节点展示或搜索投影放在这里，不在 `App.tsx` 或 Shell 根组件中堆叠。
