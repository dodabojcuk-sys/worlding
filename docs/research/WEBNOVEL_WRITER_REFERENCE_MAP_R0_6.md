# Webnovel Writer reference map R0.6

## Research boundary

- Upstream inspected: `lingfengQAQ/webnovel-writer` at `2041abad78211e29a67a2f0c64b2a97a747dce57` (default branch `master`; checked 2026-08-29).
- Scope is architecture and behavioral evidence, not a port. The upstream README describes a Claude Code plugin for serial novels and claims a target of **2 million Chinese characters**; its latest release is v6.2.1 (2026-07-07).
- This document names concepts and small schema fields only where needed to explain interoperability. It does not copy GPL implementation, prompt bodies, or substantial source text.
- Tianyan baseline for the mapping is this worktree's `e481b68765cfff9bca7f213c76091f026adead34` and its `docs/architecture/FEATURE_INDEX.json`; that index remains the implementation-owner evidence, while `TIANYAN_PRODUCT_CORE.md` remains the product authority.

## Evidence index

| Area | Upstream evidence |
| --- | --- |
| Product flow and source-of-truth claims | `README.md:33-74, 117-145`; `docs/architecture/overview.md:5-10, 80-107` |
| v6.2 context reduction and recovery | `CHANGELOG.md:20-46`; `releases/v6.2.0.md:11-55` |
| Minimum-context write flow | `docs/architecture/context-minimal-writing-flow-plan-2026-06-05.md:67-87, 150-305, 322-350, 503-550` |
| Long-term memory | `docs/memory/long-term-memory-architecture-v2.md:9-18, 42-73, 75-132, 134-232, 292-373` |
| Retrieval and fallback | `docs/guides/rag-and-config.md:3-54`; `scripts/data_modules/rag_adapter.py:1099-1302`; `scripts/data_modules/config.py:178-185, 279-284` |
| Agent boundaries | `agents/context-agent.md:11-101`; `agents/reviewer.md:11-142`; `agents/data-agent.md:11-109` |
| Dashboard and character projection | `dashboard/app.py:292-392, 394-648`; `dashboard/frontend/src/pages/CharactersPage.jsx:243-340`; `dashboard/frontend/src/api.js:18-70` |
| License | repository `LICENSE`; GitHub repository metadata reports `GPL-3.0` |

## 1. SOURCE_OF_TRUTH_MAP

| Upstream layer | Upstream authority / constraint | Tianyan counterpart | Adoption judgement |
| --- | --- | --- | --- |
| Write-before contracts | `.story-system/MASTER_SETTING.json`, volume/chapter/review contracts constrain a chapter before draft. | Canon-backed WorldObject / rules plus a version-scoped Context Receipt. | Adapt as a **read-only context contract**, never as a second Canon. |
| Accepted chapter commit | An accepted `CHAPTER_COMMIT` is the post-write fact-entry gate. Rejected commits do not drive fact projections. | `storyStudioAuthorControl.ts` produces the approved ChangeSet / author decision; `storyStudioWorkspaceOperations.ts` remains sole Event and WorldState owner. | Adopt the *single accepted gateway* invariant, but route it through Tianyan's existing author-review + Canon chain. |
| Event audit | Chapter event artifacts carry stable event IDs and supported types. | Confirmed Event owned only by `storyStudioWorkspaceOperations.ts`. | Adapt artifact validation; do not import chapter-centric event taxonomy as Tianyan's world schema. |
| Read models | `state.json`, `index.db`, summaries, scratchpad, vector DB are explicitly projections/read models. | Timeline, Data space, cards and Shell views must be projections of existing owners. | Directly adopt the non-authoritative projection rule. |
| Projection health | `projection_log.jsonl`, gates, retry and dashboard expose per-projection status. | Existing receipt / continuity / Candidate Review / workspace operations can expose a projection receipt without gaining facts ownership. | Adapt operational observability and idempotent replay only. |

**Conflict test:** upstream's commit-first model is compatible only if “accepted commit” is translated to *Tianyan author-confirmed ChangeSet applied by its sole Canon writer*. A raw agent output, a Data view update, or a vector write must never be treated as confirmation.

## 2. WRITE_PIPELINE_MAP

```text
Author intent + selected source/version
  -> Tianyan Context Receipt (bounded, immutable input evidence)
  -> Tianyi / writing-agent proposal or draft
  -> Review evidence (continuity, knowledge boundary, causality, rule checks)
  -> candidate artifacts / impact preview
  -> author decision
  -> sole Canon write + Event / WorldState mutation
  -> idempotent projections: Data, object views, search indexes, summaries, dashboard
  -> receipt, recovery marker, retry only failed projections
```

The corresponding upstream sequence is preflight → runtime contract → Context Agent brief → draft → Reviewer → polish → Data Agent artifacts → accepted commit → projections → backup. Its strongest transferable property is separation of **drafting**, **review evidence**, **fact extraction**, **acceptance**, and **derived views**. The upstream plan also requires three gates and retries only the failed projection; that is a useful reliability pattern.

Tianyan must change the ordering semantics: a writing draft can be an external artifact or candidate node; it is not necessarily an Event. Its adoption must create a candidate/ChangeSet first, run Impact Review, then write through the existing Canon/Event owner. “Chapter” is only one possible Unit scope; Tianyan must also support node, 集点, unit, branch, and derived-copy scopes.

## 3. CONTEXT_ASSEMBLY_MAP

| Upstream pattern | What it actually does | Tianyan mapping | Boundary |
| --- | --- | --- | --- |
| One base pack | Context Agent calls `memory-contract load-context` once, then deep-queries only missing entities, rules, or timeline. | Generate a Context Receipt from selected Canon/version/source, object refs, author intent, scope, and explicit exclusions. | Receipt is evidence and an input snapshot, not a mutable world cache. |
| Priority ordering | User request > chapter outline/goal > master setting > reasoning > accepted commit > CSV retrieval. | Author intent + selected source/version + confirmed Canon/Event evidence > approved branch facts > retrieval evidence > non-authoritative suggestions. | Never let a retrieved passage override confirmed Canon or author intent. |
| Narrow loading | “Already included” data is not reloaded; references are on-demand. | Resolve references by stable object ID, Event ID, document revision/range/digest, then use a task budget. | Do not inject entire project history or raw unscoped Agent memories. |
| Human-readable brief | Agent returns a compact five-part drafting brief rather than its system internals. | Tianyi returns a cited, inspectable task brief and Context Receipt summary. | Keep receipt provenance and confidence visible; do not hide fallback state. |
| Hard stop on insufficiency | Missing crucial contracts or insufficient context returns a blocker, not invented detail. | Add “insufficient evidence / need author input” as a first-class result. | Required by Tianyan's no-fabricated-facts and author-control core. |

Directly reusable rule: *load a small stable packet, supplement by exact query, preserve provenance, and stop when essential evidence is absent.* The upstream's chapter-outline vocabulary and implicit global “master setting” must be adapted into Tianyan source/version/scope contracts.

## 4. WORKING_EPISODIC_SEMANTIC_MEMORY_MAP

| Layer | Upstream implementation | Tianyan-compatible meaning | Ownership decision |
| --- | --- | --- | --- |
| Working | Runtime assembly from chapter outline, recent summaries, protagonist state, plot threads, pending disambiguation. | Per-run Context Receipt / attention pack for one Tianyi or Nuwa task. | `storyContinuity` receipt and stopping/grant repositories; disposable except immutable receipt/audit metadata. |
| Episodic | Recent structured evidence from `index.db`: state changes, relationships, appearances. | Time- and source/version-bounded Event evidence and WorldObject transitions. | Remain projections/read access over the sole Event/WorldState owner, not a new memory database of record. |
| Semantic | `memory_scratchpad.json`, bucketed facts/rules/timeline/open loops/relationships, with `active/outdated/contradicted/tentative`. | Derived, provenance-bearing memory claims such as active rule, unresolved thread, knowledge boundary, and story fact. | Introduce only as a derived memory repository under `storyContinuity`; every claim must cite Canon/Event/source revision and never overwrite it. |
| Learning memory | Separate `project_memory.json` stores author/style patterns. | Workspace Note / author preference / craft learning. | Keep separate from world facts and make author scope explicit. |

The upstream scratchpad's useful mechanics are stable keys, superseded-status retention, conflict warnings, compaction, and bootstrap from existing evidence. The unsafe shortcut is making a JSON “semantic memory” the effective truth because it is easier to query. In Tianyan, semantic entries must retain `sourceRef`, `sourceVersion`, `authorityStatus`, confidence, and invalidation/supersession links; a Canon/Event correction invalidates or regenerates derived memory rather than editing history in place.

## 5. RAG_AND_FALLBACK_MAP

| Concern | Upstream evidence | Tianyan recommendation |
| --- | --- | --- |
| Modes | `auto` routes to hybrid by default and graph-hybrid for graph-needed intent; explicit vector, BM25, hybrid, graph-hybrid, backtrack exist. | Keep retrieval strategy behind a Tianyan port. Query source/version/time/scope filters are mandatory before ranking. |
| Retrieval | Vector + BM25, RRF fusion, then rerank; graph-hybrid expands entity-related evidence. | Adopt a layered retrieval interface: deterministic exact references first, structured Event/WorldObject filtering second, optional lexical/vector retrieval third, rerank last. |
| Fallback | Missing embedding credentials falls back to BM25; rerank failure returns fused RRF results. | Directly adopt graceful degradation, but the UI/receipt must state mode, evidence set, and degradation reason. No silent fallback. |
| Storage | The current implementation stores vectors and a BM25 inverted index in SQLite `vectors.db`; it uses full scan through 500 vectors, then BM25/recent candidate prefilter. | Treat it as a useful local-index baseline, not a chosen production database. All index entries must be rebuildable from Canon/Event/source. |
| Graph | Graph-RAG is optional and disabled by default. | For Tianyan, relationships/events already have semantic owners; graph expansion must be a read-only projection/query operation and cannot create implicit facts. |

### Metrics required before Milvus / pgvector / local-index selection

Do **not** choose a vector store from upstream's nominal 2-million-character claim or its hard-coded thresholds. Collect these real per-project measurements from Tianyan first, segmented by source type and branch/version:

| Measurement | Why it decides the architecture |
| --- | --- |
| Source documents, characters/tokens, chunks, chunks per Unit, average/p95 chunk length and overlap | Determines index cardinality, storage, ingest throughput, and context packing. |
| Canonical Events, WorldObjects, relationships, object revisions, versions/derived copies, and daily mutation rate | Determines filter selectivity, projection replay cost, and whether relational co-location matters. |
| Embedding dimension/model, vector bytes, metadata bytes, total on-disk size, rebuild duration and failure/retry rate | Determines local disk/RAM and migration cost. |
| Query volume, concurrent runs, p50/p95 retrieval and rerank latency, top-k/candidate-k, cache hit rate | Determines whether SQLite/local scan remains adequate or a service index is justified. |
| Filter distribution (project, branch, version, time range, object/event type), exact-reference vs semantic query share | Determines need for pgvector filtering, hybrid retrieval, or graph support. |
| Recall/grounded-answer evaluation: cited-source precision, stale-version leakage, cross-branch leakage, author rejection rate | Determines quality and safety; latency alone is insufficient. |
| Operating constraints: offline requirement, backup/restore time, deployment topology, retention/deletion and privacy locality | Determines whether a local index is a product requirement. |

Use a fixed evaluation corpus with known source/version answers. Compare local SQLite/FTS+vector, pgvector, and Milvus only after these measurements exist; require identical source filters, identical embeddings, identical test queries, and explicit failure-mode tests.

## 6. AGENT_RESPONSIBILITY_MAP

| Upstream agent | Upstream responsibility | Tianyan mapping | Must not do |
| --- | --- | --- | --- |
| Context Agent | Read-only research; returns compact writing brief; exact follow-up queries; blocks if evidence is inadequate. | Tianyi context assembly / page Agent scoped by immutable Context Receipt. | Modify Canon, Event, WorldObject, or silently use unbounded context. |
| Reviewer | Produces evidence-backed checks for setting, timeline, continuity, character and logic; blocking issues stop commit. | Review owner evaluates Candidate/ChangeSet impact, including event causality, character knowledge boundary, rule and source/version consistency. | Decide authorship, mutate facts, or replace author review with an opaque score. |
| Data Agent | Extracts three temporary artifacts; confidence thresholds route ambiguity; it does not write projections. | Candidate extraction / Agent-recognition proposal producer. | Confirm an object, create an Event, or write Canon; its ambiguity must enter existing Candidate Review. |
| Deconstruction Agent | Returns research only; is forbidden to write canon/read models during initialization. | Research/import analysis capability. | Smuggle external/reference material into official world facts without author confirmation. |

This division aligns closely with Tianyan: use Context as **reader/assembler**, Review as **evidence and risk producer**, Data as **candidate/artifact producer**, and leave formal decision/action to the existing Review + Canon owners.

## 7. DASHBOARD_PROJECTION_MAP

Upstream Dashboard is intentionally GET-only. Its backend reads `.webnovel/state.json`, `.story-system` contracts/commits, `index.db`, and vector status. `CharactersPage` concurrently requests `/api/entities`, `/api/relationships`, `/api/relationship-events`, then requests `/api/state-changes` for the selected entity. It renders a chapter-filtered relationship graph by combining base relationships with latest relationship events.

| Dashboard concern | Tianyan mapping | Constraint |
| --- | --- | --- |
| Character list/detail | `WorldObject` fields and authorized object projection. | Character page must not own fields, tags, archive state, relations, memories, or events. |
| Relationship graph / replay | Event and relation projections filtered by source/version/time. | The graph is an observation surface; it cannot recompute and persist “truth”. |
| Overview / health | Canon/receipt/version/projection status, outstanding review and stale-index indicators. | Present authority and freshness labels, not one blended “current state”. |
| Dashboard requests | Read-only projection endpoints over existing owners. | No UI-direct state mutation and no dashboard-local database. |

For the named Tianyan owners: `WorldObject` owns character fields/tags/archive state; `ObjectCatalog` owns only project/work-version category identity and trash metadata; `Workspace Note` is author/workspace material and cannot become Canon by dashboard display; `Agent` retains stable identity/state/memory/knowledge boundaries but its execution runtime is not a facts owner; `Review owner` remains `storyStudioAuthorControl.ts`; Confirmed Event/WorldState remain `storyStudioWorkspaceOperations.ts`.

## 8. LICENSE_AND_COPYING_RISK

Upstream is licensed GPL-3.0-only (repository `LICENSE` and GitHub metadata). This is a material copying risk for a proprietary or differently licensed Tianyan distribution:

- Do not copy, translate, adapt, or embed upstream source, prompts/agent files, schemas in expressive detail, compiled frontend assets, tests, or substantial documentation text.
- Do not make derivative files by line-for-line reimplementation. A Chinese translation of source or long prompt text is still an adaptation risk, not a clean design note.
- Ideas, high-level architectures, functional requirements, public interface facts, and independently written short descriptions can inform a clean-room design, but legal classification of a particular reuse/combination is fact-specific. Obtain counsel before incorporating GPL material or distributing a combined work.
- Preserve this evidence map and independently authored Tianyan specifications as provenance. Any future contributor who has read upstream implementation should work from requirements/tests authored for Tianyan, with review for non-literal/non-structural copying.

This is engineering risk guidance, not legal advice.

## 9. ADOPT / ADAPT / REJECT

| Decision | Pattern | Reason |
| --- | --- | --- |
| Adopt | One explicit accepted gateway before derived projections. | Matches Tianyan's single Canon writer and author confirmation boundary. |
| Adopt | Projections are rebuildable, observable, idempotent, and retried without rerunning successful upstream work. | Strengthens recovery without changing semantic ownership. |
| Adopt | Context minimum-load, precise supplements, provenance, and blocker-on-insufficient-evidence. | Directly supports long-form quality and no hallucinated facts. |
| Adopt | Review separates evidence/risk from fact mutation. | Fits existing Candidate/Impact Review model. |
| Adapt | Commit artifact validation and confidence-based entity disambiguation. | Outputs must become Tianyan candidates and references, not chapter-local truth. |
| Adapt | Working/episodic/semantic layering and memory compaction. | Must be source/version-aware derived memory, never an alternate WorldState. |
| Adapt | Hybrid RAG + visible BM25/rerank fallback. | Insert authority-first filtering and valid source/version scopes before similarity ranking. |
| Adapt | Read-only Dashboard entity/relation replay. | Drive it from Tianyan projection contracts, preserving authority labels. |
| Reject | Chapter as the universal fact/commit unit. | Tianyan's Unit/集点/node, branch, Run and derived-copy semantics are broader. |
| Reject | A standalone `state.json`/SQLite/scratchpad becoming an operational fact source. | Conflicts with Canon/Event-first ownership and correction lineage. |
| Reject | Agent-written projections or agent auto-confirmed facts. | Conflicts with author authority and the sole Canon writer. |
| Reject | Direct reuse of GPL code/prompts/assets or structural copy. | License and provenance risk. |

## 10. Tianyan object-by-object mapping

| Tianyan concept / existing owner | Reference analogue | Recommended connection |
| --- | --- | --- |
| Canon — `src/storyControlSurface/storyStudioAuthorControl.ts` | accepted `CHAPTER_COMMIT` gate | Preserve Canon as the only formal author-confirmed write decision; a “commit” is an operation receipt, not a new data root. |
| Event + WorldState — `src/storyControlSurface/storyStudioWorkspaceOperations.ts` | accepted events plus state/index projections | Validate candidate events/deltas before handoff; apply only through this owner; derive all indexes/views afterward. |
| WorldObject | upstream `entities`/state deltas | Map extracted entities to proposal/merge workflows; WorldObject owns fields/tags/archive state, not the catalog or dashboard. |
| ObjectCatalog — `src/storyWorkspace/objectCatalog.ts` | dashboard/entity categorization only | Keep it limited to category identity and trash metadata; never let RAG or data extraction write full facts into it. |
| Workspace Note | outline/summary/project-memory-like materials | Store author intent, research, and craft notes with authority status; promote to Canon only through explicit review. |
| Agent — `src/storyAgent/` + `src/storyIntelligence/agentRecognitionProposalRepository.ts` | Context/Data/Reviewer roles and entity records | Agent execution can read scoped receipts and return candidates/evidence; stable Agent identity and proposal lifecycle remain Tianyan-owned. |
| Review owner — `storyStudioAuthorControl.ts` | Reviewer blocking report + accepted commit gate | Convert review findings into Impact Review/candidate decisions; the model cannot self-approve. |
| Context/Memory — `src/storyContinuity/` | context manager + memory orchestrator | Add derived memory/index ports and receipts here, retaining source/version/revision/digest bindings. |
| Data / Dashboard spaces | state/index/dashboard read model | Expose only projection DTOs, freshness and provenance; no independent persistence authority. |

## 11. Event-first compatibility conclusion

The reference's most valuable architecture is not “SQLite + vectors”; it is **a single acceptance boundary followed by disposable derived views**. That is compatible with Tianyan only when Event and Canon remain primary and author-confirmed.

Conflicts arise wherever upstream's serial-chapter assumptions are made universal: single linear chapter state, a convenience semantic JSON becoming authoritative, an agent confidence threshold silently inserting world facts, or dashboard/index tables becoming writable domain stores. Tianyan must retain multiple source/version/derived-copy identities, immutable evidence receipts, explicit candidate status, and author-selected target scope.

## 12. Recommended next research slice (no implementation or datastore choice)

1. Define a Tianyan `DerivedIndexRecord`/memory-projection contract with source ID, version, Event/WorldObject refs, authority status, supersession, digest, rebuild cursor, and deletion/tombstone semantics.
2. Instrument an entirely local fixture corpus to collect the metrics in §5 across small, medium, and long serial projects plus multi-branch/derived-copy cases.
3. Build an evaluation set that asserts no stale revision or cross-branch evidence enters a Context Receipt, including BM25-only and embedding/rerank outage paths.
4. Compare local index, pgvector, and Milvus as implementations of that contract—not as competing sources of truth.

