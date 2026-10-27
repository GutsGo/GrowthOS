import { test } from "node:test";
import assert from "node:assert/strict";

import { useAppStore } from "../store.ts";

/**
 * 全局 store 是六个页面共享的那一点状态。它没有 reducer 也没有 action types，
 * 只有一组 set —— 好处是简单，代价是「谁能改什么」全靠约定。
 * 这里把约定钉成用例：初始值、以及几个动作改的是不是你以为的那个字段。
 */

const reset = () =>
  useAppStore.setState({
    activeTab: "dashboard",
    isCommandPaletteOpen: false,
    flowTimerMinutes: 25,
    theme: "dark",
    outputSeed: null,
    reviewScope: "all",
  });

test("初始落点是今日页，默认深色（沉浸式是产品选择，不是漏配）", () => {
  reset();
  const state = useAppStore.getState();
  assert.equal(state.activeTab, "dashboard");
  assert.equal(state.theme, "dark");
  assert.equal(state.flowTimerMinutes, 25);
  assert.equal(state.outputSeed, null);
});

test("currentDate 是本地时区的 YYYY-MM-DD（不是 UTC 的）", () => {
  const { currentDate } = useAppStore.getState();
  assert.match(currentDate, /^\d{4}-\d{2}-\d{2}$/);

  const now = new Date();
  const expected = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  assert.equal(currentDate, expected);
});

test("切页只改 activeTab（复习页例外：顺手把意图重置成整套）", () => {
  reset();
  useAppStore.getState().setActiveTab("review");
  assert.equal(useAppStore.getState().activeTab, "review");
  assert.equal(
    useAppStore.getState().reviewScope,
    "all",
    "从侧边栏点「复习」＝整套，否则第二次进来会莫名只给一张",
  );
  assert.equal(useAppStore.getState().theme, "dark", "不该顺手改别的");
});

test("「先复习一张」与「去复习」是两件事，不能被同一个 setActiveTab 表达", () => {
  reset();
  useAppStore.getState().startReview("one");
  assert.equal(useAppStore.getState().activeTab, "review");
  assert.equal(useAppStore.getState().reviewScope, "one");

  // 在复习页里点「接着复习」：还是复习页，但换成整队
  useAppStore.getState().startReview("all");
  assert.equal(useAppStore.getState().activeTab, "review");
  assert.equal(useAppStore.getState().reviewScope, "all");
});

test("切到别的 tab 不会把「只复习一张」带在身上", () => {
  reset();
  useAppStore.getState().startReview("one");
  useAppStore.getState().setActiveTab("dashboard");
  useAppStore.getState().setActiveTab("review");
  assert.equal(useAppStore.getState().reviewScope, "all");
});

test("命令面板可以开关，也可以显式设置（Cmd+K 与点遮罩走不同入口）", () => {
  reset();
  const { toggleCommandPalette, setCommandPaletteOpen } = useAppStore.getState();

  toggleCommandPalette();
  assert.equal(useAppStore.getState().isCommandPaletteOpen, true);
  toggleCommandPalette();
  assert.equal(useAppStore.getState().isCommandPaletteOpen, false);

  setCommandPaletteOpen(true);
  assert.equal(useAppStore.getState().isCommandPaletteOpen, true);
});

test("「带题进输出页」的载荷可写入也可清空", () => {
  reset();
  const { setOutputSeed } = useAppStore.getState();

  setOutputSeed({ concept: "梯度下降", cardId: "card-1" });
  assert.deepEqual(useAppStore.getState().outputSeed, { concept: "梯度下降", cardId: "card-1" });

  setOutputSeed(null);
  assert.equal(useAppStore.getState().outputSeed, null, "用完必须能清，否则下次进输出页还是旧题");
});

test("切主题后立即生效（页面靠它挂 dark 类）", () => {
  reset();
  useAppStore.getState().setTheme("light");
  assert.equal(useAppStore.getState().theme, "light");
  useAppStore.getState().setTheme("dark");
  assert.equal(useAppStore.getState().theme, "dark");
});

test("专注时长可改，且不会被四舍五入偷偷改值", () => {
  reset();
  useAppStore.getState().setFlowTimerMinutes(15);
  assert.equal(useAppStore.getState().flowTimerMinutes, 15);
});
