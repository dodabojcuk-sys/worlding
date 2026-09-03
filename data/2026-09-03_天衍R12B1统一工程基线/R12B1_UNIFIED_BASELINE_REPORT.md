# 天衍 R12-B1 统一工程基线报告

日期：2026-09-03

状态：等待 Founder 对统一基线进行独立审核

候选分支：`codex/tianyan-r12b1-unified-baseline-r0`

## 1. 结论

本地候选已经以 Runtime Single Entry R0 的精确提交为第一父线，并通过一次保留谱系的非快进合并纳入 R11.1。Provider Catalog / Embedding Binding 仍是 Runtime 基线的祖先。统一候选同时保留 Runtime、Provider 与 Event Observation 三组合同，没有引入 R12-A 生产 UI，也没有新增 Event、Canon、WorldState、Relation 或 Provider 权威所有者。

合并提交为 `6863d99453db402b312268ef61b9f5400a634c4f`，两个父提交依次为：

1. `85c65d30fe9aefba8465e0c5d64b61b5d41c3ae4`（Runtime Single Entry R0）
2. `838129a88119ffe9dc0c5d06bcec06973802c63e`（R11.1 Participation Repair）

本轮已经到达停止点：只交付统一候选、验证和证据，不进入 R12-B2。

## 2. 精确谱系与现场预检

| 对象 | 精确提交 | 父提交 / 关系 |
| --- | --- | --- |
| Runtime 基线 | `85c65d30fe9aefba8465e0c5d64b61b5d41c3ae4` | 父提交 `e429b087dbbed863b07498acbd5b4a39b63604d1` |
| Provider Head | `e429b087dbbed863b07498acbd5b4a39b63604d1` | 父提交 `11f66f86ed5b1f002f965b5be91f4eafd31a24d4`；仍为最终候选祖先 |
| R11.1 Head | `838129a88119ffe9dc0c5d06bcec06973802c63e` | 父提交 `28a2b1998fc95ad27a2179933deb6a882efc4605` |
| R12-A 参考 | `eac5d79128f57d9aad8a2620a96d04da4f84fbdf` | 父提交 `85c65d30fe9aefba8465e0c5d64b61b5d41c3ae4`；未合并 |
| merge-base | `faaecd2f3435a172f49c54ef3876329d764ccade` | 现场复核与已报告值一致 |

`git merge-base --is-ancestor` 对 Runtime、R11.1、Provider 三个提交均返回 0。合并前 `range-diff` 显示两条候选线彼此独立；合并后 `range-diff` 将 `28a2b19` 与 `838129a` 原样匹配，并同时保留 Runtime / Provider 线的五个提交。

原主工作树 `/home/beelink/Documents/Codex/worlding.world-天衍` 在预检时有 3 个已跟踪修改和 7 个未跟踪目录，且分支领先上游 3 个提交。本轮未清理、stash、reset、checkout、覆盖或提交其中任何内容。既有 R11.1 worktree 只有未跟踪 `node_modules`；R11、R12-A、Runtime、Provider worktree 均干净。新 worktree 从精确 Runtime 提交创建，创建时干净。

预检发现 `127.0.0.1:4191` 与 `127.0.0.1:4192` 已由用户 Node 进程监听。本轮未停止或复用它们；所有动态验证均使用隔离端口，并只结束本轮子进程。

## 3. 合并内容分类

### 3.1 合并带来的既有生产代码

- Runtime 线：显式 `api-only` / `combined-static` 模式、开发态 Vite 唯一 UI 入口、正式态单端口静态托管、嵌套路由和未知 API 边界。
- Provider 线：Provider Profile schema v3、模型目录状态机、实例隔离、LLM / Embedding 分离、OpenAI-Compatible 与 Ollama Native 适配、Embedding index binding 与重建门禁。
- R11/R11.1 线：组合式 Event Observation、叙事顺序 / 世界时间投影、参与四态、来源层、焦点与详情保持、视图状态安全恢复。

相对 Runtime 第一父提交，合并引入 42 个 R11/R11.1 变更文件；相对 R11.1 第二父提交，候选包含 41 个 Runtime / Provider 线变更文件。全部单边变更均按 Runtime、Provider、Event Observation、测试和历史交付证据分类审查。

关键 blob 对照进一步确认没有“无冲突但语义回退”：

- `apps/story-studio/src/components/EventLineWorkbench.tsx` 与 R11.1 blob 同为 `ab23401f5ed22ca6751c588f979b4b82258299ee`。
- `apps/story-studio/server/server.mjs` 与 Runtime blob 同为 `86a89f70c900d1d02d2427ae2f943eb775e7a82b`。
- `apps/story-studio/server/providerGateway/providerCatalog.mjs` 与 Runtime blob 同为 `8b05ff7fa8e9e51e251356feeceb2f05363dd23c`。

### 3.2 为语义整合进行的手工修改

合并没有产生 Git 文本冲突。三个预测的共同修改文件均逐段审查；唯一生产索引手工修改是在 `docs/architecture/FEATURE_INDEX.json` 中补登记 `story-studio-runtime-mode-r0`，使 Runtime、Provider 与 Event Observation 三项真实状态同时可验证。Smoke 与目录导航的自动合并结果已经完整保留双方内容，无需整文件偏向任何一方。详见 `R12B1_CONFLICT_RESOLUTION_LOG.md`。

### 3.3 仅文档或验证证据

- 本报告与冲突解决日志。
- `证据/Runtime/dev-api-only.json` 与 `证据/Runtime/production-combined-static.json`。
- `证据/R11_1/` 下 7 张隔离 E2E 截图。
- `R12B1_COMMAND_EVIDENCE.md` 中的命令、响应摘要和验证矩阵。

这些文件不进入产品运行路径，不包含密钥、用户项目数据或真实 Provider 响应。

### 3.4 明确未开始

未实现或搬入 R12-A 的故事推进默认画面、横向 Event 卡片脊柱、局部对象轨迹新视觉、新详情 Dock、轨迹断点候选、角色视角正式能力、关系演变、长篇窗口化、命名视图管理，亦未引入 R12-A prototype CSS、JavaScript 或 fixture。对生产范围执行相关关键词搜索无命中。`R12_PRODUCTION_UI_WRITES=0`，`R12B2_NOT_STARTED=YES`。

## 4. 不可破坏合同复核

### Runtime

- 开发态 Vite 页面包含 `/@vite/client` 与 `/src/main.tsx`，并代理 `/__local/story-studio`。
- API-only 服务直接访问 `/event-line` 返回 404 诊断页而非完整 UI；健康响应声明 `runtimeMode: api-only`。
- 正式态只启动 `combined-static` 服务，未启动 Vite；嵌套路由返回构建后的 SPA，哈希资源返回 200。
- 正式态未知 API 返回 404 JSON，不回退 HTML。

### Provider 与 Embedding

- Feature Index 仍只有一个 Provider Boundary：`apps/story-studio/server/providerGateway/aiProviderGateway.mjs`。
- Profile schema v3、preset 建议和 endpoint 目录分离、六态目录状态、LKG stale、Provider instance 隔离、LLM / Embedding 默认模型分离均由单元、集成及 E2E 覆盖。
- Embedding probe 不回传向量正文；OpenAI-Compatible / Ollama Native 适配与 index binding compatibility / rebuild gate 均通过。
- `availableModels` 的保留出现仅用于 schema v1/v2 迁移和兼容输出；schema v3 的权威目录仍是 `catalog`，没有新增第二模型缓存。
- E2E 明确设置 `MOCK_OR_LOCAL_FAKE_ONLY` 与 `REAL_PROVIDER_CREDENTIALS_USED=0`。打开、切换、保存和普通浏览不自动调用 Provider。

### Event Observation 与事实边界

- Feature Index / lint 仍验证一个 Canon Writer、一个 WorldState owner、一个 Event owner。
- 同一正式 Event ID 在布局、参与呈现、详情和切换中保持；叙事顺序与世界时间仅为不同投影。
- `direct / witnessed / explicit-absence / unknown` 四态及来源证据保持；缺少证据不会被当作缺席。
- 角色视角恢复会剔除地点和物品，避免让非人物承担心理、信念或主观认知。
- URL / localStorage 只恢复经过验证的视图字段；布局、镜头、来源层、焦点、缩放和刷新均为零 Provider 调用，且不写 Event、Canon、WorldState 或 Relation。

本轮没有正式事实写入或用户项目迁移；测试写入仅存在于本轮临时 fixture 根。

## 5. 验证结果

锁定工具链为 Node `v22.22.0`、npm `10.9.4`。首次直接调用锁定 npm 时，其 shebang 被环境 PATH 中的 Node 24 解析，预检立即失败且没有运行产品验证；修正为将 Node 22 bin 置于 PATH 首位后，以下验证全部通过：

| 验证 | 结果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS；26 个 Feature；Canon / WorldState / Event owner 各 1 |
| `npm run test:unit` | PASS；181 个测试文件，973 tests，0 fail |
| `npm run test:integration` | PASS；10 个测试文件，46 tests，0 fail |
| `TIANYAN_E2E_SCOPE=r11-observation-workspace npm run test:e2e` | PASS；生成 R11.1 截图与开发态 Runtime 响应证据 |
| `npm run test:e2e` | PASS；完整隔离 E2E |
| `npm run build` | PASS；Vite 8.1.4，2026 modules；仅有既存的大 chunk 提示 |
| `npm exec -- node --experimental-strip-types scripts/tianyan-runtime-mode-smoke.mjs` | PASS；正式单端口、嵌套路由、哈希资源、健康和未知 API |
| `npm run verify` | PASS；完整重复门禁 |

截图已人工抽查：1440 参与轨迹保持四态可读，1440 世界时间视图与正式 Event 详情并存，1152 恢复与 200% 等效截图均由同一隔离 E2E 生成。技术验证不代替 Founder 体验验收。

## 6. 停止与开放项

没有技术阻塞。唯一开放项是 Founder 对这一统一候选基线的独立审核。未 push、未创建 PR、未合并回原分支、未部署或发布。
