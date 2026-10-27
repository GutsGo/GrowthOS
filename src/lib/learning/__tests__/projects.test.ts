import { test } from "node:test";
import assert from "node:assert";
import {
  addMilestone,
  canShip,
  createPitfall,
  createProject,
  daysLeft,
  pitfallToStory,
  projectHealth,
  projectProgress,
  sortProjects,
  toggleMilestone,
} from "../projects.ts";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 26, 12, 0, 0).getTime();

test("建项目：周期固定 7 天，状态默认进行中", () => {
  const project = createProject({ id: "p1", title: "改 GrowthOS" }, NOW);
  assert.equal(project.status, "active");
  assert.equal(project.targetEndAt - project.startAt, 7 * DAY);
  assert.equal(project.title, "改 GrowthOS");
  assert.deepEqual(project.pitfalls, []);
});

test("建项目：里程碑标题被去空白，done 一律 false", () => {
  const project = createProject(
    { id: "p1", title: "x", milestones: [" 第一步 "] },
    NOW,
  );
  assert.equal(project.milestones.length, 1);
  assert.equal(project.milestones[0].title, "第一步");
  assert.equal(project.milestones[0].done, false);
});

test("进度：没有里程碑时比例是 0，不是 NaN", () => {
  const project = createProject({ id: "p1", title: "x" }, NOW);
  assert.deepEqual(projectProgress(project), { done: 0, total: 0, ratio: 0 });
});

test("进度：勾掉一半就是 0.5", () => {
  const project = createProject(
    { id: "p1", title: "x", milestones: ["a", "b"] },
    NOW,
  );
  project.milestones = toggleMilestone(project.milestones, "p1-m1", NOW);
  assert.deepEqual(projectProgress(project), { done: 1, total: 2, ratio: 0.5 });
});

test("勾选里程碑：写 doneAt；取消时清空 doneAt", () => {
  const project = createProject({ id: "p1", title: "x", milestones: ["a"] }, NOW);
  const done = toggleMilestone(project.milestones, "p1-m1", NOW);
  assert.equal(done[0].done, true);
  assert.equal(done[0].doneAt, NOW);

  const undone = toggleMilestone(done, "p1-m1", NOW + 1);
  assert.equal(undone[0].done, false);
  assert.equal(undone[0].doneAt, undefined);
});

test("剩余天数：不足一天算一天，不能说还剩 0 天", () => {
  const project = createProject({ id: "p1", title: "x" }, NOW);
  const sixHoursBeforeEnd = project.targetEndAt - 6 * 60 * 60 * 1000;
  assert.equal(daysLeft(project, sixHoursBeforeEnd), 1);
});

test("健康度：刚建时还剩 7 天", () => {
  assert.deepEqual(projectHealth(createProject({ id: "p1", title: "x" }, NOW), NOW), {
    tone: "comfortable",
    label: "还剩 7 天",
  });
});

test("健康度：超期时陈述天数，不用「警告」措辞", () => {
  const project = createProject({ id: "p1", title: "x" }, NOW);
  const health = projectHealth(project, NOW + 9 * DAY);
  assert.equal(health.tone, "overdue");
  assert.match(health.label, /超期 2 天/);
  assert.ok(!/警告|危险/.test(health.label));
});

test("健康度：已完成不再提剩余天数", () => {
  const project = { ...createProject({ id: "p1", title: "x" }, NOW), status: "shipped" as const };
  assert.deepEqual(projectHealth(project, NOW), { tone: "done", label: "已完成" });
});

test("难题记录：问题与解法都会去空白", () => {
  const pitfall = createPitfall(" IndexedDB 事务里拿不到数据 ", " 改成同一个事务内读 ", "pf1", NOW);
  assert.equal(pitfall.problem, "IndexedDB 事务里拿不到数据");
  assert.equal(pitfall.solution, "改成同一个事务内读");
  assert.equal(pitfall.at, NOW);
});

test("难题→故事：题目带上项目名，过长的问题会截断", () => {
  const pitfall = createPitfall(
    "页面一刷新卡片就全没了因为 IndexedDB 事务还没提交就跳转了",
    "把写入和跳转拆开",
    "pf1",
    NOW,
  );
  const story = pitfallToStory(pitfall, "GrowthOS");
  assert.match(story.concept, /^GrowthOS：/);
  assert.ok(story.concept.length <= "GrowthOS：".length + 25);
  assert.equal(story.seed, "把写入和跳转拆开");
});

test("排序：进行中在前、截止早的在前，已完成沉底", () => {
  const a = { ...createProject({ id: "a", title: "A" }, NOW), status: "shipped" as const };
  const b = createProject({ id: "b", title: "B", startAt: NOW - 2 * DAY }, NOW);
  const c = createProject({ id: "c", title: "C" }, NOW);
  const sorted = sortProjects([a, b, c]);
  assert.deepEqual(sorted.map((p) => p.id), ["b", "c", "a"]);
});

test("追加里程碑：空标题与重复标题都不加", () => {
  const project = createProject({ id: "p1", title: "x", milestones: ["a"] }, NOW);
  assert.equal(addMilestone(project, "  ", "m2").length, 1);
  assert.equal(addMilestone(project, "a", "m2").length, 1);
  assert.equal(addMilestone(project, "b", "m2").length, 2);
});

test("标记完成：没做里程碑不能完成", () => {
  const project = createProject({ id: "p1", title: "x", milestones: ["a"] }, NOW);
  const check = canShip(project);
  assert.equal(check.ok, false);
  assert.match(check.reason!, /里程碑/);
});

test("标记完成：做了里程碑但没记难题，也不能完成——那讲不出故事", () => {
  const project = createProject({ id: "p1", title: "x", milestones: ["a"] }, NOW);
  project.milestones = toggleMilestone(project.milestones, "p1-m1", NOW);
  const check = canShip(project);
  assert.equal(check.ok, false);
  assert.match(check.reason!, /难题/);
});

test("标记完成：里程碑 + 难题齐了就可以收工", () => {
  const project = createProject({ id: "p1", title: "x", milestones: ["a"] }, NOW);
  project.milestones = toggleMilestone(project.milestones, "p1-m1", NOW);
  project.pitfalls = [createPitfall("问题", "解法", "pf1", NOW)];
  assert.equal(canShip(project).ok, true);
});
