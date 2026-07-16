/** Resolve avatar to a same-origin URL under the bound instance; otherwise undefined. */
export function resolveAvatarUrl(baseUrl: string, avatarUrl?: string): string | undefined {
  if (!avatarUrl?.trim()) return undefined;

  let resolved: URL;
  try {
    const base = new URL(baseUrl);
    if (/^https?:\/\//i.test(avatarUrl)) {
      resolved = new URL(avatarUrl);
    } else {
      const baseHref = base.href.endsWith("/") ? base.href : `${base.href}/`;
      resolved = new URL(avatarUrl, baseHref);
    }
  } catch {
    return undefined;
  }

  if (resolved.username || resolved.password) return undefined;
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;

  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    return undefined;
  }
  if (resolved.origin !== baseOrigin) return undefined;

  return resolved.href;
}

/** Returns a blob: URL for use in `<img src>`; caller must revokeObjectURL on cleanup. */
export async function loadAvatarBlobUrl(
  baseUrl: string,
  token: string,
  avatarUrl?: string,
): Promise<string | undefined> {
  const url = resolveAvatarUrl(baseUrl, avatarUrl);
  if (!url) return undefined;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return undefined;

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function initialsOf(email: string): string {
  const head = email.split("@")[0] ?? email;
  return head.slice(0, 2).toUpperCase();
}
