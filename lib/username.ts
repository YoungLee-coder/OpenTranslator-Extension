/** Login name: 2–64 characters, no whitespace. May be an email or a plain username. */
export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const username = raw.trim();
  if (username.length < 2 || username.length > 64) return null;
  if (/\s/.test(username)) return null;
  return username;
}
