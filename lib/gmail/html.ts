/** Light sanitize / apply helpers for Gmail whole-email replace translation. */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK", "IFRAME", "OBJECT", "EMBED"]);

/**
 * Clone message HTML for the email API: drop dangerous tags, keep layout + images.
 * Quote stripping is handled server-side when preserveQuotes=true.
 */
export function prepareEmailHtml(body: HTMLElement): { html: string; plainLength: number } {
  const clone = body.cloneNode(true) as HTMLElement;
  for (const el of clone.querySelectorAll([...SKIP_TAGS].join(","))) {
    el.remove();
  }
  // Drop extension chrome if any leaked into the body.
  for (const el of clone.querySelectorAll("[data-ot-gmail-replaced], .ot-gmail-translation")) {
    el.remove();
  }
  const html = clone.innerHTML.trim();
  const plainLength = (clone.textContent ?? "").replace(/\s+/g, " ").trim().length;
  return { html, plainLength };
}

export function applyReplacedHtml(body: HTMLElement, translatedHtml: string): void {
  body.innerHTML = translatedHtml;
  body.setAttribute("data-ot-gmail-replaced", "1");
}

export function restoreOriginalHtml(body: HTMLElement, originalHtml: string): void {
  body.innerHTML = originalHtml;
  body.removeAttribute("data-ot-gmail-replaced");
}

export function hasReplacedTranslation(body: HTMLElement): boolean {
  return body.getAttribute("data-ot-gmail-replaced") === "1";
}
