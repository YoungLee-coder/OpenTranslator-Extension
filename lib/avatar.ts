export function resolveAvatarUrl(baseUrl: string, avatarUrl?: string): string | undefined {
  if (!avatarUrl) return undefined;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }
  return `${baseUrl.replace(/\/$/, "")}${avatarUrl}`;
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
