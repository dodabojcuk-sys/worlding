# Tianyan R0.1.2 Zoom Fix — Design QA

**Comparison target**

- Source visual truth: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍全局账户设置恢复R0_1_1/截图/03-125缩放等效-1152x720.png`
- Rendered implementation: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍R0_1_2缩放修复与公开同步/截图/01-中文自动折叠-1152x720.png`
- Additional long-label state: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍R0_1_2缩放修复与公开同步/截图/02-英文长标签展开-1152x720.png`
- CSS viewport and pixel dimensions: source `1152 × 720`, implementation `1152 × 720`, device pixel ratio `1`; no density normalization required
- State: `/world`, `cloud-ink`; Chinese automatic responsive state and English explicit `rail=expanded` state
- Full-view comparison evidence: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍R0_1_2缩放修复与公开同步/验证/qa-comparison-full.png`
- Focused rail comparison evidence: `/home/beelink/Documents/Codex/worlding.world-天衍/data/2026-08-28_天衍R0_1_2缩放修复与公开同步/验证/qa-comparison-rail.png`

**Findings**

- No actionable P0, P1, or P2 issue remains. At `1152 × 720`, automatic responsive behavior now resolves to a strict `56px` icon rail; no partial labels or ellipsis are visible.
- Manual expansion overrides automatic collapse. Chinese uses the complete normal-width rail; English uses the existing long-label width, and every visible navigation and utility label has `scrollWidth <= clientWidth` with computed `text-overflow: clip`.
- All collapsed destination and utility buttons retain non-empty `title` and `aria-label` values.

**Required fidelity surfaces**

- Fonts and typography: unchanged from R0.1.1. The fix removes visible ellipsis from space labels; expanded labels retain the established Noto interface typography and line height.
- Spacing and layout rhythm: the prior 7.75rem intermediate rail is gone. The only compact width is the `3.5rem` semantic token; the workspace, directory, topbar, and right controls retain their existing geometry.
- Colors and visual tokens: unchanged. The fix uses the existing semantic width tokens and introduces no component-local color.
- Image quality and asset fidelity: no image or brand asset changed. Existing line icons remain sharp and centered in the 56px rail.
- Copy and content: Chinese and English strings are unchanged; no label is abbreviated or replaced.
- Accessibility and behavior: automatic collapse, explicit manual expansion, tooltip/accessibility names, zero horizontal overflow, and keyboard-capable controls were checked. Browser console warnings/errors: none.

**Comparison history**

1. Earlier P2: the `75rem` media query reduced an expanded rail to `7.75rem`, while `.shell-space-label` used `text-overflow: ellipsis`; Chinese destinations and Personal center rendered as partial text plus an ellipsis.
2. Fix: responsive state now resolves through `auto | collapsed | expanded`; the `75rem` breakpoint drives automatic collapse, manual expansion overrides it, the 7.75rem state and narrower CSS overrides were removed, and collapsed width remains exactly 56px.
3. Post-fix evidence: the full and focused comparisons above show the truncated mixed state replaced by icon-only navigation; the English expanded screenshot proves long labels remain complete at the same viewport.

**Primary interactions tested**

- Automatic rail collapse at `1152 × 720`
- Manual expansion override at `1152 × 720`
- Chinese and English label measurement
- Tooltip and accessible-name presence in collapsed mode
- Horizontal overflow and browser console checks

**Open questions**

- None for this regression. Founder experience acceptance remains independent from technical QA.

**Implementation checklist**

- [x] Remove the intermediate compressed-label state.
- [x] Preserve exactly 56px for collapsed mode.
- [x] Preserve full labels during manual expansion.
- [x] Add a durable browser smoke assertion for 1152×720.
- [x] Capture and compare post-fix Chinese and English states.

final result: passed
