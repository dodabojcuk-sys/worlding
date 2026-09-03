# R12-B2.1 权威与 Writer 矩阵

## 结论

现有 Story Structure/Story Unit 适合作为正式叙事编排 Owner。实现方式是 Story Unit Markdown 内部的版本化子实体，不是新顶层仓库。

## 实际权威图

| 事实/对象 | 实际 Owner / Writer | 持久化 | 本轮行为 |
| --- | --- | --- | --- |
| Story Unit 与结构字段 | `storyStudioWorkspaceOperations.ts` | `story-units/*.md` 的 `story_unit_payload` | 保持；普通保存保留新顶层字段 |
| `NarrativeArrangement` / `NarrativePlacement` | 同一个 `storyStudioWorkspaceOperations.ts` 命令面 | 路径根 Story Unit 的 `narrative_arrangements_r0` | 新增版本化子实体 |
| Event 正文与事实 | `storyStudioWorkspaceOperations.ts` 的 Event writer | `world/events/*.md` | 只读 ID；移动 Placement 零写入 |
| Canon | `storyStudioAuthorControl.ts` | 既有 Canon/frontmatter 与回执链 | 不变 |
| WorldState | 既有 Workspace/WorldState owner | 既有路径 | 不变 |
| Relation | `storyStudioRelationOperations.ts` / relation repository | 既有 relation repository | 不变 |
| WorkVersion 来源谱系 | `workVersionAuthority.ts` | `.world-os/work-versions/` | 只复用并验证身份 |
| Candidate / Impact / AuthorControl | `storyStudioAuthorControl.ts` | 既有 candidate/change-set | 本轮不扩展候选类型 |
| UI 与 localStorage | React presentation/session state | 浏览器临时状态 | 永不成为正式编排 Owner |
| Provider | `aiProviderGateway.mjs` | Provider profile/receipt owner | 调用 0，代码不改 |

## Story Structure 与 Story Unit 的持久化关系

当前没有一个独立、可安全扩展的 Story Structure 数据库。实际结构能力由 Story Unit 的 `kind`、`parentUnitId`、`branchPointEventId`、`mergeTargetUnitId`、`order` 与唯一 Workspace Writer 表达并持久化。因此 R0 arrangement 作为“路径根 Story Unit 托管的结构子实体”扩展该 Owner，避免凭文档名称推断一个不存在的顶层存储。

## 稳定身份复用

| 维度 | 复用身份 |
| --- | --- |
| story/work | Workspace `project.md` 的 canonical Project ID |
| 当前作品版本 | `WorkVersionIdentity.workVersionId` |
| 来源谱系 | root WorkVersion ID；derived 使用现有 `parentVersionId` |
| 叙事路径/分支 | 既有 Story Unit ID |
| Unit | `StoryStudioStoryUnit.id` |
| arrangement | 上述稳定作用域的 digest ID |
| Placement | arrangement ID + 首次 insert operation ID |

Nuwa `branchId` 只属于 Nuwa provenance，不能替代作品正式来源谱系；Multiverse 单派生 fixture 也不是新 Owner。

## 并发和版本机制

| 层级 | 机制 |
| --- | --- |
| Story Unit 文件 | `contentHash` + `updateWorkspaceNote(expectedContentHash)` |
| Arrangement | append-only logical revision + head digest |
| 幂等 | operation ID + normalized payload digest |
| 追溯 | 每 revision 完整 Placement 快照 + 每操作 receipt |
| 回滚 | 复制目标 revision 内容并追加新 revision |
| WorkVersion | 既有 identity/manifest/revision/receipt 完整性校验 |

## 读取/保存丢字段审计

| 路径 | 证据 | 结论 |
| --- | --- | --- |
| `parseStoryUnitPayload` / `createStoryUnitPayload` | 只选取已知 `story_unit_payload` 字段 | 新字段若放入旧 payload，旧普通保存可能删除 |
| `updateWorkspaceNote` | `{...current.frontmatter, ...input.frontmatter}` | 未知顶层 frontmatter 会保留 |
| `updateStoryUnit` | 只覆盖 `title/status/story_unit_payload` | 独立顶层 arrangement payload 保持逐字不变 |
| `normalizeStableIds` | 去重并 `localeCompare` | `linkedEntityIds` / CollectionPoint `eventIds` 不能承载顺序 |
| `.tianyan` portable package | 包含 `story-units/` | arrangement 随既有 Owner round-trip |

## Writer 路由

本地 API `GET /narrative-arrangement` 与五个写路由只转接唯一 Workspace operations。写路由有现有本地 token 与 author action 记录；服务端不保存第二份顺序。`localTransport.ts` 只是未来 UI 可用的类型和调用接口，本轮没有组件导入这些 Writer。

## 不变性

```text
EVENT_OWNER_CHANGED=NO
CANON_OWNER_CHANGED=NO
WORLDSTATE_OWNER_CHANGED=NO
RELATION_OWNER_CHANGED=NO
NEW_PARALLEL_DATABASE=NO
PRODUCTION_UI_WRITES=NO
```
