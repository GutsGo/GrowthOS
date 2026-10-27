-- 补列：v4 的卡片类型与例子
--
-- 背景：本地 `Card` 在 v4 加了 `type`（概念卡 / 面试题卡 / 错题卡）和 `example`（自己的例子），
-- 但 `supabase_cards` 建表时还没有这两列，于是同步只带走了正反面和复习状态：
-- 换一台机器登录，卡片都在，但题型全空 —— 交错练习退化成「按标签混排」，
-- 而且没有任何报错，只有「怎么感觉不太一样」。
--
-- 执行方式：Supabase SQL Editor 里跑一遍即可（幂等，可重复执行）。

ALTER TABLE public.supabase_cards
  ADD COLUMN IF NOT EXISTS type TEXT;

ALTER TABLE public.supabase_cards
  ADD COLUMN IF NOT EXISTS example TEXT;

-- 老数据这两列是 NULL，本地读取时按 undefined 处理，等价于「没题型」，
-- 不需要回填 SQL —— 用户在制卡页重新选一次题型即可。
