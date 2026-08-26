import { ArrowDown, ArrowUp, Check, CircleAlert, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getBrowserPreferenceStorage } from "../../lib/controlCenterPreferences";
import {
  addSkillToRecipe,
  createRecipeDraft,
  moveSkillInRecipe,
  removeSkillFromRecipe,
  validateRecipeDraft,
  type RecipeDraftR0,
  type SkillPackageR0
} from "../../../../../src/skillControl/skillRecipeDraft.ts";

const DRAFT_KEY = "story-studio:tianyi-skill-recipe-draft:r0";
const draftStorage = () => getBrowserPreferenceStorage();
const FIXTURE_SKILLS: SkillPackageR0[] = [
  {
    skillId: "fixture.context-read",
    displayName: "读取已选上下文",
    version: "1.0.0",
    publisher: "Tianyan fixture",
    source: "local-fixture",
    exactCommitOrDigest: "fixture-r0",
    license: "project-owned fixture",
    compatibility: ["Tianyi Session"],
    inputs: [{ name: "question", kind: "author-question", required: true }],
    outputs: [{ name: "context", kind: "story-context", required: true }],
    requiredPredecessors: [],
    optionalSuccessors: ["fixture.proposal-review"],
    capabilities: ["readSelectedSources"],
    permissions: { readProject: true, writeProject: false, readMemory: false, writeMemory: false, useNetwork: false, useApiKey: false, executeLocalCommand: false },
    sideEffects: ["none"],
    modelRequirements: [],
    estimatedCostClass: "none",
    trustStatus: "trusted-local",
    installStatus: "present"
  },
  {
    skillId: "fixture.proposal-review",
    displayName: "整理作者建议",
    version: "1.0.0",
    publisher: "Tianyan fixture",
    source: "local-fixture",
    exactCommitOrDigest: "fixture-r0",
    license: "project-owned fixture",
    compatibility: ["Tianyi Session"],
    inputs: [{ name: "context", kind: "story-context", required: true }],
    outputs: [{ name: "proposal", kind: "author-proposal", required: false }],
    requiredPredecessors: ["fixture.context-read"],
    optionalSuccessors: [],
    capabilities: ["draftProposal"],
    permissions: { readProject: true, writeProject: false, readMemory: false, writeMemory: false, useNetwork: false, useApiKey: false, executeLocalCommand: false },
    sideEffects: ["none; proposal only"],
    modelRequirements: [],
    estimatedCostClass: "none",
    trustStatus: "trusted-local",
    installStatus: "present"
  }
];

function initialDraft(): RecipeDraftR0 {
  try {
    const raw = draftStorage()?.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RecipeDraftR0;
      const validation = validateRecipeDraft(parsed, FIXTURE_SKILLS);
      return { ...parsed, validation, permissionUnion: validation.permissionUnion, missingDependencies: validation.missingDependencies, cycleErrors: validation.cycleErrors, incompatibleVersions: validation.incompatibleVersions };
    }
  } catch {
    // A broken local draft is safely replaced by a new empty draft.
  }
  return createRecipeDraft({ authorQuestion: "", target: { kind: "tianyi-session", id: "current-session" } });
}

export function TianyiSkillRecipeDraft(props: { onClose(): void }) {
  const [draft, setDraft] = useState<RecipeDraftR0>(initialDraft);
  const byId = useMemo(() => new Map(FIXTURE_SKILLS.map((skill) => [skill.skillId, skill])), []);
  useEffect(() => {
    try { draftStorage()?.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* local draft is best effort */ }
  }, [draft]);
  const validation = validateRecipeDraft(draft, FIXTURE_SKILLS);
  const update = (next: RecipeDraftR0) => setDraft({ ...next, validation: validateRecipeDraft(next, FIXTURE_SKILLS), permissionUnion: validateRecipeDraft(next, FIXTURE_SKILLS).permissionUnion });
  return <aside className="tianyi-skill-recipe-drawer" aria-label="技能编排草稿" data-skill-recipe-draft="true">
    <header><span><Sparkles /><strong>技能编排草稿</strong><small>只读目录 · 不会执行</small></span><button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭技能编排"><X /></button></header>
    <div className="tianyi-skill-recipe-body">
      <p className="tianyi-skill-recipe-notice">当前只是编排草稿，尚未执行。不会下载远程代码、调用网络、运行 shell 或写入 Canon。</p>
      <label><span>作者问题</span><textarea value={draft.authorQuestion} rows={2} onChange={(event) => update({ ...draft, authorQuestion: event.target.value, draftRevision: draft.draftRevision + 1 })} placeholder="例如：检查本章人物动机是否自洽" /></label>
      <section><header><strong>本地 fixture Skill</strong><small>{FIXTURE_SKILLS.length} 项</small></header>{FIXTURE_SKILLS.map((skill) => <article key={skill.skillId}><span><strong>{skill.displayName}</strong><small>{skill.skillId} · {skill.version}</small></span><button type="button" className="secondary-action" disabled={draft.orderedSkillRefs.includes(skill.skillId)} onClick={() => update(addSkillToRecipe(draft, skill, FIXTURE_SKILLS))}><Plus />加入编排</button></article>)}</section>
      <section><header><strong>执行顺序</strong><small>{draft.orderedSkillRefs.length} 项</small></header>{draft.orderedSkillRefs.length ? draft.orderedSkillRefs.map((skillId, index) => <article key={skillId}><span><strong>{byId.get(skillId)?.displayName || skillId}</strong><small>{skillId}</small></span><div><button type="button" className="icon-action" aria-label="上移 Skill" title="上移" disabled={index === 0} onClick={() => update(moveSkillInRecipe(draft, skillId, "up"))}><ArrowUp /></button><button type="button" className="icon-action" aria-label="下移 Skill" title="下移" disabled={index === draft.orderedSkillRefs.length - 1} onClick={() => update(moveSkillInRecipe(draft, skillId, "down"))}><ArrowDown /></button><button type="button" className="icon-action" aria-label="移除 Skill" title="移除" onClick={() => update(removeSkillFromRecipe(draft, skillId))}><Trash2 /></button></div></article>) : <p>尚未加入 Skill；可以先加入读取上下文。</p>}</section>
      <section className={validation.valid ? "tianyi-skill-recipe-validation is-valid" : "tianyi-skill-recipe-validation is-invalid"} aria-live="polite"><header>{validation.valid ? <Check /> : <CircleAlert />}<strong>{validation.valid ? "编排验证通过" : "需要修正编排"}</strong></header>{validation.missingDependencies.length ? <p>缺少依赖：{validation.missingDependencies.join("、")}</p> : null}{validation.cycleErrors.length ? <p>循环依赖：{validation.cycleErrors.join("；")}</p> : null}{validation.ioErrors.length ? <p>I/O：{validation.ioErrors.join("；")}</p> : null}{!validation.valid ? <button type="button" className="secondary-action" onClick={() => update({ ...draft, draftRevision: draft.draftRevision + 1 })}>重新验证</button> : <small>权限并集：只读当前项目 · 不写入 · 不联网</small>}</section>
    </div>
  </aside>;
}
