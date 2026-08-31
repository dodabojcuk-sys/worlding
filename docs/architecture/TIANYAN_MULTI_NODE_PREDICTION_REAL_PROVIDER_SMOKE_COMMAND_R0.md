# 天意多节点预测真实 Provider Smoke 命令 R0

状态：`ADAPTER_READY_SMOKE_NOT_EXECUTED`。真实 Provider Adapter 与有界 Smoke 脚本已实现；本轮没有真实调用。

## 前置边界

- 只允许使用本机 Story Studio 已保存的 Provider 配置；命令不接收、复制、迁移或输出凭据。
- 使用隔离的种子故事 `长夜将明`，不得指向作者的真实项目目录。
- 最多创建一个 Prediction Run、一个 Attempt；`maxOutputTokens=256`；`timeoutMs=30000`。
- 结果只停留在候选 Bundle 与执行回执；不得创建审阅、不得采纳、不得写 Event、Relation、Canon 或 WorldState。
- 普通产品路径仍固定使用本地 stub model。只有本命令的显式环境门禁和 `--confirm-real-provider` 同时存在时，脚本才能通过服务端 Provider Gateway 调用真实模型。
- 真实 Adapter 不读取或输出密钥；凭据、请求预算、幂等键和流式帧归既有服务端 Provider Gateway 所有。

## 授权后的唯一命令形状

```bash
TIANYAN_REAL_PROVIDER_SMOKE=1 \
TIANYAN_REAL_PROVIDER_SMOKE_SEED=长夜将明 \
TIANYAN_REAL_PROVIDER_SMOKE_MAX_RUNS=1 \
TIANYAN_REAL_PROVIDER_SMOKE_MAX_ATTEMPTS=1 \
TIANYAN_REAL_PROVIDER_SMOKE_MAX_PROVIDER_CALLS=8 \
TIANYAN_REAL_PROVIDER_SMOKE_MAX_OUTPUT_TOKENS=256 \
TIANYAN_REAL_PROVIDER_SMOKE_TIMEOUT_MS=30000 \
TIANYAN_REAL_PROVIDER_SMOKE_ACCEPT=0 \
node --experimental-strip-types scripts/tianyan-multi-node-prediction-real-provider-smoke-r1.mjs --confirm-real-provider
```

`scripts/tianyan-multi-node-prediction-real-provider-smoke-r1.mjs` 已存在，但默认只返回 `REAL_PROVIDER_SMOKE_NOT_STARTED_CONFIRMATION_REQUIRED` 和 `realProviderCalls: 0`。脚本在临时隔离项目中建立一个 Run 和一个 Attempt，不进入审阅或采纳；完成后删除隔离项目。

未附带 `--confirm-real-provider` 时，不读取本地凭据、不创建项目、不发起网络请求。附带确认但任一上限或种子不符合上述形状时，仍然在调用前失败关闭。

## 可先独立执行的现有连接门禁

现有 `scripts/tianyan-pi-agent-real-gate-r0-smoke.mjs` 只检查 Provider 连接与 16-token 最小推理，不创建 Prediction Run。它同样需要 `--confirm-real-provider`，且本轮未执行。它不能替代上面的种子故事预测 smoke，也不得计为预测能力通过。
