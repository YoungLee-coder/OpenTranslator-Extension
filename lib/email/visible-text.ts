/**
 * Gmail inserts U+200B (and similar) for wrapping. JavaScript `\s` does not
 * treat them as whitespace, so a quote-stripped body can look non-empty while
 * containing no translatable text — the API then returns an empty translation.
 */
const INVISIBLE_OR_SPACE = /[\s\u200b\u200c\u200d\u2060\ufeff]+/g;

export function visiblePlainLength(text: string): number {
  return text.replace(INVISIBLE_OR_SPACE, " ").trim().length;
}

/**
 * Prefer the quote-stripped payload when it still has visible text.
 * Otherwise keep the pre-strip HTML (forwards wrap the whole message in
 * `.gmail_quote`, and stripping would send an empty-looking body).
 */
export function pickEmailPayload(
  stripped: { html: string; text: string },
  withQuotes: { html: string; text: string },
): { html: string; plainLength: number } {
  const strippedLen = visiblePlainLength(stripped.text);
  if (strippedLen > 0) {
    return { html: stripped.html, plainLength: strippedLen };
  }
  const quoteLen = visiblePlainLength(withQuotes.text);
  return { html: withQuotes.html, plainLength: quoteLen };
}

export function emptyEmailStreamError(translated: string, sawTerminal: boolean): string {
  if (translated.trim()) return "";
  return sawTerminal ? "译文为空" : "翻译未完成，请重试";
}
