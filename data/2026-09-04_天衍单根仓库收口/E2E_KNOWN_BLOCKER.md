# 标准 E2E 已知问题

状态：`KNOWN_E2E_BLOCKER`

来源判定：`INHERITED_PRE_EXISTING_E2E_FAILURE`

## 当前事实

同一 Node `22.22.0` / npm `10.9.4`、同一 mock-only 环境、同一固定端口与独立临时数据条件下：

- 原 R12C `99afabb73f5df9ad079dbe8faa27d40a5e03f701` 连续两次失败；
- 独立 staging `cf1fe9e6adea43c2ac9d2150336ecaec826f6743` 连续两次以同一断言、同一行号失败；
- 两边 prediction 专项 E2E 均通过；
- Provider 调用为 0，原 R12C 测试前后工作树 clean。

失败断言位于 `apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs:2513`：

```text
The draft Event must survive reload in the story spine.
false !== true
```

## 已确认的真实行为

创建 API 对 `event.手动事件-A` 和 `event.手动事件-B` 均返回 HTTP 201。刷新前后，world-library 都能查询到相同两个 `draft` Event，revisionToken 不变；verified Canon Event 集合也不变。

这两个 draft Event 没有绑定 `targetStoryId`、BaseVersion 或 workVersionId。它们在刷新后进入 `legacy-unplaced`，折叠的 narrative staging area 只显示待编排数量，不显示 Event 标题。因此当前失败是故事脊投影/可见性契约与 smoke 断言不一致，不是数据持久化丢失，也不是仓库合并引入。

## 下一轮唯一 P0 修复目标

明确未绑定 Story/BaseVersion 的 draft Event 在刷新后故事脊中的可见性合同，并让标准 smoke 通过真实 UI 验证持久化对象：折叠入口必须具备可访问的对象证据，或测试必须打开 staging area 后核对 Event ID/标题。不得删除刷新保护、添加固定等待或把 draft 写入 Canon。

完整证据保存在仓库外只读归档：

`/home/beelink/Documents/Codex/_archive/tianyan-consolidation-20260904/verification/e2e-provenance-20260904/`
