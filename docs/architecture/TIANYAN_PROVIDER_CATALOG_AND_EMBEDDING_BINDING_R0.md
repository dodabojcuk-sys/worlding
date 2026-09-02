# 天衍 Provider Catalog 与 Embedding Binding R0

## 决策与范围

R0 在现有 Provider Gateway 内建立可扩展的 Provider 注册、可证明来源的模型目录、LLM/Embedding 独立默认值，以及未来数据集索引不可混用的 Embedding 身份合同。本轮不建立向量库、不实现完整 RAG，不改变 Canon、WorldState、Event、AuthorControl 或天意 Session 的所有权。

## 五层结构

1. **Protocol Adapter** 只处理线上协议。R0 有 `openai-compatible` 和 `ollama-native`；共享协议的厂商不复制请求实现。
2. **Provider Preset** 声明厂商/运行时标签、默认 endpoint、凭据要求、目录路径和仅作提示的静态建议。AMD 是 preset/runtime 语义，不是协议。
3. **Provider Instance** 是用户实际配置，以稳定 `providerInstanceId` 分区，持有 preset、adapter、base URL、非明文 credential reference、enabled、config revision、endpoint identity 和时间戳。
4. **Model Catalog Snapshot** 属于单个 Provider instance，持有状态、配置修订、尝试/成功时间、来源、模型项、安全失败摘要与 last-known-good 标记。
5. **Capability Binding** 在模型项上保存能力及证据来源，不由 `/models` 名称猜测。同一模型可同时具有多项能力。

Preset 列表为 OpenAI、DeepSeek、GLM/Zhipu、SiliconFlow、Ollama、AMD Radeon Cloud、AMD Lemonade、vLLM 与 Custom OpenAI-Compatible。OpenAI、DeepSeek、GLM/Zhipu、SiliconFlow、Radeon Cloud、Lemonade、vLLM 和 Custom 共用 OpenAI-Compatible adapter；Ollama 使用 native adapter。

## 模型目录状态机

```text
never_fetched --作者点击--> loading --成功--> ready
                                  |--首次失败--> failed
                                  |--404/无目录--> unsupported
ready --再次点击--> loading --失败--> stale + last-known-good
ready --endpoint/凭据/关键配置变化--> stale
never_fetched --关键配置变化--> never_fetched
```

`ready` 和 `stale` 中只有 `source=endpoint` 的项计入“已获取 N 个”。`preset` 建议、`manual` 手工值与 `unverified` 旧记录始终分组展示，没有伪造 `fetchedAt`。后续失败保留上次成功项及时间，同时显示 stale、本次失败时间与脱敏摘要。

## 旧缓存迁移

Provider Profile 的当前 schema 为 v3。v1/v2 迁移是显式的：

- 旧 `availableModels` 同时有可验证的成功获取时间时，才迁移为 endpoint/ready。
- 没有成功时间或无法证明来源的记录降级为 `unverified` + `never_fetched`。
- 静态 preset 建议迁入 `suggestedModels`，不进入 endpoint catalog，不产生成功时间。
- 每个 preset 创建独立的 `<preset>.default` 实例；目录、默认模型和 credential reference 都不跨实例复用。

原 Bug 链路是：Radeon 静态模型被 `defaultProviderProfileState()` 写入 `availableModels`，UI 仅以数组长度计数，同一 JSON 又被持久化，因此重启后继续显示“已获取 1 个”。旧实现在 endpoint/凭据变化时仅重置连接状态，也没有独立的目录新鲜度身份。v3 通过来源分离、实例分区和 config revision 失效修复全链路。

## Capability 规则

内部能力集保留 `llm | embedding | vlm | rerank | asr | tts`，R0 设置只提供已实现的 LLM 和 Embedding 入口。证据来源是 `preset-declared | user-declared | probed | unknown`，优先级为 probed > user-declared > preset-declared > unknown。`/models` 的成功只证明目录存在；新项默认能力未知，不自动当作 LLM 或 Embedding。

作者显式保存默认 LLM/Embedding 时产生 user-declared 证据；Embedding probe 成功后升级为 probed，并记录向量维度。未验证的 Ornith 或任何“本地模型”不会因运行位置被自动标成 Embedding。

## Embedding 验证

OpenAI-Compatible 调用 `/embeddings`，Ollama Native 调用 `/api/embed`。两者都只能由作者点击“验证 Embedding”发起，输入固定为 `Tianyan embedding capability probe. No author content.`。返回和持久化范围限于成功/失败、Provider instance、模型及 revision/digest（缺失时 `unknown`）、维度和耗时。向量本身、API key、故事、角色、Canon 和知识库正文不进入响应、日志或任何故事 owner。

## 索引绑定 manifest 与兼容门禁

`EmbeddingIndexBindingManifest` 必须完整持有：

- `indexGenerationId`、`datasetId`、`providerInstanceId`、protocol、preset、非敏感 endpoint identity；
- embedding model ID、model revision/digest（或显式 `unknown`）、dimensions、encoding、normalization、distance metric、adapter version；
- chunking recipe ID/version、createdAt、`building | ready | failed | superseded`、source document/version boundary。

兼容检查逐项比较 Provider instance、协议、preset、endpoint identity、model/revision、向量维度/编码/归一化/距离度量、adapter 版本和切块 recipe/version。任一改变均为不兼容，读路径必须阻止并返回：

> 此数据集已绑定另一 Embedding 配置；需要重建新索引后才能切换。

修改全局默认只影响未来新建 generation，不改写任何已有 dataset manifest。R0 没有重建引擎，因此不声称已迁移，不原地覆盖 ready generation，不在一次检索中混用不兼容向量。

## 显式操作与安全边界

打开设置、页面刷新、切换 preset、填写或保存配置只读写本地状态，不发起 Provider 请求。只有显式的“获取模型”“测试连接”“验证 Embedding”和既有作者发起的推理流程能经 Gateway 访问 endpoint。

凭据继续由现有 credential backend 持有，不在 profile、React state、前端缓存、响应、错误或日志中出现。所有 adapter 通过 Gateway；厂商官方 preset 限定官方 HTTPS endpoint，本地 runtime 限制 loopback，Custom OpenAI-Compatible 要求公网 HTTPS 并拒绝 URL 凭据、私网与 loopback。测试只使用 Mock 或本地伪服务器。

## R0 明确未实现

完整 RAG、向量数据库选型、历史索引大规模迁移、自动后台索引、混合检索、reranking、ASR/TTS 调用、自动能力发现、批量 Provider 验证、R11/R11.1 UI 变更均不在本轮。

## 验证命令

必须使用仓库锁定的 Node 22 运行。候选提交执行：

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run verify
```

2026-09-03 候选提交实际结果：`typecheck` PASS；`lint` PASS（含 10 个 package scripts、25 个 feature 及唯一 Canon/WorldState/Event owner 不变式）；`test:unit` PASS（178 个测试文件、958 tests）；`test:integration` PASS（10 个测试文件、46 tests）；`test:e2e` PASS；`build` PASS（2023 modules transformed）；`verify` PASS。自动测试中真实 Provider 调用数为 0，仅使用 mock 和 loopback 伪服务器。创始人体验验收仍需人工独立完成。
