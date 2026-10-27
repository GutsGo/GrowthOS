import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ENERGY_LABELS,
  ENERGY_ORDER,
  FORM_TYPE_LABELS,
  FORM_TYPE_ORDER,
} from "../habit-labels.ts";

/**
 * 这张表的价值不在「有几个常量」，在于两个地方同时读它：
 * 添加习惯弹窗的选项按钮、设置页习惯卡片的标签。
 *
 * 曾经的分居事故：弹窗写「社交复盘」、列表写「社交特化」，
 * 同一个 `social` 被描述成两件事，而 TypeScript 一个错都不报
 * （两边都是各自硬编码的字符串）。
 * 所以这里钉的是「一份表能覆盖所有档位、且每档说人话」。
 */

test("能量三档齐全，顺序固定从省力到费力", () => {
  assert.deepEqual([...ENERGY_ORDER], ["low", "medium", "high"]);
  assert.deepEqual(Object.keys(ENERGY_LABELS).sort(), [...ENERGY_ORDER].sort());
});

test("能量三档都有非空中文，且互不相同", () => {
  const labels = ENERGY_ORDER.map((k) => ENERGY_LABELS[k]);
  for (const label of labels) {
    assert.ok(label.trim().length > 0, "标签不能为空");
    // 还留着 low/medium/high 原样输出，等于没翻
    assert.doesNotMatch(label, /^(low|medium|high)$/i);
  }
  assert.equal(new Set(labels).size, labels.length);
});

test("表单三档齐全，且「常规打卡」是默认档", () => {
  assert.deepEqual([...FORM_TYPE_ORDER], ["none", "fitness", "social"]);
  assert.deepEqual(Object.keys(FORM_TYPE_LABELS).sort(), [...FORM_TYPE_ORDER].sort());
  assert.equal(FORM_TYPE_ORDER[0], "none");
});

test("表单三档文案互不相同（特化表单和常规打卡不能叫同一个名字）", () => {
  const labels = FORM_TYPE_ORDER.map((k) => FORM_TYPE_LABELS[k]);
  for (const label of labels) {
    assert.ok(label.trim().length > 0, "标签不能为空");
  }
  assert.equal(new Set(labels).size, labels.length);
});

test("social 在两处只有一个说法", () => {
  assert.equal(FORM_TYPE_LABELS.social, "社交复盘");
});
