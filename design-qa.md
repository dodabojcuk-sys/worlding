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
