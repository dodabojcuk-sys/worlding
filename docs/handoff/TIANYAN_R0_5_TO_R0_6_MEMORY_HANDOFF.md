# Tianyan R0.5 → R0.6 handoff

## Repository state

- Branch: `main`.
- R0.5 reference base: `758790fd8a41bdddfe22d0f7823cc034ba2998bc`.
- `R0_5_IMPLEMENTATION_HEAD=dd7034cd72d4edf0f1d0a536cdb4137505dd349e`.
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
- Full character workspace is not implemented; its inspector entry reports an honest unavailable state.
- Standard/compact density is a browser UI preference scoped by user and object type, not character data.
- Deleted R0.3 character UI stays deleted.

## Founder visual evidence

- Stable reference: `data/2026-08-29_天衍R0_5创始人视觉收口/TIANYAN_R0_5_FOUNDER_CHARACTER_DIRECTORY_REFERENCE.png`.
- Reference SHA-256: `0acbc7f2671a41b9833ffbf081be1929c8c3fb0a3d9472347c64b2057ad6e4de`.
- Implementation screenshots and their per-capture manifests: `data/2026-08-29_天衍R0_5创始人视觉收口/`.
- Visual capture used the repository's installed Playwright browser with isolated test data at 1920×1000, 1440×900 and 1152×720; console warnings/errors were zero. Founder visual status remains `REVIEW_REQUIRED` until independent review.
- Validation environment was Node `v24.16.0`; the project navigation still records Node 22 as its target runtime.

## Verification and known gaps

Final test results and browser evidence must be read from the R0.5 completion report and final `git log`. Permanent deletion remains safely blocked in UI. Known gaps: full character workspace, named category-definition management, first-appearance sorting, complete delete-impact enumeration, and permanent delete.

## Memory handoff

The seven layers are working, session, episodic, semantic, procedural, prospective and raw evidence. Canon and Agent memory remain separate owners; original evidence is authoritative and embeddings are replaceable indexes. Candidate `VectorStoreBackend` implementations are Milvus, pgvector, Qdrant and ChromaDB. Milvus is not selected: operational fit, project/version isolation, hybrid retrieval, backup/recovery and local-product ergonomics require R0.6 evaluation.

Do not reopen these frozen decisions in the next conversation: Canon is not memory, original evidence is not replaceable by vectors, model credentials stay in Provider configuration, backend selection follows contract/evaluation, and mobile remains a separate product.

Read first in a new conversation: `AGENTS.md`, `TIANYAN_PRODUCT_CORE.md`, `项目目录导航.md`, this handoff, `TIANYAN_MEMORY_AND_MODEL_CAPABILITY_BOUNDARIES_R0.md`, `objectCatalog.ts`, and the character-directory README.

`NEXT_STAGE=TIANYAN_R0_6_LONG_FORM_MEMORY_RETRIEVAL_CONTRACT_AND_BACKEND_EVALUATION`
