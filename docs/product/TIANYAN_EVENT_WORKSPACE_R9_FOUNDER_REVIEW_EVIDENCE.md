# Tianyan Event Workspace R9 Founder Review Evidence

Status: `ENGINEERING_COMPLETE / FOUNDER_REVIEW_REQUIRED`

Base: `6e425d608ec22ebd45e7dd69a73ab2a486f3c85b`

Branch: `codex/event-workspace-foundation-r8`

Draft PR: `#2`

## Delivered contract

- Perspective selection accepts 1–5 versioned formal Owner references. One Owner uses the single perspective projection; 2–5 use the comparison projection. Switching projections is read-only and makes zero Provider calls.
- Set points are Story Unit owner-backed authoring containers. They retain stable IDs, reference existing Event IDs, preserve formal Relation endpoints, and support create, rename, membership update, collapse, movement, dissolve, receipt, and refresh recovery.
- The Event line is a horizontal narrative projection with stable main/branch tracks, explicit branch/merge topology, pinned-position preservation, readable semantic zoom, and horizontal panning.
- The Timeline is an independent `TemporalCanvas`. It reuses Event identity and source versions without inheriting the Relation canvas node skin, positions, ports, or every Relation edge.
- AI temporal composition is a versioned read-only projection cache containing versioned Event refs, tracks, point/interval placement, confidence, evidence, alternatives, manifest digest, and layout revision.
- Story Spine, Event line, Timeline, Relations, and Perspectives remain projections over the existing owners; no second Event, Relation, Canon, or WorldState writer was introduced.

## Milestone commits

1. `b2704a7` — `docs: correct event projection and perspective model`
2. `a865e36` — `feat: add single and comparison perspective modes`
3. `17ebddf` — `feat: add owner-backed event collection points`
4. `b5ce710` — `feat: add horizontal narrative event layout`
5. `0c8ece7` — `feat: add independent timeline projection`
6. `7216bee` — `feat: strengthen event node and spine topology`
7. `256ffea` — `feat: refine projection-specific event grammar`
8. `0a7de74` — `fix: preserve independent event projection layouts`
9. `4c0f787` — `feat: version temporal composition cache`
10. `e878282` — `test: verify r9 event projection workflows`
11. `8655f1d` — `test: keep r9 timeline evidence readable at 1152`

## Gate results

- Unit: PASS — 939 tests, 0 failures.
- Integration: PASS — 42 tests, 0 failures.
- Standard E2E: PASS.
- Prediction E2E: PASS.
- R9 interaction and recording E2E: PASS at 1440×900, 1280×800, and 1152×720.
- Typecheck: PASS.
- Lint: PASS, including the single-owner feature-index invariants.
- Build: PASS.
- Browser console warnings/errors during evidence flows: 0.
- `REAL_PROVIDER_CALLS=0`; evidence used the isolated test Provider only.
- `FORMAL_EVENT_WRITES=0`, `FORMAL_RELATION_WRITES=0`, `CANON_WRITES=0`, `WORLDSTATE_WRITES=0` before author actions.

## Visual evidence

Stable external evidence root:

`/home/beelink/.codex/visualizations/2026/09/02/tianyan-event-workspace-r9`

- `01-1440-single-owner-perspective.png`
- `02-1440-multi-owner-comparison.png`
- `03-1440-set-point-created-moved-collapsed.png`
- `04-1440-horizontal-three-branch-two-merge-layout.png`
- `05-1440-ai-temporal-composition-branch-tracks.png`
- `06-1280-story-spine-branch-topology.png`
- `07-1152-timeline-tianyi-348.png`
- `08-1152-set-point-event-line-pan.png`
- `09-R8-to-R9-before-after-contact-sheet.png`
- `TIANYAN_R9_1440x900_FULL_FLOW.webm`
- `TIANYAN_R9_1152x720_RESPONSIVE.webm`
- `SHA256SUMS.txt`

Both recordings were decoded frame-by-frame without media errors. One-second visual contact sheets were opened and reviewed after the final recording pass. The 1440 recording demonstrates horizontal inspection of the density story without shrinking the nodes into a card wall. The 1152 recording demonstrates panning and a readable independent Timeline beside the fixed 348px Tianyi dock.

## Design QA

- The density fixture is deliberately wider than one viewport. The initial frame keeps 193px rendered Event cards and four readable track labels; the uncut recording pans through its three branches and merge topology.
- The Timeline overview starts at the authored beginning at a readable zoom. It does not fit every event into a single miniature view; overflow remains available by pan.
- Single-perspective blind spots are explicitly author-visible and labeled as unknown to the selected character; they are not presented as character knowledge.
- The set-point summary is visually a container projection, not an Event card, and its edges preserve formal Event endpoints.
- No Founder acceptance is inferred from these engineering and visual checks.

## Remaining review

Founder review is required for the visual density, narrative-track inspection rhythm, set-point authoring comfort, and single/compare perspective language before merge to `main`.
