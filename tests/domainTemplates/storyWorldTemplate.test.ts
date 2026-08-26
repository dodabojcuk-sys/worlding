import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

import { createProductWorkspace } from "../../src/productWorkspace/index.ts";
import {
  createStoryWorldTemplate,
  type DomainTemplate,
  type StoryWorldProject
} from "../../src/domainTemplates/storyWorld/index.ts";

test("Story World Template creates the first runnable novel domain project", () => {
  const template = createStoryWorldTemplate();
  const project = template.createProject({
    projectId: "mist-lighthouse",
    title: "雾中灯塔"
  });
  const dashboard = template.getDashboard(project);

  assert.equal(template.kind, "story_world");
  assert.equal(project.version, "world-os-story-world-project-v1");
  assert.equal(project.world.title, "雾中灯塔");
  assert.equal(project.world.genre, "mystery fantasy");
  assert.equal(project.world.era, "industrial coastal age");
  assert.deepEqual(project.world.themes, ["memory", "truth", "choice"]);
  assert.equal(project.characters.length >= 2, true);
  assert.equal(project.locations.length >= 2, true);
  assert.equal(project.events.length >= 2, true);
  assert.equal(project.keyframes.length >= 1, true);
  assert.equal(project.openLoops.length >= 1, true);

  assert.equal(dashboard.version, "world-os-story-world-dashboard-v1");
  assert.deepEqual(dashboard.currentChapter, {
    id: "chapter-3",
    title: "第3章 · 灯塔下层",
    status: "drafting"
  });
  assert.deepEqual(
    dashboard.mainCharacters.map((character) => character.name),
    ["阿岚", "林远"]
  );
  assert.deepEqual(dashboard.worldRules, [
    "潮门不能主动开启",
    "灯塔只在海雾中显影",
    "工业时代技术水平不得自动跃迁"
  ]);
  assert.equal(dashboard.aiSuggestionEntry.targetSpace, "ai");
});

test("Story World data is independent and does not mutate generic Product Workspace", () => {
  const template = createStoryWorldTemplate();
  const workspaceBefore = createProductWorkspace();
  const first = template.createProject({ projectId: "story-a", title: "第一世界" });
  const second = template.createProject({ projectId: "story-b", title: "第二世界" });

  first.characters[0].name = "被局部修改的角色";
  first.world.rules.push("只影响第一个项目");

  assert.equal(second.characters[0].name, "阿岚");
  assert.equal(second.world.rules.includes("只影响第一个项目"), false);
  assert.deepEqual(createProductWorkspace(), workspaceBefore);
});

test("Story World AI context is deterministic, clone-safe, and author-facing", () => {
  const template = createStoryWorldTemplate();
  const project = template.createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const contextA = template.getContextForAI(project);
  const contextB = template.getContextForAI(project);

  assert.deepEqual(contextA, contextB);
  assert.equal(contextA.version, "world-os-story-world-ai-context-v1");
  assert.deepEqual(contextA.world, {
    title: "雾中灯塔",
    genre: "mystery fantasy",
    era: "industrial coastal age",
    themes: ["memory", "truth", "choice"]
  });
  assert.deepEqual(
    contextA.characters.map((character) => [character.id, character.name, character.role, character.status]),
    [
      ["a-lan", "阿岚", "witness", "missing"],
      ["lin-yuan", "林远", "keeper", "drafting"]
    ]
  );
  assert.deepEqual(contextA.relationships, [
    {
      sourceId: "a-lan",
      targetId: "lin-yuan",
      type: "left_warning",
      status: "unverified"
    },
    {
      sourceId: "lin-yuan",
      targetId: "a-lan",
      type: "old_letter",
      status: "evidence_gap"
    }
  ]);
  assert.deepEqual(contextA.rules.narrativeRules, [
    "关键帧由作者决定",
    "不得自动推进时代",
    "AI只补全关键帧之间的表达"
  ]);

  contextA.characters[0].name = "被修改的上下文副本";
  assert.equal(template.getContextForAI(project).characters[0].name, "阿岚");
});

test("Story World validation catches missing world data without reaching lower systems", () => {
  const template = createStoryWorldTemplate();
  const project = template.createProject({ projectId: "mist-lighthouse", title: "雾中灯塔" });
  const invalid: StoryWorldProject = {
    ...project,
    characters: [],
    rules: {
      ...project.rules,
      constraints: []
    }
  };

  assert.deepEqual(template.validateWorld(project), {
    valid: true,
    violations: []
  });
  assert.deepEqual(template.validateWorld(invalid), {
    valid: false,
    violations: [
      "Story world needs at least one character.",
      "Story world needs explicit constraints."
    ]
  });
});

test("Story World Template connects only to allowed product-side workspace runtime", () => {
  const source = readFileSync("src/domainTemplates/storyWorld/index.ts", "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]).sort();

  assert.deepEqual(imports, ["../../productWorkspaceRuntime/index.ts"]);

  const forbidden = [
    ["gate", "way"],
    ["exec", "ution"],
    ["skill", "Runtime"],
    ["memory", "Skills"],
    ["plugin", "Product"],
    ["ui", "Rendering"],
    ["ui", "Contract"],
    ["runtime", "Orchestration"],
    ["execute", "Intent"],
    ["Execution", "Gateway"],
    ["process", "Intent"],
    ["fetch", "("],
    ["XML", "Http", "Request"],
    ["Date", ".now"],
    ["Math", ".random"]
  ].map((parts) => parts.join(""));

  for (const term of forbidden) {
    assert.equal(source.includes(term), false, `forbidden source term leaked: ${term}`);
  }
});

test("Story World Template leaves room for later CodeTemplate domains", () => {
  const codeTemplate: DomainTemplate<
    { projectId: string; kind: "code" },
    { currentModule: string },
    { files: string[] }
  > = {
    kind: "code",
    version: "world-os-code-template-v1",
    createProject: () => ({ projectId: "code-a", kind: "code" }),
    validateProject: () => ({ valid: true, violations: [] }),
    getDashboard: () => ({ currentModule: "workspace" }),
    getContextForAI: () => ({ files: ["src/index.ts"] })
  };

  assert.deepEqual(codeTemplate.getDashboard(codeTemplate.createProject()), {
    currentModule: "workspace"
  });
  assert.deepEqual(codeTemplate.getContextForAI(codeTemplate.createProject()), {
    files: ["src/index.ts"]
  });
});


function readSourceTree(root: string): string {
  return readdirSync(root)
    .flatMap((entry) => {
      const path = `${root}/${entry}`;
      const stat = statSync(path);

      if (stat.isDirectory()) {
        return readSourceTree(path);
      }

      return path.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}
