/** Loopback hosts allowed to use plain HTTP (local dev). */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** Normalize instance URL: trim, ensure protocol, strip trailing slash. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error("请输入实例地址");

  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      throw new Error("实例地址仅支持 http:// 或 https://");
    }
    url = `https://${url}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("实例地址无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("实例地址仅支持 http:// 或 https://");
  }
  if (parsed.username || parsed.password) {
    throw new Error("实例地址不能包含用户名或密码");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new Error("非本地实例请使用 HTTPS");
  }

  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname);
}

export function originPattern(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  return `${parsed.origin}/*`;
}
