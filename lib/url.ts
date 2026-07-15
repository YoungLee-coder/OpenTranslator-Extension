/** Normalize instance URL: trim, ensure protocol, strip trailing slash. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error("请输入实例地址");
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  const parsed = new URL(url);
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname);
}

export function originPattern(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  return `${parsed.origin}/*`;
}
