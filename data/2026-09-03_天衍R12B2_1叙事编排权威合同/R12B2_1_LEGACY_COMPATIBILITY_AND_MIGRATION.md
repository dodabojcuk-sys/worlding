# R12-B2.1 旧项目兼容与迁移

## 默认读取

旧 Story Unit 不含 `narrative_arrangements_r0` 时，parser 产生一个仅存在于内存的空 store；权威读取返回 `arrangement=null`，所有当前 Event 返回 `unplaced` 与 `narrativeIndex=null`。

此过程不创建文件、不更新 frontmatter、不触发 workspace operation、不写 localStorage、不调用 Provider。

尚未建立 WorkVersion authority 的更早项目也允许只读：调用方提供当前选择器后仍得到全量 `unplaced`，但不能创建正式 arrangement；正式写入前必须先由既有 WorkVersion Owner 建立真实身份。

## 明确不采用的 fallback

旧项目不会用以下内容创建 confirmed Placement：

- `linkedEntityIds` 的保存顺序；
- Collection Point `eventIds`；
- Event ID、标题、创建时间或返回数组；
- world time；
- 画布坐标；
- AI 推断。

这些值可以在未来候选建议中作为“推断依据”显示，但不能成为正式 arrangement。

## Schema 与 round-trip

```text
tianyan-story-unit-narrative-arrangements/r0
tianyan-narrative-arrangement/r0
tianyan-narrative-arrangement-revision/r0
tianyan-narrative-arrangement-receipt/r0
tianyan-narrative-placement/r0
tianyan-narrative-arrangement-projection/r0
```

兼容策略：

1. 字段对旧数据可选；缺失即 legacy/unplaced。
2. 新 store 有显式 schema，并提供 `extensions` 作为后续兼容扩展容器。
3. 独立顶层 frontmatter 规避旧 `story_unit_payload` 的 known-field 重建。
4. 普通 `updateStoryUnit` 对新字段逐字保留，测试覆盖。
5. 新 Writer 更新该字段时仍保留 store/arrangement `extensions`。
6. `.tianyan` 导入导出沿用 Story Unit 文件，测试验证 currentVersion 和投影不变。

## 保存其他字段

Story Unit 的标题、摘要、生命周期、`linkedEntityIds` 等继续由原 writer 管理。保存它们不会创建 Placement，也不会改变 arrangement payload。Narrative writer 只合并自己的顶层 key，不重写 Story Unit 正文和旧 payload。

## 回滚与恢复

- 业务回滚：`rollbackNarrativeArrangement` 追加新 revision，恢复目标快照。
- 文件并发：`expectedOwnerVersion` 冲突时不写。
- arrangement 并发：`expectedRevision` 冲突时不写。
- portable 恢复：既有 `.tianyan` 打包 Story Unit 文件与 WorkVersion 数据。
- 本轮不扫描、不升级、不改写任何用户真实项目。

## 未来建议式迁移（未实现）

未来若 Founder 批准迁移体验，只允许：

1. 读取旧成员、Collection Point、世界时间等为候选证据；
2. 生成 `NarrativePlacementCandidate` / `NarrativeMoveCandidate`；
3. 明示推断依据和不确定性；
4. 作者逐项或批量确认；
5. AuthorControl 确认后调用唯一 Story Unit Writer；
6. 取消、拒绝或失败时正式 arrangement 不变；
7. 每次正式写入仍有 expected version、receipt 和回滚。

本轮没有 Candidate schema、迁移 UI、AI 排序或用户数据写入。

## 当前分支兼容边界

R0 安全支持所有 main Story Unit 组成的主路径，以及单个既有 branch Story Unit 自己托管的独立 arrangement。深层多 Unit 分支路径和正式合流需要先冻结现有 Story Unit 分支延续/合流合同；当前 Writer 返回 `branch-mismatch`，不会通过临时 ID 或自动合并越过该边界。
