import test from "node:test";
import assert from "node:assert/strict";

import { isMissingColumnError } from "../sync-errors.ts";

test("缺列：PGRST204（PostgREST schema cache 找不到列）", () => {
  assert.equal(
    isMissingColumnError({
      code: "PGRST204",
      message: "Could not find the 'type' column of 'supabase_cards' in the schema cache",
    }),
    true,
  );
});

test("缺列：42703（Postgres undefined_column）", () => {
  assert.equal(
    isMissingColumnError({
      code: "42703",
      message: 'column "example" of relation "supabase_cards" does not exist',
    }),
    true,
  );
});

test("缺列：只有文案、没有错误码时也能认出来", () => {
  assert.equal(
    isMissingColumnError({ message: 'column "type" of relation "supabase_cards" does not exist' }),
    true,
  );
});

test("不是缺列：权限 / 网络 / 主键冲突都照旧抛出", () => {
  assert.equal(
    isMissingColumnError({ code: "42501", message: "permission denied for table supabase_cards" }),
    false,
  );
  assert.equal(isMissingColumnError({ code: "23505", message: "duplicate key value" }), false);
  assert.equal(isMissingColumnError({ message: "TypeError: fetch failed" }), false);
});

test("不是缺列：空错误对象 / 无关文案不会被误判", () => {
  assert.equal(isMissingColumnError({}), false);
  assert.equal(isMissingColumnError({ message: "" }), false);
  // 「表不存在」是另一回事：表都没有时，摘掉列重试也救不回来
  assert.equal(
    isMissingColumnError({ code: "42P01", message: 'relation "supabase_cards" does not exist' }),
    false,
  );
});
