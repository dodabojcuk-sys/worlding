# 天衍 Runtime Mode 与单入口 R0

## 目的

开发态与构建产物态复用同一 Story Studio API，但不再共享模糊的 UI 入口。运行模式由 `TIANYAN_STORY_STUDIO_RUNTIME_MODE` 显式决定，绝不通过 `NODE_ENV`、端口、来源或 User-Agent 推断。

| 模式 | UI 入口 | API | `dist` / SPA fallback |
| --- | --- | --- | --- |
| `api-only` | Vite `4191` | Story Studio `4192` | 禁止 |
| `combined-static` | Story Studio `4192` | Story Studio `4192` | 启用 |

未设置模式时，服务安全地使用 `api-only`，不会误把可能陈旧的构建产物作为开发 UI 暴露。

## 命令与端口责任

### 开发

```bash
npm run dev
```

该命令启动 Vite（默认 `127.0.0.1:4191`）和 `api-only` Story Studio API（默认 `127.0.0.1:4192`）。开发日志只声明：

```text
DEV_UI=http://127.0.0.1:4191
LOCAL_API=http://127.0.0.1:4192/__local/story-studio
ACCEPTANCE_ENTRY=http://127.0.0.1:4191
```

Vite 仅代理 `/__local/story-studio` 到 API。4192 的非 API 路径返回不含应用资源的 `api-only` 诊断（浏览器 HTML 请求）或 JSON 404（其他请求）；它不重定向到 4191，也不读取 `dist`。

### 正式构建/本机预览

```bash
npm run build
npm run serve
```

`serve` 显式选择 `combined-static`。启动前必须存在本轮 `npm run build` 输出的 `apps/story-studio/dist/index.html`；不存在即失败，而不是静默提供历史页面。该模式只监听既有 loopback 地址 `127.0.0.1:4192`，不启动或宣传 4191：

```text
APP_UI_AND_API=http://127.0.0.1:4192
RUNTIME_MODE=combined-static
```

在该模式中，`/assets/**` 从 `dist` 提供，普通嵌套路由回退到 `dist/index.html`。`/__local/story-studio/**` 永远先进入 API 路由；未知 API 返回 JSON 404，不能回退为 HTML。

## 验收与测试

- `npm run test:e2e` 启动隔离的 Vite/API 对，并显式使用 `api-only`：验证 Vite 源码入口、代理 API、4192 无 SPA、健康检查与未知 API JSON 404。
- 构建后运行：

  ```bash
  npm exec -- node --experimental-strip-types scripts/tianyan-runtime-mode-smoke.mjs
  ```

  它只启动一个隔离的 `combined-static` 服务，验证根页、嵌套路由刷新、带哈希静态资源、健康检查与未知 API 404，并清理本轮进程。
- 自动化只使用 Mock 或本地伪服务；不触发真实 Provider。

## 适用范围、回滚与历史原因

仓库未发现 Docker、Compose、Electron、Tauri 或 systemd 运行合同，因此本轮不新增它们。未来正式容器如被引入，必须执行 build 后只运行 `combined-static`，只公开一个应用端口。

旧行为由 `server.mjs` 无条件托管 `dist` 且所有非 API 路由回退 `index.html` 造成，因此开发时 4191（源码）和 4192（构建产物）都像 UI 入口。R0 只隔离运行模式，不维护第二份前端源码，也不将 `dist` 提升为源码权威。

回滚此候选提交即可恢复旧的无条件静态托管、原启动脚本和原测试入口；不需要删除构建产物或处理任何用户项目数据。
