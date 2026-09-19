# 天衍 · WorldContextPack fail-closed 修复提交前审查 R0

> 状态：REFERENCE
> 作用域：仅 2026-09-19 `codex/semantic-world-r3` BASE worktree（`/home/beelink/.codex/worktrees/tianyan-semantic-world-r3`，HEAD `80a1bbb`）工作区的未提交改动。审查全部只读；本文不改任何文件。
> 基线：HEAD `80a1bbb`（含 nuwa 分支幂等两连修）。
> 取代关系：—（对账快照 → `docs/research/`，G-3.2）
> 依据：任务 TIANYAN_WORLD_CONTEXT_PACK_FAIL_CLOSED_REVIEW_R0；被审对象 = TIANYAN_WORLD_CONTEXT_PACK_FAIL_CLOSED_FIX_R0 产出（2 文件，+35/−5）。

## 结论：PASS

五项检查全部通过；"作者视角逐字节不变"这一最硬约束不止靠 diff 静态证明，还做了 **HEAD 版本与修复版的运行时 A/B 实测**（5 种输入组合 JSON 逐字节一致）。一处语义分歧（`characterAllowedReferences` 保持其文档化宽松合同）按 G-6.10 登记于 §四，不阻塞，ROADMAP 冲突表登记列为后续项。

## 一、改动面核对（✅）

`git status --porcelain` 非 `??` 项恰好两个文件：

| 文件 | diff | 内容 |
| --- | --- | --- |
| `src/storyContracts/worldCausalEvolution.ts` | +4/−3（仅 `buildWorldContextPack` 角色分支） | `if (!knowledge) return entry.category !== "clue"` → `return knowledge?.state === "known"`，附 fail-closed 语义注释 |
| `tests/storyContracts/worldCausalEvolution.test.ts` | +31/−2 | 新增 fail-closed 测试（6 条目夹具、11 断言）；既有测试夹具 2 个条目补"知情：林月如=已得知"（原夹具锁定的正是被修的 fail-open，补标签后其 scope/relatedness/秘密排除/沈砚未知/作者视角 macro 断言全部原样保留且通过） |

## 二、语义核对（✅，含运行时证明）

| 检查 | 方法 | 结论 |
| --- | --- | --- |
| `characterTitle=null` 作者视角未改变 | **A/B 实测**：`git show HEAD:` 物化修复前契约模块（依赖链仅 worldReferenceProjection.ts，一并取出），与修复版对同一输入各跑一次，`JSON.stringify` 逐字节比较——4 种 scopeLevel ＋ 含 taskKeyword 的 needles 变体共 **5 组合全部一致**；静态上 diff 仅触及 `characterTitle` 非空分支，null 分支不可达改动 | ✅ |
| `publicFacts` 未改变 | 该行不在 diff 内；A/B 实测的 JSON 比较包含 publicFacts 字段（角色视角下两版本亦相等，测试另断言） | ✅ |
| unknown 不进角色上下文 | 测试断言 `知情：林月如=未知` 的 `char.港主` 被拒；既有 `沈砚` 用例（character-unknown）继续通过 | ✅ |
| author-note 不泄漏 | 上游 `publicFacts` 过滤（nature ≠ author-note/rumor，未动）＋ 新测试断言 `作者暗线真港` 不在 roleAllowedFacts、在 excludedSecrets（reason=author-note） | ✅ |
| rumor 不泄漏 | 同上（`海雾怪谈`，reason=rumor） | ✅ |

**收紧的完整语义（审查确认）**：角色视角 `roleAllowedFacts` 仅收显式 `知情：<角色>=已得知` 条目；未标注条目现落入 `excludedSecrets`（reason=character-unknown，诚实披露）并相应进入 `sourceRefs`。派生字段（hardRules/currentPressures/relatedLocations/relatedFactions/relevantEvents）⊆ roleAllowed，随之一致收紧。作者视角（null）全字段逐字节不变。

## 三、测试覆盖核对（✅，任务书五类全覆盖）

| 要求覆盖 | 测试证据 |
| --- | --- |
| 已知 | `loc.暗渠`、`event.夜火`（知情=已得知）→ 断言可见；且 A/B 验证修复前后对显式已知条目行为一致（收紧不误伤） |
| 未知 | `char.港主`（知情=未知）→ 断言拒绝；既有 `沈砚` 用例 |
| 无标签 | `faction.灰雾商会` → 断言拒绝 ＋ excludedSecrets 以 character-unknown 披露；**该断言修复前红（true≠false），是本修复的失败测试** |
| 作者秘密 | `loc.真港`（作者秘密标签）→ 断言拒绝 ＋ excludedSecrets reason=author-note |
| 作者视角 | `authorView`（characterTitle=null）断言未标注条目仍可见 ＋ publicFacts 字段与角色视角相等；另有运行时逐字节 A/B 证明（§二）与既有 macroPack 用例 |

（额外：传闻 `loc.怪谈` 覆盖 reason=rumor 披露。）

## 四、重点审查：`characterAllowedReferences` 与 `buildWorldContextPack` 的语义分歧（已记录，未统一）

**分歧现状**（本审查按 G-6.10 登记，不做统一）：

| 函数 | 角色视角对"无知情标签"条目的处理 | 依据 |
| --- | --- | --- |
| `buildWorldContextPack`（本次修复） | **拒绝**（fail-closed） | 快照执行包任务二："把'没标注'当'公共知识'是违反"；创始人本轮任务"默认拒绝未知信息" |
| `characterAllowedReferences`（worldReferenceProjection.ts:159） | **非线索类别放行**（人物/地点/组织/物件/规则视为公共事实；线索必须显式已知） | 其 JSDoc `:155-158` **明文声明**的合同；角色 Agent 预备接口草案，上游文档 `docs/product/WORLD_REFERENCE_AND_CHARACTER_AGENT_PREP_R0.md`（仅基线存在） |

- 本修复**未触碰** `characterAllowedReferences`——它的 fail-open 是文档化设计而非疏漏，擅改会违反其声明的合同与最小范围约束。
- **后续项（需要创始人裁定，非本审查可决）**：① 该分歧是否登记进 `ROADMAP` 冲突表（本审查任务禁止改文件，未代登记——建议下一文档批次顺手补一行）；② 角色 Agent 正式接线时两套语义是否统一为 fail-closed；若统一，需同步 `characterAllowedReferences` 的 JSDoc、其调用方与 PREP 文档（后者仅基线存在，合并时按 G-8.2 处理）。
- 实际风险敞口：`buildWorldContextPack` 生产零调用方（实测仍只有定义文件，接线=任务三、阻塞 C1）；`characterAllowedReferences` 同样无生产调用方（预备接口）——分歧当前不影响任何活路径。

## 五、测试与验证记录（审查时点）

| 项 | 结果 |
| --- | --- |
| 3 个相关测试文件（worldCausalEvolution / characterContextPack / indexEligibility） | 14/14 绿 |
| `typecheck` / `lint`（Node 22 规范运行时） | 绿 |
| `test:unit` 全量 | 1321/1322；唯一失败 = `storyChangePreview` 既有 locale 假阳性（与本改动无关） |
| 作者视角 A/B 逐字节验证 | 5 组合 PASS（脚本落 `/tmp`，非仓库文件） |

## 六、边界与声明

本文只审查未提交工作区改动，未修改、未 commit、未 push；`/tmp` 下的验证脚本与 HEAD 契约副本不属仓库资产。技术验证不构成创始人体验验收（AGENTS.md 末条）。commit 与否的决定权在用户侧。
