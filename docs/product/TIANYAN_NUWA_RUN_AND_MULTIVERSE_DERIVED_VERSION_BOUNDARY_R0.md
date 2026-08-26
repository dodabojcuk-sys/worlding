# Tianyan Nuwa Run and Multiverse Derived Version Boundary R0

Status: frozen product and owner boundary. Multiverse implementation is out of scope.

## Product decision

女娲是作者面对的“排演现场”。它在一个冻结的故事切片中试演微观发展，
允许暂停、纠正、形成临时走向、比较结果，并把作者选中的结果送入既有的
Candidate Review、Impact Review 和 AuthorControl 写入链。排演本身不创建正式
事实，也不创建可以长期独立创作的故事版本。

多元是未来的“派生版本”工作空间。它从既有版本所有者读取来源版本，并由
同一个既有版本所有者管理派生版本、来源版本、对齐、陈旧状态、恢复点和作者
决策。多元不能借用女娲的临时走向作为第二套版本存储，也不能创建第二个
Event、World、Character、Relation 或 Canon owner。

## Owner map

| Product meaning | Existing owner | Nuwa R0 authority | Future Multiverse authority |
| --- | --- | --- | --- |
| 排演生命周期 | existing Nuwa RunPack | owns one Run-local lifecycle, frozen snapshot, steps, pauses, corrections and recovery | none |
| 临时走向 | child RunPack linked to its parent and checkpoint | reversible Run-local continuation only; never a formal version | may only be used as reviewed input after an explicit future handoff contract |
| 候选结果 | existing Candidate Review owner | creates a pending proposal from one completed source-complete path | reads reviewed candidates only when a future contract explicitly permits it |
| 影响审查 | existing Impact Review owner | projects current facts, possible changes, unchanged facts, conflicts and write plan | reuses the same review owner; no second review ledger |
| 正式事件写入 | existing Event owner through `StoryStudioAuthorControl.applyAuthorChangeSet` | exactly one author-confirmed write path | reuses the same AuthorControl path when a derived version is later accepted |
| 派生版本 | existing version / derived Event Line owner | none | sole owner of source revision, derived version identity, alignment, staleness and recovery |
| World / Character / Relation / Canon truth | existing domain owners | read-only snapshot input until author confirmation | read-only source input; writes remain behind existing AuthorControl and domain owners |

## Boundary rules

1. A Nuwa temporary path is scoped to one Run and one frozen snapshot. It is not
   a branch in the Multiverse product sense and must not appear in version lists.
2. Nuwa rollback means creating a child continuation from a checkpoint. It never
   rewrites the original path, snapshot, step, receipt, or confirmed story truth.
3. A Nuwa candidate remains pending until the author completes Candidate Review,
   Impact Review, and the existing AuthorControl confirmation.
4. A future Multiverse derived version must retain an explicit source version and
   source revision, must expose staleness, and must be recoverable through the
   existing version owner. It cannot use RunPack as its persistence root.
5. Nuwa and Multiverse may share projections and handoff contracts, but they may
   not share authority by copying truth into a new local store.
6. Unknown information remains unknown. Rehearsal inference, psychological
   narration, and alternate outcomes never become current facts by display alone.

## Author-facing language

The default Nuwa surface uses these terms:

| Internal concept | Default author label |
| --- | --- |
| Observation | 排演现场 |
| Branch | 临时走向 |
| Compare | 结果对照 |
| Event Overlay | 事件候选 |
| Review | 作者审查 |
| Replay | 回放记录 |

Internal IDs, receipts, deltas, hashes, provider counters, owner names, revisions
and fail-closed diagnostics may appear only inside a collapsed technical-details
section. They are never the primary explanation of the author journey.

## Explicit non-goals for this task

- no Multiverse route, data model, persistence, migration or UI implementation;
- no new version, Event, World, Character, Relation, Canon or Run owner;
- no real Provider or plugin call;
- no real-project write or migration;
- no mobile feature implementation;
- no push, merge or deployment.

## Acceptance boundary

The repaired Nuwa experience may earn local technical and evidence acceptance.
It cannot issue Founder acceptance, and it cannot authorize Multiverse work.
Multiverse remains on hold until the Founder approves the author-facing Nuwa
journey and separately issues the next product contract.
