import { test } from "node:test";
import assert from "node:assert/strict";

import { POST, GET } from "../uploadthing/route.ts";
import { ourFileRouter } from "../uploadthing/core.ts";

/**
 * 上传路由本身是 uploadthing 的工厂产物，能测的很少；
 * 但「它到底接了哪个 FileRouter、那个 router 有没有如实声明字段」值得钉住——
 * 少声明一个路由，前端上传会在运行时才 404。
 */

test("GET / POST 都由同一个路由工厂产出（SDK 的握手与上传各用一个）", () => {
  assert.equal(typeof GET, "function");
  assert.equal(typeof POST, "function");
});

test("习惯凭证上传路由存在（UI 调的就是这个名字，改名等于断链）", () => {
  const router = ourFileRouter as Record<string, unknown>;
  assert.ok(router.habitAttachment, "缺了这个 key，前端上传会在运行时才 404");

  // 刻意不深入断言 maxFileSize / 允许类型：那是 uploadthing 的内部表示（_def 在不同
  // 小版本里换过形状）。钉死它等于给自己签一张「升级必红」的欠条。
  assert.equal(typeof router.habitAttachment, "object");
});
