# 天衍 R4：Pi 零调用准备与 Nuwa-N1 交接

## 当前结论

- R4 目录及完整页面流程已经通过；最新 CI 红灯的准确分类是假 Provider 流取消终态，不再是目录恢复。取消后的缓冲完成与恢复响应均不得使 Run 重回可执行状态。
- World Library/Story Unit 的短快照复用已加入写入代次边界：写前旧读和写入期间启动的读可完成原调用，但不会污染写后读。
- 事件线顶栏的低频操作已收入固定“更多”，角色观察区保留唯一人物选择入口；右侧工具栏和检查器不被隐藏。
- R4 自动测试、假服务和角色观察切换都必须保持 `Provider calls = 0`；它们不构成真实模型成功证据。
- 零调用预检已在本机 `4193` 完成：Provider 配置可见，profile revision 为 `14`，预检实际 Provider 请求为 `0`。现有真实门禁在没有命令级明确确认时返回 `REAL_PI_AGENT_GATE_NOT_STARTED_CONFIRMATION_REQUIRED`。
- 权威预算账本记录到 R4 开始前为：setup `3`、generation `16`、tool-loop `3`、retry `1`、total `19`。R4 在原 synthetic-only 回执下实际执行了 1 次模型目录连接验证与 1 次最小推理：A、B 均通过，B 返回 `finishReason=stop`、总计 10 tokens；这不是故事对话或工具调用成功。该回执的六次实际 Provider dispatch 已用尽，C/D/E 未运行。
- A 暴露了旧实现缺口：`discoverModels` 的真实 setup dispatch 没有写入账本，所以账本当前只显示 generation `17` / total `20`。R4 已把未来模型目录诊断与 Embedding probe 纳入 setup 预留、dispatch 前校验和完成回执；不迁移或伪改这次既有账本，而是在 R4 证据中把 A 单独记为实际调用。
- 请求计数以 Provider dispatch 为唯一边界。连接/模型诊断、正常 generation、Pi 工具回合、显式重试和修复后验证全部计入总数；自动重试上限为 0。`StoryIntakeEnvelope.providerCalls` 只记录单次产品 Run，不能替代总账本。

支持矩阵的可执行定义位于 `src/storyAgent/piR4ValidationContract.ts`，预先固定的三组真实故事结构合成样本位于 `tests/fixtures/pi-r4-perspective-cases.json`。其中世界规则、组织、作者未来意图当前只能保留为 `unresolved` 或作者私密约束；不得因为 Provider 能说出这些词就宣称已有正式 Writer。

## 端到端链路与观测点

`UI → story-studio server → Tianyi AgentRuntimePort → builtin Pi adapter → aiProviderGateway → Provider → tool frame → StoryIntakeEnvelope → Review/Work → Owner adapter → EventLine / CharacterStateProjection`

关键边界：

1. UI 普通对话和“整理为故事候选”是不同作者动作；只有后者要求命名结构化工具。
2. Gateway 预留预算后才可 dispatch；所有结果必须落为 success、timeout、transport-failed、malformed 或 cancelled-after-dispatch 之一。
3. 工具自由文本不能替代 `propose_story_intake`；Envelope 仍为 candidate-only，确认前正式写入为 0。
4. Review/Work 复用同一 Envelope 和候选 ID；正式采纳经 Event、Relation、Story Unit、NarrativeArrangement 或资料对象的既有唯一 Owner。
5. 作者联合对照是只读并集；角色 API / ContextPack 必须重新按一个角色、分支、时点过滤，不能复用作者并集。

## 后续 C/D/E 的一次性预算建议

现有 synthetic-only 回执已按实际 dispatch 用尽。若要继续 C/D/E，申请一张独立 R4 回执，将权威账本上限设置为 generation `21` / total `24`，相对当前账本 generation `17` / total `20` 新增最多 **4 次实际 Provider dispatch**；旧账本中因 A 未记账而显示的名义余量不得继续使用。建议分配：

1. 1 次最小结构化工具往返；
2. 2 次产品样本（同名/别名；相对时间/误解/未来意图边界）；
3. 1 次仅在修复后使用的复验余量。

任何失败和重试都占上述名额，不补发、不机械花完。价格上限需要按当前 Provider 实际模型与 token 报价在授权时填写；本地配置没有可信的价格快照，因此本文不虚构金额。

## Nuwa-N1：下一阶段试演合同

R4 不扩建完整女娲。N1 只允许 2–3 个当前作品的正式角色、一个场景、一个局部目标和有限交互步数，复用既有 Nuwa Run、checkpoint、版本与候选结果；作者未明确保留时不创建长期分支。

每次角色调用必须由稳定角色核心、当前分支/时点状态、当前目标与限制、该角色可见事件和证据、过滤后的分级记忆、允许动作、剩余步数与 token 预算组成。导演可持有作者规划和世界真相，但只能通过角色可感知的事件施加影响；作者秘密不能原样下发。

输入先按身份、分支、时点和可见性过滤，再检索排序，最后在实际序列化请求处计量或保守估算 token。输出分为结构化动作/状态变化和作者可读场景；漂亮文本不能冒充已执行的多角色互动。到达预算、上下文不足、不可解冲突或硬约束阻断时必须暂停并返回决策点。

### 现有差距

| 项目 | 已有基础 | N1 缺口 |
| --- | --- | --- |
| Run / 暂停 / 回放 | `nuwaBoundedScenarioRuntime.ts` 有确定性演练、checkpoint 与回放核验 | 仍是本地确定性路径，未接任意作品真实 Pi 角色回合 |
| 人物状态 | `characterStateProjection.ts` 区分状态、知识、信念、分支与观察位置 | 真实作品角色状态尚未完整序列化到 Nuwa Provider 请求 |
| 来源范围 | `nuwaAttentionContext.ts`、`nuwaTaskContextPack.ts` 有引用裁剪 | `maxTokens × 4` 字符预算不是中文精确 token 计量；需在请求序列化处闭合 |
| 调度与成本 | 有 bounded run / step 概念 | 尚缺每角色、每步、整 Run 的真实 Provider 账本与无关角色休眠证据 |
| 结果融入 | 已有候选/Owner 边界 | 需证明局部结果可在事件线回放、比较、选择性融入且副作用重放幂等 |

N1 的本地工程闭环不再以真实 Pi 为前置：先用走同一产品路径和工具往返的本地假执行器验证角色 ID、分支、观察时点、知情隔离、请求预算和 checkpoint 恢复。真实 Pi 仍是独立验收项，本轮未授权调用；假执行器成功不得写成真实对话成功。
