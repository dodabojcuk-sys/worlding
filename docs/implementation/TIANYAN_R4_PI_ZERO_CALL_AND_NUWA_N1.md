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

## Nuwa-N1 本地工程接入表

| 环节 | 生产入口与唯一 Owner | 本轮已接通行为 | 安全边界/观测 |
| --- | --- | --- | --- |
| 范围选择 | \`/nuwa\` 读取当前 Project 的 World Object/Story Unit Owner | 选择 2–3 位正式角色、1 个 Story Unit 和 1 个局部目标；按中文稳定 ID 与 revision 校验 | 不复制角色/事件/单元；跨项目同名角色返回冲突 |
| 上下文编译 | \`nuwaN1Port.mjs\` 读取既有正式 Event 与 \`knowledgeSubjects\` | 按角色分开 known facts/unknown IDs/来源 revision；页面同时展示两个不同知情范围 | 角色正文、其他角色秘密、作者未来意图不进入 adapter 请求 |
| 角色回合 | \`nuwaN1Runtime.ts\` 在既有 Nuwa RunPack 内拥有 N1 生命周期 | 角色轮换；先请求 \`read_role_context\`，再以同一 actor ref 继续；下一角色只获得已发生台词，不获得前一角色私有信念 | 每 Run 最多 6 个已提交步骤/12 个模拟 dispatch；每次输入预算 4096 tokens、输出 1024 tokens |
| 运行状态 | RunPack 内 \`nuwa-n1.json\` 原子替换 | ready/running/paused/completed/cancelled/blocked，CAS revision、operation idempotency、暂停/刷新/恢复/停止/回放 | 每个 await 后重读；停止赢过晚到 adapter 结果；回放不重新 dispatch |
| 作者提示 | 当前 Run 的 future-only cue | sticky 输入进入后续步骤，不改写已提交步骤 | 最多 800 字；回执只记关键状态，不记每次鼠标操作或大量原文 |
| 结果交接 | 既有 \`storyStudioAuthorControl\` Candidate Review | 仅将作者勾选的步骤送入统一待确认 | \`formalWrites=0\`；正式事实仍需既有影响预览、Owner、版本校验、回执与撤销 |
| 执行器 | 可替换 adapter；本轮仅 \`local-n1-tool-roundtrip-fake/v1\` | 只在 \`NODE_ENV != production\` 且 \`TIANYAN_NUWA_N1_FAKE_PROVIDER=1\` 时可用，页面明示“本地工程演练 · 0 Provider” | 生产/未授权状态返回 503，不自动回退为假对话；本轮真实 Provider dispatch = 0 |

## Nuwa-N1 真实 Provider 独立验证申请（未授权）

下一次若获授权，建议使用一张独立回执，不与上文 R4 C/D/E 的 4 次建议混用。先记录 Provider instance ID、实际返回 model ID、协议、报价快照时间和计费币种，再开始 dispatch；未能从运行响应核对模型身份时立即停止。

1. 场景固定为同一作品的 2 位中文正式角色和 1 个 Story Unit；预置一条只对角色 A 可见的事件、一条只对角色 B 可见的事件、一条作者私密未来信息。
2. 一次 Run 授权上限为 **12 次实际 Provider dispatch**；连接/模型诊断、首轮、工具继续、明确重试和修复后复验全部计入总数，自动重试为 0。每次序列化输入上限 4096 tokens，输出上限 1024 tokens。
3. 最小成功标准是 2 个角色各完成至少 1 步，每步有实际 \`read_role_context\` 往返、结构化意图/台词/动作/可观察结果，且秘密 canary 不进入另一角色请求或响应。
4. 立即停止条件：身份不明、知情泄漏、越过工具白名单、revision 冲突后仍 dispatch、停止后还提交步骤、任一级预算到顶或出现未授权自动重试。
5. 历史调用对账以 Provider dispatch 为准；既有 R4 账本的 setup/generation/tool-loop/retry/total 原样保留，Nuwa-N1 单独列出每步的请求 ID、工具请求 ID、输入/输出 tokens、结束原因和累计成本。费用上限只能使用授权时的实际模型报价计算，本文不预填金额。
