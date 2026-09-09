# 天衍 R4 收尾与女娲 N1 独立审阅修补记录

日期：2026-09-07

独立审阅：Sol High 子任务（未参与核心实现，只读审阅）

审阅基线：`d98b7a5`

初始结论：`HOLD`

修补责任：主负责人；修补后由专项自动化与真实浏览器路径复测。

## 问题与闭环

| # | 复现步骤 | 预期 | 实际（审阅时） | 证据 | 修补与复测 |
| --- | --- | --- | --- | --- | --- |
| 1 | 同一 Tianyi Session 的两个 Run 并发写入，再取消其中一个 | Session Owner 串行保存；取消基于最新同 Run 投影，保留其他 Run 与 stream 回执 | 仅按 runId 排队，旧 Session 投影可覆盖另一 Run 的新回执和 revision | `tests/storyAgent/tianyiAgentRuntimePort.test.ts` | 保存队列改为 projectId+sessionId；新增同 Run overlap 与同 Session 双 Run CAS；R4 精确 SHA `4a9edde3955ebd480bed6446bfdec5bf8fc24f90` 全量 `verify` 通过 |
| 2 | Provider/tool continuation 在途时停止 N1 | 已发 dispatch 留在账本，终态 cancelled，迟到结果不提交步骤 | 取消投影可能显示 0 dispatch，无法追踪已发调用 | `tests/storyIntelligence/nuwaN1Runtime.test.ts` | dispatch 前持久化 attempt；停止后保留非零 dispatch，专项及浏览器停止竞态通过 |
| 3 | 点击“单步”后在请求尚未完成时尝试暂停/停止 | 暂停和停止始终可达 | 全局 busy 同时禁用了中断动作 | `NuwaN1Workspace.tsx`、N1 E2E | 中断使用独立状态；350ms 受控在途请求期间动态断言两按钮可用 |
| 4 | 给角色配置 `被误导/怀疑` 的 Event 知情标签并预览上下文 | 误解/怀疑保留为角色信念，不能成为世界事实 | `knowledgeSubjects` 可把相关事件统一抬升为 known fact | `nuwaN1LocalApi.integration.test.ts` | 复用 Event 知情投影，事实与 beliefItems 分开；稳定 ID 夹具覆盖林昭已知、阿芜误解 |
| 5 | 角色上下文在 dispatch 前已超过 4096，或 adapter 返回 4097 输入 token，或省略 usage 并返回长输出 | 输入超限不发送；响应超限不提交步骤；无精确计量时有明确保守估算 | 4096/1024 只声明在上下文，没有提交前硬门 | `nuwaN1Runtime.test.ts` | 序列化上下文先做 UTF-8 字节保守门；超限记录 blocked attempt 且 dispatch=0；返回的精确 usage 与输出保守估算再执行上限，步骤 UI 标注“计量/保守估算” |
| 6 | 暂停/取消后检查 RunPack `run.json` 顶层 status 与 N1 状态 | 同一 Owner 文件表达一致生命周期 | 顶层仍可能是 planned，而兄弟 `nuwa-n1.json` 写 running/paused | `nuwaN1Runtime.test.ts` | N1 内嵌既有 `run.json` 并同步精确状态；旧兄弟文件只读兼容、下一写迁移 |
| 7 | 相同 operationId 先交接步骤 A，再改为步骤 B 重试 | 幂等重试只能接受完全相同选择范围 | 只按 operationId 命中，可能返回不同选中步骤的 handoff | `nuwaN1Runtime.test.ts` | receipt 持久化 payloadHash，不同选择范围返回冲突 |
| 8 | Run 已 completed/cancelled 后继续作者任务 | 可新建排演，不被终态困住 | 页面只剩回放，无新建入口 | `nuwaN1WorkspaceSource.test.ts`、N1 E2E | 增加“新建排演”，浏览器完成候选后新建并验证在途停止 |
| 9 | 检查一次 `read_role_context` 往返的调用责任 | adapter 明确请求、执行工具、接收结果后再生成动作 | runtime 直接把 context 包成 tool result，假往返名不副实 | `nuwaN1Runtime.ts`、`nuwaN1Port.mjs` | adapter 增加 `executeTool`，runtime 校验 actor/run/request/context hash 后才继续 |

## 当前验证证据

- 合同/API：`typecheck` 与 N1 runtime/API/source 共 14 项通过。
- 浏览器：1440、1195 两档；角色知情预览、双角色步骤、暂停刷新恢复、停止、回放、新建、选定结果送入待确认；控制台错误为 0，Provider 请求为 0。
- 连续记录：`N1-FINAL-20260907/N1-51s-continuous-flow.webm`，时长 51.64 秒。
- 正式数据边界：集成测试在候选交接前后比较正式 Event/Story Unit 快照 hash 与 revision；保持不变，`formalWrites=0`。

## 尚未由本轮证明

- 未调用真实 Pi/Provider，假执行器结果不得写成真实角色对话成功。
- 未完成 Founder 人工视觉与体验验收。
- 生产 Provider adapter、匹配 tokenizer、长期记忆相关性和地图建模不在本轮闭环内。
