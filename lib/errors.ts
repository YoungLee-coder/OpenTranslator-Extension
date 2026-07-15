/** Map API errors to user-facing messages for Options / Side Panel UI. */
export function formatApiError(
  error: string,
  status?: number,
  kind?: string,
): string {
  if (kind === "cors") return error;
  if (status === 401) return "邮箱或密码错误";
  if (status === 403) {
    if (/private/i.test(error)) return "站点为私有模式，请先登录";
    return error || "无权访问";
  }
  if (status === 429) return "请求过于频繁，请稍后再试";
  if (status === 0 && kind === "network") return error;
  return error;
}
