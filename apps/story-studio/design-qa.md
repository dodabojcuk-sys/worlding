# Tianyan Global Shell Rebuild R0 — Design QA

**Comparison target**

- Source visual truth (primary geometry): `/tmp/codex-clipboard-acaec6cc-7093-4e0a-bc83-6134e28e6eb2.png`
- Source visual truth (secondary tone and density): `/tmp/codex-clipboard-fa56aca9-ef69-4913-ab80-14a317eb7b3a.png`
- Rendered implementation: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍全局外壳重建R0/截图/01-中文默认-1440x900.png`
- Route and state: `/tianyi`, `zh-CN`, `cloud-ink`, expanded global rail, neutral production slots
- CSS viewport: `1440 × 900`; implementation pixels: `1440 × 900`; device pixel ratio: `1`
- Primary source pixels: `1586 × 992`, proportionally resized and center-cropped to `1440 × 900` for equal-size comparison
- Secondary source pixels: `1560 × 975`; used as a qualitative reference for paper tone and editorial density, not as the geometry target
- Full-view comparison evidence: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍全局外壳重建R0/验证/qa-comparison-full.png`
- Focused region evidence: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍全局外壳重建R0/验证/qa-comparison-nav-topbar.png`

**Findings**

- No actionable P0, P1, or P2 mismatch remains within the R0 shell scope. The implementation preserves the primary reference's macro composition: a persistent dark space rail, restrained global topbar, warm-paper central workspace, separate project-directory boundary, and independent right-side control region.
- The production view intentionally omits the references' directory records, chat history, character details, work logs, analysis tools, and other business content. This is a product-scope constraint, not incomplete visual fidelity: R0 authoritatively requires neutral slots and forbids simulated business data.
- The topbar adds global search and local runtime status that are required by the R0 contract but not equally prominent in the reference. Their weight remains subordinate to the workspace.

**Required fidelity surfaces**

- Fonts and typography: local `Noto Serif CJK SC` display text and `Noto Sans CJK SC` interface text reproduce the editorial serif/sans hierarchy. Chinese and English use the same semantic scale, with wrapping and truncation verified at `1440 × 900`, `1280 × 800`, and an equivalent 125% zoom viewport (`1152 × 720`).
- Spacing and layout rhythm: the implementation follows the source's rail/topbar/workspace/panel hierarchy and preserves a visibly dominant center. Grid tracks, panel widths, gaps, borders, radii, shadows, and compact action-rail density are tokenized. No viewport overflow or clipped persistent controls remained in verified states.
- Colors and visual tokens: deep ink-blue structure, warm paper surfaces, restrained jade accent, text, muted text, borders, focus, success, warning, and danger are all mapped through semantic tokens. Switching to `night-paper` changes the visual system without component rewrites.
- Image quality and asset fidelity: the R0 shell owns no photographic, illustrative, logo, or avatar assets. The source's business-content imagery is explicitly outside this build. Existing Lucide icons are used consistently; no emoji, placeholder drawings, CSS art, or handcrafted SVG substitutes were introduced.
- Copy and content: all visible shell copy is meaningful, scoped to the shell, and supplied through complete `zh-CN` and `en-US` translation dictionaries. No fake story entities, logs, chat messages, or completed-feature cards appear in production routes.
- Icons and interaction states: navigation, search, theme, locale, panel close/reopen, collapse, profile, and settings controls use one line-icon family, accessible names, tooltips where needed, visible focus, hover/active states, and reduced-motion handling.
- Responsiveness and accessibility: the global rail remains usable when collapsed; English labels do not clip; keyboard navigation supports Arrow keys, Home, and End; panel slots remain independently closable and can coexist in Shell Lab; browser console warnings/errors were empty.

**Comparison history**

1. Initial browser comparison found two P2 issues: long English navigation labels clipped in the expanded rail, and the right action rail was too narrow for Chinese labels. The space rail and action rail widths were increased using semantic sizing tokens, labels were allowed to wrap safely, and compact-mode behavior was retained.
2. Post-fix captures were produced at the same viewport/state. Evidence: `02-英文状态-1440x900.png`, `03-收起空间轨-1280x800.png`, and the refreshed full/focused comparison images above. No clipping, overlap, or page overflow remained.

**Primary interactions tested**

- Global navigation selection and URL transition, including independent `/collections`
- ArrowDown, Home, and End navigation focus behavior
- Space rail expand/collapse
- `zh-CN` / `en-US` locale switching
- `cloud-ink` / `night-paper` theme switching
- Independent close/reopen behavior for Global Tianyi and page-inspector slots
- Shell Lab parallel panel state
- Browser console warning/error check: none

**Open questions**

- Founder experience acceptance remains a separate manual activity; this technical visual QA does not replace it.
- Detailed project-directory content and page-specific right-panel experiences remain deliberately unstarted.

**Implementation checklist**

- [x] Correct the independent Collections boundary.
- [x] Drive the global rail from one registry.
- [x] Separate topbar, workspace outlet, directory slot, Global Tianyi slot, and page-inspector slot.
- [x] Verify Chinese, English, collapsed rail, Shell Lab, 125% zoom equivalent, keyboard behavior, and alternate theme.
- [x] Re-capture and compare after P2 fixes.

**Follow-up polish**

- P3: after Founder review, tune the central title's optical size and starting position if the preferred balance should lean more strongly toward either reference image.

final result: passed
