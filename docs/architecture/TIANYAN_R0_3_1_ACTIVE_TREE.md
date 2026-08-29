# TIANYAN R0.3.1 active tree

Baseline: `238c892a4dd336cba749e4a4efd6331e73580f03` on `main`.

This inventory records the verified active graph before the R0.3.1 retirement cleanup. It is an implementation map, not a second product specification.

## Roots and reachability method

| Root | Verified path | Result |
| --- | --- | --- |
| Browser product | `apps/story-studio/src/main.tsx` | Static TypeScript and CSS imports lead to `App.tsx`, the R0 Shell, current event-line workbench, page tools, Tianyi sidebar, project directory and Dock. |
| Local server | `apps/story-studio/server/server.mjs` | Direct and dynamic server imports lead to established Story Control Surface, Continuity, Intelligence, Workspace, Agent and Provider gateway owners. |
| Tests | `scripts/run-selected-tests.mjs` | The package test runner selects tracked unit tests and separately declares the integration set. |

Reachability was determined from static imports, imported styles, server dynamic imports, package script entrypoints, and remaining test imports. A file name alone was not used as evidence.

## Classification

| Class | Scope | Decision |
| --- | --- | --- |
| `KEEP_ACTIVE` | `apps/story-studio/src/main.tsx`, `App.tsx`, `product-shell/`, current `components/event-observation/`, `components/page-tools/`, `components/tianyi/{sidebar,composer,capability-launcher}/`, and their imported styles | Mounted R0.3 product path. |
| `KEEP_DOMAIN` | `src/storyControlSurface/`, `src/storyContinuity/`, `src/storyIntelligence/`, `src/storyAgent/`, `src/storyWorkspace/`, current local transport and `server/` | Existing facts, Sessions, Agent Runs, permissions, Candidate Review, Provider and project owners. No domain logic is removed by this cleanup. |
| `EXTRACT_THEN_DELETE` | Shell-only session recovery identifier | Kept as `product-shell/runtime/tianyiShellSessionRecovery.ts`; it stores only a project-scoped browser hint before the old presentation paths are removed. |
| `DELETE_RETIRED` | Unmounted legacy product shells, old workbenches, obsolete Tianyi presentation surfaces, old observation canvas, their CSS, and their source-regex-only tests | No remaining root imports them; their useful domain behavior already resides in existing domain owners. |
| `UNKNOWN_STOP` | None | No ambiguous reachable file was deleted. A future reference to a removed path must stop and be reclassified before replacement. |

## R0.3-specific runtime boundaries

- A saved Session identifier is namespaced by project and only lets the Shell ask the existing Session owner to recover it after refresh.
- The composer has a synchronous submit gate, so one draft cannot open duplicate Session/Run requests before React rerenders.
- Only broker-backed permissions are selectable; the selected intent maps into the existing Agent permission profile for the next run.
- Provider model configuration remains a read-only projection in the Shell until a real selection contract is wired.

## Retired-path rule

Retired UI is deleted rather than copied into an archive directory. `docs/architecture/FEATURE_INDEX.json` contains only current reachable entries and domain entries; its validation is part of lint.

## Deletion manifest

| Retired group | Removed paths |
| --- | --- |
| Legacy shells and global presentation | `product-shell/AppShell.tsx`, old header/profile/navigation helpers, and `styles/product-shell-r0.css` |
| Unmounted workbenches | Old world, library, creation, writing, graph, relation, card, Canvas, Nuwa and multiverse components that had no root import |
| Old Tianyi presentation | `components/tianyi/TianyiWorkspace.tsx`, conversation/brief/review helpers, the old composer and legacy session presentation helpers |
| Isolated observation experiment | `components/story-observation/` and its route helper |
| Retired styling | Old app, presentation, prototype, bounded-Nuwa, multiverse, observation and Tianyi stylesheets |
| Retired test and browser evidence paths | Source-regex-only legacy tests and unmounted old browser smoke scripts; `test:e2e` now points to the active R0 Shell smoke |

The full per-file deletion list is the local commit diff. No archive directory, backup branch, or compatibility copy is created.
