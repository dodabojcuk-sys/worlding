# R0.5 character directory design QA

- Source visual truth: `/tmp/codex-clipboard-4c1afdc3-8d26-4107-8033-23f4c720b4a3.png`
- Source pixels: 1560 × 1008; desktop reference.
- Implementation URL: `http://127.0.0.1:4191/world`
- Intended viewports: 1920 × 1000, 1440 × 900, 1152 × 720 at device scale 1.
- State: standard character directory, compact mode, multi-select, archive/trash, and read-only inspector.

**Full-view comparison evidence**

The source image was supplied and inspected. The implementation passed the isolated Playwright component-flow smoke at 1152 × 720, including the real character directory, URL focus, right inspector, unchanged central workspace geometry, multi-select gating and absence of permanent delete. The selected in-app Browser rejected local-URL control under its URL safety policy, so no browser-rendered implementation screenshot could be captured for a valid side-by-side comparison.

**Focused region comparison evidence**

Blocked for the same reason. Code inspection or the headless interaction test is not substituted for visual evidence.

**Findings**

- [P1] Visual fidelity cannot be signed off without an implementation capture.
  - Location: character directory and right inspector at all three desktop viewports.
  - Evidence: source exists; equivalent browser-rendered implementation capture is unavailable.
  - Impact: typography, exact spacing, overlay coverage and responsive density cannot receive Founder-level visual approval.
  - Fix: repeat capture and side-by-side comparison when the approved local browser surface allows `127.0.0.1:4191`.

**Implementation Checklist**

- Capture standard, compact, multi-select, archive/trash and inspector states.
- Compare 1920 × 1000, 1440 × 900 and 1152 × 720 against the Founder reference.
- Fix any P0/P1/P2 differences and rerun the comparison.

**Follow-up Polish**

- None assessed without valid visual evidence.

final result: blocked

---

# Design QA — Tianyan Multi-Node Prediction Productization R1

- Reference opened: `/tmp/codex-clipboard-422355c5-fe9e-44f5-9870-f0545b6fcf9e.png` (1568×1003)
- Compared implementation: `B-1440x900-candidate-path-overlay.png`
- Comparison artifact: `/home/beelink/.codex/visualizations/2026/08/31/tianyan-multi-node-prediction-productization-r1/reference-vs-implementation.png`
- Responsive evidence: `F-1152x720-rightmost-tianyi.png`

## Contract checks

- Unit directory is visible at 1440 and yields at 1152; it does not introduce a mandatory volume hierarchy.
- Three ordered formal source nodes form one visually bounded prediction basis.
- The canvas shows the same active continuous candidate path selected in Tianyi.
- Candidate cards and dashed edges remain visually distinct from formal Events and Relations.
- Candidate cards remain fully inside the live canvas and readable at 1440×900 and 1152×720.
- Tianyi remains the rightmost dedicated prediction console and does not show provider/runtime controls.
- Partial node exclusion is represented in both the canvas and the Tianyi review.
- Unknown time remains reviewable; time conflict remains visibly blocked.
- Keyboard focus styling is present on prediction controls and Unit-directory actions.
- Browser console warnings/errors: 0 in the passing E2E run.

final result: passed

---

# Design QA — Tianyan Event Line R6

- Product baseline: remote review head `00b3566d36ee49652a2171cb3216420862a7bbe0`.
- Final evidence: `/home/beelink/.codex/visualizations/2026/09/02/tianyan-event-line-r6/final/`.
- Eight-state contact sheet: `/home/beelink/.codex/visualizations/2026/09/02/tianyan-event-line-r6/final/R6-CONTACT-SHEET.png`.
- Uncut recordings: `R6-1440x900-story-modeling.webm` (44.48s) and `R6-1152x720-responsive.webm` (11.24s).
- Verified viewports: 1440×900 and 1152×720 at device scale 1.

## Contract and interaction checks

- Story Spine, Relation Graph and Timeline view switching remain zero-cost reads. A missing temporal cache shows a clearly named base layout; a stale projection remains readable with an update recommendation.
- Every modeling tool opens the same author confirmation boundary first. It exposes the recommended scope, chapter/event/dependency counts, bounded Provider request and token ranges, price-aware cost handling, output class and all protected write owners.
- Cancel creates no Run. One confirmation creates one bounded isolated test-provider Run; evidence never claims the fixture is real AI proof.
- Story Spine shows the main Unit as a control surface with semantic summary, direct Events, optional Collection Point and existing-owner actions. Unsafe split, merge, reorder, Nuwa and Multiverse actions remain visibly disabled rather than simulating writes.
- Timeline keeps the Event Graph foreground, adds synchronized top and left coordinates, preserves unknown/conflict semantics and reserves an inset so rulers do not cover cards. Canvas resize refits the readable range when the 348px Tianyi Dock opens.
- Smart Relation candidates show direction, type, confidence and source reason, deduplicate against current relations and remain candidate-only. The review tray keeps its header and batch actions visible while only the candidate list scrolls.

## Visual findings and fixes

- [Resolved P1] At 1152 the Story Spine action group overlapped the view switch. The responsive toolbar now uses two non-overlapping rows with horizontal overflow only inside the action row.
- [Resolved P1] Initial temporal fitting allowed the left ruler to cover the first Event column. The final fit reserves the coordinate insets and responds to live canvas resize.
- [Resolved P1] The Smart Relation review footer could fall behind the bottom AI toolbar. The tray now uses fixed header/footer tracks and a bounded scrolling list.
- The 1440 Story Spine retains mature paper-white / deep-blue / teal hierarchy and exposes at least five complete Events without reverting to a table.
- The 1152 proof keeps readable Event cards, a folded bottom tool surface and Tianyi fixed at the far right at 348px. It relies on panning instead of shrinking nodes below the reading threshold.
- Browser console warnings/errors: 0 across the evidence recording flow and the passing standard E2E.
- The two recordings were reviewed at two frames per second through complete frame sheets; no clipped transition, modal escape, duplicate write, blank surface or final-state console error was found.

## Deferred owner contracts

- Split at Event, merge adjacent Units, reorder impact application, Nuwa handoff and Multiverse-derived source creation remain disabled. Their current owners do not expose the required safe transactional contracts; R6 does not fabricate success or create a second owner.

final result: passed

---

# Design QA — Tianyan AI Semantic Timeline R5

- Motion reference: `/home/beelink/下载/1000003311.mp4` (1276×720, 10.75s); extracted reference contact sheet: `/home/beelink/.codex/visualizations/2026/09/01/tianyan-ai-semantic-timeline-r5/reference-video/contact-sheet.png`.
- Final product evidence: `/home/beelink/.codex/visualizations/2026/09/01/tianyan-ai-semantic-timeline-r5/evidence-final4/`.
- Final A–H comparison sheet: `/home/beelink/.codex/visualizations/2026/09/01/tianyan-ai-semantic-timeline-r5/evidence-final4/I-before-after-contact-sheet.png`.
- Final interaction recording: `/home/beelink/.codex/visualizations/2026/09/01/tianyan-ai-semantic-timeline-r5/recording-final4/semantic-timeline-interaction-r5.webm` (19.52s).
- Verified viewports: 1440×900 and 1152×720 at device scale 1.

## Reference and implementation comparison

- The reference's useful interaction principle is preserved: one continuous graph surface transitions in place, keeps connectors visible, supports semantic zoom, and retains a minimap. Its unrelated brand treatment and floating assistant skin were not copied.
- Relationship and temporal modes render the same stable Event node family and Relation edges. Temporal mode adds low-contrast vertical paper screens behind them rather than mounting a second timeline card system.
- Explicit, inferred, ambiguous, conflict and unplaced temporal states remain author-facing projections. Unknown formal time is semantically distributed and never upgraded to formal `worldTime`.
- Medium zoom shows formal/inferred time state; far zoom reduces nodes to title, status and the main relation structure; near zoom expands anchors, confidence and a short evidence summary in place.
- Closely positioned Events use collision-aware vertical lanes. At narrow widths, cards remain at least 170px wide and the canvas pans rather than shrinking the whole graph into dots.
- Selection, conflict inspection, Agent-only Run receipt, Dialogue isolation, Escape return, cache reuse and revision refresh were exercised in the passing browser flow.
- Provider-unconfigured evidence uses an intentionally intercepted isolated request and reports the failure honestly without an unknown bucket or fabricated timeline.
- Browser console warnings/errors outside that explicitly attributed proof response: 0.

## Visual findings

- The first captured implementation exposed two P1 issues: timeline mode retained a duplicate prose toolbar and its default semantic layout allowed dense nodes to overlap. Both were corrected before the final evidence set.
- The final 1440 overview keeps screen boundaries, Event titles and relation routes legible; vertical overflow remains reachable through panning instead of lowering the readable zoom floor.
- The final 1152 state preserves the rightmost product rail, readable cards and continuous temporal background without page-level horizontal overflow.
- No P0, P1 or P2 visual defect remains in the requested graph-to-time transition, semantic zoom, conflict inspector, provider-unavailable state or responsive proof.

final result: passed

---

# Design QA — Tianyi Agent Graph Visual Polish and Provider Adapter Ready R1

- Founder reference: `/tmp/codex-clipboard-422355c5-fe9e-44f5-9870-f0545b6fcf9e.png` (1568×1003)
- Side-by-side comparison: `/home/beelink/.codex/visualizations/2026/08/31/tianyan-agent-graph-provider-adapter-r1/visual-reference-vs-implementation.png`
- R1 contact sheet: `/home/beelink/.codex/visualizations/2026/08/31/tianyan-agent-graph-provider-adapter-r1/R1-contact-sheet.png`
- Verified viewports: 1440×900 and 1152×720 at device scale 1.

## Contract checks

- The execution graph is monotonic from left to right; no execution edge returns to an earlier horizontal position.
- Process, Tool, Gate and Result use distinct structure, width, outline, icon density and status language rather than a shared colored rectangle.
- At 1152×720, Tianyi remains rightmost at 348px, the central execution surface remains 672px wide, and rendered execution nodes retain at least 170px width at the 0.9 default zoom.
- `查看起点` and `查看当前` provide explicit keyboard-operable navigation while preserving readable panning instead of fitting the full run into tiny cards.
- The current candidate path remains fully readable at 1152; the three formal sources collapse to the existing semantic summary instead of shrinking alongside the candidate nodes.
- The adoption receipt leads with author-facing outcomes (`沿用已有事件`, `保存为作者草稿`, `已跳过`) and keeps run/bundle/candidate IDs inside a collapsed technical receipt.
- Browser console warnings/errors: 0 in the passing dedicated and standard E2E runs.

## Visual comparison findings

- The implementation retains the reference composition: Unit directory, ordered multi-source basis, continuous candidate path and rightmost Tianyi console.
- The execution view intentionally uses the central canvas and a readable pan surface; the R1 screenshots cover both the start/process-tool-gate region and the current/result region without shrinking nodes into dots.
- Candidate nodes remain visibly temporary through amber dashed outlines and author-facing `候选／尚未写入` language.
- No P0, P1 or P2 defect remains in the requested one-way graph, node-family distinction, 1152 responsive state or author-facing receipt.

final result: passed

---

# Design QA — Tianyan Multi-Node Prediction Founder Polish R2

- Founder reference: `/tmp/codex-clipboard-422355c5-fe9e-44f5-9870-f0545b6fcf9e.png` (1568×1003)
- Reference comparison: `/home/beelink/.codex/visualizations/2026/08/31/tianyan-multi-node-prediction-founder-polish-r2/reference-vs-r2-review.png`
- Four-state contact sheet: `/home/beelink/.codex/visualizations/2026/08/31/tianyan-multi-node-prediction-founder-polish-r2/four-state-contact-sheet.png`
- Verified viewports: 1440×900 and 1152×720 at device scale 1.

## Contract checks

- `单元 01 · 雾港` contains direct Event nodes plus the optional `集点 · 仓库冲突`; the Set Point references two existing Events and introduces no volume hierarchy.
- Truncated Event titles retain their complete native tooltip and accessible name.
- Partial adoption shows two selected candidates, one existing Event reference, one new draft Event, and one skipped candidate; the primary action repeats the real selected/new-draft counts.
- The persisted receipt is the first card under the Tianyi heading after refresh and names the Run, path, selection, reference, draft and skipped candidate without moving focus.
- Refresh recovery did not increase the draft Event count, and formal Relation, Canon and WorldState ownership boundaries remain unchanged.
- At 1152×720, the three formal sources collapse to one keyboard-expandable `3 个推演依据` summary; the current three-node candidate path remains fully visible and readable.
- Tianyi remains the rightmost fixed-width prediction console at 348px with its own scroll surface.
- Browser console warnings/errors: 0 in the passing dedicated prediction E2E run.

## Visual comparison findings

- The R2 implementation preserves the reference's Unit-directory / multi-source basis / continuous candidate path / rightmost Tianyi composition.
- The review UI is intentionally denser than the reference because it exposes the frozen identity, time and write-target gates; the new count summary keeps the primary action unambiguous.
- The 1152 evidence now uses semantic collapse rather than shrinking six cards into the viewport; neither the source summary nor the current candidate path is clipped.
- No P0, P1 or P2 visual defect remains in the four requested evidence states.

final result: passed
