import { normalizeBaseUrl, originPattern } from "@/lib/url";

/** Must run in a user gesture (e.g. Options button click), not in the service worker. */
export async function ensureHostPermission(baseUrlInput: string): Promise<boolean> {
  const baseUrl = normalizeBaseUrl(baseUrlInput);
  const pattern = originPattern(baseUrl);
  const has = await browser.permissions.contains({ origins: [pattern] });
  if (has) return true;
  return browser.permissions.request({ origins: [pattern] });
}
