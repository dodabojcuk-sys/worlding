# 天衍 R12-B1 冲突与语义整合日志

## 1. 合并操作

基线：`85c65d30fe9aefba8465e0c5d64b61b5d41c3ae4`

合并对象：`838129a88119ffe9dc0c5d06bcec06973802c63e`

命令：`git merge --no-ff --no-commit 838129a88119ffe9dc0c5d06bcec06973802c63e`

Git 响应为自动合并成功并停在提交前。`git diff --name-only --diff-filter=U` 为空，因此：

- 文本冲突：0
- 需要语义审查的预测共同文件：3
- 超出预测的冲突：0

之后创建 merge commit：`6863d99453db402b312268ef61b9f5400a634c4f`。

## 2. 三个共同修改文件

### 2.1 `apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs`

自动合并同时保留：

- Runtime 的 `assertDevelopmentRuntimeMode()`；
- Provider 的 `assertProviderCatalogSettingsR0(page)`；
- R11.1 的 `assertR11ObservationWorkspace(page, consoleProblems)`。

调用点分别位于统一 Smoke 的前置流程，三个函数定义也都存在。逐段检查确认开发态 Vite/API-only 断言、Provider 显式获取/Embedding probe/stale/rebuild gate 断言，以及 Event Observation 默认/轨迹/矩阵/世界时间/详情/零 Provider 断言没有互相覆盖。未做手工文本修改。

### 2.2 `docs/architecture/FEATURE_INDEX.json`

自动合并已经保留：

- `provider-runtime`：Provider Gateway、Profile schema v3、Catalog 与 Embedding Binding 责任；
- `event-line`：R11 组合式观察、唯一 Event owner 与浏览器视图状态边界。

自动结果缺少 Runtime 独立功能登记。手工增加 `story-studio-runtime-mode-r0`，只登记已有生产事实：

- 入口：`scripts/start-story-studio-dev.mjs` 与 `apps/story-studio/server/server.mjs`；
- 模式：`api-only` / `combined-static`；
- 状态所有者：无；持久化所有者：无；
- Provider 依赖：无；
- 测试：Runtime mode 单测、统一 Shell Smoke、正式 Runtime Smoke；
- provenance：精确 Runtime 提交 `85c65d30fe9aefba8465e0c5d64b61b5d41c3ae4`。

`node scripts/validate-feature-index.mjs` 和 `npm run lint` 均通过：26 个 Feature，Canon Writer、WorldState owner、Event owner 各 1。没有新增事实所有者。

### 2.3 `项目目录导航.md`

自动合并保留了三条责任路径：

- `apps/story-studio/server/runtimeMode.mjs` 与单入口运行模式说明；
- `providerGateway/`、`persistentProviderProfileStore.mjs` 与 `embeddingIndexBinding.ts`；
- `eventObservation.ts`、Event Observation 组件和 R11 隔离验证路径。

未做偏向 Runtime 或 R11.1 的整文件覆盖。合并后的导航仍明确 `App.tsx` 只做顶层装配、`TianyanR0Shell.tsx` 只做区域组合，且唯一 Canon / WorldState / Event / Provider 边界不变。

报告阶段仅新增 R12-B1 证据目录入口，属于交付物导航，不是冲突解决或产品能力修改。

## 3. 无文本冲突的单边变更审查

| 分类 | 审查重点 | 结果 |
| --- | --- | --- |
| Runtime 服务与脚本 | `runtimeMode.mjs`、`server.mjs`、dev / serve 脚本、Runtime Smoke | 与 Runtime 父线 blob 一致；合同保持 |
| Provider / Embedding | Gateway、Profile Store、Catalog、adapters、设置 UI、binding contract | 与 Runtime / Provider 线一致；无第二 Gateway 或目录 owner |
| Event Observation | Workbench、Observation 控件、Participation、合同、样式 | Workbench 与 R11.1 blob 一致；四态和投影保持 |
| 测试 | 单元、集成、统一 Shell E2E、Runtime Smoke | 未删除断言、未放宽门禁、未扩大超时 |
| 历史资料 | R11、R11.1、Provider、Runtime 既有报告和截图 | 只作证据，不进入产品入口 |

相对第一父提交有 42 个文件，相对第二父提交有 41 个文件。`range-diff` 合并后将 R11 与 R11.1 两个提交原样匹配，同时保留 Runtime / Provider 谱系。

## 4. 重复边界与越界搜索

- 唯一 Event / WorldState owner：`src/storyControlSurface/storyStudioWorkspaceOperations.ts`。
- 唯一 Canon Writer：`src/storyControlSurface/storyStudioAuthorControl.ts`。
- 唯一 Provider Boundary：`apps/story-studio/server/providerGateway/aiProviderGateway.mjs`。
- 静态前端只在 `combined-static` 模式从 `apps/story-studio/dist` 提供；`api-only` 不托管 SPA。
- 旧 `availableModels` 字段仅出现在 Provider Profile v1/v2 迁移与兼容投影，不是 schema v3 的第二权威缓存。
- 在 `apps/`、`src/`、`tests/`、`scripts/`、`docs/architecture/` 与 `package.json` 搜索 R12-A/R12-B2 越界能力关键词，无生产命中。

## 5. 人工修改清单

合并提交前的唯一手工语义修改：

1. `docs/architecture/FEATURE_INDEX.json`：增加 Runtime 模式功能登记。

合并提交后的交付修改：

1. `data/2026-09-03_天衍R12B1统一工程基线/`：报告、响应 JSON 与截图证据；
2. `项目目录导航.md`：加入上述交付目录入口。

没有手工修改 Event、Provider、Runtime 生产实现或数据合同；没有 R12-A 生产 UI 写入。
