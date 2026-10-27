import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateLCS,
  describeMatch,
  escapeHtml,
  highlightMatchedText,
  normalizeForCompare,
  stripHtml,
} from "../recall.ts";

test("stripHtml：去标签、解码实体、压缩空白", () => {
  assert.equal(stripHtml("<p>ReAct <strong>推理</strong> + 行动</p>"), "ReAct 推理 + 行动");
  assert.equal(stripHtml("A&nbsp;&amp;&nbsp;B"), "A & B");
  assert.equal(stripHtml(""), "");
});

test("normalizeForCompare：标点与空白不参与比对", () => {
  assert.equal(normalizeForCompare("ReAct：推理 + 行动"), "react推理行动");
  assert.equal(normalizeForCompare("  A B  "), "ab");
});

test("calculateLCS：一模一样是 100", () => {
  assert.equal(calculateLCS("推理与行动交替", "推理与行动交替"), 100);
});

test("calculateLCS：空输入是 0，不是 NaN", () => {
  assert.equal(calculateLCS("", "推理与行动"), 0);
  assert.equal(calculateLCS("推理", ""), 0);
  assert.equal(calculateLCS("   ", "  "), 0);
});

test("calculateLCS：标点不同但内容相同，仍然满分", () => {
  // 同样的字，一个用全角冒号+加号，一个用空格和破折号
  assert.equal(calculateLCS("ReAct：推理 + 行动", "ReAct 推理-行动。"), 100);
});

test("calculateLCS：只说到一半，分数落在中间", () => {
  const full = "选择概念并学习然后向小白解释卡壳处回查资料最后简化加类比";
  const half = "选择概念并学习";
  const score = calculateLCS(half, full);
  assert.ok(score > 0 && score < 60, `半句话的分数应偏低，实际 ${score}`);
});

test("calculateLCS：顺序打乱会扣分（LCS 奖励结构正确）", () => {
  const ordered = "第一第二第三第四";
  const shuffled = "第四第三第二第一";
  assert.ok(
    calculateLCS(shuffled, ordered) < calculateLCS(ordered, ordered),
    "倒着说必须比顺着说分低",
  );
});

test("highlightMatchedText：命中答案的字上色，未命中的保持原样", () => {
  const html = highlightMatchedText("推理", "推理与行动");
  assert.ok(html.includes('<span class="text-primary font-bold">推</span>'));
  assert.ok(html.includes("理"));
});

test("highlightMatchedText：用户输入必须被转义，不能执行脚本", () => {
  // 这是从 FlowView 搬出来时修掉的真实漏洞：
  // 原实现直接拼 dangerouslySetInnerHTML，用户口述一句 <img onerror> 就能跑脚本。
  const html = highlightMatchedText('<img src=x onerror="alert(1)">', "推理");
  assert.ok(!html.includes("<img"), "尖括号必须被转义");
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&quot;"));
});

test("highlightMatchedText：空输入返回空串", () => {
  assert.equal(highlightMatchedText("", "推理"), "");
});

test("escapeHtml：五个危险字符全覆盖", () => {
  assert.equal(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

test("describeMatch：分档评语不倒挂", () => {
  assert.equal(describeMatch(100), "基本说全了，可以往下走");
  assert.equal(describeMatch(85), "基本说全了，可以往下走");
  assert.equal(describeMatch(84), "主干有了，细节还漏");
  assert.equal(describeMatch(60), "主干有了，细节还漏");
  assert.equal(describeMatch(59), "抓到一部分，但结构没串起来");
  assert.equal(describeMatch(0), "基本没说上来");
});
