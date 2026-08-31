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
