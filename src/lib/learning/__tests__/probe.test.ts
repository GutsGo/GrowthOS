import { test } from "node:test";
import assert from "node:assert";

import {
  MAX_POOL_SIZE,
  buildCandidates,
  candidateToFront,
  mergeCandidates,
  pendingCandidates,
  type CardCandidate,
} from "../probe.ts";

const NOW = 1_700_000_000_000;
let seq = 0;
const idFn = () => `id-${++seq}`;

function candidate(partial: Partial<CardCandidate> = {}): CardCandidate {
  return {
    id: `c-${++seq}`,
    question: "这一步为什么必要？",
    source: "原文",
    createdAt: NOW,
    adopted: false,
    ...partial,
  };
}

test("建池：空问题和过短的被丢掉", () => {
  const list = buildCandidates(["", "嗯", "它和长期记忆的分界线在哪？"], "原文", NOW, idFn);
  assert.equal(list.length, 1);
  assert.equal(list[0].adopted, false);
});

test("建池：同一批里重复的只留一条", () => {
  const list = buildCandidates(
    ["为什么需要它？", "为什么 需要它？"],
    "原文",
    NOW,
    idFn,
  );
  assert.equal(list.length, 1, "标点与空格差异应视为同一句");
});

test("建池：原文片段截断到 200 字，不会把整篇文章塞进池子", () => {
  const list = buildCandidates(["一个问题在这里？"], "长".repeat(500), NOW, idFn);
  assert.equal(list[0].source.length, 200);
});

test("合并：新的排在前面，旧的补在后面", () => {
  const older = candidate({ id: "old", question: "旧问题是什么？", createdAt: NOW - 1000 });
  const newer = candidate({ id: "new", question: "新问题是什么？", createdAt: NOW });
  const merged = mergeCandidates([older], [newer]);
  assert.deepEqual(
    merged.map((c) => c.id),
    ["new", "old"],
  );
});

test("合并：跨批次重复的只留一条（新覆盖旧）", () => {
  const older = candidate({ id: "old", question: "同一个问题？" });
  const newer = candidate({ id: "new", question: "同一个 问题？" });
  const merged = mergeCandidates([older], [newer]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "new");
});

test("合并：超过上限时裁掉最旧的，留下最新的", () => {
  const existing = Array.from({ length: MAX_POOL_SIZE }, (_, i) =>
    candidate({ id: `old-${i}`, question: `旧问题第 ${i} 条是什么？`, createdAt: NOW - i }),
  );
  const incoming = [candidate({ id: "fresh", question: "最新的一条问题是什么？" })];
  const merged = mergeCandidates(existing, incoming);
  assert.equal(merged.length, MAX_POOL_SIZE);
  assert.equal(merged[0].id, "fresh");
});

test("待处理：已接走的不会再出现，且按时间倒序", () => {
  const list = [
    candidate({ id: "a", createdAt: NOW - 10 }),
    candidate({ id: "b", createdAt: NOW }),
    candidate({ id: "c", createdAt: NOW - 5, adopted: true }),
  ];
  assert.deepEqual(
    pendingCandidates(list).map((c) => c.id),
    ["b", "a"],
  );
});

test("预填：只给问题，不给答案", () => {
  const c = candidate({ question: "它和长期记忆的分界线在哪？" });
  assert.equal(candidateToFront(c), "它和长期记忆的分界线在哪？");
  assert.equal(candidateToFront(c), c.question.trim());
});
