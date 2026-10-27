/**
 * 云端同步的错误分类。
 *
 * 为什么单独一个文件：这段逻辑决定「是降级还是直接失败」，
 * 判错的代价完全不对称 ——
 *   · 把「缺列」判成普通错误：一次 upsert 失败，整轮同步中断，
 *     连不涉及那两列的数据都没传上去。
 *   · 把普通错误判成「缺列」：摘掉字段重试，可能仍然失败（会被抓住），
 *     也可能"成功"了一条信息不全的记录，用户以为同步好了。
 * 所以只认两个明确的错误码和一条明确的文案，其余一律当普通错误。
 */
export function isMissingColumnError(error: {
  code?: string;
  message?: string;
}): boolean {
  // PGRST204：PostgREST 的 schema cache 里找不到这一列
  // 42703：Postgres 原生的 undefined_column
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /column .* does not exist/i.test(error.message ?? "");
}
