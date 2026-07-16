import { normalizeBaseUrl, originPattern } from "@/lib/url";

/** Must run in a user gesture (e.g. Options button click), not in the service worker. */
export async function ensureHostPermission(baseUrlInput: string): Promise<boolean> {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const pattern = originPattern(baseUrl);
  const has = await browser.permissions.contains({ origins: [pattern] });
  if (has) return true;
  return browser.permissions.request({ origins: [pattern] });
}

/**
 * Drop optional host access for a former instance.
 * Parses the stored URL loosely so legacy http remotes can still be revoked.
 * Required manifest host_permissions (e.g. localhost:8787) cannot be removed — ignore failures.
 */
export async function revokeHostPermission(baseUrlInput: string): Promise<void> {
  try {
    const raw = baseUrlInput.trim();
    if (!raw) return;
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    await browser.permissions.remove({ origins: [`${parsed.origin}/*`] });
  } catch {
    // invalid URL, or origin is a required host_permission
  }
}
