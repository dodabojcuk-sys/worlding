# Tianyan R0.5 → R0.6 handoff

## Repository state

- Branch: `main`.
- R0.5 reference base: `758790fd8a41bdddfe22d0f7823cc034ba2998bc`.
- `R0_5_IMPLEMENTATION_HEAD=dd7034cd72d4edf0f1d0a536cdb4137505dd349e`.
- `R0_5_FOUNDER_REPAIR_BASE_HEAD=334e20a4fb7acc45c30ff794c25d7e28831a52e9`; it only relocated the previous external visual-evidence paths and is an ancestor-preserving documentation correction.
- GitHub remote: `https://github.com/dodabojcuk-sys/worlding`, public `origin/main`. A handoff reader must resolve its current remote head with `git ls-remote origin refs/heads/main`; this document must not claim its own commit hash.
- `HANDOFF_READER_MUST_RESOLVE_CURRENT_HEAD_WITH=git rev-parse HEAD`.
- Pre-existing `CORE.md` and `data/` changes remain outside R0.5 commits.
- Push, deploy and Provider/model calls: zero.

## R0.5 implementation

- Project-directory owner: `apps/story-studio/src/product-shell/project-directory/`.
- Character directory entry: `character/CharacterDirectoryPanel.tsx`.
- Read-only inspector: `character/CharacterInspectorCard.tsx`, reading existing WorldObject, relation and event projections.
- Catalog owner: `src/storyWorkspace/objectCatalog.ts`.
- Catalog persistence: project-local `.world-os/object-catalog/<workVersionId>.json`; missing files project an empty v1 catalog, so old projects need no eager migration.
- Catalog fields: project/work-version/object identity, category, trash metadata, optional display order, schema/revision timestamps. It stores no title, prose, image, level, tags, relations, events, Canon, sources or memory.

The visible lifecycle is composed from two authorities:

```text
active ↔ archived       WorldObject owner
active|archived → trash ObjectCatalog records trashedAt + trashedFrom
trash → prior state     ObjectCatalog clears trash only after source-state validation
```

Permanent deletion is intentionally blocked in the R0.5 UI. Existing impact enumeration does not prove complete coverage across every relationship, event/Canon, Story Unit, source/evidence and historical WorkVersion reference; therefore “unknown” cannot be treated as zero references. There is no cascade delete.

## Frozen interaction decisions

- Character directory replaces only the light project-directory slot.
- Selecting a character opens a new read-only right inspector overlay and writes stable focus to the URL.
- The central workspace, Tianyi Session and draft are not remounted or resized by selection.
- Full character workspace is not implemented. The inspector can expand to a larger read-only overlay using existing WorldObject/Card Presentation/relation/event projections, but “在资料中编辑” remains disabled until a stable editor route exists.
- Standard/compact density and directory sort are browser UI preferences scoped by user and object type, not character data. Both controls remain discoverable in the character-directory toolbar.
- Deleted R0.3 character UI stays deleted.

## Founder visual evidence

- Founder rejected the pre-repair R0.5 directory and inspector. `FOUNDER_VISUAL_VERDICT=REJECTED`; the repair's self-check does not change the required independent Founder verdict.
- Stable tracked reference: `docs/design/references/tianyan-r0-5-founder-character-directory.png`.
- Source-path copy preserved outside the tracked design asset: `data/2026-08-29_天衍R0_5创始人视觉收口/TIANYAN_R0_5_FOUNDER_CHARACTER_DIRECTORY_REFERENCE.png`.
- Reference SHA-256: `0acbc7f2671a41b9833ffbf081be1929c8c3fb0a3d9472347c64b2057ad6e4de`.
- Repair evidence screenshots and per-capture manifests: `data/2026-08-29_天衍R0_5创始人退回修复/截图/`; they remain external work evidence and are deliberately not Git-tracked.
- The installed Playwright browser verified isolated test data at 1920×1000, 1440×900 and 1152×720. It exercises real creation, required-field recovery, refresh and new-Shell durability, compact/multi/archive states, inspector selection and exact one-navigation-current behavior; console warnings/errors were zero.
- A clean GitHub clone verified the tracked reference SHA, `npm ci`, `npm run verify`, and the real browser creation smoke. New work must begin from a freshly fetched `origin/main`, not a local worktree containing uncommitted `CORE.md` or `data/` artifacts.
- Creation uses the existing `createCharacterCard` → WorldObject/Card Presentation owner. The dialog receives the returned stable `object.id`, reloads the directory projection, then writes URL focus and opens the read-only inspector. Category is a separate ObjectCatalog metadata write: failure leaves the created character intact and exposes retry; it never deletes to roll back.
- WorldObjects follow the existing project-scoped projection rule. ObjectCatalog category/trash metadata is project-and-work-version scoped; no character title, summary, aliases or tags are copied into it. Founder visual status remains `REVIEW_REQUIRED` until independent review.
- Validation environment was Node `v24.16.0`; the project navigation still records Node 22 as its target runtime.

## R0.6 character-directory repair notes

- Display summaries reuse `readStoryCardContent` / `parseStoryCardSections`; the directory and inspector must never render section anchors, internal comments, content references or section IDs. This is a read-only presentation projection and must not rewrite source Markdown.
- Custom role levels are values in the existing WorldObject `subtype` field. Authors can select built-ins, existing project values, or a validated new value at character creation. Global rename/delete of a role level is not implemented.
- Category definitions use project-scoped `workspaceLayoutRepository` folders with `kind=custom-category`; ObjectCatalog retains only a project-and-work-version-scoped folder ID assignment. Unknown historic IDs display “未知分类”, never the internal ID. Do not add a CategoryStore or migration without a new owner contract.

## Verification and known gaps

Final test results and browser evidence must be read from the R0.5 completion report and final `git log`. Permanent deletion remains safely blocked in UI. Known gaps: full character workspace/editor route, global role-level rename/delete, first-appearance sorting (no authoritative projection), complete delete-impact enumeration, and permanent delete.

## Memory handoff

The seven layers are working, session, episodic, semantic, procedural, prospective and raw evidence. Canon and Agent memory remain separate owners; original evidence is authoritative and embeddings are replaceable indexes. Candidate `VectorStoreBackend` implementations are Milvus, pgvector, Qdrant and ChromaDB. Milvus is not selected: operational fit, project/version isolation, hybrid retrieval, backup/recovery and local-product ergonomics require R0.6 evaluation.

Do not reopen these frozen decisions in the next conversation: Canon is not memory, original evidence is not replaceable by vectors, model credentials stay in Provider configuration, backend selection follows contract/evaluation, and mobile remains a separate product.

Read first in a new conversation: `AGENTS.md`, `TIANYAN_PRODUCT_CORE.md`, `项目目录导航.md`, this handoff, `TIANYAN_MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES_R0.md`, `objectCatalog.ts`, and the character-directory README.

`NEXT_STAGE=TIANYAN_R0_6_LONG_FORM_MEMORY_RETRIEVAL_CONTRACT_AND_BACKEND_EVALUATION`
