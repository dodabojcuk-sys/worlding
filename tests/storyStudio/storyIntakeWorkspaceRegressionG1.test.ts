import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("apps/story-studio/src/components/tianyi/workspace/TianyiConversationWorkspace.tsx", "utf8");
const reviewSurface = readFileSync("apps/story-studio/src/components/tianyi/workspace/StoryIntakeReviewSurface.tsx", "utf8");
const workSurface = readFileSync("apps/story-studio/src/components/tianyi/workspace/StoryIntakeWorkSurface.tsx", "utf8");
const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
const responsive = readFileSync("apps/story-studio/src/product-shell/navigation/responsiveRailState.ts", "utf8");
const transport = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
const server = readFileSync("apps/story-studio/server/server.mjs", "utf8");

test("real StoryIntakeEnvelope candidates, not only the legacy fixture, can enter Review and Work", () => {
  assert.match(workspace, /type Lane = "creative" \| "review" \| "work"/u);
  assert.match(workspace, /createActiveStoryIntakeCandidateRef/u);
  assert.match(workspace, /resolveActiveStoryIntakeCandidate/u);
  assert.match(workspace, /StoryIntakeReviewSurface/u);
  assert.match(reviewSurface, /StoryIntakeCandidateRow/u);
  assert.match(workspace, /onEnterWork/u);
  assert.match(workspace, /storyIntakeEnvelope/u);
});

test("entering Work does not hand a real Envelope candidate to the legacy creative candidate repository", () => {
  const transitionStart = workspace.indexOf("const moveIntakeCandidatesToWork =");
  const transitionEnd = workspace.indexOf("\n  };", transitionStart);
  const workTransition = workspace.slice(transitionStart, transitionEnd);
  assert.match(workTransition, /createActiveStoryIntakeCandidateRef/u);
  assert.doesNotMatch(workTransition, /handoffTianyiCreativeCandidate/u);
  assert.match(workTransition, /setActiveTianyiCandidateId\(null\)/u);
  assert.match(workSurface, /候选状态保持/u);
});

test("project changes clear transient Envelope state before project-scoped recovery", () => {
  assert.match(workspace, /setIntakeRun\(null\)/u);
  assert.match(workspace, /setActiveIntakeRef\(null\)/u);
  assert.match(workspace, /setSelectedIntakeCandidateIds\(\[\]\)/u);
  assert.match(workspace, /\[project\?\.id\]/u);
});

test("Work uses a controlled narrative position and functional candidate-only exploration", () => {
  assert.match(workSurface, /value=\{position\}/u);
  assert.match(workSurface, /position,/u);
  assert.match(workSurface, /receipt\?\.status !== "active"/u);
  assert.match(workSurface, /基于已采纳范围继续探索/u);
  assert.match(workSurface, /只读已采纳范围/u);
  assert.match(workSurface, /receipt\.storyUnit\.title/u);
  assert.match(workSurface, /receipt\.position === "start"/u);
  assert.match(workSurface, /const scopeLocked = receipt\?\.status === "active" \|\| receipt\?\.status === "recovery-required"/u);
  assert.match(workSurface, /disabled=\{scopeLocked\}/u);
  assert.match(workspace, /runtime\.setActiveTianyiCandidateId\(null\);[\s\S]{0,300}window\.history\.pushState\(\{\}, "", "\/event-line"\)/u);
});

test("Work numbers only Event or scene candidates and keeps objects, units, paths, and unknowns in typed change groups", () => {
  assert.match(workSurface, /const narrativeCandidates = props\.candidates\.filter\(\(candidate\) => candidate\.type === "event"\)/u);
  assert.match(workSurface, /className="story-intake-story-sequence"/u);
  assert.match(workSurface, /className="story-intake-change-groups"/u);
  assert.match(workSurface, /关联对象/u);
  assert.match(workSurface, /故事结构/u);
  assert.match(workSurface, /保留语义/u);
  const orderedStory = workSurface.slice(workSurface.indexOf('<ol className="story-intake-story-sequence"'), workSurface.indexOf('</ol>', workSurface.indexOf('<ol className="story-intake-story-sequence"')));
  assert.doesNotMatch(orderedStory, /props\.candidates\.map/u);
});

test("the main Work surface can continue the same TianyiConversation without turning every message into Story Intake", () => {
  assert.match(workspace, /submitConversation/u);
  assert.match(workspace, /streamTianyiGroundedAnswer/u);
  assert.match(workspace, /发送消息/u);
  assert.match(workspace, /整理为故事候选/u);
  assert.match(workSurface, /story-intake-work-conversation/u);
  assert.match(workSurface, /继续和天意讨论当前范围/u);
});

test("R2 keeps one task frame across Creative, Review and Work while preserving per-lane reading positions", () => {
  assert.match(workspace, /className="tianyi-task-header"/u);
  assert.match(workspace, /className="tianyi-conversation-anchor"/u);
  assert.match(workspace, /tianyi-lane-scroll:/u);
  assert.match(workspace, /saveLaneScroll\(lane\)/u);
  assert.match(workspace, /target\.scrollTop = stored/u);
  assert.doesNotMatch(workspace, /className="tianyi-conversation-return"/u, "Review and Work must not add a second permanent conversation banner");
});

test("R2 exact pending targets recover their requested candidate from the same persisted Envelope", () => {
  assert.match(workspace, /get\("tianyiCandidate"\)/u);
  assert.match(workspace, /createActiveStoryIntakeCandidateRef\(envelope, requestedCandidate\.candidateId\)/u);
  assert.match(workspace, /requestedCandidate \? \[requestedCandidate\.candidateId\] : \[\]/u);
});

test("R2 refresh restores a selected scope into Work even when the transient focus ref is absent", () => {
  assert.match(workspace, /disabled=\{!activeIntakeRef && !activeLegacyCandidate && selectedIntakeCandidateIds\.length === 0\}/u);
  assert.match(workspace, /moveIntakeCandidatesToWork\(selectedIntakeCandidateIds\)/u);
});

test("relation dependencies expose candidate inclusion, existing-object binding, locate, and exclusion recovery actions before the scope is recalculated", () => {
  assert.match(workSurface, /纳入所需候选/u);
  assert.match(workSurface, /绑定已有对象/u);
  assert.match(workSurface, /searchWorldObjects/u);
  assert.match(workSurface, /relationBindings/u);
  assert.match(workSurface, /定位端点/u);
  assert.match(workSurface, /排除此关系/u);
  assert.match(workSurface, /excludedRelationKeys/u);
});

test("1195-class layouts turn the directory into an overlay and close it when crossing the breakpoint", () => {
  assert.match(responsive, /SHELL_DIRECTORY_OVERLAY_QUERY = "\(max-width: 76rem\)"/u);
  assert.match(shell, /closeDirectoryWhenItBecomesOverlay/u);
});

test("local fake execution is never labelled as a real Pi success", () => {
  assert.match(workspace, /本地假服务 · 非真实 Pi/u);
  assert.doesNotMatch(workspace, /running: "真实运行中"/u);
});

test("normal entry and Review deep links discover the current persisted Envelope without creating another session", () => {
  assert.match(workspace, /getLatestTianyiStoryIntakeRun/u);
  assert.match(workspace, /runtime\.setTianyiConversationId\(recovered\.sessionId\)/u);
  assert.match(workspace, /requested === "review" \|\| requested === "work" \? requested : "creative"/u);
  assert.match(transport, /tianyi-agent\/run\/latest-story-intake/u);
  assert.match(server, /latest-story-intake/u);
  assert.match(server, /findLatestStoryIntakeRun/u);
});

test("local fake is disclosed before send, while production without a Provider stops instead of fabricating a reply", () => {
  assert.match(workspace, /本地假服务 · 非真实 Pi/u);
  assert.match(workspace, /当前没有可用的真实 Provider；草稿仍保留/u);
  assert.match(server, /runtime: agentFakeProviderStreamAllowed \? "local-fake" : selectedModelReady \? "provider" : "unavailable"/u);
});
