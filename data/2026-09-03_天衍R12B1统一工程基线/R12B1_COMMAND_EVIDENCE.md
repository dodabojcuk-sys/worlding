# 天衍 R12-B1 命令与响应证据

## 1. 工具链

所有有效验证均使用：

```text
PATH=/home/beelink/.cache/tianyan-runtime/node-v22.22.0-linux-x64/bin:$PATH
node v22.22.0
npm 10.9.4
```

首次直接执行缓存目录中的 npm 时，环境 PATH 让 npm shebang 解析到 Node 24，工具链门禁按设计停止。修正 PATH 后再开始有效验证；没有改代码、删断言或放宽门禁。

## 2. Git 证据

```text
git merge --no-ff --no-commit 838129a88119ffe9dc0c5d06bcec06973802c63e
Automatic merge went well; stopped before committing as requested

git show -s --format='%H %P' 6863d99453db402b312268ef61b9f5400a634c4f
6863d99453db402b312268ef61b9f5400a634c4f 85c65d30fe9aefba8465e0c5d64b61b5d41c3ae4 838129a88119ffe9dc0c5d06bcec06973802c63e

git merge-base --is-ancestor <runtime|r11.1|provider> HEAD
0
0
0
```

合并前 `range-diff`：R11/R11.1 两个提交与 Runtime/Provider 五个提交分别位于独立序列。
合并后 `range-diff`：`28a2b19` 与 `838129a` 均以 `=` 原样匹配，Runtime/Provider 五个提交全部保留。

## 3. Runtime 响应

开发态隔离 E2E 的完整机器可读响应见 `证据/Runtime/dev-api-only.json`：

```text
Vite /event-line: 200; contains /@vite/client and /src/main.tsx
api-only /event-line: 404; contains RUNTIME_MODE=api-only
proxied /__local/story-studio/bootstrap: 200
health: 200 application/json; runtimeMode=api-only
unknown API: 404 application/json
```

正式单端口 Smoke 的完整机器可读响应见 `证据/Runtime/production-combined-static.json`：

```text
RUNTIME_MODE=combined-static
nested /event-line?eventView=line: 200
hashed /assets/index-Bx_wm9kE.js: 200
health: 200 application/json; runtimeMode=combined-static
unknown API: 404 application/json
PRODUCTION_VITE_STARTED=0
source=apps/story-studio/dist
```

动态证据端口为开发 UI `46043`、开发 API `37937`、正式单端口 `39935`。它们不占用用户已有的 4191/4192。

## 4. Event Observation 证据

隔离命令：

```text
TIANYAN_E2E_SCOPE=r11-observation-workspace npm run test:e2e
PASS
```

生成并抽查：

- `证据/R11_1/01-1440-narrative-trajectory.png`：参与轨迹与来源层；
- `证据/R11_1/01b-1440-narrative-matrix-detail.png`：矩阵和详情；
- `证据/R11_1/02-1440-world-time-shared-event-detail.png`：世界时间和同一 Event 详情；
- `证据/R11_1/03-1152-world-time-restored.png`：1152 恢复；
- `证据/R11_1/04-743x529-200-percent-equivalent.png`：200% 等效窄视口。

断言覆盖默认叙事视图、轨迹、矩阵、世界时间、详情、四态、来源、URL/localStorage 安全恢复、Event ID/焦点/详情保持、非人物心理边界，以及视图切换 Provider 调用计数为 0。

## 5. Provider / Embedding 证据

通过的专项测试包含：

```text
tests/storyStudio/providerCatalogR0.test.ts
tests/storyStudio/providerCatalogLifecycleIntegrationR0.test.ts
tests/storyStudio/providerEmbeddingAdaptersR0.test.ts
tests/storyStudio/persistentProviderProfile.test.ts
tests/storyStudio/persistentProviderServer.test.ts
tests/storyContinuity/embeddingIndexBindingR0.test.ts
apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs
```

断言覆盖 `never_fetched / loading / ready / stale / failed / unsupported`、显式模型获取、LKG stale、Embedding probe、OpenAI-Compatible / Ollama Native、Provider instance 隔离、LLM / Embedding 分离、index binding compatibility 与重建门禁。伪 Provider 只监听 loopback；E2E 环境明确禁用真实凭据。

## 6. 全量门禁

```text
npm run typecheck       PASS
npm run lint            PASS (26 features; Canon/WorldState/Event owner each 1)
npm run test:unit       PASS (181 files; 973 tests; 0 fail)
npm run test:integration PASS (10 files; 46 tests; 0 fail)
npm run test:e2e        PASS
npm run build           PASS (Vite 8.1.4; 2026 modules)
npm run verify          PASS
```

构建只有既存的 chunk 大小提示，没有错误。所有验证使用 mock、临时 fixture 或 loopback 伪服务；真实 Provider 调用为 0。
