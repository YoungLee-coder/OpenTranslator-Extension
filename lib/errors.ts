/** Map API errors to user-facing messages for Options / Side Panel UI. */
export function formatApiError(
  error: string,
  status?: number,
  kind?: string,
  retryAfterSeconds?: number,
): string {
  if (kind === "cors" || kind === "timeout" || kind === "disconnected") return error;
  if (status === 403) {
    if (/private/i.test(error)) return "站点为私有模式，请先登录";
    if (/disabled/i.test(error)) return "账号已被停用";
    if (/forbidden/i.test(error)) return "当前账号无权翻译";
    return error || "无权访问";
  }
  if (status === 429) {
    if (retryAfterSeconds != null && retryAfterSeconds > 0) {
      return `请求过于频繁，请 ${retryAfterSeconds} 秒后再试`;
    }
    if (/请 \d+ 秒后再试/.test(error)) return error;
    return "请求过于频繁，请稍后再试";
  }
  if (status === 400 && /exceeds maximum length|maximum length/i.test(error)) {
    return "原文过长，请缩短后再试（上限 80 000 字符）";
  }
  if (status === 0 && (kind === "network" || kind === "timeout")) return error;
  return error;
}
