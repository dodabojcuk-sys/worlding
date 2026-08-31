# 天意多节点预测真实 Provider Smoke 命令 R0

状态：`NOT_EXECUTED`。本文件只冻结下一阶段的人工授权入口；本轮不得运行。

## 前置边界

- 只允许使用本机 Story Studio 已保存的 Provider 配置；命令不接收、复制、迁移或输出凭据。
- 使用隔离的种子故事 `长夜将明`，不得指向作者的真实项目目录。
- 最多创建一个 Prediction Run、一个 Attempt；`maxOutputTokens=256`；`timeoutMs=30000`。
- 结果只停留在候选 Bundle 与执行回执；不得创建审阅、不得采纳、不得写 Event、Relation、Canon 或 WorldState。
- 当前 R0 产品 Gateway 固定使用本地 stub model。真实 Provider 适配器未获授权前，下面的预测命令必须保持不可执行；不得把 stub 结果冒充真实 smoke。

## 授权后的唯一命令形状

```bash
TIANYAN_REAL_PROVIDER_SMOKE=1 \
TIANYAN_REAL_PROVIDER_SMOKE_SEED=长夜将明 \
TIANYAN_REAL_PROVIDER_SMOKE_MAX_RUNS=1 \
TIANYAN_REAL_PROVIDER_SMOKE_MAX_ATTEMPTS=1 \
TIANYAN_REAL_PROVIDER_SMOKE_MAX_OUTPUT_TOKENS=256 \
TIANYAN_REAL_PROVIDER_SMOKE_TIMEOUT_MS=30000 \
TIANYAN_REAL_PROVIDER_SMOKE_ACCEPT=0 \
node scripts/tianyan-multi-node-prediction-real-provider-smoke-r1.mjs --confirm-real-provider
```

`scripts/tianyan-multi-node-prediction-real-provider-smoke-r1.mjs` 当前有意不存在。下一阶段只有在 Founder 明确授权真实 Provider smoke 后，才能实现该脚本和真实 Gateway adapter；在此之前，运行上述命令应因入口不存在而失败关闭。

## 可先独立执行的现有连接门禁

现有 `scripts/tianyan-pi-agent-real-gate-r0-smoke.mjs` 只检查 Provider 连接与 16-token 最小推理，不创建 Prediction Run。它同样需要 `--confirm-real-provider`，且本轮未执行。它不能替代上面的种子故事预测 smoke，也不得计为预测能力通过。
