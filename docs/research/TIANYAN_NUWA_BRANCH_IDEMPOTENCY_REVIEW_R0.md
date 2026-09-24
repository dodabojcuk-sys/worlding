# 天衍 · 女娲分支幂等修复提交前审查 R0

> 状态：REFERENCE
> 作用域：仅 2026-09-19 `codex/semantic-world-r3 @ 93f41aa`（BASE worktree `/home/beelink/.codex/worktrees/tianyan-semantic-world-r3`）工作区的未提交改动。审查动作全部只读；本文不改任何文件。
> 基线：HEAD `93f41aa7ea8a6f3719773421abe7f466c9381f3c`（= BASE，逐位实测）。
> 取代关系：—（对账快照 → `docs/research/`，G-3.2）
> 依据：任务 TIANYAN_NUWA_BRANCH_IDEMPOTENCY_REVIEW_R0；被审对象 = TIANYAN_NUWA_BRANCH_IDEMPOTENCY_FIX_R0 的产出（2 文件，+81/−2）。

## 结论：NEED_FIX（一处边界回归；核心修复本身正确）

任务书四项审查标准全部满足（见 §二）；但审查发现一个由该修复**新引入**的可达回归：**满 64 条 provenance 的分支节点将无法被采纳（adopt 永久抛错，无恢复路径）**，见 §三 R-1。 remedy 约 5 行 + 1 个测试，修完复跑后本审查可升 PASS。

## 一、改动面核对（✅ 通过）

`git status --porcelain`（非 `??` 项）恰好两个跟踪文件，无其他改动混入：

| 文件 | diff | 内容 |
| --- | --- | --- |
| `src/storyControlSurface/storyStudioWorkspaceOperations.ts` | +11/−2（仅 `updateNuwaBranchNodeContent` 成功路径内） | 追加重放标记 `{kind:"author-edit", authorActionId: replayAuthorActionId, at: editedAt}` ＋ 64 条上限裁剪（丢最旧 author-edit、保留 nuwa-run） |
| `tests/storyStudio/nuwaBranchCheckpointCloseout.test.ts` | +70（文件末尾追加 2 个新 test，既有用例零改动） | 重放幂等测试 ＋ 64 条上限裁剪测试 |

## 二、任务书六项"没有"核对（✅ 全部通过）

| 检查 | 方法 | 结论 |
| --- | --- | --- |
| 新 Owner | diff 无新导出/新文件/新目录；改动全部在既有唯一 Owner 文件的既有方法体内 | ✅ 无 |
| 新数据结构 | 追加项 `{kind:"author-edit", authorActionId, at}` 与合同联合成员逐字段一致（`nuwaBranchNode.ts:25`） | ✅ 无 |
| 新存储 | 写入仍走同一 `nuwaBranchAtomicWrite(branchEventFile(...))`、同一 frontmatter `NUWA_BRANCH_NODE_FRONTMATTER_KEY` 字段 | ✅ 无 |
| UI 修改 | `NuwaN1Workspace.tsx`、`localTransport.ts`、端口 `nuwaN1Port.mjs` 均不在 diff 内 | ✅ 无 |
| Canon 写入路径变化 | 无新写入路径；`storyStudioAuthorControl.ts`、`applyAuthorChangeSet` 链未触碰；改动只影响分支节点草稿文件（非 Canon/Event/WorldState 事实） | ✅ 无 |
| Provider 调用 | 纯本地文件操作；测试以 `MOCK_OR_LOCAL_FAKE_ONLY`＋`REAL_PROVIDER_CREDENTIALS_USED=0` 运行 | ✅ 无 |

## 三、provenance 追加逻辑专项审查

### 3.1 与 `adoptNuwaBranchNode` 一致性（✅，含一处合理差异）

- **条目形状一致**：`{kind:"author-edit", authorActionId, at}`，与 adopt 的 3207 行追加及合同 `normalizeProvenance`（`:157-158`）完全同构。
- **验证强度一致**：adopt 用 `requireText(authorActionId,180)` 校验后追加；update 复用 `replayAuthorActionId`（上游 `requireText(operationId,180)` 已验），落盘时再过 `normalizeProvenance → requireOperation`（≤180，字符集 `[a-z0-9._:-]`）双重校验。
- **authorActionId 取值差异是设计使然**：update 的重放机制按 `"<operationId>.author"` 派生标记（一次编辑一个操作）；adopt 的重放机制按 `reviewState==="branch-adopted"` 状态判定（采纳单向）。端口层 `authorActionId` 本就传 `${operationId}.author`，两者在生产路径重合。
- **长度边界（✅ 无风险）**：生产唯一调用方端口层 `operation()` 把 operationId 钳在 ≤160（`nuwaN1Port.mjs:1398`）→ 追加标记 ≤167 < 180 合同上限。仅直调 operations 层的 174–180 字符 operationId 会触界（当前只有测试可达），且与 adopt 既有暴露同类，不构成新风险类。

### 3.2 64 条限制（⚠️ update 侧正确执行；adopt 侧新暴露回归 → R-1）

- update 侧：追加后 `while (length > 64)` 裁至 ≤64，先于 `normalizeProvenance`（>64 即抛）——顺序正确，测试已覆盖（65 次修改后 ≤64、最旧被裁、最新保留）。
- **R-1（回归）**：3207 行 adopt 的追加**无裁剪**。修复前 provenance 全仓只有两个增长点（创建 ≤1 条、adopt +1 条），64 上限不可达；修复后 update 使长会话节点稳定停在 64 条。此时 adopt 追加到 65 → `normalizeNuwaBranchNode` 抛 `TypeError: Nuwa branch node provenance is invalid.`（`nuwaBranchNode.ts:151`）→ 端口只把返回值 `conflict` 转 409，抛出的 TypeError 直接透传为 5xx → **该节点每次采纳都失败，且无任何压缩/恢复路径**（update 仍可用但恒停在 64）。可达性：64 次不同 operationId 的成功保存（长自动保存会话量级）后点采纳。

### 3.3 nuwa-run 溯源（✅）

- 裁剪循环只删 `kind === "author-edit"` 的条目；`findIndex` 返回 -1 时 break（防御：理论上不可能全为 author-edit 还超限，此时宁可抛错也不丢 nuwa-run——与注释"keep nuwa-run origins"意图一致）。
- 测试覆盖：cap 测试节点带 `nuwa-run-cap` 溯源，65 次修改后断言其仍在。✅

## 四、测试与验证记录（审查时复跑）

| 项 | 结果 |
| --- | --- |
| 3 个 nuwa 分支测试文件（10 用例） | ✅ fail 0（含新增 2 例） |
| `typecheck` / `lint`（Node 22 规范运行时） | ✅ 绿（33 features、四唯一 Owner 校验通过） |
| `test:unit` 全量 | 1318/1319；唯一失败 `storyChangePreview` = 快照 §2.3 登记的既有 locale 假阳性，导入链不经过被改文件，与本改动无关 |

## 五、修复要求（升 PASS 的唯一条件）

在 `adoptNuwaBranchNode`（3207 行）的追加处套用与 update 相同的上限策略——同一节点级 provenance 政策（"cap at 64; trim oldest author-edits, keep nuwa-run origins"）理应约束两个写入点：

1. adopt 追加后按同一 while 规则裁至 ≤64（建议抽一个两写入点共用的小 helper 或保持对称复制，二选一，不加新 Owner/新文件）。
2. 补 1 个测试：带 nuwa-run 溯源的节点修改 64 次后 adopt 成功（`reviewState === "branch-adopted"`、重放命中）、最旧 author-edit 被裁、nuwa-run 保留。
3. 复跑 3 个 nuwa 测试文件 + typecheck + lint，全绿后本审查按 §五 附记升 PASS（同文件追加附记，不另起 R1——G-3.11）。

## 六、边界与声明

本文只审查未提交工作区改动，未修改、未 commit、未 push；verdict 的执行（补 adopt 裁剪 + 测试）属下一轮修复动作，等用户指令。审查中复跑的测试与既有结论（快照 §2.3/执行包）不构成创始人体验验收（AGENTS.md 末条）。

---

## 七、PASS 附记（2026-09-19，TIANYAN_NUWA_BRANCH_PROVENANCE_CAP_FIX_R0 之后）

§五 的修复要求已由后续任务完成，本审查升级为 **PASS**：

- `capNuwaBranchProvenance` helper（模块级，operations 文件内，无新 Owner/新文件）落位；update（:3157）与 adopt（:3201）两个写入点复用同一裁剪规则（cap 64、丢最旧 author-edit、保 nuwa-run）。
- 新增测试"满 64 条 provenance 的节点仍可采纳"：修复前红（`adoptNuwaBranchNode → normalizeProvenance` 抛 `TypeError: Nuwa branch node provenance is invalid.`，即 §三 R-1 预测路径），修复后绿；断言 adopt 成功、`reviewState === "branch-adopted"`、provenance ≤64、采纳标记保留、nuwa-run 保留。
- 复跑：nuwa 3 测试文件 **11/11** 绿；`typecheck`/`lint` 绿；`test:unit` 全量 **1320/1321**——唯一失败仍是 `storyChangePreview`（既有 locale 假阳性）；本轮全量曾出现一次 `authorChangeSetCrashSafeEventApply` 失败，隔离复跑 31/31 且第二次全量通过，定性为并发负载下的一次性 flake，与改动无关。
- 约束复核：无新数据结构/Owner/存储/UI/Canon 写入链变化/Provider 调用（diff 仅 provenance 生命周期逻辑）。
- 改动面（未提交）：`storyStudioWorkspaceOperations.ts` +17/−3（含 helper）、`nuwaBranchCheckpointCloseout.test.ts` +110（3 个测试）。commit/push 等用户指令。
