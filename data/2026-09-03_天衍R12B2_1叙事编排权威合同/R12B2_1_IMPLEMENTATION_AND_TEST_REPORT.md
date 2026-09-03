# R12-B2.1 实现与测试报告

## 结论

```text
RESULT=WAITING_FOR_FOUNDER_R12B2_1_NARRATIVE_CONTRACT_REVIEW
```

R12-B2 的历史停止保持不变；其语义按 Founder 决定解释为 `BLOCKED_NARRATIVE_ORDER_CONTRACT_REQUIRED`，不改写历史提交。本候选只解决正式叙事编排合同与最小权威切片，没有恢复生产 UI。

## 实现摘要

- 新增纯合同与投影：`src/storyContracts/narrativeArrangement.ts`。
- 新增 Story Unit 内部 top-level payload：`narrative_arrangements_r0`。
- 新增 create/insert/move/remove/rollback 唯一 Writer 与 read projection。
- 复用 WorkVersion、Story Unit ID、Workspace content hash 和本地 action/token 边界。
- 新增 local transport/API，但没有任何 React 组件接入。
- 没有新依赖、数据库、Event 字段、自动迁移或 Provider 调用。

## 定向测试

Node `v22.22.0`、npm `10.9.4`，仅临时项目、本地 API 和零 Provider：

| 范围 | 结果 |
| --- | --- |
| `tests/storyContracts/narrativeArrangementR0.test.ts` | PASS：9 tests |
| `tests/storyStudio/narrativeArrangementAuthorityR0.test.ts` | PASS：5 tests |
| `tests/storyStudio/narrativeArrangementTransportR0.test.ts` | PASS：1 test |
| 合计 | PASS：15 / 15 |
| `npm run typecheck`（实现后定向） | PASS |

覆盖真实行为：before/after、同 Unit move、跨 Unit move、重复呈现、正式 Unit+Placement 顺序、输入数组变化、world time 分离、重平衡、双 expected version、失效 anchor、幂等、并发拒绝、receipt、rollback、legacy 零写入、普通保存保留、portable round-trip、分支隔离、隐式合流拒绝、本地 token。

## 全量验收

最终全量命令结果：

```text
UNIT_TESTS=PASS (982 tests / 182 files)
INTEGRATION_TESTS=PASS (52 tests / 12 files)
E2E_TESTS=PASS (existing isolated R0 shell smoke)
TYPECHECK=PASS
LINT=PASS (10 scripts; retired-source and owner-index invariants)
PRODUCTION_BUILD=PASS (Vite 2026 modules)
FULL_VERIFY=PASS
```

UI 完全未改，因此没有伪造修改后截图。现有 E2E 必须按原隔离 fixture 通过；创始人体验验收仍必须人工独立完成。

## 安全边界

```text
USER_PROJECT_DATA_WRITES=0
REAL_PROVIDER_CALLS=0
DEPENDENCIES_ADDED=0
R12B2_UI_RESUMED=NO
R12B3_STARTED=NO
```

所有自动测试写入均位于测试创建并负责删除的临时目录。
